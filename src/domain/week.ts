import type { Day, DinerChoice, MealKind, Profile, ProfileId, Slot, SlotId, WeekPlan } from './types';

export const MEALS: MealKind[] = ['dejeuner', 'diner'];
export const PROFILE_IDS: ProfileId[] = ['moi', 'compagne'];
/** Durée d'un planning : de 1 à 14 jours. */
export const MIN_DAYS = 1;
export const MAX_DAYS = 14;

/** Jours de la semaine, index JavaScript (0 = dimanche). */
export const WEEKDAY_LABELS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
export const WEEKDAY_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
/** Ordre d'affichage des jours dans les réglages (lundi en premier). */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const MEAL_LABELS: Record<MealKind, string> = { dejeuner: 'Midi', diner: 'Soir' };

export const dayId = (index: number): Day => `d${index}`;
export function dayIndex(day: Day): number {
  return Number(day.slice(1));
}

export function slotId(day: Day, meal: MealKind): SlotId {
  return `${day}-${meal}`;
}

export function parseSlotId(id: SlotId): { day: Day; meal: MealKind } {
  const [day, meal] = id.split('-') as [Day, MealKind];
  return { day, meal };
}

export function isSlotId(v: unknown): v is SlotId {
  return typeof v === 'string' && /^d\d{1,2}-(dejeuner|diner)$/.test(v);
}

/** Jours d'un planning dans l'ordre. */
export function dayIds(plan: Pick<WeekPlan, 'days'>): Day[] {
  return Array.from({ length: plan.days }, (_, i) => dayId(i));
}

/** Tous les créneaux d'un planning dans l'ordre chronologique. */
export function slotIds(plan: Pick<WeekPlan, 'days'>): SlotId[] {
  return dayIds(plan).flatMap((d) => MEALS.map((m) => slotId(d, m)));
}

/** Position chronologique d'un créneau (indépendante de la longueur du planning). */
export function slotIndex(id: SlotId): number {
  const { day, meal } = parseSlotId(id);
  return dayIndex(day) * 2 + (meal === 'diner' ? 1 : 0);
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

/** Date ISO d'un jour du planning. */
export function dateOf(plan: Pick<WeekPlan, 'weekOf'>, day: Day): string {
  return addDays(plan.weekOf, dayIndex(day));
}

/** Jour de la semaine (0 = dimanche) d'un jour du planning. */
export function weekdayOf(plan: Pick<WeekPlan, 'weekOf'>, day: Day): number {
  return parseIso(dateOf(plan, day)).getDay();
}

export function dayName(plan: Pick<WeekPlan, 'weekOf'>, day: Day): string {
  return WEEKDAY_LABELS[weekdayOf(plan, day)];
}

/** « 27 sept. » */
export function dayDate(plan: Pick<WeekPlan, 'weekOf'>, day: Day): string {
  return parseIso(dateOf(plan, day)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/**
 * Libellé d'un créneau : « Dimanche midi ». Le jour de la semaine se répète au-delà de 7 jours :
 * on précise alors la date (« Dimanche 4 oct. midi »).
 */
export function slotLabel(plan: Pick<WeekPlan, 'weekOf' | 'days'>, id: SlotId): string {
  const { day, meal } = parseSlotId(id);
  const repeated = plan.days > 7;
  return `${dayName(plan, day)}${repeated ? ` ${dayDate(plan, day)}` : ''} ${MEAL_LABELS[meal].toLowerCase()}`;
}

/** Jour de préparation par défaut : le dernier jour de batch cooking ≤ au jour du repas (sinon le jour même). */
export function defaultPrepDay(plan: Pick<WeekPlan, 'weekOf'>, day: Day, prepWeekdays: number[]): Day {
  for (let i = dayIndex(day); i >= 0; i--) {
    if (prepWeekdays.includes(weekdayOf(plan, dayId(i)))) return dayId(i);
  }
  return day;
}

export function defaultDiner(profile: Profile, meal: MealKind): DinerChoice {
  return {
    present: true,
    portion: 1,
    sideId: null,
    extras: [...(meal === 'dejeuner' ? profile.defaultLunchExtras : profile.defaultDinnerExtras)],
  };
}

export function emptySlot(plan: Pick<WeekPlan, 'weekOf'>, id: SlotId, profiles: Record<ProfileId, Profile>, prepWeekdays: number[]): Slot {
  const { day, meal } = parseSlotId(id);
  return {
    recipeId: null,
    leftoverOf: null,
    prepDay: defaultPrepDay(plan, day, prepWeekdays),
    extraPortions: 0,
    diners: {
      moi: defaultDiner(profiles.moi, meal),
      compagne: defaultDiner(profiles.compagne, meal),
    },
    note: '',
    cookedOn: null,
  };
}

export function emptyPlan(profiles: Record<ProfileId, Profile>, prepWeekdays: number[], weekOf: string, days: number): WeekPlan {
  const plan: WeekPlan = { weekOf, days, slots: {} };
  for (const id of slotIds(plan)) plan.slots[id] = emptySlot(plan, id, profiles, prepWeekdays);
  return plan;
}

/**
 * Change la durée du planning : les repas déjà prévus sur les jours conservés restent,
 * les jours ajoutés sont vides, les jours retirés disparaissent (avec leurs restes réservés).
 */
export function resizePlan(plan: WeekPlan, days: number, profiles: Record<ProfileId, Profile>, prepWeekdays: number[]): WeekPlan {
  const next: WeekPlan = { ...plan, days, slots: {} };
  for (const id of slotIds(next)) {
    const old = plan.slots[id];
    next.slots[id] = old ? { ...old } : emptySlot(next, id, profiles, prepWeekdays);
  }
  return next;
}

/** Recette effectivement mangée sur un créneau (celle de la source si ce sont des restes). */
export function effectiveRecipeId(plan: WeekPlan, id: SlotId): string | null {
  const slot = plan.slots[id];
  if (!slot) return null;
  if (slot.leftoverOf) return plan.slots[slot.leftoverOf]?.recipeId ?? null;
  return slot.recipeId;
}

/** Jour où le plat consommé sur ce créneau a été cuisiné. */
export function effectivePrepDay(plan: WeekPlan, id: SlotId): Day {
  const slot = plan.slots[id];
  if (slot.leftoverOf && plan.slots[slot.leftoverOf]) return plan.slots[slot.leftoverOf].prepDay;
  return slot.prepDay;
}

export function presentProfiles(slot: Slot): ProfileId[] {
  return PROFILE_IDS.filter((p) => slot.diners[p].present);
}

/** Créneaux qui consomment les restes d'un créneau source. */
export function leftoverTargets(plan: WeekPlan, source: SlotId): SlotId[] {
  return slotIds(plan).filter((id) => plan.slots[id].leftoverOf === source);
}

/** Prochaine date (aujourd'hui compris) tombant sur ce jour de la semaine. */
export function upcomingWeekday(weekday: number, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
  return toIso(d);
}

/** « dim. 27 sept. → dim. 4 oct. » */
export function planRange(plan: Pick<WeekPlan, 'weekOf' | 'days'>): string {
  const f = (iso: string) => parseIso(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${f(plan.weekOf)} → ${f(addDays(plan.weekOf, plan.days - 1))}`;
}
