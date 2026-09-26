import type { Catalog, SlotId, WeekPlan } from './types';
import { PROFILE_IDS, dayIndex, effectivePrepDay, effectiveRecipeId, parseSlotId, slotIndex, slotLabel } from './week';

export type FreshnessStatus = 'ok' | 'veille' | 'congeler' | 'trop_long' | 'incoherent';

export interface FreshnessCheck {
  status: FreshnessStatus;
  daysStored: number;
  limitDays: number;
  message: string;
}

/**
 * Vérifie qu'un repas préparé à l'avance reste dans sa durée de conservation indicative.
 * Les durées sont prudentes et supposent un réfrigérateur à 4 °C maximum et un refroidissement rapide.
 */
export function checkFreshness(catalog: Catalog, plan: WeekPlan, id: SlotId): FreshnessCheck | null {
  const recipeId = effectiveRecipeId(plan, id);
  if (!recipeId) return null;
  const recipe = catalog.recipes[recipeId];
  if (!recipe) return null;
  const slot = plan.slots[id];
  const { day } = parseSlotId(id);
  const prepDay = effectivePrepDay(plan, id);
  const daysStored = dayIndex(day) - dayIndex(prepDay);

  if (slot.leftoverOf && slotIndex(slot.leftoverOf) >= slotIndex(id)) {
    return { status: 'incoherent', daysStored, limitDays: 0, message: `Les restes viennent de ${slotLabel(slot.leftoverOf)}, qui a lieu après ce repas.` };
  }
  if (daysStored < 0) {
    return { status: 'incoherent', daysStored, limitDays: 0, message: 'Le jour de préparation est après le repas.' };
  }

  let limit = recipe.fridgeDays;
  let limitingName = recipe.name;
  let allFreezable = recipe.freezable;
  for (const p of PROFILE_IDS) {
    const d = slot.diners[p];
    if (!d.present || !d.sideId) continue;
    const side = catalog.sides[d.sideId];
    if (!side) continue;
    if (side.fridgeDays < limit) {
      limit = side.fridgeDays;
      limitingName = side.name;
    }
    allFreezable = allFreezable && side.freezable;
  }

  if (daysStored <= limit) {
    return { status: 'ok', daysStored, limitDays: limit, message: daysStored === 0 ? 'Préparé le jour même.' : `Conservation OK (${daysStored} j sur ${limit} j max).` };
  }
  const sideLimited = limitingName !== recipe.name;
  if (recipe.quickAssembly && !sideLimited) {
    return {
      status: 'veille',
      daysStored,
      limitDays: limit,
      message: `À assembler la veille au soir (moins de 10 min) : préparez les éléments pendant la session de cuisine et montez-les la veille.`,
    };
  }
  if (allFreezable) {
    return {
      status: 'congeler',
      daysStored,
      limitDays: limit,
      message: sideLimited
        ? `${limitingName} : ${limit} j max au frais. Congelez la portion dès la préparation (décongélation au réfrigérateur la veille) ou cuisez-le le jour même.`
        : `${daysStored} j de stockage pour ${limit} j max au frais : congelez cette portion dès la préparation et décongelez-la au réfrigérateur la veille.`,
    };
  }
  return {
    status: 'trop_long',
    daysStored,
    limitDays: limit,
    message: `${limitingName} se garde ${limit} j au frais et ne se congèle pas bien : choisissez un jour de préparation plus proche du repas.`,
  };
}
