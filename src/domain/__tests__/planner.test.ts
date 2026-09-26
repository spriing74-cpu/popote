import { describe, expect, it } from 'vitest';
import { suggestPlan, recipeFitsSlot, slotConstraint } from '../planner';
import { checkFreshness } from '../freshness';
import { effectiveRecipeId, parseSlotId, slotIds } from '../week';
import { withLeftover, withRecipe } from '../planner';
import { CATALOG } from '../../data/catalog';
import { defaultProfiles, defaultSettings } from '../../data/defaults';
import { emptyPlan } from '../week';
import { testCatalog as C, testPlan, testProfiles } from './fixtures';

const WEEK_OF = '2026-09-27'; // un dimanche
const IDS = slotIds({ days: defaultSettings().planDays });

describe('suggestions de planning', () => {
  const profiles = defaultProfiles();
  const settings = defaultSettings();

  it('remplit les 16 créneaux (dimanche → dimanche) avec des recettes adaptées et variées', () => {
    const plan = suggestPlan(CATALOG, emptyPlan(profiles, settings.prepWeekdays, WEEK_OF, settings.planDays), profiles, { ...settings, useLeftoversInSuggestions: false }, [], {
      seed: 42,
      onlyEmpty: true,
    });
    const ids = IDS.map((id) => effectiveRecipeId(plan, id));
    expect(ids.every(Boolean)).toBe(true);
    expect(IDS).toHaveLength(16);
    expect(new Set(ids).size).toBe(16); // aucune répétition
    for (const id of IDS) {
      const r = CATALOG.recipes[plan.slots[id].recipeId!];
      if (slotConstraint(plan, id, profiles) === 'boite_froide') {
        // Jour travaillé sans micro-ondes : boîte mangeable froide.
        expect(r.lunchbox).toBe(true);
        expect(r.temperature).not.toBe('chaud');
      } else expect(r.meals).toContain(parseSlotId(id).meal);
    }
    // Le week-end, le déjeuner se prend à la maison : pas de contrainte de boîte.
    expect(slotConstraint(plan, 'd0-dejeuner', profiles)).toBe('aucune');
    expect(slotConstraint(plan, 'd1-dejeuner', profiles)).toBe('boite_froide');
    // Ingrédient principal pas plus de 3 fois sur la semaine
    const mains = new Map<string, number>();
    for (const id of ids) mains.set(CATALOG.recipes[id!].mainIngredient, (mains.get(CATALOG.recipes[id!].mainIngredient) ?? 0) + 1);
    expect(Math.max(...mains.values())).toBeLessThanOrEqual(3);
  });

  it('est déterministe pour une même graine et varie avec une autre', () => {
    const base = emptyPlan(profiles, settings.prepWeekdays, WEEK_OF, settings.planDays);
    const a = suggestPlan(CATALOG, base, profiles, settings, [], { seed: 7, onlyEmpty: true });
    const b = suggestPlan(CATALOG, base, profiles, settings, [], { seed: 7, onlyEmpty: true });
    const c = suggestPlan(CATALOG, base, profiles, settings, [], { seed: 8, onlyEmpty: true });
    expect(a).toEqual(b);
    expect(IDS.map((id) => effectiveRecipeId(a, id))).not.toEqual(IDS.map((id) => effectiveRecipeId(c, id)));
  });

  it('ne touche pas aux créneaux déjà choisis en mode « cases vides »', () => {
    let plan = emptyPlan(profiles, settings.prepWeekdays, WEEK_OF, settings.planDays);
    plan = { ...plan, slots: { ...plan.slots, 'd3-diner': withRecipe(plan.slots['d3-diner'], CATALOG.recipes.boeuf_bourguignon) } };
    const s = suggestPlan(CATALOG, plan, profiles, settings, [], { seed: 1, onlyEmpty: true });
    expect(s.slots['d3-diner'].recipeId).toBe('boeuf_bourguignon');
    expect(IDS.filter((id) => effectiveRecipeId(s, id) === 'boeuf_bourguignon')).toHaveLength(1);
  });

  it('ne propose jamais un repas dont la conservation serait dépassée (batch sam/dim)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = suggestPlan(CATALOG, emptyPlan(profiles, settings.prepWeekdays, WEEK_OF, settings.planDays), profiles, settings, [], { seed, onlyEmpty: true });
      for (const id of IDS) {
        const f = checkFreshness(CATALOG, s, id);
        expect(f, `graine ${seed}, ${id}`).not.toBeNull();
        expect(['ok', 'congeler', 'veille'], `graine ${seed}, ${id} : ${f!.message}`).toContain(f!.status);
      }
    }
  });

  it('respecte les allergènes exclus', () => {
    const s = suggestPlan(CATALOG, emptyPlan(profiles, settings.prepWeekdays, WEEK_OF, settings.planDays), profiles, { ...settings, excludedAllergens: ['oeuf', 'poisson'] }, [], {
      seed: 3,
      onlyEmpty: true,
    });
    for (const id of IDS) {
      const r = CATALOG.recipes[effectiveRecipeId(s, id)!];
      for (const ri of r.ingredients) {
        const al = CATALOG.ingredients[ri.ingredientId].allergens ?? [];
        expect(al).not.toContain('oeuf');
        expect(al).not.toContain('poisson');
      }
    }
  });

  it('ne propose un plat « chaud » à midi que si tout le monde a un micro-ondes', () => {
    const p = testProfiles();
    const plan = testPlan();
    const slot = plan.slots['d2-dejeuner'];
    expect(recipeFitsSlot(C.recipes.gratin_chaud, plan, 'd2-dejeuner', p, slot)).toBe(false);
    const solo = { ...slot, diners: { ...slot.diners, moi: { ...slot.diners.moi, present: false } } };
    expect(recipeFitsSlot(C.recipes.gratin_chaud, plan, 'd2-dejeuner', p, solo)).toBe(true); // compagne a un micro-ondes
  });
});

