import type { ReferencePrice, Unit } from '../domain/types';
import { INGREDIENTS } from './ingredients';
import data from './prix-insee.json';

/** Moyennes nationales INSEE (mises à jour à chaque build), limitées aux ingrédients connus. */
export const INSEE_SOURCE = { label: data.source, url: data.url, fetchedAt: data.fetchedAt };

export const REFERENCE_PRICES: ReferencePrice[] = data.items
  .filter((i) => INGREDIENTS[i.ingredientId])
  .map((i) => ({ ingredientId: i.ingredientId, label: i.label, price: i.price, perQty: i.perQty, perUnit: i.perUnit as Unit, period: i.period }));
