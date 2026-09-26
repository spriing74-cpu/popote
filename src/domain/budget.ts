import type { Catalog, PriceEntry, ReferencePrice, StoreId } from './types';
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
export function itemCost(item: ShoppingItem, entry: Pick<PriceEntry, 'price' | 'perQty' | 'perUnit'>, catalog: Catalog): number | null {
  if (!item.ingredientId) return null;
  const ing = catalog.ingredients[item.ingredientId];
  const perBase = toIngredientUnit(entry.perQty, entry.perUnit, ing);
  if (perBase === null || perBase <= 0) return null;
  return (entry.price * item.purchase.qty) / perBase;
}

export type PriceOrigin = 'magasin' | 'autre_magasin' | 'insee';

export interface BudgetEstimate {
  total: number;
  pricedCount: number;
  /** Articles du planning sans prix connu (ou à l'unité incompatible). */
  missing: string[];
  /** Date du relevé personnel le plus ancien utilisé. */
  oldestDate: string | null;
  /** Nombre d'articles chiffrés par origine du prix. */
  byOrigin: Record<PriceOrigin, number>;
  /** Période INSEE utilisée (AAAA-MM), si des moyennes nationales ont servi. */
  inseePeriod: string | null;
}

/**
 * Estimation du budget. Pour chaque article, on prend dans l'ordre :
 * 1. votre dernier prix dans le magasin choisi (saisi, ticket, import) ;
 * 2. votre dernier prix dans n'importe quel magasin ;
 * 3. la moyenne nationale INSEE du mois le plus récent, si elle existe.
 * Aucun prix n'est inventé : sans l'une de ces sources, l'article est compté « sans prix ».
 */
export function estimateBudget(
  items: ShoppingItem[],
  prices: PriceEntry[],
  catalog: Catalog,
  store: StoreId | null,
  reference: ReferencePrice[] = [],
): BudgetEstimate {
  let total = 0;
  let pricedCount = 0;
  const missing: string[] = [];
  let oldestDate: string | null = null;
  let inseePeriod: string | null = null;
  const byOrigin: Record<PriceOrigin, number> = { magasin: 0, autre_magasin: 0, insee: 0 };
  for (const item of items) {
    if (item.manual || !item.ingredientId) continue;
    const candidates: [PriceOrigin, PriceEntry | undefined][] = store
      ? [['magasin', latestPrice(prices, item.ingredientId, store)], ['autre_magasin', latestPrice(prices, item.ingredientId, null)]]
      : [['autre_magasin', latestPrice(prices, item.ingredientId, null)]];
    let done = false;
    for (const [origin, entry] of candidates) {
      const cost = entry ? itemCost(item, entry, catalog) : null;
      if (cost === null || !entry) continue;
      total += cost;
      pricedCount += 1;
      byOrigin[origin] += 1;
      if (!oldestDate || entry.date < oldestDate) oldestDate = entry.date;
      done = true;
      break;
    }
    if (!done) {
      const ref = reference.find((r) => r.ingredientId === item.ingredientId);
      const cost = ref ? itemCost(item, ref, catalog) : null;
      if (ref && cost !== null) {
        total += cost;
        pricedCount += 1;
        byOrigin.insee += 1;
        if (!inseePeriod || ref.period > inseePeriod) inseePeriod = ref.period;
      } else missing.push(item.label);
    }
  }
  return { total, pricedCount, missing, oldestDate, byOrigin, inseePeriod };
}

/**
 * Comparaison entre magasins UNIQUEMENT à partir des prix saisis par l'utilisateur.
 * Un magasin sans aucun prix saisi n'apparaît pas : aucune valeur n'est inventée.
 */
export function compareStores(items: ShoppingItem[], prices: PriceEntry[], catalog: Catalog): { store: StoreId; estimate: BudgetEstimate }[] {
  const stores = (['auchan', 'leclerc', 'lidl', 'autre'] as StoreId[]).filter((s) => prices.some((p) => p.store === s));
  // Chaque magasin n'est chiffré qu'avec ses propres prix (pas de repli sur un autre magasin ni sur l'INSEE).
  return stores.map((store) => ({ store, estimate: estimateBudget(items, prices.filter((p) => p.store === store), catalog, store) }));
}

export function formatEuro(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}
