import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../data/catalog';
import { RECIPE_LIST } from '../../data/recipes';
import { defaultState } from '../../data/defaults';
import { exportJson, normalizeState, parseImport } from '../../state/persistence';
import { reducer } from '../../state/reducer';
import { leftoverTargets } from '../week';
import { toIngredientUnit } from '../units';
import { estimateBudget, compareStores } from '../budget';
import { buildShoppingList } from '../shopping';
import { planConsumption } from '../portions';

describe('catalogue', () => {
  it('contient au moins 30 recettes, assez de déjeuners transportables froids et de dîners chauds', () => {
    expect(RECIPE_LIST.length).toBeGreaterThanOrEqual(30);
    const lunchCold = RECIPE_LIST.filter((r) => r.lunchbox && r.temperature !== 'chaud');
    const hotDinners = RECIPE_LIST.filter((r) => r.meals.includes('diner') && r.temperature !== 'froid');
    expect(lunchCold.length).toBeGreaterThanOrEqual(12);
    expect(hotDinners.length).toBeGreaterThanOrEqual(15);
    const salads = RECIPE_LIST.filter((r) => r.category === 'bowl_salade');
    expect(salads.length / RECIPE_LIST.length).toBeLessThan(0.25);
  });

  it('n’a que des références valides et des quantités convertibles', () => {
    const ids = new Set<string>();
    for (const r of RECIPE_LIST) {
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(r.steps.length).toBeGreaterThan(0);
      expect(r.totalMin).toBeGreaterThanOrEqual(r.activeMin);
      for (const s of r.suggestedSides) expect(CATALOG.sides[s], `${r.id} → ${s}`).toBeDefined();
      if (r.defaultSide) expect(CATALOG.sides[r.defaultSide]).toBeDefined();
      for (const ri of r.ingredients) {
        const ing = CATALOG.ingredients[ri.ingredientId];
        expect(ing, `${r.id} → ${ri.ingredientId}`).toBeDefined();
        expect(toIngredientUnit(ri.qty, ri.unit, ing), `${r.id} → ${ri.ingredientId}`).not.toBeNull();
        expect(ri.qty).toBeGreaterThan(0);
      }
    }
    for (const s of Object.values(CATALOG.sides))
      for (const ri of s.ingredients) expect(toIngredientUnit(ri.qty, ri.unit, CATALOG.ingredients[ri.ingredientId])).not.toBeNull();
  });
});

describe('état, restes et sauvegarde', () => {
  const reduce = reducer(CATALOG);

  it('réserve des restes puis les détache si la recette source change', () => {
    let s = defaultState();
    s = reduce(s, { type: 'setRecipe', slot: 'sam-diner', recipeId: 'chili_con_carne' });
    s = reduce(s, { type: 'reserveLeftovers', source: 'sam-diner', targets: ['lun-dejeuner', 'mar-dejeuner'] });
    expect(leftoverTargets(s.plan, 'sam-diner')).toEqual(['lun-dejeuner', 'mar-dejeuner']);
    // Un créneau antérieur ne peut pas recevoir les restes.
    s = reduce(s, { type: 'reserveLeftovers', source: 'sam-diner', targets: ['sam-dejeuner', 'lun-dejeuner'] });
    expect(leftoverTargets(s.plan, 'sam-diner')).toEqual(['lun-dejeuner']);
    s = reduce(s, { type: 'setRecipe', slot: 'sam-diner', recipeId: 'dahl_lentilles_corail' });
    expect(leftoverTargets(s.plan, 'sam-diner')).toEqual([]);
    expect(s.plan.slots['lun-dejeuner'].recipeId).toBeNull();
  });

  it('scénario de la checklist iPhone : restes du samedi soir pour lundi midi', () => {
    let s = defaultState();
    s = reduce(s, { type: 'setRecipe', slot: 'sam-diner', recipeId: 'poulet_roti_pdt' });
    s = reduce(s, { type: 'reserveLeftovers', source: 'sam-diner', targets: ['lun-dejeuner'] });
    const list = buildShoppingList(planConsumption(CATALOG, s.plan, s.profiles), CATALOG, s.pantry, []);
    const cuisses = list.items.find((i) => i.ingredientId === 'poulet_cuisse')!;
    expect(cuisses.needed).toBeCloseTo(4.2);
    expect(cuisses.purchase.qty).toBe(5);
  });

  it('exporte puis réimporte à l’identique', () => {
    let s = defaultState();
    s = reduce(s, { type: 'setRecipe', slot: 'dim-diner', recipeId: 'lasagnes_bolognaise' });
    s = reduce(s, { type: 'setDiner', slot: 'dim-diner', profile: 'compagne', patch: { portion: 1.25, extras: ['yaourt'] } });
    s = reduce(s, { type: 'toggleChecked', key: 'ing:oignon' });
    s = reduce(s, { type: 'addManualItem', item: { id: 'x', label: 'Éponges', quantity: '2', aisle: 'divers' } });
    const back = parseImport(exportJson(s), CATALOG);
    expect(back).toEqual(s);
  });

  it('rejette un fichier étranger et répare des données partielles', () => {
    expect(() => parseImport('pas du json', CATALOG)).toThrow();
    expect(() => parseImport('{"foo":1}', CATALOG)).toThrow();
    const repaired = normalizeState({ plan: { slots: { 'lun-diner': { recipeId: 'inconnue', leftoverOf: 'mer-diner' } } } }, CATALOG);
    expect(repaired.plan.slots['lun-diner'].recipeId).toBeNull();
    expect(repaired.plan.slots['lun-diner'].leftoverOf).toBeNull();
    expect(repaired.profiles.moi.name).toBe('Moi');
  });
});

describe('budget', () => {
  it('n’affiche un coût que pour les articles ayant un prix saisi, sans rien inventer', () => {
    let s = defaultState();
    const reduce = reducer(CATALOG);
    s = reduce(s, { type: 'setRecipe', slot: 'sam-diner', recipeId: 'chili_con_carne' });
    const list = buildShoppingList(planConsumption(CATALOG, s.plan, s.profiles), CATALOG, s.pantry, []);
    const prices = [{ id: 'p', ingredientId: 'boeuf_hache', store: 'lidl' as const, price: 10, perQty: 1, perUnit: 'kg' as const, date: '2026-09-20' }];
    const est = estimateBudget(list.items, prices, CATALOG, null);
    const boeuf = list.items.find((i) => i.ingredientId === 'boeuf_hache')!;
    expect(est.pricedCount).toBe(1);
    expect(est.total).toBeCloseTo((boeuf.purchase.qty / 1000) * 10);
    expect(est.missing.length).toBe(list.items.length - 1);
    const cmp = compareStores(list.items, prices, CATALOG);
    expect(cmp.map((c) => c.store)).toEqual(['lidl']); // aucun prix Auchan / Leclerc : pas de comparaison inventée
  });
});
