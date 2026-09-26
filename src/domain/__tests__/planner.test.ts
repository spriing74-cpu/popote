import { describe, expect, it } from 'vitest';
import { suggestPlan, recipeFitsSlot } from '../planner';
import { checkFreshness } from '../freshness';
import { SLOT_IDS, effectiveRecipeId, parseSlotId } from '../week';
import { withLeftover, withRecipe } from '../planner';
import { CATALOG } from '../../data/catalog';
import { defaultProfiles, defaultSettings } from '../../data/defaults';
import { emptyPlan } from '../week';
import { testCatalog as C, testPlan, testProfiles } from './fixtures';

describe('suggestions de planning', () => {
  const profiles = defaultProfiles();
  const settings = defaultSettings();

  it('remplit les 10 créneaux avec des recettes adaptées et variées', () => {
    const plan = suggestPlan(CATALOG, emptyPlan(profiles, settings.prepDays), profiles, { ...settings, useLeftoversInSuggestions: false }, [], {
      seed: 42,
      onlyEmpty: true,
    });
    const ids = SLOT_IDS.map((id) => effectiveRecipeId(plan, id));
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(10); // aucune répétition
    for (const id of SLOT_IDS) {
      const r = CATALOG.recipes[plan.slots[id].recipeId!];
      if (parseSlotId(id).meal === 'dejeuner') {
        // Pas de micro-ondes : boîte mangeable froide.
        expect(r.lunchbox).toBe(true);
        expect(r.temperature).not.toBe('chaud');
      } else expect(r.meals).toContain('diner');
    }
    // Ingrédient principal pas plus de 3 fois sur la semaine
    const mains = new Map<string, number>();
    for (const id of ids) mains.set(CATALOG.recipes[id!].mainIngredient, (mains.get(CATALOG.recipes[id!].mainIngredient) ?? 0) + 1);
    expect(Math.max(...mains.values())).toBeLessThanOrEqual(3);
  });

  it('est déterministe pour une même graine et varie avec une autre', () => {
    const base = emptyPlan(profiles, settings.prepDays);
    const a = suggestPlan(CATALOG, base, profiles, settings, [], { seed: 7, onlyEmpty: true });
    const b = suggestPlan(CATALOG, base, profiles, settings, [], { seed: 7, onlyEmpty: true });
    const c = suggestPlan(CATALOG, base, profiles, settings, [], { seed: 8, onlyEmpty: true });
    expect(a).toEqual(b);
    expect(SLOT_IDS.map((id) => effectiveRecipeId(a, id))).not.toEqual(SLOT_IDS.map((id) => effectiveRecipeId(c, id)));
  });

  it('ne touche pas aux créneaux déjà choisis en mode « cases vides »', () => {
    let plan = emptyPlan(profiles, settings.prepDays);
    plan = { ...plan, slots: { ...plan.slots, 'mar-diner': withRecipe(plan.slots['mar-diner'], CATALOG.recipes.boeuf_bourguignon) } };
    const s = suggestPlan(CATALOG, plan, profiles, settings, [], { seed: 1, onlyEmpty: true });
    expect(s.slots['mar-diner'].recipeId).toBe('boeuf_bourguignon');
    expect(SLOT_IDS.filter((id) => effectiveRecipeId(s, id) === 'boeuf_bourguignon')).toHaveLength(1);
  });

  it('ne propose jamais un repas dont la conservation serait dépassée (batch sam/dim)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = suggestPlan(CATALOG, emptyPlan(profiles, settings.prepDays), profiles, settings, [], { seed, onlyEmpty: true });
      for (const id of SLOT_IDS) {
        const f = checkFreshness(CATALOG, s, id);
        expect(f, `graine ${seed}, ${id}`).not.toBeNull();
        expect(['ok', 'congeler', 'veille'], `graine ${seed}, ${id} : ${f!.message}`).toContain(f!.status);
      }
    }
  });

  it('respecte les allergènes exclus', () => {
    const s = suggestPlan(CATALOG, emptyPlan(profiles, settings.prepDays), profiles, { ...settings, excludedAllergens: ['oeuf', 'poisson'] }, [], {
      seed: 3,
      onlyEmpty: true,
    });
    for (const id of SLOT_IDS) {
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
    const slot = plan.slots['lun-dejeuner'];
    expect(recipeFitsSlot(C.recipes.gratin_chaud, 'lun-dejeuner', slot, p)).toBe(false);
    const solo = { ...slot, diners: { ...slot.diners, moi: { ...slot.diners.moi, present: false } } };
    expect(recipeFitsSlot(C.recipes.gratin_chaud, 'lun-dejeuner', solo, p)).toBe(true); // compagne a un micro-ondes
  });
});

describe('conservation / batch cooking', () => {
  it('signale une préparation trop ancienne et propose la congélation', () => {
    let plan = testPlan();
    plan = { ...plan, slots: { ...plan.slots, 'mer-dejeuner': { ...withRecipe(plan.slots['mer-dejeuner'], C.recipes.salade_froide), prepDay: 'dim' } } };
    // salade_froide : 2 j, non congelable ; dim → mer = 3 j
    expect(checkFreshness(C, plan, 'mer-dejeuner')!.status).toBe('trop_long');
    plan = { ...plan, slots: { ...plan.slots, 'mer-diner': { ...withRecipe(plan.slots['mer-diner'], C.recipes.omelette), prepDay: 'sam' } } };
    // omelette : 3 j, congelable ; sam → mer = 4 j
    expect(checkFreshness(C, plan, 'mer-diner')!.status).toBe('congeler');
  });

  it('les restes héritent du jour de préparation du créneau source', () => {
    let plan = testPlan();
    plan = { ...plan, slots: { ...plan.slots, 'sam-diner': { ...withRecipe(plan.slots['sam-diner'], C.recipes.pates_poulet), prepDay: 'sam' } } };
    plan = { ...plan, slots: { ...plan.slots, 'lun-dejeuner': withLeftover(plan.slots['lun-dejeuner'], 'sam-diner', C.recipes.pates_poulet) } };
    const f = checkFreshness(C, plan, 'lun-dejeuner')!;
    expect(f.daysStored).toBe(2);
    expect(f.status).toBe('ok');
  });
});
