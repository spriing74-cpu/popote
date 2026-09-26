import type { Recipe } from './types';
import { normalizeText } from './matching';

export type EquipmentKind = 'four' | 'airfryer' | 'microondes' | 'plaques' | 'autocuiseur' | 'robot' | 'autre';

export const EQUIPMENT_LABELS: Record<EquipmentKind, string> = {
  four: 'Four',
  airfryer: 'Airfryer (friteuse à air)',
  microondes: 'Micro-ondes',
  plaques: 'Plaques de cuisson',
  autocuiseur: 'Autocuiseur / multicuiseur (Cookeo…)',
  robot: 'Robot cuiseur (Thermomix, Monsieur Cuisine…)',
  autre: 'Autre appareil',
};

/** Réglages recommandés trouvés par l'IA pour un type de plat. */
export interface DishSetting {
  dish: string;
  mode: string;
  tempC: number | null;
  timeMin: string | null;
  notes: string;
}

export interface EquipmentAiInfo {
  summary: string;
  functions: string[];
  maxTempC: number | null;
  capacity: string | null;
  dishSettings: DishSetting[];
  tips: string[];
  sources: { title: string; url: string }[];
  caveats: string;
  fetchedAt: string;
}

export interface Equipment {
  id: string;
  kind: EquipmentKind;
  brand: string;
  model: string;
  /** Four : chaleur tournante disponible. */
  convection?: boolean;
  /** Four / airfryer : température maximale. */
  maxTempC?: number | null;
  /** Airfryer : volume du panier en litres. */
  basketLiters?: number | null;
  /** Micro-ondes : puissance en watts. */
  watts?: number | null;
  /** Plaques : type. */
  hob?: 'induction' | 'vitroceramique' | 'gaz' | 'electrique';
  notes: string;
  ai?: EquipmentAiInfo;
}

// ---------------------------------------------------------------------------
// Lecture de la plaque signalétique (texte OCR) : marque et référence du modèle.
// ---------------------------------------------------------------------------

const BRANDS = [
  'Whirlpool', 'Bosch', 'Siemens', 'Neff', 'Gaggenau', 'Samsung', 'LG', 'Electrolux', 'AEG', 'Beko', 'Candy', 'Hoover', 'Brandt', 'De Dietrich',
  'Sauter', 'Rosières', 'Rosieres', 'Smeg', 'Miele', 'Hotpoint', 'Indesit', 'Faure', 'Arthur Martin', 'Scholtès', 'Scholtes', 'Thomson', 'Haier',
  'Moulinex', 'Seb', 'Tefal', 'Ninja', 'Philips', 'Cosori', 'Russell Hobbs', 'Kenwood', 'Vorwerk', 'Thermomix', 'Magimix', 'KitchenAid', 'Tower',
  'Silvercrest', 'Proline', 'Essentiel B', 'Listo', 'Continental Edison', 'Sharp', 'Panasonic', 'Toshiba', 'Daewoo', 'Severin', 'Klarstein',
  'Instant Pot', 'Cookeo', 'Monsieur Cuisine', 'Lidl', 'Delonghi', "De'Longhi", 'Rowenta', 'Riviera et Bar', 'Domo', 'Livoo', 'Proficook', 'Hisense',
];

const NOT_A_MODEL = /^(\d[\d\-.,/]*\s*(v|w|hz|kw|a|l|mm|cm|kg|va)~?|ce|ip\d+|made|in|china|france|type|model|mod|ref|serial|s\/n|sn|no|nr)$/i;

export interface PlateReading {
  brand: string | null;
  models: string[];
}

