import type { Catalog, Ingredient, Recipe, RoleFactors, Unit } from './types';
import data from '../data/nutrition.json';
import { scaledQty } from './portions';
import { toIngredientUnit } from './units';

// Repères nutritionnels INDICATIFS, calculés à partir de la table CIQUAL (Anses, valeurs pour 100 g
// d'aliment cru ou tel qu'acheté). Ce n'est ni un objectif ni une prescription.

export interface Nutrients {
  kcal: number;
  proteines: number;
  glucides: number;
  lipides: number;
  fibres: number;
  sel: number;
}

type Entry = Nutrients & { code: number; aliment: string; note?: string };
const TABLE = (data as { items: Record<string, Entry> }).items;

export const NUTRITION_SOURCE = { name: 'Anses. 2020. Table de composition nutritionnelle des aliments Ciqual', url: data.url, licence: data.licence };

const ZERO: Nutrients = { kcal: 0, proteines: 0, glucides: 0, lipides: 0, fibres: 0, sel: 0 };

/** Masse en grammes d'une quantité (pièces via le poids moyen, volumes via la masse volumique, 1 g/ml par défaut). */
export function gramsOf(qty: number, unit: Unit, ing: Ingredient): number | null {
  const base = toIngredientUnit(qty, unit, ing);
  if (base === null) return null;
  if (ing.unit === 'g') return base;
  if (ing.unit === 'ml') return base * (ing.densityGPerMl ?? 1);
  return ing.pieceWeightG ? base * ing.pieceWeightG : null;
}

export interface PortionNutrition extends Nutrients {
  /** Part des ingrédients (hors sel, poivre…) trouvés dans la table (0 à 1). */
  coverage: number;
  /** Ingrédients sans valeur connue. */
  missing: string[];
}

/** Valeurs pour UNE portion de la recette, avec les facteurs du profil (sans accompagnement). */
export function portionNutrition(recipe: Recipe, factors: RoleFactors | null, catalog: Catalog, portion = 1): PortionNutrition {
  const total = { ...ZERO };
  let known = 0;
  let all = 0;
  const missing: string[] = [];
  for (const ri of recipe.ingredients) {
    const ing = catalog.ingredients[ri.ingredientId];
    if (!ing) continue;
    all += 1;
    const g = gramsOf(scaledQty(ri, factors, portion), ri.unit, ing);
    const n = TABLE[ri.ingredientId];
    if (g === null || !n) {
      missing.push(ing.name);
      continue;
    }
    known += 1;
    for (const k of Object.keys(ZERO) as (keyof Nutrients)[]) total[k] += (n[k] * g) / 100;
  }
  return { ...total, coverage: all === 0 ? 0 : known / all, missing };
}

export function hasNutrition(ingredientId: string): boolean {
  return ingredientId in TABLE;
}
