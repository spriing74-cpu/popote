import { describe, expect, it } from 'vitest';
import type { InventoryItem } from '../types';
import { CATALOG } from '../../data/catalog';
import { defaultSettings, defaultState } from '../../data/defaults';
import { bestMatch, matchIngredient } from '../matching';
import { parseExpiryDates, parseReceipt } from '../receipt';
import { guessIngredient, lookupBarcode, parseOffQuantity, toProductInfo } from '../openfoodfacts';
import { available, consume, defaultQuantity, estimateExpiry, inventoryAsPantry, urgency } from '../inventory';
import { generateIdeas, rankCatalog, TEMPLATE_COUNT } from '../antigaspi';
import { toIngredientUnit } from '../units';
import { planConsumption } from '../portions';
import { buildShoppingList } from '../shopping';
import { reducer } from '../../state/reducer';
import { exportJson, parseImport } from '../../state/persistence';

const TODAY = '2026-09-26';

function item(ingredientId: string | null, qty: number, unit: InventoryItem['unit'], expiry: string | null, extra: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: `${ingredientId}-${expiry}-${qty}`,
    ingredientId,
    label: ingredientId ?? 'Produit',
    qty,
    unit,
    expiry,
    expirySource: expiry ? 'emballage' : 'aucune',
    location: 'frigo',
    addedAt: TODAY,
    ...extra,
  };
}

describe('reconnaissance des libellés', () => {
  it('reconnaît les abréviations de tickets', () => {
    expect(bestMatch('FIL.POUL.X2 500G', CATALOG)).toBe('poulet_filet');
    expect(bestMatch('STK HACHE 5%MG X4', CATALOG)).toBe('boeuf_hache');
    expect(bestMatch('CR FRAICHE EPAISSE 30%', CATALOG)).toBe('creme_epaisse');
    expect(bestMatch('EMMENTAL RAPE 200G', CATALOG)).toBe('emmental_rape');
    expect(bestMatch('COURGETTE VRAC', CATALOG)).toBe('courgette');
    expect(bestMatch('POMMES DE TERRE 2.5KG', CATALOG)).toBe('pomme_de_terre');
    expect(bestMatch('LAIT 1/2 ECR UHT 1L', CATALOG)).toBe('lait');
  });

  it('ne force pas une correspondance douteuse', () => {
    expect(bestMatch('LESSIVE LIQUIDE 2L', CATALOG)).toBeNull();
    expect(bestMatch('PAPIER TOILETTE X12', CATALOG)).toBeNull();
    expect(bestMatch('Nutella Pâte à tartiner aux noisettes et au cacao', CATALOG)).toBeNull();
    expect(bestMatch('JUS DE POMME 1L', CATALOG)).toBeNull();
    expect(bestMatch('PATE BRISEE 230G', CATALOG)).toBe('pate_brisee');
  });

  it('privilégie les correspondances apprises', () => {
    expect(matchIngredient('PDT GRENAILLE', CATALOG, { 'pdt grenaille': 'pomme_de_terre' })[0].ingredientId).toBe('pomme_de_terre');
    expect(bestMatch('XYZ MYSTERE', CATALOG, { 'xyz mystere': 'feta' })).toBe('feta');
  });
});

