import type { Catalog, PriceEntry, StoreId, Unit } from './types';
import { bestMatch, normalizeText } from './matching';
import { foodInfo } from '../data/foodinfo';
import { toIngredientUnit } from './units';

export interface PriceImportResult {
  entries: PriceEntry[];
  errors: string[];
}

const UNITS: Unit[] = ['g', 'kg', 'ml', 'cl', 'l', 'pc'];

function store(s: string, fallback: StoreId): StoreId {
  const n = s.toLowerCase();
  if (n.includes('leclerc')) return 'leclerc';
  if (n.includes('auchan')) return 'auchan';
  if (n.includes('lidl')) return 'lidl';
  return n.trim() ? 'autre' : fallback;
}

function isoDate(s: string, fallback: string): string {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return fallback;
}

/**
 * Importe des relevés de prix depuis un texte CSV (séparateur ; , ou tabulation), une ligne par prix :
 * produit ; prix ; quantité ; unité ; magasin ; date
 * ex. « Filets de poulet;11,90;1;kg;Leclerc Castres;2026-09-26 ». Quantité, unité, magasin et date sont facultatifs
 * (par défaut : 1 unité de base de l'ingrédient, magasin choisi, date du jour). Les lignes incomprises sont signalées.
 */
export function parsePriceCsv(text: string, catalog: Catalog, aliases: Record<string, string>, defaultStore: StoreId, today: string): PriceImportResult {
  const entries: PriceEntry[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, i) => {
    const sep = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
    const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (i === 0 && /produit|prix/i.test(cols[0]) && isNaN(parseFloat(cols[1]?.replace(',', '.')))) return; // en-tête
    const [product = '', priceRaw = '', qtyRaw = '', unitRaw = '', storeRaw = '', dateRaw = ''] = cols;
    const ingredientId = catalog.ingredients[product] ? product : bestMatch(product, catalog, aliases);
    const price = parseFloat(priceRaw.replace('€', '').replace(',', '.'));
    if (!ingredientId) return void errors.push(`Ligne ${i + 1} : produit « ${product} » non reconnu.`);
    if (!(price > 0)) return void errors.push(`Ligne ${i + 1} : prix « ${priceRaw} » invalide.`);
    const ing = catalog.ingredients[ingredientId];
    const unit = (UNITS as string[]).includes(unitRaw.toLowerCase()) ? (unitRaw.toLowerCase() as Unit) : ing.unit === 'g' ? 'kg' : ing.unit === 'ml' ? 'l' : 'pc';
    const perQty = qtyRaw ? parseFloat(qtyRaw.replace(',', '.')) : 1;
    if (!(perQty > 0) || toIngredientUnit(perQty, unit, ing) === null) return void errors.push(`Ligne ${i + 1} : unité « ${unitRaw} » incompatible avec ${ing.name}.`);
    entries.push({
      id: `imp-${today}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      ingredientId,
      store: store(storeRaw, defaultStore),
      price,
      perQty,
      perUnit: unit,
      date: isoDate(dateRaw, today),
      source: 'import',
    });
  });
  return { entries, errors };
}

// ---------------------------------------------------------------------------
// Import d'un catalogue de magasin (export CSV : category,brand,name,size,price,available,url).
// Un ingrédient correspond souvent à des dizaines de produits (bio, marque, format…) :
// on retient le prix MÉDIAN au kilo / litre / pièce, plus représentatif qu'un produit isolé.
// ---------------------------------------------------------------------------

/** Découpe une ligne CSV (guillemets doublés gérés). */
export function splitCsvLine(line: string, sep = ','): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** « 340g », « 2.5kg », « 6x1L », « 4 x 115 g », « 75cl », « 6 pièces » → quantité totale. */
export function parseSize(size: string): { qty: number; unit: Unit } | null {
  const s = size.toLowerCase().replace(',', '.').replace(/\s+/g, ' ').trim();
  const multi = s.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|cl|ml|l)\b/);
  if (multi) return { qty: +multi[1] * +multi[2], unit: multi[3] as Unit };
  const single = s.match(/^(\d+(?:\.\d+)?)\s*(kg|g|cl|ml|l)\b/);
  if (single) return { qty: +single[1], unit: single[2] as Unit };
  const pieces = s.match(/^(\d+)\s*(pi[eè]ces?|pcs?|oeufs?|œufs?|tranches?|galettes?|unit[eé]s?)\b/);
  if (pieces) return { qty: +pieces[1], unit: 'pc' };
  return null;
}

const NON_FOOD_AISLES = /hygi|entretien|b[eé]b[eé]|animal|maison & loisirs|maison et loisirs/i;
const PROCESSED = /\bdes \d+ mois\b|\bpour (chien|chat)s?\b|\b(saveur|parfum|fourre|fraise|vanille|framboise|abricot|fruits rouges|aromatis|a boire|dessert|mousse|pret a|cuisine|plat|poelee de|salade de|taboule|nuggets|cordon|pane|panee|chips|biscuit|gateau|cake|bonbon|chocolat|glace|bouillon de|soupe|veloute)\b/;

// Mots qui signalent un plat préparé ou une variante transformée (« Thon sauce catalane », « Riz cantonais »,
// « Blanc de poulet fumé »), sauf s'ils font partie du nom de l'ingrédient (« lardons fumés », « saumon fumé »).
const DISH_WORDS = new Set([
  'sauce', 'facon', 'cuisine', 'cuisinee', 'cuisines', 'cuisinees', 'carbonara', 'cantonais', 'provencale', 'bolognaise', 'catalane', 'meuniere',
  'express', 'marine', 'marinee', 'marines', 'marinees', 'roti', 'rotie', 'rotis', 'fume', 'fumee', 'fumes', 'fumees', 'dore', 'doree',
  'pane', 'panee', 'panes', 'panees', 'farci', 'farcie', 'gratin', 'terrine', 'tartinable', 'rillettes', 'veloute', 'poelee', 'salade',
  'toilette', 'lave', 'regenerant', 'hydratant', 'demaquillant', 'nettoyant', 'lessive', 'adoucissant',
]);

function isPreparedVariant(name: string, ingredientId: string, catalog: Catalog): boolean {
  const own = new Set([catalog.ingredients[ingredientId].name, ...foodInfo(ingredientId).kw].flatMap((p) => normalizeText(p).split(' ')));
  return normalizeText(name)
    .split(' ')
    .slice(1)
    .some((w) => DISH_WORDS.has(w) && !own.has(w));
}

/** Retire les mentions marketing en majuscules en tête de nom (« CULTIVONS LE BON Oeufs… » → « Oeufs… »). */
export function productName(name: string): string {
  const words = name.split(/\s+/);
  let i = 0;
  while (i < words.length - 1 && /^[A-ZÀ-Ý0-9'’&-]{2,}$/.test(words[i]) && /[A-Z]/.test(words[i])) i++;
  return words.slice(i).join(' ');
}

export interface CatalogImportSummary {
  ingredientId: string;
  products: number;
  price: number;
  perQty: number;
  perUnit: Unit;
  examples: string[];
}

export interface CatalogImportResult {
  entries: PriceEntry[];
  summary: CatalogImportSummary[];
  rows: number;
  foodRows: number;
  matchedRows: number;
}

export function isStoreCatalogCsv(text: string): boolean {
  const head = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0].toLowerCase();
  return head.startsWith('category,brand,name,size,price');
}

export function importStoreCatalog(text: string, catalog: Catalog, aliases: Record<string, string>, store: StoreId, date: string): CatalogImportResult {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const [iCat, iBrand, iName, iSize, iPrice] = ['category', 'brand', 'name', 'size', 'price'].map(col);
  const perIngredient = new Map<string, { ppu: number[]; names: string[] }>();
  let foodRows = 0;
  let matchedRows = 0;
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const category = cols[iCat] ?? '';
    const name = cols[iName] ?? '';
    const price = parseFloat((cols[iPrice] ?? '').replace(',', '.'));
    if (!name || !(price > 0) || category.length > 80 || NON_FOOD_AISLES.test(category)) continue;
    foodRows++;
    if (PROCESSED.test(normalizeText(name))) continue;
    const ingredientId = bestMatch(productName(name), catalog, aliases, { strict: true, head: true });
    if (ingredientId && isPreparedVariant(productName(name), ingredientId, catalog)) continue;
    const size = parseSize(cols[iSize] ?? '');
    if (!ingredientId || !size) continue;
    const ing = catalog.ingredients[ingredientId];
    const base = toIngredientUnit(size.qty, size.unit, ing);
    if (base === null || base <= 0) continue;
    matchedRows++;
    const entry = perIngredient.get(ingredientId) ?? { ppu: [], names: [] };
    entry.ppu.push(price / base);
    if (entry.names.length < 3) entry.names.push(`${cols[iBrand] ? `${cols[iBrand]} ` : ''}${name} ${cols[iSize] ?? ''}`.trim());
    perIngredient.set(ingredientId, entry);
  }
  const summary: CatalogImportSummary[] = [];
  const entries: PriceEntry[] = [];
  for (const [ingredientId, { ppu, names }] of perIngredient) {
    const sorted = [...ppu].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const ing = catalog.ingredients[ingredientId];
    const [perQty, perUnit, factor]: [number, Unit, number] = ing.unit === 'g' ? [1, 'kg', 1000] : ing.unit === 'ml' ? [1, 'l', 1000] : [1, 'pc', 1];
    const price = Math.round(median * factor * 100) / 100;
    summary.push({ ingredientId, products: ppu.length, price, perQty, perUnit, examples: names });
    entries.push({ id: `cat-${store}-${ingredientId}`, ingredientId, store, price, perQty, perUnit, date, source: 'import' });
  }
  summary.sort((a, b) => b.products - a.products);
  return { entries, summary, rows: lines.length - 1, foodRows, matchedRows };
}