describe('conservation / batch cooking', () => {
  it('signale une préparation trop ancienne et propose la congélation', () => {
    let plan = testPlan();
    plan = { ...plan, slots: { ...plan.slots, 'd4-dejeuner': { ...withRecipe(plan.slots['d4-dejeuner'], C.recipes.salade_froide), prepDay: 'd1' } } };
    // salade_froide : 2 j, non congelable ; dim → mer = 3 j
    expect(checkFreshness(C, plan, 'd4-dejeuner')!.status).toBe('trop_long');
    plan = { ...plan, slots: { ...plan.slots, 'd4-diner': { ...withRecipe(plan.slots['d4-diner'], C.recipes.omelette), prepDay: 'd0' } } };
    // omelette : 3 j, congelable ; sam → mer = 4 j
    expect(checkFreshness(C, plan, 'd4-diner')!.status).toBe('congeler');
  });

  it('les restes héritent du jour de préparation du créneau source', () => {
    let plan = testPlan();
    plan = { ...plan, slots: { ...plan.slots, 'd0-diner': { ...withRecipe(plan.slots['d0-diner'], C.recipes.pates_poulet), prepDay: 'd0' } } };
    plan = { ...plan, slots: { ...plan.slots, 'd2-dejeuner': withLeftover(plan.slots['d2-dejeuner'], 'd0-diner', C.recipes.pates_poulet) } };
    const f = checkFreshness(C, plan, 'd2-dejeuner')!;
    expect(f.daysStored).toBe(2);
    expect(f.status).toBe('ok');
  });
});

describe('suggestions qui apprennent', () => {
  const profiles = defaultProfiles();
  const settings = { ...defaultSettings(), useLeftoversInSuggestions: false };
  const run = (learning: Parameters<typeof suggestPlan>[5]['learning'], seed = 11) => {
    const plan = suggestPlan(CATALOG, emptyPlan(profiles, settings.prepWeekdays, WEEK_OF, settings.planDays), profiles, settings, [], { seed, onlyEmpty: true, learning });
    return IDS.map((id) => effectiveRecipeId(plan, id)!);
  };

  it('n’écarte jamais une recette notée « plus jamais »', () => {
    const base = run(undefined);
    const banned = Object.fromEntries(base.map((id) => [id, -1 as const]));
    for (let seed = 1; seed <= 10; seed++) {
      const next = run({ ratings: banned, recentWeeks: [], stockUrgency: {} }, seed);
      expect(next.filter((id) => banned[id])).toEqual([]);
    }
  });

  it('évite les recettes de la semaine dernière', () => {
    const lastWeek = run(undefined);
    const next = run({ ratings: {}, recentWeeks: [lastWeek], stockUrgency: {} });
    expect(next.filter((id) => lastWeek.includes(id)).length).toBeLessThanOrEqual(1);
  });

  it('favorise les recettes qui écoulent le stock urgent', () => {
    const stock = { courgette: 4, champignon: 3, creme_liquide: 1.5 };
    const uses = (ids: string[]) => ids.filter((id) => CATALOG.recipes[id].ingredients.some((i) => i.ingredientId in stock)).length;
    let withStock = 0;
    let without = 0;
    for (let seed = 1; seed <= 20; seed++) {
      withStock += uses(run({ ratings: {}, recentWeeks: [], stockUrgency: stock }, seed));
      without += uses(run(undefined, seed));
    }
    expect(withStock).toBeGreaterThan(without * 1.5);
  });
});

describe('autre idée pour un seul repas', () => {
  it('ne change que le créneau demandé et évite la recette retirée', () => {
    const profiles = defaultProfiles();
    const settings = { ...defaultSettings(), useLeftoversInSuggestions: false };
    const full = suggestPlan(CATALOG, emptyPlan(profiles, settings.prepWeekdays, WEEK_OF, settings.planDays), profiles, settings, [], { seed: 5, onlyEmpty: true });
    const old = full.slots['d3-diner'].recipeId!;
    const cleared = { ...full, slots: { ...full.slots, 'd3-diner': withRecipe(full.slots['d3-diner'], null) } };
    for (let seed = 1; seed <= 10; seed++) {
      const next = suggestPlan(CATALOG, cleared, profiles, settings, [], { seed, onlyEmpty: true, only: 'd3-diner', avoid: [old] });
      expect(next.slots['d3-diner'].recipeId).toBeTruthy();
      expect(next.slots['d3-diner'].recipeId).not.toBe(old);
      for (const id of IDS) if (id !== 'd3-diner') expect(next.slots[id].recipeId).toBe(full.slots[id].recipeId);
    }
  });
});
