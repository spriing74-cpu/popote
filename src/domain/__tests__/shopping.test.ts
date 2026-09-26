import { describe, expect, it } from 'vitest';
import type { Slot, WeekPlan } from '../types';
import { cookingPlanFor, planConsumption } from '../portions';
import { aggregate, buildShoppingList } from '../shopping';
import { withLeftover, withRecipe } from '../planner';
import { testCatalog as C, testPlan, testProfiles } from './fixtures';

const profiles = testProfiles();

function put(plan: WeekPlan, id: keyof WeekPlan['slots'], fn: (s: Slot) => Slot): WeekPlan {
  return { ...plan, slots: { ...plan.slots, [id]: fn(plan.slots[id]) } };
}
function totals(plan: WeekPlan) {
  const agg = aggregate(planConsumption(C, plan, profiles), C);
  return Object.fromEntries([...agg.values()].map((a) => [a.ingredientId, a.qty]));
}

describe('portions différentes entre profils', () => {
  it('applique les facteurs de chaque profil par rôle d’ingrédient', () => {
    const plan = put(testPlan(), 'd0-diner', (s) => withRecipe(s, C.recipes.pates_poulet));
    const t = totals(plan);
    // Pâtes (féculent) : moi 100×0,8 + compagne 100×1
    expect(t.pates).toBeCloseTo(180);
    // Poulet (protéine) : 120 + 100
    expect(t.poulet).toBeCloseTo(220);
    // Crème 5 cl = 50 ml (sauce) : 25 + 50
    expect(t.creme).toBeCloseTo(75);
    // Oignon 0,5 pc (légume) : 0,75 + 0,5
    expect(t.oignon).toBeCloseTo(1.25);
    // Sel (autre) : facteur neutre
    expect(t.sel).toBeCloseTo(2);
  });

  it('applique le multiplicateur ponctuel du repas et l’accompagnement propre à chacun', () => {
    let plan = put(testPlan(), 'd0-diner', (s) => withRecipe(s, C.recipes.omelette));
    plan = put(plan, 'd0-diner', (s) => ({
      ...s,
      diners: {
        moi: { ...s.diners.moi, portion: 1.5, sideId: 'brocoli' },
        compagne: { ...s.diners.compagne, sideId: 'riz' },
      },
    }));
    const t = totals(plan);
    expect(t.oeuf).toBeCloseTo(2 * 1.2 * 1.5 + 2); // 5,6
    expect(t.brocoli).toBeCloseTo(150 * 1.5 * 1.5); // légume ×1,5, portion ×1,5
    expect(t.riz).toBeCloseTo(80); // seulement la compagne
  });
});

describe('convives absents', () => {
  it('ne compte aucune portion fictive pour une personne absente', () => {
    let plan = put(testPlan(), 'd2-dejeuner', (s) => withRecipe(s, C.recipes.salade_froide));
    plan = put(plan, 'd2-dejeuner', (s) => ({ ...s, diners: { ...s.diners, compagne: { ...s.diners.compagne, present: false } } }));
    const t = totals(plan);
    expect(t.pates).toBeCloseTo(80 * 0.8);
    expect(t.oeuf).toBeCloseTo(1.2);
  });

  it('un créneau sans personne ne génère rien, même avec une recette', () => {
    let plan = put(testPlan(), 'd1-diner', (s) => withRecipe(s, C.recipes.omelette));
    plan = put(plan, 'd1-diner', (s) => ({
      ...s,
      diners: { moi: { ...s.diners.moi, present: false }, compagne: { ...s.diners.compagne, present: false } },
    }));
    expect(planConsumption(C, plan, profiles)).toHaveLength(0);
  });
});

