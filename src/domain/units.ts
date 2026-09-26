import type { BaseUnit, Ingredient, Unit } from './types';

const TO_BASE: Record<Unit, { base: BaseUnit; factor: number }> = {
  g: { base: 'g', factor: 1 },
  kg: { base: 'g', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  cl: { base: 'ml', factor: 10 },
  l: { base: 'ml', factor: 1000 },
  cc: { base: 'ml', factor: 5 },
  cs: { base: 'ml', factor: 15 },
  pc: { base: 'pc', factor: 1 },
};

export function baseOf(unit: Unit): BaseUnit {
  return TO_BASE[unit].base;
}

/** Convertit vers l'unité de base de la même dimension (g, ml ou pc). */
export function toBase(qty: number, unit: Unit): { qty: number; unit: BaseUnit } {
  const t = TO_BASE[unit];
  return { qty: qty * t.factor, unit: t.base };
}

/** Conversion entre unités de même dimension ; null si incompatibles. */
export function convertSameDimension(qty: number, from: Unit, to: Unit): number | null {
  const a = TO_BASE[from];
  const b = TO_BASE[to];
  if (a.base !== b.base) return null;
  return (qty * a.factor) / b.factor;
}

/**
 * Convertit une quantité vers l'unité de base d'un ingrédient, en utilisant
 * le poids unitaire ou la masse volumique si les dimensions diffèrent.
 * Retourne null si aucune conversion fiable n'existe.
 */
export function toIngredientUnit(qty: number, unit: Unit, ing: Ingredient): number | null {
  const b = toBase(qty, unit);
  if (b.unit === ing.unit) return b.qty;
  // Tout passer par les grammes si possible.
  let grams: number | null = null;
  if (b.unit === 'g') grams = b.qty;
  else if (b.unit === 'pc' && ing.pieceWeightG) grams = b.qty * ing.pieceWeightG;
  else if (b.unit === 'ml' && ing.densityGPerMl) grams = b.qty * ing.densityGPerMl;
  if (grams === null) return null;
  if (ing.unit === 'g') return grams;
  if (ing.unit === 'pc' && ing.pieceWeightG) return grams / ing.pieceWeightG;
  if (ing.unit === 'ml' && ing.densityGPerMl) return grams / ing.densityGPerMl;
  return null;
}

const nf = (max: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: max });

function pluralize(label: string, n: number): string {
  if (n < 2 || /[sxz]$/.test(label)) return label;
  if (/(eau|eu)$/.test(label)) return `${label}x`;
  return `${label}s`;
}

/**
 * Formate une quantité en unité de base de manière lisible (1,2 kg, 75 cl, 3 oignons).
 * `exact` : pour les pièces, affiche la valeur décimale au lieu d'un arrondi à la demie.
 */
export function formatQty(qty: number, unit: BaseUnit, pieceLabel?: string, exact = false): string {
  if (unit === 'g') {
    if (qty >= 1000) return `${nf(2).format(qty / 1000)} kg`;
    return `${nf(qty < 10 ? 1 : 0).format(qty)} g`;
  }
  if (unit === 'ml') {
    if (qty >= 1000) return `${nf(2).format(qty / 1000)} l`;
    if (qty >= 100) return `${nf(1).format(qty / 10)} cl`;
    if (qty < 20 && qty > 0) {
      const cs = qty / 15;
      if (cs >= 1) return `${nf(1).format(cs)} c. à s.`;
      return `${nf(1).format(qty / 5)} c. à c.`;
    }
    return `${nf(0).format(qty)} ml`;
  }
  if (exact) {
    const n = nf(1).format(qty);
    return pieceLabel ? `${n} ${pluralize(pieceLabel, qty)}` : n;
  }
  // Pièces : arrondi lisible au quart (sous 1) ou à la demie, signalé par « ≈ ».
  const step = qty < 1 ? 0.25 : 0.5;
  const rounded = Math.max(step, Math.round(qty / step) * step);
  const approx = Math.abs(rounded - qty) > 1e-6 ? '≈ ' : '';
  const whole = Math.floor(rounded);
  const frac = rounded - whole;
  const fracText = frac === 0.25 ? '¼' : frac === 0.5 ? '½' : frac === 0.75 ? '¾' : '';
  const n = whole === 0 ? fracText : `${whole}${fracText ? ` ${fracText}` : ''}`;
  return `${approx}${n}${pieceLabel ? ` ${pluralize(pieceLabel, rounded)}` : ''}`;
}

/** Arrondi « d'achat » : on n'achète pas 437,5 g ni 2,3 œufs. */
export function roundForPurchase(qty: number, unit: BaseUnit): number {
  const EPS = 1e-9;
  if (unit === 'pc') return Math.ceil(qty - EPS);
  const step = qty < 100 ? 5 : qty < 1000 ? 10 : 50;
  return Math.ceil(qty / step - EPS) * step;
}

export function formatAmount(qty: number, unit: Unit): string {
  const b = toBase(qty, unit);
  return formatQty(b.qty, b.unit);
}
