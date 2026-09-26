import type { Catalog, PriceEntry, StoreId, Unit } from './types';
import { bestMatch } from './matching';
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
