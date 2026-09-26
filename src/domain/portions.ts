import type {
  Catalog,
  Profile,
  ProfileId,
  RecipeIngredient,
  Role,
  RoleFactors,
  SlotId,
  Unit,
  WeekPlan,
} from './types';
import { PROFILE_IDS, effectiveRecipeId, leftoverTargets, slotIds } from './week';

/** Une quantité réellement consommée (ou cuisinée) par une personne sur un créneau. */
export interface ConsumptionLine {
  ingredientId: string;
  qty: number;
  unit: Unit;
  role: Role;
  /** Créneau où le repas est mangé. */
  slotId: SlotId;
  /** Créneau où le plat est cuisiné (différent si ce sont des restes). */
  cookedAt: SlotId;
  /** null pour les portions supplémentaires (congélateur). */
  profileId: ProfileId | null;
  origin: 'recette' | 'accompagnement' | 'complement' | 'portions_en_plus';
  sourceName: string;
  form?: string;
}

export function roleFactor(factors: RoleFactors, role: Role): number {
  const specific = role === 'autre' ? 1 : factors[role];
  return factors.portion * specific;
}

/** Quantité d'un ingrédient pour une personne donnée et un multiplicateur ponctuel. */
export function scaledQty(ri: RecipeIngredient, factors: RoleFactors | null, slotPortion: number): number {
  const f = factors ? roleFactor(factors, ri.role) : 1;
  return ri.qty * f * slotPortion;
}

type Profiles = Record<ProfileId, Profile>;

/** Consommation d'une personne sur un créneau (plat, accompagnement, compléments). */
export function dinerConsumption(
  catalog: Catalog,
  plan: WeekPlan,
  profiles: Profiles,
  id: SlotId,
  profileId: ProfileId,
): ConsumptionLine[] {
  const slot = plan.slots[id];
  const choice = slot.diners[profileId];
  if (!choice.present || choice.portion <= 0) return [];
  const factors = profiles[profileId].factors;
  const lines: ConsumptionLine[] = [];
  const recipeId = effectiveRecipeId(plan, id);
  const cookedAt = slot.leftoverOf ?? id;

  if (recipeId) {
    const recipe = catalog.recipes[recipeId];
    if (recipe) {
      for (const ri of recipe.ingredients) {
        lines.push({
          ingredientId: ri.ingredientId,
          qty: scaledQty(ri, factors, choice.portion),
          unit: ri.unit,
          role: ri.role,
          slotId: id,
          cookedAt,
          profileId,
          origin: 'recette',
          sourceName: recipe.name,
          form: ri.form,
        });
      }
    }
  }
  // Accompagnement propre à chaque personne (riz pour l'un, légumes pour l'autre…).
  if (choice.sideId) {
    const side = catalog.sides[choice.sideId];
    if (side) {
      for (const ri of side.ingredients) {
        lines.push({
          ingredientId: ri.ingredientId,
          qty: scaledQty(ri, factors, choice.portion),
          unit: ri.unit,
          role: ri.role,
          slotId: id,
          cookedAt: id,
          profileId,
          origin: 'accompagnement',
          sourceName: side.name,
          form: ri.form,
        });
      }
    }
  }
  // Compléments (fruit, yaourt, collation) : quantités fixes, non multipliées par la portion.
  for (const extraId of choice.extras) {
    const extra = catalog.sides[extraId];
    if (!extra) continue;
    for (const ri of extra.ingredients) {
      lines.push({
        ingredientId: ri.ingredientId,
        qty: ri.qty,
        unit: ri.unit,
        role: ri.role,
        slotId: id,
        cookedAt: id,
        profileId,
        origin: 'complement',
        sourceName: extra.name,
        form: ri.form,
      });
    }
  }
  return lines;
}

/** Portions standard supplémentaires cuisinées sur un créneau (congélateur, imprévus). */
export function extraPortionLines(catalog: Catalog, plan: WeekPlan, id: SlotId): ConsumptionLine[] {
  const slot = plan.slots[id];
  if (slot.leftoverOf || !slot.recipeId || slot.extraPortions <= 0) return [];
  const recipe = catalog.recipes[slot.recipeId];
  if (!recipe) return [];
  return recipe.ingredients.map((ri) => ({
    ingredientId: ri.ingredientId,
    qty: ri.qty * slot.extraPortions,
    unit: ri.unit,
    role: ri.role,
    slotId: id,
    cookedAt: id,
    profileId: null,
    origin: 'portions_en_plus' as const,
    sourceName: recipe.name,
    form: ri.form,
  }));
}

/**
 * Toute la consommation du planning. Chaque repas mangé est compté exactement une fois :
 * un créneau « restes » ne génère pas de nouvelle cuisson, il porte sa propre consommation
 * (rattachée au créneau source via `cookedAt`).
 */
export function planConsumption(catalog: Catalog, plan: WeekPlan, profiles: Profiles): ConsumptionLine[] {
  const lines: ConsumptionLine[] = [];
  for (const id of slotIds(plan)) {
    for (const p of PROFILE_IDS) lines.push(...dinerConsumption(catalog, plan, profiles, id, p));
    lines.push(...extraPortionLines(catalog, plan, id));
  }
  return lines;
}

export interface CookingPlanItem {
  sourceSlot: SlotId;
  recipeId: string;
  /** Nombre de repas servis à partir de cette cuisson (personnes × créneaux + portions en plus). */
  servings: number;
  /** Créneaux servis par cette cuisson (source + restes). */
  servedSlots: SlotId[];
  /** Quantités du plat à cuisiner (sans accompagnements ni compléments), additionnées. */
  lines: ConsumptionLine[];
}

/** Ce qu'il faut cuisiner pour un créneau source : ses convives + les restes réservés + extras. */
export function cookingPlanFor(catalog: Catalog, plan: WeekPlan, profiles: Profiles, source: SlotId): CookingPlanItem | null {
  const slot = plan.slots[source];
  if (slot.leftoverOf || !slot.recipeId) return null;
  const served = [source, ...leftoverTargets(plan, source)];
  const lines: ConsumptionLine[] = [];
  let servings = 0;
  for (const id of served) {
    for (const p of PROFILE_IDS) {
      const dl = dinerConsumption(catalog, plan, profiles, id, p).filter((l) => l.origin === 'recette');
      if (dl.length) servings += 1;
      lines.push(...dl);
    }
  }
  lines.push(...extraPortionLines(catalog, plan, source));
  servings += slot.extraPortions;
  return { sourceSlot: source, recipeId: slot.recipeId, servings, servedSlots: served, lines };
}
