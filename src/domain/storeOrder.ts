import type { AisleId, StoreId } from './types';

// Ordre des rayons propre à chaque magasin. Il se règle à la main ou s'apprend :
// en mode magasin, l'ordre dans lequel on coche les premiers articles de chaque rayon
// reflète le parcours réel.

/** Ordre complet (tous les rayons) à partir d'un ordre enregistré éventuellement partiel. */
export function completeOrder(saved: AisleId[] | undefined, fallback: AisleId[]): AisleId[] {
  const known = (saved ?? []).filter((a, i, arr) => fallback.includes(a) && arr.indexOf(a) === i);
  return [...known, ...fallback.filter((a) => !known.includes(a))];
}

/**
 * Fusionne un parcours observé dans l'ordre courant : les rayons visités prennent, dans l'ordre
 * du parcours, les places qu'ils occupaient ; les autres ne bougent pas.
 */
export function mergeVisit(current: AisleId[], visited: AisleId[]): AisleId[] {
  const seen = visited.filter((a, i) => current.includes(a) && visited.indexOf(a) === i);
  if (seen.length < 2) return current;
  const slots = seen.map((a) => current.indexOf(a)).sort((x, y) => x - y);
  const next = [...current];
  slots.forEach((pos, k) => (next[pos] = seen[k]));
  return next;
}

export function moveAisle(order: AisleId[], aisle: AisleId, delta: -1 | 1): AisleId[] {
  const i = order.indexOf(aisle);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export type AisleOrders = Partial<Record<StoreId, AisleId[]>>;
