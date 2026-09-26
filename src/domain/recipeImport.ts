import type { Catalog, Recipe, RecipeIngredient, Unit } from './types';
import type { ImportLine } from './themealdb';
import { roleOf } from './themealdb';
import { foodInfo } from '../data/foodinfo';
import { bestMatch } from './matching';
import { toIngredientUnit } from './units';
import { stepTimers } from './recipeTools';

// Import d'une recette depuis une page web (données structurées schema.org, présentes sur
// Marmiton, 750g, Cuisine AZ, Ricardo…), un texte collé ou une photo de livre (OCR).

export interface ParsedRecipe {
  name: string;
  servings: number | null;
  ingredients: string[];
  steps: string[];
  activeMin?: number;
  totalMin?: number;
  imageUrl?: string;
  sourceUrl?: string;
  sourceName?: string;
}

// ---------- Ligne d'ingrédient en français ----------

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

const UNIT_WORDS: [RegExp, Unit | 'pack' | 'pinch'][] = [
  [/^(kg|kilos?|kilogrammes?)\b/i, 'kg'],
  [/^(g|gr|grs|grammes?)\b/i, 'g'],
  [/^(ml|millilitres?)\b/i, 'ml'],
  [/^(cl|centilitres?)\b/i, 'cl'],
  [/^(l|litres?)\b/i, 'l'],
  [/^(c\.?\s?(à|a)\.?\s?s(oupe)?\.?|cuill(è|e)res?\s+(à|a)\s+soupe|cs|càs|cas|cuil\.?\s?(à|a)\s?soupe)(?=\s|$|\.)/i, 'cs'],
  [/^(c\.?\s?(à|a)\.?\s?c(afé)?\.?|cuill(è|e)res?\s+(à|a)\s+caf(é|e)|cc|càc|cac|cuil\.?\s?(à|a)\s?caf(é|e))(?=\s|$|\.)/i, 'cc'],
  [/^(pinc(é|e)es?|soupçons?|traits?)\b/i, 'pinch'],
  [/^(bo(î|i)tes?|conserves?|briques?|pots?|sachets?|paquets?|barquettes?)\b/i, 'pack'],
  [/^(gousses?|tranches?|feuilles?|brins?|bouquets?|branches?|tiges?|cubes?|morceaux?|pi(è|e)ces?|filets?|pav(é|e)s?|escalopes?|t(ê|e)tes?|bottes?|poign(é|e)es?|verres?|tasses?|noix|noisettes?)\b/i, 'pc'],
];

export interface ParsedLine {
  raw: string;
  name: string;
  qty: number | null;
  unit: Unit | 'pack' | null;
}