/** Cherche la marque et les références probables sur une plaque signalétique lue par OCR. */
export function parseRatingPlate(text: string): PlateReading {
  const norm = normalizeText(text);
  const brand = BRANDS.find((b) => new RegExp(`\\b${normalizeText(b)}\\b`).test(norm)) ?? null;
  const candidates: { value: string; score: number }[] = [];
  const add = (v: string, score: number) => {
    const value = v.replace(/[;,.:]+$/, '').trim();
    if (value.length < 4 || value.length > 24 || NOT_A_MODEL.test(value)) return;
    if (!/\d/.test(value) || !/[a-z]/i.test(value)) return;
    const existing = candidates.find((c) => c.value.toUpperCase() === value.toUpperCase());
    if (existing) existing.score = Math.max(existing.score, score);
    else candidates.push({ value: value.toUpperCase(), score });
  };
  for (const line of text.split(/\r?\n/)) {
    // « Mod. : HBA5570S0 », « Type AF300 », « E-Nr. HBG635BS1 », « Réf : NF4000 »
    const labelled = line.match(/\b(?:mod(?:[eè]le|el)?|type|typ|e-?nr|r[ée]f(?:[ée]rence)?|prod(?:uct)?(?:\s*no)?|pnc|code)\b\.?\s*[:/]?\s*([A-Z0-9][A-Z0-9\-/.]{3,23})/i);
    if (labelled) add(labelled[1], 3);
    for (const tok of line.split(/\s+/)) if (/^[A-Z0-9][A-Z0-9\-/]{3,23}$/i.test(tok)) add(tok, 1);
  }
  return { brand, models: candidates.sort((a, b) => b.score - a.score).map((c) => c.value).slice(0, 4) };
}

// ---------------------------------------------------------------------------
// Adaptation des réglages d'une recette à l'équipement déclaré.
// Règles d'équivalence usuelles, indicatives : la notice de l'appareil prime.
// ---------------------------------------------------------------------------

export interface CookingHints {
  ovenTemps: number[];
  times: number[];
  usesOven: boolean;
  usesAirfryer: boolean;
  simmers: boolean;
  wetDish: boolean;
}

export function cookingHints(recipe: Recipe): CookingHints {
  const text = recipe.steps.join(' ');
  // Températures du four : on ignore les passages qui parlent de l'airfryer (« ou 12 min à l'airfryer à 190 °C »).
  const ovenParts = text.split(/[.;()]|\bou\b/).filter((part) => !/airfryer/i.test(part));
  const ovenTemps = ovenParts
    .flatMap((part) => [...part.matchAll(/(\d{3})\s*°\s*C/g)].map((m) => +m[1]))
    .filter((t) => t >= 100 && t <= 300);
  const times = [...text.matchAll(/(\d{1,3})\s*(?:à\s*\d{1,3}\s*)?min/g)].map((m) => +m[1]);
  const n = normalizeText(`${recipe.name} ${text}`);
  return {
    ovenTemps: [...new Set(ovenTemps)],
    times,
    usesOven: ovenTemps.length > 0 || /\bfour\b|gratiner|rotir/.test(n),
    usesAirfryer: /airfryer/.test(n) || (recipe.tags ?? []).includes('airfryer'),
    simmers: recipe.category === 'mijote' || /mijot|a couvert|a feu doux/.test(n),
    wetDish: /gratin|lasagne|quiche|tarte|clafoutis|flan|moussaka|parmentier|hachis|cake/.test(n),
  };
}

export interface EquipmentAdvice {
  equipmentId: string;
  title: string;
  lines: string[];
  fromAi: boolean;
}

const round5 = (n: number) => Math.round(n / 5) * 5;

function aiMatches(eq: Equipment, recipe: Recipe): DishSetting[] {
  if (!eq.ai) return [];
  const n = normalizeText(`${recipe.name} ${recipe.category} ${recipe.mainIngredient}`);
  return eq.ai.dishSettings.filter((d) =>
    normalizeText(d.dish)
      .split(' ')
      .filter((w) => w.length >= 4)
      .some((w) => n.includes(w.slice(0, Math.max(4, w.length - 1)))),
  );
}