describe('lecture de ticket', () => {
  const TICKET = `E.LECLERC
SIRET 123 456 789
FIL.POUL.X2 500G          6,49 A
COURGETTE VRAC
0,532 kg x 2,49 €/kg      1,32 A
2 x 1,15
YAOURT NATURE X4          2,30 A
REMISE FIDELITE          -0,50
CR FRAICHE EPAISSE 20CL   1,19 A
SOUS-TOTAL               11,30
TOTAL                    11,30
CB                       11,30
MERCI DE VOTRE VISITE`;

  it('extrait les articles, quantités et prix, en ignorant le reste', () => {
    const lines = parseReceipt(TICKET);
    expect(lines.map((l) => l.label)).toEqual(['FIL.POUL.X2 500G', 'COURGETTE VRAC', 'YAOURT NATURE X4', 'CR FRAICHE EPAISSE 20CL']);
    const [poulet, courgette, yaourt, creme] = lines;
    expect(poulet).toMatchObject({ qty: 500, unit: 'g', price: 6.49, count: 2 });
    expect(courgette).toMatchObject({ qty: 0.532, unit: 'kg', count: 2 });
    expect(yaourt.count).toBe(4);
    expect(creme).toMatchObject({ qty: 20, unit: 'cl', price: 1.19 });
  });

  it('corrige les confusions d’OCR au contact des chiffres', () => {
    expect(parseReceipt('CR FRAICHE EPAISSE 2@CL 1,19')[0]).toMatchObject({ qty: 20, unit: 'cl' });
    expect(parseReceipt('RIZ BASMATI 1OOOG 2,45')[0]).toMatchObject({ qty: 1000, unit: 'g' });
    expect(parseReceipt('POMME GOLDEN 1,95')[0].label).toBe('POMME GOLDEN');
  });

  it('quantité par défaut cohérente pour le stock', () => {
    // 500 g lus sur l'étiquette « X2 » : 2 barquettes de 500 g
    expect(defaultQuantity(CATALOG, 'poulet_filet', 2, 500, 'g')).toEqual({ qty: 1000, unit: 'g' });
    // Yaourts x4 : conditionnement 4 pièces
    expect(defaultQuantity(CATALOG, 'yaourt_nature', 1, null, null)).toEqual({ qty: 4, unit: 'pc' });
    // Unité incompatible (pc sans poids pour du persil en g) : on retombe sur les pièces
    expect(defaultQuantity(CATALOG, 'persil', 1, 30, 'g')).toEqual({ qty: 1, unit: 'pc' });
  });
});

describe('dates de péremption', () => {
  it('lit les formats usuels et écarte les dates impossibles ou lointaines', () => {
    expect(parseExpiryDates('A consommer jusqu’au : 02/10/2026 L1234', TODAY)).toEqual(['2026-10-02']);
    expect(parseExpiryDates('DLC 30.09.26', TODAY)).toEqual(['2026-09-30']);
    expect(parseExpiryDates('à consommer de préférence avant fin 03/2027', TODAY)).toEqual(['2027-03-31']);
    expect(parseExpiryDates('DDM 12 OCT 2026', TODAY)).toEqual(['2026-10-12']);
    expect(parseExpiryDates('31/02/2026 et 01/01/2099', TODAY)).toEqual([]);
    // O lu à la place de 0
    expect(parseExpiryDates('DLC O5/1O/2O26', TODAY)).toEqual(['2026-10-05']);
  });
});

describe('Open Food Facts', () => {
  it('interprète les quantités', () => {
    expect(parseOffQuantity('500 g')).toEqual({ qty: 500, unit: 'g' });
    expect(parseOffQuantity('6 x 125 g')).toEqual({ qty: 750, unit: 'g' });
    expect(parseOffQuantity('1 L')).toEqual({ qty: 1, unit: 'l' });
    expect(parseOffQuantity('20 cl')).toEqual({ qty: 20, unit: 'cl' });
    expect(parseOffQuantity('6 oeufs')).toEqual({ qty: 6, unit: 'pc' });
    expect(parseOffQuantity('')).toBeNull();
  });

  it('rattache un produit par catégorie exacte puis par nom', () => {
    expect(guessIngredient({ categories_tags: ['en:meats', 'en:poultries', 'en:chicken-breasts'] }, CATALOG)).toBe('poulet_filet');
    // « en:corn » ne doit pas matcher des corn-flakes
    expect(guessIngredient({ categories_tags: ['en:breakfast-cereals', 'en:cornflakes'], product_name: 'Corn flakes' }, CATALOG)).toBeNull();
    expect(guessIngredient({ product_name_fr: 'Crème fraîche épaisse 30%' }, CATALOG)).toBe('creme_epaisse');
    const p = toProductInfo('3033490004743', { product_name_fr: 'Emmental râpé', brands: 'Président, Lactalis', quantity: '200 g' }, CATALOG);
    expect(p).toMatchObject({ name: 'Emmental râpé', brand: 'Président', ingredientId: 'emmental_rape', qty: 200, unit: 'g' });
  });

  it('gère produit inconnu, erreur réseau et code invalide sans planter', async () => {
    const notFound = (async () => new Response('{"status":0}', { status: 404 })) as unknown as typeof fetch;
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const ok = (async () => new Response(JSON.stringify({ status: 1, product: { product_name: 'Lardons fumés', quantity: '2 x 100 g' } }))) as unknown as typeof fetch;
    expect((await lookupBarcode('3000000000000', CATALOG, {}, notFound)).status).toBe('inconnu');
    expect((await lookupBarcode('3000000000000', CATALOG, {}, offline)).status).toBe('hors_ligne');
    expect((await lookupBarcode('abc', CATALOG, {}, ok)).status).toBe('erreur');
    const r = await lookupBarcode('3000000000000', CATALOG, {}, ok);
    expect(r.status === 'trouve' && r.product.ingredientId).toBe('lardons');
    expect(r.status === 'trouve' && r.product.qty).toBe(200);
  });
});

