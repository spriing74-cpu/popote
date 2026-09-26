import type { Day, DinerChoice, MealKind, Profile, ProfileId, Slot, SlotId, WeekPlan } from './types';

export const DAYS: Day[] = ['sam', 'dim', 'lun', 'mar', 'mer'];
export const MEALS: MealKind[] = ['dejeuner', 'diner'];
export const PROFILE_IDS: ProfileId[] = ['moi', 'compagne'];

export const DAY_LABELS: Record<Day, string> = {
  sam: 'Samedi',
  dim: 'Dimanche',
  lun: 'Lundi',
  mar: 'Mardi',
  mer: 'Mercredi',
};
export const MEAL_LABELS: Record<MealKind, string> = { dejeuner: 'Midi', diner: 'Soir' };

export function slotId(day: Day, meal: MealKind): SlotId {
  return `${day}-${meal}`;
}

export function parseSlotId(id: SlotId): { day: Day; meal: MealKind } {
  const [day, meal] = id.split('-') as [Day, MealKind];
  return { day, meal };
}

/** Tous les créneaux dans l'ordre chronologique (sam midi → mer soir). */
export const SLOT_IDS: SlotId[] = DAYS.flatMap((d) => MEALS.map((m) => slotId(d, m)));

export function slotIndex(id: SlotId): number {
  return SLOT_IDS.indexOf(id);
}

export function dayIndex(day: Day): number {
  return DAYS.indexOf(day);
}

export function slotLabel(id: SlotId): string {
  const { day, meal } = parseSlotId(id);
  return `${DAY_LABELS[day]} ${MEAL_LABELS[meal].toLowerCase()}`;
}

/** Jour de préparation par défaut : le dernier jour de préparation ≤ au jour du repas. */
export function defaultPrepDay(day: Day, prepDays: Day[]): Day {
  const di = dayIndex(day);
  const candidates = prepDays.filter((p) => dayIndex(p) <= di).sort((a, b) => dayIndex(b) - dayIndex(a));
  return candidates[0] ?? day;
}

export function defaultDiner(profile: Profile, meal: MealKind): DinerChoice {
  return {
    present: true,
    portion: 1,
    sideId: null,
    extras: [...(meal === 'dejeuner' ? profile.defaultLunchExtras : profile.defaultDinnerExtras)],
  };
}

export function emptySlot(id: SlotId, profiles: Record<ProfileId, Profile>, prepDays: Day[]): Slot {
  const { day, meal } = parseSlotId(id);
  return {
    recipeId: null,
    leftoverOf: null,
    prepDay: defaultPrepDay(day, prepDays),
    extraPortions: 0,
    diners: {
      moi: defaultDiner(profiles.moi, meal),
      compagne: defaultDiner(profiles.compagne, meal),
    },
    note: '',
    cookedOn: null,
  };
}

export function emptyPlan(profiles: Record<ProfileId, Profile>, prepDays: Day[], weekOf: string | null = null): WeekPlan {
  const slots = {} as Record<SlotId, Slot>;
  for (const id of SLOT_IDS) slots[id] = emptySlot(id, profiles, prepDays);
  return { weekOf, slots };
}

/** Recette effectivement mangée sur un créneau (celle de la source si ce sont des restes). */
export function effectiveRecipeId(plan: WeekPlan, id: SlotId): string | null {
  const slot = plan.slots[id];
  if (slot.leftoverOf) return plan.slots[slot.leftoverOf]?.recipeId ?? null;
  return slot.recipeId;
}

/** Jour où le plat consommé sur ce créneau a été cuisiné. */
export function effectivePrepDay(plan: WeekPlan, id: SlotId): Day {
  const slot = plan.slots[id];
  if (slot.leftoverOf) return plan.slots[slot.leftoverOf].prepDay;
  return slot.prepDay;
}

export function presentProfiles(slot: Slot): ProfileId[] {
  return PROFILE_IDS.filter((p) => slot.diners[p].present);
}

/** Créneaux qui consomment les restes d'un créneau source. */
export function leftoverTargets(plan: WeekPlan, source: SlotId): SlotId[] {
  return SLOT_IDS.filter((id) => plan.slots[id].leftoverOf === source);
}

/** Date du samedi (AAAA-MM-JJ) de la semaine en cours ou à venir. */
export function upcomingSaturday(from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const delta = (6 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function dateForDay(weekOf: string | null, day: Day): string | null {
  if (!weekOf) return null;
  const [y, m, d] = weekOf.split('-').map(Number);
  const date = new Date(y, m - 1, d + dayIndex(day));
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