export function adviceFor(recipe: Recipe, equipment: Equipment[], portions = 2): EquipmentAdvice[] {
  const h = cookingHints(recipe);
  const out: EquipmentAdvice[] = [];
  for (const eq of equipment) {
    const name = [eq.brand, eq.model].filter(Boolean).join(' ') || EQUIPMENT_LABELS[eq.kind];
    const lines: string[] = [];
    if (eq.kind === 'four' && h.usesOven && h.ovenTemps.length) {
      for (const t of h.ovenTemps) {
        const max = eq.maxTempC ?? 275;
        const conv = Math.min(max, t - 20);
        lines.push(
          eq.convection === false
            ? `Voûte et sole : ${Math.min(max, t)} °C, durée de la recette.`
            : `${t} °C en voûte et sole, ou chaleur tournante ${conv} °C (même durée, surveillez la fin).`,
        );
        if (t > max) lines.push(`Votre four monte à ${max} °C : prolongez un peu la cuisson.`);
      }
    }
    if (eq.kind === 'airfryer' && (h.usesOven || h.usesAirfryer) && h.ovenTemps.length) {
      const max = eq.maxTempC ?? 200;
      const t = Math.min(max, round5(Math.max(...h.ovenTemps) - 20));
      const longest = h.times.length ? Math.max(...h.times) : null;
      lines.push(
        `Environ ${t} °C${longest ? `, ${round5(longest * 0.8) || 5} min au lieu de ${longest}` : ', durée réduite d’environ 20 %'} ; secouer ou retourner à mi-cuisson.`,
      );
      if (h.wetDish) lines.push('Plat en sauce ou appareil liquide : uniquement dans un moule qui tient dans le panier, sinon au four.');
      if (eq.basketLiters) {
        const perBatch = Math.max(1, Math.floor(eq.basketLiters / 1.5));
        lines.push(
          portions > perBatch
            ? `Panier de ${String(eq.basketLiters).replace('.', ',')} L : environ ${perBatch} portion(s) par fournée — prévoir ${Math.ceil(portions / perBatch)} fournées pour ${portions}.`
            : `Panier de ${String(eq.basketLiters).replace('.', ',')} L : ${portions} portion(s) en une fournée, en une seule couche.`,
        );
      }
    }
    if (eq.kind === 'microondes' && recipe.lunchbox && recipe.temperature !== 'froid') {
      const w = eq.watts ?? 800;
      const perPortion = Math.round((2.5 * 800) / w * 2) / 2;
      lines.push(`Réchauffer une portion ≈ ${perPortion} min à ${w} W, couvercle entrouvert, en remuant à mi-temps, jusqu’à ce que ce soit bien chaud à cœur.`);
    }
    if (eq.kind === 'autocuiseur' && h.simmers && recipe.totalMin >= 45) {
      lines.push(`Sous pression : environ ${round5(recipe.totalMin / 3)} min au lieu de ${recipe.totalMin} (dorer d’abord en mode rissolage, liquide minimum selon la notice).`);
    }
    if (eq.kind === 'plaques' && (h.simmers || /saisir|dorer|revenir/.test(normalizeText(recipe.steps.join(' '))))) {
      lines.push(
        eq.hob === 'gaz'
          ? 'Saisir à grande flamme, puis mijoter à petite flamme (brûleur auxiliaire).'
          : 'Saisir : 8–9 · faire revenir : 6–7 · mijoter : 3–4 · maintien au chaud : 1–2' + (eq.hob === 'induction' ? ' (induction : chauffe très vite, baisser plus tôt).' : '.'),
      );
    }
    const ai = aiMatches(eq, recipe);
    for (const d of ai) {
      lines.push(`D’après la notice (IA) — ${d.dish} : ${[d.mode, d.tempC ? `${d.tempC} °C` : null, d.timeMin].filter(Boolean).join(', ')}${d.notes ? `. ${d.notes}` : ''}`);
    }
    if (lines.length) out.push({ equipmentId: eq.id, title: name, lines, fromAi: ai.length > 0 });
  }
  return out;
}
