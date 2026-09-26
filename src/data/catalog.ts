import type { Allergen, Catalog, Recipe } from '../domain/types';
import { INGREDIENTS } from './ingredients';
import { RECIPES } from './recipes';
import { SIDES } from './sides';

export const CATALOG: Catalog = { ingredients: INGREDIENTS, recipes: RECIPES, sides: SIDES };

/** Catalogue de base + recettes vide-frigo gardées par l'utilisateur. */
export function mergeCatalog(base: Catalog, custom: Recipe[]): Catalog {
  if (custom.length === 0) return base;
  return { ...base, recipes: { ...base.recipes, ...Object.fromEntries(custom.map((r) => [r.id, r])) } };
}

/** Allergènes connus d'une recette, déduits des ingrédients structurés. */
export function recipeAllergens(recipe: Recipe, catalog: Catalog = CATALOG): Allergen[] {
  const set = new Set<Allergen>();
  for (const ri of recipe.ingredients) for (const a of catalog.ingredients[ri.ingredientId]?.allergens ?? []) set.add(a);
  return [...set];
}
