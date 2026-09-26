import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../data/catalog';
import { defaultProfiles } from '../../data/defaults';
import { ingredientStock, recipeShelves, servingQty, similarRecipes, stepTimers } from '../recipeTools';

describe('minuteurs lus dans les étapes', () => {
  it('reconnaît minutes, heures et intervalles', () => {
    expect(stepTimers('Cuire 20 min à 200 °C en retournant.')).toEqual([{ minutes: 20, label: '20 min' }]);
    expect(stepTimers('Mijoter 20 à 25 minutes à couvert.')).toEqual([{ minutes: 20, label: '20 min' }]);
    expect(stepTimers('Laisser mijoter 1 h 30, puis 10 min à découvert.')).toEqual([
      { minutes: 90, label: '1 h 30' },
      { minutes: 10, label: '10 min' },
    ]);
    expect(stepTimers('Mariner 2 heures au frais.')).toEqual([{ minutes: 120, label: '2 h' }]);
    expect(stepTimers('Ajouter 1 huile et 200 g de riz à 180 °C.')).toEqual([]);
  });

  it('trouve au moins un minuteur dans la plupart des recettes', () => {
    const recipes = Object.values(CATALOG.recipes);
    const withTimer = recipes.filter((r) => r.steps.some((s) => stepTimers(s).length > 0));
    expect(withTimer.length / recipes.length).toBeGreaterThan(0.6);
  });
});

describe('portions et stock', () => {
  const profiles = defaultProfiles();
  const r = CATALOG.recipes.chili_con_carne;
  const boeuf = r.ingredients.find((i) => i.ingredientId === 'boeuf_hache')!;

  it('additionne les deux profils pour « nous deux »', () => {
    const moi = servingQty(boeuf, { kind: 'profil', id: 'moi' }, profiles);
    const elle = servingQty(boeuf, { kind: 'profil', id: 'compagne' }, profiles);
    expect(servingQty(boeuf, { kind: 'foyer' }, profiles)).toBeCloseTo(moi + elle);
    expect(servingQty(boeuf, { kind: 'portions', n: 4 }, profiles)).toBeCloseTo(boeuf.qty * 4);
  });

  it('distingue frigo, placard et manquant', () => {
    const today = '2026-09-26';
    const inv = [{ id: 'a', ingredientId: 'boeuf_hache', label: 'Bœuf', qty: 500, unit: 'g' as const, expiry: '2026-09-28', expirySource: 'emballage' as const, location: 'frigo' as const, addedAt: today }];
    expect(ingredientStock(boeuf, 250, CATALOG, inv, [], today)).toBe('frigo');
    expect(ingredientStock(boeuf, 900, CATALOG, inv, [], today)).toBe('manque');
    const sel = { ingredientId: 'sel', qty: 1, unit: 'g' as const, role: 'autre' as const };
    expect(ingredientStock(sel, 1, CATALOG, [], [], today)).toBe('placard');
  });
});

describe('découverte', () => {
  it('propose des recettes proches et des rayons sans les « plus jamais »', () => {
    const r = CATALOG.recipes.chili_con_carne;
    const sim = similarRecipes(r, CATALOG);
    expect(sim.length).toBeGreaterThan(2);
    expect(sim.map((x) => x.id)).not.toContain(r.id);
    const shelves = recipeShelves(CATALOG, {
      favorites: ['chili_con_carne'],
      ratings: { pot_au_feu: -1 },
      history: [],
      planned: [],
      fromFridge: [],
      today: '2026-09-26',
      allowed: () => true,
    });
    expect(shelves.map((s) => s.id)).toContain('rapide');
    expect(shelves.find((s) => s.id === 'aimes')!.recipes.map((x) => x.id)).toEqual(['chili_con_carne']);
    for (const s of shelves) expect(s.recipes.map((x) => x.id)).not.toContain('pot_au_feu');
    // Même jour = mêmes rayons ; autre jour = autre sélection.
    const again = recipeShelves(CATALOG, { favorites: [], ratings: {}, history: [], planned: [], fromFridge: [], today: '2026-09-26', allowed: () => true });
    const other = recipeShelves(CATALOG, { favorites: [], ratings: {}, history: [], planned: [], fromFridge: [], today: '2026-09-27', allowed: () => true });
    const ids = (x: typeof again) => x.find((s) => s.id === 'rapide')!.recipes.map((r) => r.id);
    expect(ids(again)).toEqual(ids(recipeShelves(CATALOG, { favorites: [], ratings: {}, history: [], planned: [], fromFridge: [], today: '2026-09-26', allowed: () => true })));
    expect(ids(other)).not.toEqual(ids(again));
  });
});