describe('stock', () => {
  const inv: InventoryItem[] = [
    item('poulet_filet', 300, 'g', '2026-09-27'),
    item('poulet_filet', 0.5, 'kg', '2026-09-30'),
    item('poulet_filet', 200, 'g', '2026-09-20'), // périmé
    item('creme_liquide', 20, 'cl', '2026-10-10'),
    item(null, 1, 'pc', null, { label: 'Lessive' }),
  ];

  it('additionne le stock utilisable en excluant le périmé', () => {
    expect(available(inv, 'poulet_filet', CATALOG, TODAY)).toBeCloseTo(800);
    expect(available(inv, 'creme_liquide', CATALOG, TODAY)).toBeCloseTo(200);
    expect(urgency(inv[0], TODAY)).toBe('urgent');
    expect(urgency(inv[2], TODAY)).toBe('perime');
    expect(urgency(inv[4], TODAY)).toBe('inconnu');
  });

  it('consomme d’abord ce qui périme le plus tôt et signale ce qui manque', () => {
    const lines = [
      { ingredientId: 'poulet_filet', qty: 450, unit: 'g' as const, role: 'proteine' as const, slotId: 'sam-diner' as const, cookedAt: 'sam-diner' as const, profileId: 'moi' as const, origin: 'recette' as const, sourceName: 'x' },
      { ingredientId: 'oeuf', qty: 2, unit: 'pc' as const, role: 'proteine' as const, slotId: 'sam-diner' as const, cookedAt: 'sam-diner' as const, profileId: 'moi' as const, origin: 'recette' as const, sourceName: 'x' },
    ];
    const { inventory, missing } = consume(inv, lines, CATALOG);
    // Le lot périmé (20/09) passe en premier dans l'ordre FIFO : 200 g, puis 250 g du lot du 27/09.
    const poulet = inventory.filter((i) => i.ingredientId === 'poulet_filet');
    const total = poulet.reduce((s, i) => s + toIngredientUnit(i.qty, i.unit, CATALOG.ingredients.poulet_filet)!, 0);
    expect(total).toBeCloseTo(1000 - 450);
    expect(poulet.find((i) => i.expiry === '2026-09-20')).toBeUndefined();
    expect(missing).toEqual({ oeuf: 2 });
  });

  it('estime une date sans l’inventer quand l’emballage est lu', () => {
    expect(estimateExpiry('boeuf_hache', 'frigo', TODAY)).toBe('2026-09-28');
    expect(estimateExpiry('boeuf_hache', 'congelateur', TODAY)).toBe('2026-12-25');
  });

  it('déduit le stock non périmé de la liste de courses', () => {
    const reduce = reducer(CATALOG);
    let s = defaultState();
    s = reduce(s, { type: 'setRecipe', slot: 'sam-diner', recipeId: 'curry_poulet_coco' });
    const lines = planConsumption(CATALOG, s.plan, s.profiles);
    const without = buildShoppingList(lines, CATALOG, s.pantry, []).items.find((i) => i.ingredientId === 'poulet_filet')!;
    const withStock = buildShoppingList(lines, CATALOG, [...s.pantry, ...inventoryAsPantry(inv, CATALOG, TODAY)], []);
    expect(without.needed).toBeCloseTo(130 * 1.1 + 130);
    // 800 g en stock couvrent les 273 g : le poulet n'est plus à acheter.
    expect(withStock.items.find((i) => i.ingredientId === 'poulet_filet')).toBeUndefined();
    expect(withStock.covered.find((i) => i.ingredientId === 'poulet_filet')).toBeDefined();
  });

  it('« C’est cuisiné » retire du stock une seule fois', () => {
    const reduce = reducer(CATALOG);
    let s = { ...defaultState(), inventory: inv };
    s = reduce(s, { type: 'setRecipe', slot: 'sam-diner', recipeId: 'curry_poulet_coco' });
    const lines = planConsumption(CATALOG, s.plan, s.profiles);
    s = reduce(s, { type: 'markCooked', slot: 'sam-diner', lines, date: TODAY });
    const after1 = available(s.inventory, 'poulet_filet', CATALOG, TODAY);
    s = reduce(s, { type: 'markCooked', slot: 'sam-diner', lines, date: TODAY });
    expect(available(s.inventory, 'poulet_filet', CATALOG, TODAY)).toBeCloseTo(after1);
    expect(s.plan.slots['sam-diner'].cookedOn).toBe(TODAY);
  });
});

