import type { Catalog, PriceEntry, StoreId } from './types';
import type { ShoppingItem } from './shopping';
import { toIngredientUnit } from './units';

export const STORE_LABELS: Record<StoreId, string> = {
  auchan: 'Auchan',
  leclerc: 'E.Leclerc',
  lidl: 'Lidl',
  autre: 'Autre magasin',
};

/** Prix le plus récent saisi pour un ingrédient (dans un magasin donné ou n'importe lequel). */
export function latestPrice(prices: PriceEntry[], ingredientId: string, store: StoreId | null): PriceEntry | undefined {
  return prices
    .filter((p) => p.ingredientId === ingredientId && (store === null || p.store === store))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

/** Coût de l'article tel qu'il sera acheté (paquets entiers ou quantité arrondie). */
export function itemCost(item: ShoppingItem, entry: PriceEntry, catalog: Catalog): number | null {
  if (!item.ingredientId) return null;
  const ing = catalog.ingredients[item.ingredientId];
  const perBase = toIngredientUnit(entry.perQty, entry.perUnit, ing);
  if (perBase === null || perBase <= 0) return null;
  return (entry.price * item.purchase.qty) / perBase;
}

export interface BudgetEstimate {
  total: number;
  pricedCount: number;
  /** Articles du planning sans prix saisi (ou à l'unité incompatible). */
  missing: string[];
  oldestDate: string | null;
}

export function estimateBudget(items: ShoppingItem[], prices: PriceEntry[], catalog: Catalog, store: StoreId | null): BudgetEstimate {
  let total = 0;
  let pricedCount = 0;
  const missing: string[] = [];
  let oldestDate: string | null = null;
  for (const item of items) {
    if (item.manual || !item.ingredientId) continue;
    const entry = latestPrice(prices, item.ingredientId, store);
    const cost = entry ? itemCost(item, entry, catalog) : null;
    if (cost === null || !entry) {
      missing.push(item.label);
      continue;
    }
    total += cost;
    pricedCount += 1;
    if (!oldestDate || entry.date < oldestDate) oldestDate = entry.date;
  }
  return { total, pricedCount, missing, oldestDate };
}

/**
 * Comparaison entre magasins UNIQUEMENT à partir des prix saisis par l'utilisateur.
 * Un magasin sans aucun prix saisi n'apparaît pas : aucune valeur n'est inventée.
 */
export function compareStores(items: ShoppingItem[], prices: PriceEntry[], catalog: Catalog): { store: StoreId; estimate: BudgetEstimate }[] {
  const stores = (['auchan', 'leclerc', 'lidl', 'autre'] as StoreId[]).filter((s) => prices.some((p) => p.store === s));
  return stores.map((store) => ({ store, estimate: estimateBudget(items, prices, catalog, store) }));
}

export function formatEuro(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}