function parseNumber(s: string): number | null {
  const t = s.trim();
  if (FRACTIONS[t]) return FRACTIONS[t];
  const mixed = t.match(/^(\d+)\s*([½¼¾⅓⅔])$/);
  if (mixed) return parseInt(mixed[1], 10) + FRACTIONS[mixed[2]];
  const frac = t.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return parseInt(frac[1], 10) / parseInt(frac[2], 10);
  const n = parseFloat(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** « 200 g de farine », « 3 œufs », « 1 c. à soupe d'huile d'olive », « ½ citron », « sel, poivre ». */
export function parseIngredientLine(raw: string): ParsedLine {
  let s = raw
    .replace(/^[\s•·*\-–—▢☐□✓]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  let qty: number | null = null;
  const num = s.match(/^(\d+\s*\/\s*\d+|\d+\s*[½¼¾⅓⅔]|\d+(?:[.,]\d+)?|[½¼¾⅓⅔])(?:\s*(?:à|-|–)\s*\d+(?:[.,]\d+)?)?\s*/);
  if (num) {
    qty = parseNumber(num[1]);
    s = s.slice(num[0].length);
  }
  let unit: ParsedLine['unit'] = qty !== null ? 'pc' : null;
  for (const [re, u] of UNIT_WORDS) {
    const m = s.match(re);
    if (m) {
      s = s.slice(m[0].length).trim();
      if (u === 'pinch') {
        qty = null;
        unit = null;
      } else unit = u;
      break;
    }
  }
  const name = s
    .replace(/^(de\s+la|de\s+l['’]|du|des|de|d['’])\s*/i, '')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s*[,;].*$/, '')
    .trim();
  return { raw, name: name || s, qty, unit };
}

// ---------- Texte libre (collé ou lu sur une photo) ----------

const ING_HEADER = /^\s*(ingr[ée]dients?|pour\s+la\s+(pâte|sauce|garniture)|il\s+vous\s+faut)\b/i;
const STEP_HEADER = /^\s*(pr[ée]paration|[ée]tapes?|instructions?|d[ée]roul[ée]|recette|m[ée]thode)\b/i;
const NOISE = /^(temps|pr[ée]paration\s*:|cuisson\s*:|repos|difficult|co[ûu]t|budget|niveau|note|avis|partager|imprimer|\d+\s*(min|h)\b)/i;

function servingsIn(text: string): number | null {
  const m = text.match(/(?:pour\s+)?(\d{1,2})\s*(personnes?|pers\.?|parts?|portions?|couverts?)/i);
  return m ? parseInt(m[1], 10) : null;
}

const minutesIn = (text: string, label: RegExp): number | undefined => {
  const line = text.split(/\n/).find((l) => label.test(l));
  if (!line) return undefined;
  const t = stepTimers(line);
  return t.length ? t.reduce((s, x) => s + x.minutes, 0) : undefined;
};

export function parseRecipeText(text: string): ParsedRecipe {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const name = lines.find((l) => !ING_HEADER.test(l) && !STEP_HEADER.test(l) && !NOISE.test(l) && l.length > 3 && l.length < 90) ?? 'Recette importée';
  const ingredients: string[] = [];
  const steps: string[] = [];
  let mode: 'intro' | 'ing' | 'steps' = 'intro';
  const hasHeaders = lines.some((l) => ING_HEADER.test(l)) || lines.some((l) => STEP_HEADER.test(l));

  for (const l of lines) {
    if (l === name && mode === 'intro') continue;
    if (ING_HEADER.test(l) && l.length < 40) {
      mode = 'ing';
      continue;
    }
    if (STEP_HEADER.test(l) && l.length < 40) {
      mode = 'steps';
      continue;
    }
    if (NOISE.test(l) && l.length < 60) continue;
    const looksIngredient = /^[\s•·*\-–—▢☐□]*(\d|[½¼¾⅓⅔])/.test(l) && l.length < 80 && !/^\d+\s*[.)]\s+\S/.test(l);
    if (mode === 'ing' || (!hasHeaders && looksIngredient && steps.length === 0)) {
      if (l.length < 100) ingredients.push(l);
      continue;
    }
    if (mode === 'steps' || (!hasHeaders && l.length >= 25)) {
      const clean = l.replace(/^(([ée]tape\s*)?\d+\s*[.):-]?|[•·*\-–—])\s*/i, '').trim();
      // Une ligne qui ne commence pas par une majuscule prolonge l'étape précédente (texte coupé).
      if (steps.length && /^[a-zà-ÿ(]/.test(clean) && !/[.!?]$/.test(steps[steps.length - 1])) steps[steps.length - 1] += ` ${clean}`;
      else if (clean.length > 3) steps.push(clean);
    }
  }
  return {
    name,
    servings: servingsIn(text),
    ingredients,
    steps,
    activeMin: minutesIn(text, /pr[ée]paration\s*:|temps de pr[ée]paration/i),
    totalMin: minutesIn(text, /temps total|total\s*:/i),
  };
}

// ---------- Page web : données structurées schema.org/Recipe ----------

/** Blocs JSON-LD d'une page HTML. */
export function extractLdBlocks(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) out.push(m[1]);
  return out;
}

/** Durée ISO 8601 (« PT1H30M ») en minutes. */
export function isoMinutes(d: unknown): number | undefined {
  if (typeof d !== 'string') return undefined;
  const m = d.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return undefined;
  const v = (parseInt(m[1] ?? '0', 10) * 24 + parseInt(m[2] ?? '0', 10)) * 60 + parseInt(m[3] ?? '0', 10);
  return v > 0 ? v : undefined;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

function findRecipe(node: unknown): Json | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n);
      if (r) return r;
    }
    return null;
  }
  if (!isObj(node)) return null;
  const type = node['@type'];
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return node;
  if (node['@graph']) return findRecipe(node['@graph']);
  return null;
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;|&rsquo;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, ' ')
    .trim();

