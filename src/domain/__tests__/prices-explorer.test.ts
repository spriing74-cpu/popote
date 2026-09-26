import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../data/catalog';
import { REFERENCE_PRICES } from '../../data/referencePrices';
import { defaultState } from '../../data/defaults';
import { reducer } from '../../state/reducer';
import { planConsumption } from '../portions';
import { buildShoppingList } from '../shopping';
import { compareStores, estimateBudget } from '../budget';
import { parsePriceCsv } from '../priceImport';
import { CASTRES, summarize, toOpenPrices } from '../openprices';
import { matchEnglish, parseMeasure, proposeImport, toPopoteRecipe, translateQuery, type Meal } from '../themealdb';
import { toIngredientUnit } from '../units';
// @ts-expect-error script Node sans déclaration de types
import { parseSdmx } from '../../../scripts/fetch-insee-prices.mjs';
import type { PriceEntry } from '../types';

const TODAY = '2026-09-26';

function listFor(recipeId: string) {
  let s = defaultState();
  s = reducer(CATALOG)(s, { type: 'setRecipe', slot: 'sam-diner', recipeId });
  return buildShoppingList(planConsumption(CATALOG, s.plan, s.profiles), CATALOG, s.pantry, []).items;
}

describe('budget : ordre des sources de prix', () => {
  const items = listFor('ratatouille_oeufs');
  const p = (ingredientId: string, store: PriceEntry['store'], price: number): PriceEntry => ({
    id: `${ingredientId}-${store}`,
    ingredientId,
    store,
    price,
    perQty: 1,
    perUnit: 'kg',
    date: TODAY,
    source: 'ticket',
  });
  const prices = [p('courgette', 'leclerc', 2), p('courgette', 'auchan', 3), p('aubergine', 'auchan', 4)];

  it('magasin choisi, puis autre magasin, puis moyenne INSEE, sinon « sans prix »', () => {
    const est = estimateBudget(items, prices, CATALOG, 'leclerc', REFERENCE_PRICES);
    expect(est.byOrigin.magasin).toBe(1); // courgette chez Leclerc
    expect(est.byOrigin.autre_magasin).toBe(1); // aubergine relevée seulement chez Auchan
    expect(est.byOrigin.insee).toBeGreaterThan(0); // tomates, poivrons, oignons…
    expect(est.inseePeriod).toMatch(/^\d{4}-\d{2}$/);
    const courgette = items.find((i) => i.ingredientId === 'courgette')!;
    const aubergine = items.find((i) => i.ingredientId === 'aubergine')!;
    const tomate = items.find((i) => i.ingredientId === 'tomate')!;
    const tomatoRef = REFERENCE_PRICES.find((r) => r.ingredientId === 'tomate')!;
    const known = (courgette.purchase.qty / 1000) * 2 + (aubergine.purchase.qty / 1000) * 4 + (tomate.purchase.qty / 1000) * tomatoRef.price;
    expect(est.total).toBeGreaterThanOrEqual(known - 1e-9);
    // Sans référence INSEE, les produits non relevés restent « sans prix » : rien n'est estimé au hasard.
    const noRef = estimateBudget(items, prices, CATALOG, 'leclerc', []);
    expect(noRef.byOrigin.insee).toBe(0);
    expect(noRef.missing).toContain('Tomates');
  });

  it('la comparaison entre magasins n’utilise que les prix de chaque magasin', () => {
    const cmp = compareStores(items, prices, CATALOG);
    const leclerc = cmp.find((c) => c.store === 'leclerc')!.estimate;
    const auchan = cmp.find((c) => c.store === 'auchan')!.estimate;
    expect(leclerc.pricedCount).toBe(1);
    expect(auchan.pricedCount).toBe(2);
    expect(leclerc.byOrigin.insee).toBe(0);
  });
});

describe('prix INSEE', () => {
  it('le fichier embarqué ne contient que des prix exploitables', () => {
    expect(REFERENCE_PRICES.length).toBeGreaterThanOrEqual(10);
    for (const r of REFERENCE_PRICES) {
      expect(r.price).toBeGreaterThan(0);
      expect(toIngredientUnit(r.perQty, r.perUnit, CATALOG.ingredients[r.ingredientId]), r.ingredientId).not.toBeNull();
    }
  });

  it('lit une réponse SDMX et garde l’observation la plus récente', () => {
    const xml = '<Series IDBANK="000641429" FREQ="M"><Obs TIME_PERIOD="2026-07" OBS_VALUE="4.1"/><Obs TIME_PERIOD="2026-08" OBS_VALUE="4.26"/></Series>';
    expect(parseSdmx(xml)).toEqual({ '000641429': { period: '2026-08', value: 4.26 } });
  });
});

describe('import de prix CSV', () => {
  it('importe, reconnaît les produits et signale les erreurs', () => {
    const csv = [
      'produit;prix;quantite;unite;magasin;date',
      'Filets de poulet;11,90;1;kg;Leclerc Castres;2026-09-20',
      'COURGETTE;2.49',
      'Lait demi-écrémé;1,05;1;l;Auchan;21/09/2026',
      'Lessive;7,90',
      'Carottes;abc',
      'Oeufs;2,10;6;pc',
    ].join('\n');
    const r = parsePriceCsv(csv, CATALOG, {}, 'lidl', TODAY);
    expect(r.entries.map((e) => [e.ingredientId, e.store, e.price, e.perQty, e.perUnit, e.date])).toEqual([
      ['poulet_filet', 'leclerc', 11.9, 1, 'kg', '2026-09-20'],
      ['courgette', 'lidl', 2.49, 1, 'kg', TODAY],
      ['lait', 'auchan', 1.05, 1, 'l', '2026-09-21'],
      ['oeuf', 'lidl', 2.1, 6, 'pc', TODAY],
    ]);
    expect(r.errors).toHaveLength(2); // lessive non reconnue, prix invalide
    expect(r.entries.every((e) => e.source === 'import')).toBe(true);
  });
});