describe('agrégation des ingrédients', () => {
  it('additionne un même ingrédient venant de recettes et d’unités différentes', () => {
    let plan = put(testPlan(), 'd0-diner', (s) => withRecipe(s, C.recipes.pates_poulet));
    plan = put(plan, 'd1-diner', (s) => withRecipe(s, C.recipes.omelette));
    const agg = aggregate(planConsumption(C, plan, profiles), C);
    // Oignon : 1,25 pc + (50 g ×1,5 + 50 g) = 125 g = 1,25 pc → 2,5 pc
    expect(agg.get('oignon')!.qty).toBeCloseTo(2.5);
    expect(agg.get('oignon')!.unconvertible).toHaveLength(0);
    // Crème : 75 ml + (20×0,5 + 20) ml = 105 ml
    expect(agg.get('creme')!.qty).toBeCloseTo(105);
    expect(agg.get('oignon')!.sources.map((s) => s.name).sort()).toEqual(['Omelette oignon', 'Pâtes poulet crème']);
  });

  it('garde à part une quantité impossible à convertir au lieu de la perdre', () => {
    const catalog = {
      ...C,
      recipes: {
        ...C.recipes,
        bizarre: { ...C.recipes.omelette, id: 'bizarre', ingredients: [{ ingredientId: 'riz', qty: 1, unit: 'pc' as const, role: 'autre' as const }] },
      },
    };
    const plan = put(testPlan(), 'd0-diner', (s) => withRecipe(s, catalog.recipes.bizarre));
    const agg = aggregate(planConsumption(catalog, plan, profiles), catalog);
    expect(agg.get('riz')!.qty).toBe(0);
    expect(agg.get('riz')!.unconvertible).toEqual([{ qty: 2, unit: 'pc' }]);
  });

  it('construit une liste arrondie, déduit le placard et ajoute les articles manuels', () => {
    let plan = put(testPlan(), 'd0-diner', (s) => withRecipe(s, C.recipes.pates_poulet));
    plan = put(plan, 'd1-diner', (s) => withRecipe(s, C.recipes.pates_poulet));
    plan = put(plan, 'd2-diner', (s) => withRecipe(s, C.recipes.pates_poulet));
    const lines = planConsumption(C, plan, profiles);
    const list = buildShoppingList(
      lines,
      C,
      [
        { ingredientId: 'sel', qty: null, unit: 'g' },
        { ingredientId: 'poulet', qty: 0.2, unit: 'kg' },
      ],
      [{ id: 'm1', label: 'Papier cuisson', quantity: '1 rouleau', aisle: 'divers' }],
    );
    const byKey = Object.fromEntries(list.items.map((i) => [i.key, i]));
    // Pâtes : 3 × 180 = 540 g → 2 paquets de 500 g
    expect(byKey['ing:pates'].needed).toBeCloseTo(540);
    expect(byKey['ing:pates'].purchase.packs).toBe(2);
    // Poulet : 660 g − 200 g en stock = 460 g
    expect(byKey['ing:poulet'].toBuy).toBeCloseTo(460);
    expect(byKey['ing:poulet'].purchase.qty).toBe(460);
    // Oignon : 3 × 1,25 = 3,75 → 4 oignons
    expect(byKey['ing:oignon'].purchase.qty).toBe(4);
    // Sel entièrement couvert par le placard
    expect(byKey['ing:sel']).toBeUndefined();
    expect(list.covered.map((c) => c.ingredientId)).toContain('sel');
    expect(byKey['manuel:m1'].display).toBe('1 rouleau');
  });
});

describe('restes', () => {
  it('ne compte pas deux fois les portions réservées pour un déjeuner', () => {
    // Samedi soir : pâtes pour deux ; lundi midi : les restes, pour moi seulement.
    let plan = put(testPlan(), 'd0-diner', (s) => withRecipe(s, C.recipes.pates_poulet));
    plan = put(plan, 'd2-dejeuner', (s) => withLeftover(s, 'd0-diner', C.recipes.pates_poulet));
    plan = put(plan, 'd2-dejeuner', (s) => ({ ...s, diners: { ...s.diners, compagne: { ...s.diners.compagne, present: false } } }));

    const t = totals(plan);
    // 3 repas réels : moi (sam), compagne (sam), moi (lun)
    expect(t.pates).toBeCloseTo(80 + 100 + 80);
    expect(t.poulet).toBeCloseTo(120 + 100 + 120);

    // La cuisson du samedi soir inclut la portion réservée.
    const cook = cookingPlanFor(C, plan, profiles, 'd0-diner')!;
    expect(cook.servings).toBe(3);
    expect(cook.servedSlots).toEqual(['d0-diner', 'd2-dejeuner']);
    const cooked = aggregate(cook.lines, C);
    expect(cooked.get('pates')!.qty).toBeCloseTo(260);

    // Le créneau de restes ne produit pas de cuisson propre.
    expect(cookingPlanFor(C, plan, profiles, 'd2-dejeuner')).toBeNull();
  });

  it('compte les portions supplémentaires (congélateur) une seule fois, au format standard', () => {
    let plan = put(testPlan(), 'd1-diner', (s) => withRecipe(s, C.recipes.pates_poulet));
    plan = put(plan, 'd1-diner', (s) => ({ ...s, extraPortions: 2 }));
    const t = totals(plan);
    expect(t.pates).toBeCloseTo(180 + 200);
    expect(cookingPlanFor(C, plan, profiles, 'd1-diner')!.servings).toBe(4);
  });

  it('les restes suivent la recette du créneau source', () => {
    let plan = put(testPlan(), 'd0-diner', (s) => withRecipe(s, C.recipes.omelette));
    plan = put(plan, 'd1-dejeuner', (s) => withLeftover(s, 'd0-diner', C.recipes.omelette));
    const lines = planConsumption(C, plan, profiles).filter((l) => l.slotId === 'd1-dejeuner');
    expect(lines.every((l) => l.cookedAt === 'd0-diner' && l.sourceName === 'Omelette oignon')).toBe(true);
  });
});