function instructions(v: unknown): string[] {
  if (typeof v === 'string') return v.split(/\r?\n|(?<=\.)\s+(?=\d+[.)]\s)/).map(decode).filter((s) => s.length > 3);
  if (Array.isArray(v)) return v.flatMap(instructions);
  if (isObj(v)) {
    if (v.itemListElement) return instructions(v.itemListElement);
    if (typeof v.text === 'string') return [decode(v.text)];
    if (typeof v.name === 'string') return [decode(v.name)];
  }
  return [];
}

export function recipeFromLd(blocks: string[], url?: string): ParsedRecipe | null {
  for (const b of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(b.trim());
    } catch {
      continue;
    }
    const r = findRecipe(data);
    if (!r) continue;
    const yieldRaw = Array.isArray(r.recipeYield) ? r.recipeYield.join(' ') : String(r.recipeYield ?? '');
    const servings = parseInt(yieldRaw.match(/\d+/)?.[0] ?? '', 10);
    const image = Array.isArray(r.image) ? r.image[0] : isObj(r.image) ? r.image.url : r.image;
    const prep = isoMinutes(r.prepTime);
    const total = isoMinutes(r.totalTime) ?? (prep !== undefined ? prep + (isoMinutes(r.cookTime) ?? 0) : undefined);
    return {
      name: decode(String(r.name ?? 'Recette importée')),
      servings: Number.isFinite(servings) && servings > 0 ? servings : null,
      ingredients: (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : []).filter((x): x is string => typeof x === 'string').map(decode),
      steps: instructions(r.recipeInstructions),
      activeMin: prep,
      totalMin: total,
      imageUrl: typeof image === 'string' && image.startsWith('https://') ? image : undefined,
      sourceUrl: url,
      sourceName: url ? new URL(url).hostname.replace(/^www\./, '') : undefined,
    };
  }
  return null;
}

// ---------- Rattachement au catalogue et construction ----------

export function proposeLines(parsed: ParsedRecipe, catalog: Catalog, aliases: Record<string, string> = {}): ImportLine[] {
  return parsed.ingredients.map((raw) => {
    const p = parseIngredientLine(raw);
    const ingredientId = p.name ? bestMatch(p.name, catalog, aliases) : null;
    let qty = p.qty;
    let unit: Unit | null = p.unit === 'pack' ? null : p.unit;
    if (ingredientId) {
      const ing = catalog.ingredients[ingredientId];
      if (p.unit === 'pack' && qty !== null) {
        // « 1 boîte de tomates » : un conditionnement habituel.
        if (ing.pack) {
          qty = qty * ing.pack.size;
          unit = ing.unit === 'g' ? 'g' : ing.unit === 'ml' ? 'ml' : 'pc';
        } else unit = 'pc';
      }
      if (qty !== null && unit && toIngredientUnit(qty, unit, ing) === null) {
        // « 2 courgettes » pour un ingrédient en grammes : via le poids unitaire.
        if (unit === 'pc' && ing.pieceWeightG) {
          qty = qty * ing.pieceWeightG;
          unit = 'g';
        } else unit = null;
      }
      // Sel, poivre « à volonté » : une petite quantité par défaut pour les épices de placard.
      if (qty === null && ing.staple) {
        qty = ing.unit === 'pc' ? 1 : 2;
        unit = ing.unit === 'pc' ? 'pc' : ing.unit === 'ml' ? 'ml' : 'g';
      }
    }
    return { name: p.name || raw, measure: raw, ingredientId, qty, unit };
  });
}

const CATEGORY_WORDS: [RegExp, Recipe['category']][] = [
  [/quiche|tarte|tourte|cake sal/i, 'quiche_tarte'],
  [/gratin|lasagne|parmentier|r[ôo]ti|au four|clafoutis|moussaka/i, 'four'],
  [/salade|bowl|taboul/i, 'bowl_salade'],
  [/wrap|sandwich|burger|tacos|panini|croque/i, 'wrap_sandwich'],
  [/p[âa]tes|spaghetti|risotto|riz|nouilles|gnocchi|penne|tagliatelle/i, 'pates_riz'],
  [/bourguignon|blanquette|mijot|rago[ûu]t|daube|pot-au-feu|cassoulet|navarin|chili|tajine|curry/i, 'mijote'],
];