describe('anti-gaspi', () => {
  const inv: InventoryItem[] = [
    item('courgette', 500, 'g', '2026-09-27'),
    item('champignon', 250, 'g', '2026-09-28'),
    item('lardons', 200, 'g', '2026-10-01'),
    item('oeuf', 6, 'pc', '2026-10-15'),
    item('creme_liquide', 200, 'ml', '2026-10-05'),
    item('emmental_rape', 200, 'g', '2026-10-20'),
    item('pates_courtes', 500, 'g', '2027-06-01', { location: 'placard' }),
  ];

  it('compose des recettes valides qui utilisent d’abord ce qui périme', () => {
    const ideas = generateIdeas(CATALOG, inv, TODAY, defaultSettings());
    expect(ideas.length).toBeGreaterThanOrEqual(4);
    expect(ideas.length).toBeLessThanOrEqual(TEMPLATE_COUNT);
    for (const idea of ideas) {
      const r = idea.recipe;
      expect(r.id.startsWith('vf-')).toBe(true);
      expect(r.steps.length).toBeGreaterThan(1);
      for (const ri of r.ingredients) {
        expect(CATALOG.ingredients[ri.ingredientId], ri.ingredientId).toBeDefined();
        expect(toIngredientUnit(ri.qty, ri.unit, CATALOG.ingredients[ri.ingredientId])).not.toBeNull();
        expect(ri.qty).toBeGreaterThan(0);
      }
      // Aucun ingrédient en double dans une recette
      expect(new Set(r.ingredients.map((i) => i.ingredientId)).size).toBe(r.ingredients.length);
    }
    // La courgette (J-1) est utilisée par la meilleure idée
    expect(ideas[0].uses.map((u) => u.ingredientId)).toContain('courgette');
    const omelette = ideas.find((i) => i.templateId === 'omelette')!;
    expect(omelette.missing).toEqual([]);
  });

  it('respecte les exclusions et varie avec « autres idées »', () => {
    const s = { ...defaultSettings(), excludedIngredients: ['lardons'] };
    for (const i of generateIdeas(CATALOG, inv, TODAY, s)) expect(i.recipe.ingredients.map((x) => x.ingredientId)).not.toContain('lardons');
    const a = generateIdeas(CATALOG, inv, TODAY, null, 0).map((i) => i.recipe.id);
    const b = generateIdeas(CATALOG, inv, TODAY, null, 1).map((i) => i.recipe.id);
    expect(a).not.toEqual(b);
  });

  it('ne propose rien sans stock et ignore le périmé', () => {
    expect(generateIdeas(CATALOG, [], TODAY, null)).toEqual([]);
    expect(generateIdeas(CATALOG, [item('courgette', 500, 'g', '2026-09-01')], TODAY, null)).toEqual([]);
  });

  it('classe le catalogue selon ce qu’il sauve', () => {
    const ranked = rankCatalog(CATALOG, inv, TODAY, defaultSettings());
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].uses.length).toBeGreaterThanOrEqual(2);
    // Les premières recettes sauvent un produit qui périme sous 2 jours (courgette J-1, champignons J-2).
    for (const r of ranked.slice(0, 3)) expect(r.uses.some((u) => u.daysLeft !== null && u.daysLeft <= 2)).toBe(true);
  });

  it('une recette gardée est planifiable, sauvegardée et réimportée', () => {
    const reduce = reducer(CATALOG);
    const idea = generateIdeas(CATALOG, inv, TODAY, null)[0].recipe;
    let s = defaultState();
    s = reduce(s, { type: 'keepRecipe', recipe: idea });
    s = reduce(s, { type: 'setRecipe', slot: 'dim-diner', recipeId: idea.id });
    expect(s.plan.slots['dim-diner'].recipeId).toBe(idea.id);
    const back = parseImport(exportJson(s), CATALOG);
    expect(back.customRecipes[0].id).toBe(idea.id);
    expect(back.plan.slots['dim-diner'].recipeId).toBe(idea.id);
    // Une recette utilisée au planning ne peut pas être oubliée.
    expect(reduce(s, { type: 'removeCustomRecipe', id: idea.id }).customRecipes).toHaveLength(1);
  });
});
