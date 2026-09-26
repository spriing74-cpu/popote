// Popote — service IA personnel (Cloudflare Worker).
// Garde la clé API Anthropic côté serveur : l'application n'envoie qu'une photo ou une référence d'appareil.
//   POST /identify  { image: <base64>, mediaType }       → type, marque, modèle probables (vision)
//   POST /settings  { kind, brand, model }                → réglages recommandés + sources (recherche web)
//   GET  /health
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

export interface Env {
  ANTHROPIC_API_KEY: string;
  /** Origines autorisées, séparées par des virgules (ex. https://spriing74-cpu.github.io). */
  ALLOWED_ORIGINS: string;
}

const MODEL = 'claude-opus-5';
// Si le modèle décline une requête (filtres de sécurité), l'API la rejoue automatiquement sur le modèle recommandé.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const MAX_IMAGE_BASE64 = 6_000_000; // ≈ 4,5 Mo d'image

const Kind = z.enum(['four', 'airfryer', 'microondes', 'plaques', 'autocuiseur', 'robot', 'autre']);

const IdentifySchema = z.object({
  kind: Kind,
  brand: z.string().nullable(),
  model: z.string().nullable(),
  confidence: z.enum(['haute', 'moyenne', 'faible']),
  visibleText: z.string(),
  notes: z.string(),
});

const SettingsSchema = z.object({
  summary: z.string(),
  functions: z.array(z.string()),
  maxTempC: z.number().nullable(),
  capacity: z.string().nullable(),
  dishSettings: z.array(
    z.object({
      dish: z.string(),
      mode: z.string(),
      tempC: z.number().nullable(),
      timeMin: z.string().nullable(),
      notes: z.string(),
    }),
  ),
  tips: z.array(z.string()),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  caveats: z.string(),
});

const IdentifyRequest = z.object({
  image: z.string().min(100).max(MAX_IMAGE_BASE64),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

const SettingsRequest = z.object({
  kind: Kind,
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
});

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  const headers: Record<string, string> = { 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } });
}

function refusalGuard(message: { stop_reason: string | null }) {
  if (message.stop_reason === 'refusal') throw new HttpError(422, 'Demande déclinée par le modèle.');
}

async function identify(client: Anthropic, body: unknown) {
  const req = IdentifyRequest.safeParse(body);
  if (!req.success) throw new HttpError(400, 'Photo manquante ou trop lourde.');
  const message = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(IdentifySchema) },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: req.data.mediaType, data: req.data.image } },
          {
            type: 'text',
            text:
              "Cette photo montre un appareil de cuisine d'un particulier en France (ou sa plaque signalétique). " +
              "Identifie le type d'appareil, la marque et la référence exacte du modèle si elles sont lisibles ou reconnaissables. " +
              "Recopie dans visibleText les inscriptions lisibles utiles (logo, référence). N'invente pas de référence : " +
              "mets null si elle n'est pas lisible, et baisse la confiance si tu déduis la marque du seul design. " +
              "Dans notes, une phrase en français (ex. conseil pour photographier la plaque si la référence manque).",
          },
        ],
      },
    ],
  });
  refusalGuard(message);
  if (!message.parsed_output) throw new HttpError(502, 'Réponse illisible du modèle.');
  return message.parsed_output;
}

/** Récupère les pages web réellement consultées (pour ne garder que des sources vérifiables). */
function collectSources(content: Anthropic.Beta.BetaContentBlock[]): Map<string, string> {
  const urls = new Map<string, string>();
  for (const block of content) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) if (r.type === 'web_search_result') urls.set(r.url, r.title);
    }
    if (block.type === 'text') {
      for (const c of block.citations ?? []) if (c.type === 'web_search_result_location') urls.set(c.url, c.title ?? c.url);
    }
  }
  return urls;
}