describe('Open Prices', () => {
  it('garde les relevés proches de Castres, sinon le plus récent en France', () => {
    const raw = [
      { price: 3.49, currency: 'EUR', date: '2026-09-10', location: { osm_brand: 'E.Leclerc', osm_address_city: 'Castres', osm_lat: 43.61, osm_lon: 2.25 } },
      { price: 3.2, currency: 'EUR', date: '2026-09-20', location: { osm_brand: 'Carrefour', osm_address_city: 'Grenoble', osm_lat: 45.18, osm_lon: 5.72 } },
      { price: 3.9, currency: 'EUR', date: '2026-08-01', location: { osm_brand: 'Auchan', osm_address_city: 'Albi', osm_lat: 43.93, osm_lon: 2.15 } },
    ];
    const s = summarize(toOpenPrices(raw, CASTRES));
    // Albi est à ~37 km : dans le rayon de 40 km. Tri du plus récent au plus ancien.
    expect(s.nearby.map((p) => p.city)).toEqual(['Castres', 'Albi']);
    expect(s.nearby[0].distanceKm).toBeLessThanOrEqual(1);
    const far = summarize(toOpenPrices(raw.slice(1), CASTRES), 20);
    expect(far.nearby).toEqual([]);
    expect(far.latestElsewhere?.city).toBe('Grenoble');
  });
});

describe('TheMealDB', () => {
  it('traduit la recherche et lit les mesures anglaises', () => {
    expect(translateQuery('Poulet')).toBe('chicken');
    expect(parseMeasure('1 1/2 tbsp')).toEqual({ qty: 1.5, unit: 'cs' });
    expect(parseMeasure('200g')).toEqual({ qty: 200, unit: 'g' });
    expect(parseMeasure('½ tsp')).toEqual({ qty: 0.5, unit: 'cc' });
    expect(parseMeasure('2 cups')).toEqual({ qty: 480, unit: 'ml' });
    expect(parseMeasure('1 lb')?.qty).toBeCloseTo(453.6);
    expect(parseMeasure('Pinch')).toEqual({ qty: 0.5, unit: 'g' });
    expect(parseMeasure('to taste')).toBeNull();
    expect(parseMeasure('3 large')).toEqual({ qty: 3, unit: 'pc' });
  });

  it('rattache les ingrédients anglais sans confusion', () => {
    expect(matchEnglish('Chicken Breasts', CATALOG)).toBe('poulet_filet');
    expect(matchEnglish('Chicken Stock', CATALOG)).toBe('bouillon');
    expect(matchEnglish('Red Pepper', CATALOG)).toBe('poivron');
    expect(matchEnglish('Pepper', CATALOG)).toBe('poivre');
    expect(matchEnglish('Extra Virgin Olive Oil', CATALOG)).toBe('huile_olive');
    expect(matchEnglish('Scotch Bonnet', CATALOG)).toBeNull();
  });

  const meal: Meal = {
    idMeal: '52904',
    strMeal: 'Test Stew',
    strCategory: 'Beef',
    strArea: 'French',
    strInstructions: 'STEP 1\r\nBrown the beef.\r\n\r\nSTEP 2\r\nAdd the wine and simmer.',
    strMealThumb: 'https://www.themealdb.com/images/media/meals/x.jpg',
    strYoutube: 'https://www.youtube.com/watch?v=SQnr4Z-7rok',
    strSource: 'https://example.org/stew',
    strIngredient1: 'Beef',
    strMeasure1: '1kg',
    strIngredient2: 'Chicken Stock',
    strMeasure2: '500ml',
    strIngredient3: 'Coconut Milk',
    strMeasure3: '1 can',
    strIngredient4: 'Onions',
    strMeasure4: '2',
    strIngredient5: 'Scotch Bonnet',
    strMeasure5: '1',
    strIngredient6: 'Beef',
    strMeasure6: '200g',
  };

  it('convertit en recette Popote structurée, par portion, avec vidéo et source', () => {
    const lines = proposeImport(meal, CATALOG);
    expect(lines.map((l) => l.ingredientId)).toEqual(['boeuf_mijoter', 'bouillon', 'lait_coco', 'oignon', null, 'boeuf_mijoter']);
    expect(lines[1]).toMatchObject({ qty: 1, unit: 'pc' }); // 500 ml de bouillon = 1 cube
    expect(lines[2]).toMatchObject({ qty: 400, unit: 'ml' }); // 1 boîte
    const r = toPopoteRecipe(meal, lines, 4, 'Mijoté test', CATALOG);
    expect(r.id).toBe('mdb-52904');
    expect(r.ingredients.find((i) => i.ingredientId === 'boeuf_mijoter')!.qty).toBe(300); // (1000 + 200) / 4
    expect(r.steps).toEqual(['Brown the beef.', 'Add the wine and simmer.']);
    expect(r.videoUrl).toBe(meal.strYoutube);
    expect(r.source?.url).toBe('https://example.org/stew');
    let s = defaultState();
    const reduce = reducer(CATALOG);
    s = reduce(s, { type: 'keepRecipe', recipe: r });
    s = reduce(s, { type: 'setRecipe', slot: 'lun-diner', recipeId: r.id });
    expect(s.plan.slots['lun-diner'].recipeId).toBe('mdb-52904');
  });
});
