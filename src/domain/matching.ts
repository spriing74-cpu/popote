import type { Catalog } from './types';
import { FOOD_INFO } from '../data/foodinfo';

/** minuscules, sans accents ni ponctuation, espaces simples. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'a', 'au', 'aux', 'et', 'en', 'l', 'd', 'x', 'g', 'kg', 'ml', 'cl', 'l', 'bio', 'lot', 'pack', 'nature']);

export function tokens(s: string): string[] {
  return normalizeText(s)
    .split(' ')
    .filter((t) => t.length > 0 && !STOP.has(t) && !/^\d+$/.test(t));
}

/**
 * Deux mots correspondent s'ils sont égaux, ou si l'un est une abréviation de l'autre :
 * début du mot, au moins 3 lettres et au moins la moitié du mot (« poul » / « poulet », mais pas « corn » / « cornichons »).
 */
function tokenMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && short.length / long.length >= 0.5 && long.startsWith(short);
}

/** Égalité stricte au pluriel près (« pâtes » = « pâte », « poireaux » = « poireau »). */
function strictMatch(a: string, b: string): boolean {
  const sing = (w: string) => w.replace(/(aux|eaux)$/, (m) => (m === 'eaux' ? 'eau' : 'al')).replace(/[sx]$/, '');
  return a === b || sing(a) === sing(b);
}

export interface MatchOptions {
  /** Mots entiers uniquement (noms de produits complets, pas d'abréviations de ticket). */
  strict?: boolean;
  /** Le premier mot significatif du libellé (le produit lui-même) doit faire partie de l'expression. */
  head?: boolean;
}

/** Score d'une expression de référence dans un texte : 1 si tous ses mots y sont. */
function phraseScore(textTokens: string[], phrase: string, opts: MatchOptions = {}): number {
  const pt = tokens(phrase);
  if (pt.length === 0) return 0;
  const eq = opts.strict ? strictMatch : tokenMatch;
  if (opts.head && textTokens.length && !pt.some((p) => eq(textTokens[0], p))) return 0;
  let matched = 0;
  for (const p of pt) if (textTokens.some((t) => eq(t, p))) matched++;
  if (matched < pt.length) return matched / pt.length / 2; // correspondance partielle fortement pénalisée
  // Bonus aux expressions précises (« pomme de terre » l'emporte sur « pomme »).
  return 1 + Math.min(pt.length - 1, 3) * 0.15;
}

// Produits transformés ou non alimentaires dont le nom contient un mot trompeur
// (« pâte à tartiner » ≠ pâtes, « jus de pomme » ≠ pommes) : jamais rattachés automatiquement.
const NOT_AN_INGREDIENT =
  /\b(pate a tartiner|tartiner|biscuit|biscuits|gateau|gateaux|cookie|brioche|chocolat|bonbon|confiserie|glace|sorbet|soda|boisson|jus|nectar|sirop|biere|cereales petit dejeuner|chips|aperitif|lessive|liquide vaisselle|papier|shampoing|gel douche|dentifrice|essuie tout|eponge|croquettes|litiere|pret a manger|plat cuisine|surimi)\b/;

export interface MatchCandidate {
  ingredientId: string;
  score: number;
}

/**
 * Propose les ingrédients les plus probables pour un libellé (ticket, fiche produit).
 * Les correspondances apprises (`aliases`) sont prioritaires.
 */
export function matchIngredient(text: string, catalog: Catalog, aliases: Record<string, string> = {}, limit = 3, opts: MatchOptions = {}): MatchCandidate[] {
  const norm = normalizeText(text);
  const learned = aliases[norm];
  if (learned && catalog.ingredients[learned]) return [{ ingredientId: learned, score: 10 }];
  if (NOT_AN_INGREDIENT.test(norm)) return [];
  const tt = tokens(text);
  const results: MatchCandidate[] = [];
  for (const ing of Object.values(catalog.ingredients)) {
    const phrases = [ing.name, ...(FOOD_INFO[ing.id]?.kw ?? [])];
    let best = 0;
    for (const p of phrases) best = Math.max(best, phraseScore(tt, p, opts));
    if (learned === ing.id) best = 10;
    if (best >= 0.5) results.push({ ingredientId: ing.id, score: best });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Meilleure correspondance jugée fiable (toute l'expression retrouvée), sinon null. */
export function bestMatch(text: string, catalog: Catalog, aliases: Record<string, string> = {}, opts: MatchOptions = {}): string | null {
  const [first] = matchIngredient(text, catalog, aliases, 1, opts);
  return first && first.score >= 1 ? first.ingredientId : null;
}