async function settings(client: Anthropic, body: unknown) {
  const req = SettingsRequest.safeParse(body);
  if (!req.success) throw new HttpError(400, 'Type, marque et modèle requis.');
  const { kind, brand, model } = req.data;

  // Étape 1 : recherche web (notice du fabricant, fiche produit), réponse rédigée.
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: 'user',
      content:
        `Appareil : ${kind} — marque « ${brand} », modèle « ${model} ».\n` +
        'Cherche la notice ou la fiche technique officielle de ce modèle exact (site du fabricant en priorité, puis revendeurs sérieux). ' +
        'Relève : fonctions/modes de cuisson, température maximale, capacité, et les réglages recommandés par le fabricant pour des plats courants ' +
        '(rôti, poulet, gratin, lasagnes, quiche/tarte, pizza, frites, légumes rôtis, poisson, cake, réchauffage). ' +
        'Indique pour chaque information la page d’où elle vient. Si tu ne trouves pas le modèle exact, dis-le clairement et donne seulement des repères génériques pour ce type d’appareil en le signalant. Réponds en français.',
    },
  ];
  let research: Anthropic.Beta.BetaMessage | null = null;
  const allContent: Anthropic.Beta.BetaContentBlock[] = [];
  for (let turn = 0; turn < 4; turn++) {
    research = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }],
      messages,
    });
    refusalGuard(research);
    allContent.push(...research.content);
    // Tour long interrompu par le serveur : on le relance avec le contenu déjà produit.
    if (research.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: research.content });
  }
  if (!research) throw new HttpError(502, 'Recherche impossible.');
  const sources = collectSources(allContent);
  const researchText = allContent
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  // Étape 2 : mise en forme structurée (sans outils), limitée aux sources réellement consultées.
  const structured = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(SettingsSchema) },
    messages: [
      {
        role: 'user',
        content:
          `Mets en forme cette synthèse de recherche sur l'appareil ${brand} ${model} (${kind}).\n\n` +
          `SYNTHÈSE :\n${researchText}\n\nPAGES CONSULTÉES :\n${[...sources].map(([url, title]) => `- ${title} — ${url}`).join('\n') || '(aucune)'}\n\n` +
          'Règles : tout en français ; températures en °C (nombres) ; durées en texte (ex. « 25-30 min ») ; mode = nom du mode sur l’appareil. ' +
          'N’ajoute aucune information absente de la synthèse. sources = uniquement des pages de la liste ci-dessus. ' +
          'caveats = ce qui n’a pas pu être confirmé pour ce modèle exact (vide si tout est confirmé). dishSettings : 12 entrées maximum.',
      },
    ],
  });
  refusalGuard(structured);
  const out = structured.parsed_output;
  if (!out) throw new HttpError(502, 'Réponse illisible du modèle.');
  // Garde-fou : aucune source que la recherche n'a pas réellement consultée.
  out.sources = out.sources.filter((s) => sources.has(s.url) && /^https?:\/\//.test(s.url)).slice(0, 8);
  return out;
}

// ---------- Lecture d'une page de recette (sans IA) ----------
// Les sites de recettes interdisent la lecture directe depuis le navigateur (CORS) : le service
// récupère la page et ne renvoie que ses données structurées schema.org (JSON-LD).

const MAX_PAGE = 3_000_000;

function isPublicHttps(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
  const host = u.hostname.toLowerCase();
  // Pas d'adresse locale ni d'IP brute (évite de servir de relais vers un réseau privé).
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || /^[\d.]+$/.test(host) || host.includes(':')) return null;
  return u;
}

export async function recipeBlocks(raw: string, fetchImpl: typeof fetch = fetch): Promise<{ status: number; body: unknown }> {
  const url = isPublicHttps(raw);
  if (!url) return { status: 400, body: { error: 'Adresse https publique attendue.' } };
  let res: Response;
  try {
    res = await fetchImpl(url.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Popote/1.0; lecture de recette)', Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { status: 502, body: { error: 'Page injoignable.' } };
  }
  if (!res.ok) return { status: 502, body: { error: `Le site a répondu ${res.status}.` } };
  if (!(res.headers.get('Content-Type') ?? '').includes('html')) return { status: 415, body: { error: 'Ce lien n’est pas une page web.' } };
  const html = (await res.text()).slice(0, MAX_PAGE);
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1])
    .filter((b) => b.length < 300_000)
    .slice(0, 20);
  return { status: 200, body: { blocks } };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const { pathname } = new URL(request.url);
    if (request.method === 'GET' && pathname === '/health') return json({ ok: true, model: MODEL }, 200, cors);
    // Seule l'application Popote (origines autorisées) peut appeler le service depuis un navigateur.
    if (!cors['Access-Control-Allow-Origin']) return json({ error: 'Origine non autorisée.' }, 403, cors);
    if (request.method === 'GET' && pathname === '/recipe') {
      const target = new URL(request.url).searchParams.get('url') ?? '';
      const r = await recipeBlocks(target);
      return json(r.body, r.status, cors);
    }
    if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405, cors);
    if (Number(request.headers.get('Content-Length') ?? 0) > MAX_IMAGE_BASE64 + 10_000) return json({ error: 'Requête trop volumineuse.' }, 413, cors);

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      const body = await request.json().catch(() => null);
      if (pathname === '/identify') return json(await identify(client, body), 200, cors);
      if (pathname === '/settings') return json(await settings(client, body), 200, cors);
      return json({ error: 'Adresse inconnue.' }, 404, cors);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, cors);
      if (e instanceof Anthropic.AuthenticationError) return json({ error: 'Clé API Anthropic invalide (voir wrangler secret).' }, 500, cors);
      if (e instanceof Anthropic.RateLimitError) return json({ error: 'Trop de demandes, réessayez dans une minute.' }, 429, cors);
      if (e instanceof Anthropic.BadRequestError) return json({ error: `Requête refusée par l’API : ${e.message}` }, 502, cors);
      if (e instanceof Anthropic.APIError) return json({ error: `Erreur de l’API Anthropic (${e.status ?? '?'}).` }, 502, cors);
      return json({ error: 'Erreur interne du service.' }, 500, cors);
    }
  },
};
