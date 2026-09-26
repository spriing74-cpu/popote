import type { Catalog, MealKind, Profile, ProfileId, Recipe, Settings, Slot, SlotId, WeekPlan } from './types';
import { PROFILE_IDS, dayIndex, effectiveRecipeId, leftoverTargets, parseSlotId, presentProfiles, slotIds, weekdayOf } from './week';
import { checkFreshness } from './freshness';

type Profiles = Record<ProfileId, Profile>;

/** Générateur pseudo-aléatoire déterministe (mulberry32) : même graine = même suggestion. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** La recette respecte-t-elle les préférences globales (allergènes, exclusions, temps, coût) ? */
export function recipeAllowed(recipe: Recipe, settings: Settings, catalog: Catalog): boolean {
  if (settings.maxActiveMin !== null && recipe.activeMin > settings.maxActiveMin) return false;
  if (settings.maxCostLevel !== null && recipe.costLevel > settings.maxCostLevel) return false;
  for (const ri of recipe.ingredients) {
    if (settings.excludedIngredients.includes(ri.ingredientId)) return false;
    const allergens = catalog.ingredients[ri.ingredientId]?.allergens ?? [];
    if (allergens.some((a) => settings.excludedAllergens.includes(a))) return false;
  }
  return true;
}

/** Ce profil déjeune-t-il hors de la maison ce jour-là (jour travaillé) ? */
export function lunchAway(profile: Profile, weekday: number): boolean {
  return profile.lunchPlace !== 'maison' && profile.workWeekdays.includes(weekday);
}

/** Le déjeuner doit-il être une boîte transportable (et mangeable froid si pas de micro-ondes) ? */
export function lunchConstraint(slot: Slot, meal: MealKind, profiles: Profiles, weekday: number): 'aucune' | 'boite' | 'boite_froide' {
  if (meal !== 'dejeuner') return 'aucune';
  const away = presentProfiles(slot).filter((p) => lunchAway(profiles[p], weekday));
  if (away.length === 0) return 'aucune';
  if (away.some((p) => !profiles[p].microwaveAtLunch)) return 'boite_froide';
  return 'boite';
}

export function slotConstraint(plan: WeekPlan, id: SlotId, profiles: Profiles, slot: Slot = plan.slots[id]) {
  const { day, meal } = parseSlotId(id);
  return lunchConstraint(slot, meal, profiles, weekdayOf(plan, day));
}

export function recipeFitsSlot(recipe: Recipe, plan: WeekPlan, id: SlotId, profiles: Profiles, slot: Slot = plan.slots[id]): boolean {
  const { meal } = parseSlotId(id);
  const c = slotConstraint(plan, id, profiles, slot);
  if (c === 'aucune') return recipe.meals.includes(meal);
  if (!recipe.lunchbox) return false;
  if (c === 'boite_froide' && recipe.temperature === 'chaud') return false;
  return true;
}

/** Ce que l'app a appris : notes, semaines passées, stock du frigo. */
export interface Learning {
  /** 1 = on aime, -1 = plus jamais. */
  ratings: Record<string, 1 | -1>;
  /** Recettes des semaines précédentes, la plus récente en premier. */
  recentWeeks: string[][];
  /** Intérêt anti-gaspi par ingrédient en stock (plus c'est urgent, plus c'est élevé). */
  stockUrgency: Record<string, number>;
}

const RECENT_PENALTY = [8, 4, 2, 2];

/** Ajustement du score (plus petit = mieux) selon les goûts, l'historique et le frigo. */
export function learningScore(r: Recipe, learning: Learning | undefined, catalog: Catalog): number {
  if (!learning) return 0;
  let s = 0;
  const rating = learning.ratings[r.id];
  if (rating === -1) s += 1000; // « plus jamais » : seulement s'il n'existe aucune autre possibilité
  if (rating === 1) s -= 2;
  learning.recentWeeks.slice(0, RECENT_PENALTY.length).forEach((week, i) => {
    if (week.includes(r.id)) s += RECENT_PENALTY[i];
  });
  const ids = new Set(r.ingredients.map((i) => i.ingredientId).filter((id) => !catalog.ingredients[id]?.staple));
  let stock = 0;
  for (const id of ids) stock += learning.stockUrgency[id] ?? 0;
  s -= Math.min(6, stock);
  return s;
}

export interface SuggestOptions {
  seed: number;
  learning?: Learning;
  /** true : ne remplit que les créneaux vides ; false : repart de zéro (convives conservés). */
  onlyEmpty: boolean;
}

function clearRecipe(slot: Slot): Slot {
  return {
    ...slot,
    recipeId: null,
    leftoverOf: null,
    extraPortions: 0,
    cookedOn: null,
    diners: Object.fromEntries(PROFILE_IDS.map((p) => [p, { ...slot.diners[p], sideId: null }])) as Slot['diners'],
  };
}