function hashId(s: string): string {
  let h = 5381;
  for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

/** Recette Popote à partir des lignes validées (quantités totales divisées par le nombre de portions). */
export function toImportedRecipe(parsed: ParsedRecipe, lines: ImportLine[], servings: number, name: string, steps: string[], catalog: Catalog): Recipe {
  const merged = new Map<string, RecipeIngredient>();
  for (const l of lines) {
    if (!l.ingredientId || !l.qty || !l.unit) continue;
    const ing = catalog.ingredients[l.ingredientId];
    const base = toIngredientUnit(l.qty, l.unit, ing);
    if (base === null || base <= 0) continue;
    const perPortion = base / Math.max(1, servings);
    const unit: Unit = ing.unit === 'g' ? 'g' : ing.unit === 'ml' ? 'ml' : 'pc';
    const prev = merged.get(ing.id);
    if (prev) prev.qty = Math.round((prev.qty + perPortion) * 100) / 100;
    else merged.set(ing.id, { ingredientId: ing.id, qty: Math.round(perPortion * 100) / 100, unit, role: roleOf(ing.id) });
  }
  const ingredients = [...merged.values()].filter((i) => i.qty > 0);
  const main = ingredients.find((i) => i.role === 'proteine')?.ingredientId ?? ingredients[0]?.ingredientId ?? 'oignon';
  const timed = steps.flatMap(stepTimers).reduce((s, t) => s + t.minutes, 0);
  const totalMin = parsed.totalMin ?? Math.max(20, timed + 15);
  const activeMin = Math.min(totalMin, parsed.activeMin ?? Math.max(10, Math.round(totalMin * 0.4)));
  const category = CATEGORY_WORDS.find(([re]) => re.test(name))?.[1] ?? 'familial';
  const vegetarian = !ingredients.some((i) => ['viande', 'charcuterie', 'poisson'].includes(foodInfo(i.ingredientId).family));
  return {
    id: `imp-${hashId(`${name}|${parsed.sourceUrl ?? ''}|${ingredients.map((i) => i.ingredientId).join(',')}`)}`,
    name,
    summary: parsed.sourceName ? `Importée de ${parsed.sourceName}.` : 'Recette importée.',
    category,
    meals: ['dejeuner', 'diner'],
    lunchbox: false,
    temperature: 'chaud',
    activeMin,
    totalMin,
    costLevel: 2,
    mainIngredient: main,
    ingredients,
    steps,
    fridgeDays: 2,
    freezable: false,
    storageTips: 'Repère prudent : 2 jours au réfrigérateur (recette importée, durée non vérifiée).',
    suggestedSides: [],
    defaultSide: null,
    leftoverFriendly: true,
    vegetarian,
    tags: ['importee'],
    source: parsed.sourceUrl ? { name: parsed.sourceName ?? 'Source', url: parsed.sourceUrl } : undefined,
    imageUrl: parsed.imageUrl,
  };
}

/**
 * Lit une page de recette. Beaucoup de sites refusent la lecture directe depuis une autre adresse
 * (CORS) : on passe alors par le service personnel (Worker) s'il est configuré.
 */
export async function fetchRecipePage(url: string, aiServiceUrl: string, fetchImpl: typeof fetch = fetch): Promise<ParsedRecipe | 'bloque' | 'introuvable'> {
  try {
    const res = await fetchImpl(url, { mode: 'cors' });
    if (res.ok) {
      const r = recipeFromLd(extractLdBlocks(await res.text()), url);
      if (r) return r;
    }
  } catch {
    /* CORS : on essaie le service personnel */
  }
  if (!aiServiceUrl) return 'bloque';
  try {
    const res = await fetchImpl(`${aiServiceUrl.replace(/\/$/, '')}/recipe?url=${encodeURIComponent(url)}`);
    if (!res.ok) return 'introuvable';
    const data = (await res.json()) as { blocks?: string[] };
    return recipeFromLd(data.blocks ?? [], url) ?? 'introuvable';
  } catch {
    return 'bloque';
  }
}
