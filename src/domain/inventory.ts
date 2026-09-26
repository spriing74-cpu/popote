import type { Catalog, InventoryItem, PantryItem, StorageLocation, Unit } from './types';
import type { ConsumptionLine } from './portions';
import { toBase, toIngredientUnit } from './units';
import { foodInfo } from '../data/foodinfo';

const DAY = 86400000;

export function todayIso(d: Date = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return todayIso(new Date(y, m - 1, d + days));
}

/** Jours restants avant la date limite (0 = aujourd'hui, négatif = dépassée). */
export function daysLeft(expiry: string | null, today: string): number | null {
  if (!expiry) return null;
  return Math.round((Date.parse(expiry) - Date.parse(today)) / DAY);
}

export type Urgency = 'perime' | 'urgent' | 'bientot' | 'ok' | 'inconnu';

export function urgency(item: InventoryItem, today: string): Urgency {
  const d = daysLeft(item.expiry, today);
  if (d === null) return 'inconnu';
  if (d < 0) return 'perime';
  if (d <= 2) return 'urgent';
  if (d <= 5) return 'bientot';
  return 'ok';
}

/** Date limite estimée (produit fermé), en l'absence de date lue sur l'emballage. */
export function estimateExpiry(ingredientId: string | null, location: StorageLocation, from: string): string {
  if (location === 'congelateur') return addDays(from, ingredientId && foodInfo(ingredientId).loc === 'congelateur' ? foodInfo(ingredientId).days : 90);
  return addDays(from, ingredientId ? foodInfo(ingredientId).days : 5);
}

export function defaultLocation(ingredientId: string | null): StorageLocation {
  return ingredientId ? foodInfo(ingredientId).loc : 'frigo';
}

/** Quantité utilisable (non périmée) d'un ingrédient, dans son unité de base. */
export function available(inventory: InventoryItem[], ingredientId: string, catalog: Catalog, today: string): number {
  const ing = catalog.ingredients[ingredientId];
  if (!ing) return 0;
  let total = 0;
  for (const it of inventory) {
    if (it.ingredientId !== ingredientId) continue;
    const d = daysLeft(it.expiry, today);
    if (d !== null && d < 0) continue;
    const q = toIngredientUnit(it.qty, it.unit, ing);
    if (q !== null) total += q;
  }
  return total;
}

/** Le stock non périmé, sous forme d'articles de placard, pour la liste de courses. */
export function inventoryAsPantry(inventory: InventoryItem[], catalog: Catalog, today: string): PantryItem[] {
  const ids = new Set(inventory.map((i) => i.ingredientId).filter((x): x is string => !!x && !!catalog.ingredients[x]));
  return [...ids].map((id) => ({ ingredientId: id, qty: available(inventory, id, catalog, today), unit: catalog.ingredients[id].unit as Unit }));
}

/**
 * Retire du stock ce qui a été cuisiné, en commençant par ce qui périme le plus tôt (FIFO).
 * Retourne le nouveau stock et ce qui manquait (quantités non trouvées dans le stock).
 */
export function consume(
  inventory: InventoryItem[],
  lines: ConsumptionLine[],
  catalog: Catalog,
): { inventory: InventoryItem[]; missing: Record<string, number> } {
  const needs = new Map<string, number>();
  for (const l of lines) {
    const ing = catalog.ingredients[l.ingredientId];
    if (!ing || ing.staple) continue;
    const q = toIngredientUnit(l.qty, l.unit, ing);
    if (q !== null) needs.set(ing.id, (needs.get(ing.id) ?? 0) + q);
  }
  const next = inventory.map((i) => ({ ...i }));
  const missing: Record<string, number> = {};
  for (const [id, need0] of needs) {
    const ing = catalog.ingredients[id];
    let need = need0;
    const candidates = next
      .filter((i) => i.ingredientId === id && i.qty > 0)
      .sort((a, b) => (a.expiry ?? '9999').localeCompare(b.expiry ?? '9999'));
    for (const it of candidates) {
      if (need <= 1e-9) break;
      const have = toIngredientUnit(it.qty, it.unit, ing);
      if (have === null || have <= 0) continue;
      const take = Math.min(have, need);
      // Remettre la quantité restante dans l'unité de l'article.
      const ratio = (have - take) / have;
      it.qty = it.qty * ratio;
      need -= take;
    }
    if (need > 1e-6) missing[id] = need;
  }
  return { inventory: next.filter((i) => i.qty > 1e-6), missing };
}

/** Normalise une quantité saisie en unité de base (pour l'affichage). */
export function baseQty(item: InventoryItem): { qty: number; unit: 'g' | 'ml' | 'pc' } {
  return toBase(item.qty, item.unit);
}

/**
 * Quantité par défaut d'un article acheté : quantité lue (ticket, fiche produit) si elle existe,
 * sinon conditionnement habituel × nombre d'articles, sinon nombre de pièces.
 */
export function defaultQuantity(
  catalog: Catalog,
  ingredientId: string | null,
  count: number,
  qty: number | null,
  unit: Unit | null,
): { qty: number; unit: Unit } {
  const ing = ingredientId ? catalog.ingredients[ingredientId] : null;
  if (qty !== null && unit !== null && qty > 0) {
    if (!ing || toIngredientUnit(qty, unit, ing) !== null) return { qty: qty * Math.max(1, count), unit };
  }
  if (!ing) return { qty: Math.max(1, count), unit: 'pc' };
  if (ing.pack) return { qty: ing.pack.size * Math.max(1, count), unit: ing.unit };
  if (ing.unit === 'pc') return { qty: Math.max(1, count), unit: 'pc' };
  if (ing.pieceWeightG) return { qty: ing.pieceWeightG * Math.max(1, count), unit: 'g' };
  return { qty: ing.unit === 'g' ? 500 * Math.max(1, count) : 1000 * Math.max(1, count), unit: ing.unit };
}