export function withRecipe(slot: Slot, recipe: Recipe | null): Slot {
  return {
    ...slot,
    recipeId: recipe?.id ?? null,
    leftoverOf: null,
    cookedOn: slot.recipeId === (recipe?.id ?? null) ? slot.cookedOn : null,
    diners: Object.fromEntries(
      PROFILE_IDS.map((p) => [p, { ...slot.diners[p], sideId: recipe?.defaultSide ?? null }]),
    ) as Slot['diners'],
  };
}

export function withLeftover(slot: Slot, source: SlotId, sourceRecipe: Recipe | null): Slot {
  return {
    ...slot,
    recipeId: null,
    leftoverOf: source,
    cookedOn: null,
    extraPortions: 0,
    diners: Object.fromEntries(
      PROFILE_IDS.map((p) => [p, { ...slot.diners[p], sideId: sourceRecipe?.defaultSide ?? null }]),
    ) as Slot['diners'],
  };
}

/**
 * Propose un planning varié : pas deux fois la même recette tant que c'est possible,
 * ingrédient principal peu répété, contraintes de boîte repas et de conservation respectées.
 */
export function suggestPlan(
  catalog: Catalog,
  plan: WeekPlan,
  profiles: Profiles,
  settings: Settings,
  favorites: string[],
  opts: SuggestOptions,
): WeekPlan {
  const random = rng(opts.seed);
  const slots = { ...plan.slots };
  const ids = slotIds(plan);
  if (!opts.onlyEmpty) for (const id of ids) slots[id] = clearRecipe(slots[id]);
  const next: WeekPlan = { ...plan, slots };

  const recipeUse = new Map<string, number>();
  const mainUse = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const id of ids) {
    const r = effectiveRecipeId(next, id);
    if (r && catalog.recipes[r] && !slots[id].leftoverOf) {
      bump(recipeUse, r);
      bump(mainUse, catalog.recipes[r].mainIngredient);
    }
  }

  const all = Object.values(catalog.recipes).filter((r) => recipeAllowed(r, settings, catalog));
  let leftoversUsed = ids.filter((id) => slots[id].leftoverOf).length;
  const maxLeftovers = Math.max(2, Math.round(plan.days / 2.5));
  let previousMain: string | null = null;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const slot = slots[id];
    const existing = effectiveRecipeId(next, id);
    if (existing) {
      previousMain = catalog.recipes[existing]?.mainIngredient ?? null;
      continue;
    }
    if (presentProfiles(slot).length === 0) continue;
    const { meal, day } = parseSlotId(id);

    // 1) Restes du dîner de la veille pour un déjeuner, si pertinent.
    if (settings.useLeftoversInSuggestions && meal === 'dejeuner' && i > 0 && leftoversUsed < maxLeftovers) {
      const prevId = ids[i - 1];
      const prev = slots[prevId];
      const prevRecipe = prev.recipeId ? catalog.recipes[prev.recipeId] : null;
      if (
        prevRecipe &&
        !prev.leftoverOf &&
        prevRecipe.leftoverFriendly &&
        recipeFitsSlot(prevRecipe, next, id, profiles, slot) &&
        leftoverTargets(next, prevId).length === 0 &&
        random() < 0.6
      ) {
        slots[id] = withLeftover(slot, prevId, prevRecipe);
        const f = checkFreshness(catalog, next, id);
        if (f && (f.status === 'ok' || f.status === 'congeler')) {
          leftoversUsed += 1;
          previousMain = prevRecipe.mainIngredient;
          continue;
        }
        slots[id] = slot;
      }
    }

    // 2) Choix d'une recette par score (plus petit = meilleur).
    const candidates = all.filter((r) => recipeFitsSlot(r, next, id, profiles, slot));
    if (candidates.length === 0) continue;
    let best: Recipe | null = null;
    let bestScore = Infinity;
    for (const r of candidates) {
      let score = random();
      score += (recipeUse.get(r.id) ?? 0) * 100;
      score += (mainUse.get(r.mainIngredient) ?? 0) * 4;
      if (previousMain && r.mainIngredient === previousMain) score += 6;
      if (favorites.includes(r.id)) score -= 1.5;
      score += learningScore(r, opts.learning, catalog);
      // Conservation vis-à-vis du jour de préparation (plat + accompagnement par défaut).
      const stored = dayIndex(day) - dayIndex(slot.prepDay);
      const side = r.defaultSide ? catalog.sides[r.defaultSide] : null;
      const limit = Math.min(r.fridgeDays, side?.fridgeDays ?? Infinity);
      const freezable = r.freezable && (side?.freezable ?? true);
      const sideLimited = !!side && side.fridgeDays < r.fridgeDays;
      if (stored > limit) score += r.quickAssembly && !sideLimited ? 1 : freezable ? 3 : 50;
      // Un dîner chaud est préféré le soir, un plat froid le midi.
      if (meal === 'diner' && r.temperature === 'froid') score += 2;
      if (score < bestScore) {
        bestScore = score;
        best = r;
      }
    }
    if (!best) continue;
    slots[id] = withRecipe(slot, best);
    bump(recipeUse, best.id);
    bump(mainUse, best.mainIngredient);
    previousMain = best.mainIngredient;
  }
  return next;
}
