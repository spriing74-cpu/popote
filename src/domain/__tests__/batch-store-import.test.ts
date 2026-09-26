import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../data/catalog';
import { defaultState } from '../../data/defaults';
import { reducer } from '../../state/reducer';
import { AISLE_ORDER } from '../../data/aisles';
import { applianceOf, batchPlan } from '../batchPlan';
import { completeOrder, mergeVisit, moveAisle } from '../storeOrder';
import { extractLdBlocks, isoMinutes, parseIngredientLine, parseRecipeText, proposeLines, recipeFromLd, toImportedRecipe } from '../recipeImport';

describe('plan de session batch cooking', () => {
  const reduce = reducer(CATALOG);
  let s = defaultState(); // dimanche → dimanche, batch le dimanche (d0)
  s = reduce(s, { type: 'setRecipe', slot: 'd0-diner', recipeId: 'lasagnes_bolognaise' });
  s = reduce(s, { type: 'setRecipe', slot: 'd1-diner', recipeId: 'chili_con_carne' });
  s = reduce(s, { type: 'setRecipe', slot: 'd2-diner', recipeId: 'gratin_courgettes_riz' });
  s = reduce(s, { type: 'setRecipe', slot: 'd3-diner', recipeId: 'boeuf_bourguignon' });
  const p = batchPlan(CATALOG, s.plan, s.profiles, 'd0');

  it('regroupe les plats du jour de préparation et respecte un seul cuisinier', () => {
    const plats = p.tasks.filter((t) => t.kind === 'plat');
    expect(plats.map((t) => t.recipeId).sort()).toEqual(['boeuf_bourguignon', 'chili_con_carne', 'gratin_courgettes_riz', 'lasagnes_bolognaise'].sort());
    // Les temps actifs ne se chevauchent jamais.
    const actives = [...p.tasks].sort((a, b) => a.start - b.start);
    for (let i = 1; i < actives.length; i++) expect(actives[i].start).toBeGreaterThanOrEqual(actives[i - 1].start + actives[i - 1].active);
    // Le plus long mijotage est lancé en premier.
    expect(actives[0].recipeId).toBe('boeuf_bourguignon');
  });

  it('ne met jamais plus de 2 plats au four en même temps et gagne du temps sur la cuisine en série', () => {
    const four = p.tasks.filter((t) => t.appliance === 'four');
    for (const a of four) {
      const overlap = four.filter((b) => b.applianceFrom < a.end && a.applianceFrom < b.end).length;
      expect(overlap).toBeLessThanOrEqual(2);
    }
    const serial = p.tasks.reduce((sum, t) => sum + t.active + t.passive, 0);
    expect(p.cookingEnd).toBeLessThan(serial * 0.75);
    expect(p.steps[0].at).toBe(0);
    expect(p.boxes.length).toBeGreaterThanOrEqual(4);
  });

  it('reconnaît l’appareil principal', () => {
    expect(applianceOf(CATALOG.recipes.lasagnes_bolognaise)).toBe('four');
    expect(applianceOf(CATALOG.recipes.chili_con_carne)).toBe('plaques');
  });
});

describe('ordre des rayons par magasin', () => {
  it('complète, déplace et apprend un parcours', () => {
    const base = completeOrder(undefined, AISLE_ORDER);
    expect(base).toEqual(AISLE_ORDER);
    expect(moveAisle(base, 'boulangerie', -1).slice(0, 2)).toEqual(['boulangerie', 'fruits_legumes']);
    // Parcours observé : surgelés avant les fruits et légumes, boulangerie à la fin.
    const next = mergeVisit(base, ['surgeles', 'fruits_legumes', 'boulangerie']);
    expect(next.indexOf('surgeles')).toBeLessThan(next.indexOf('fruits_legumes'));
    expect(next.indexOf('fruits_legumes')).toBeLessThan(next.indexOf('boulangerie'));
    // Les rayons non visités restent à leur place.
    expect(next.indexOf('frais')).toBe(base.indexOf('frais'));
    expect(completeOrder(['surgeles', 'inconnu' as never], AISLE_ORDER)[0]).toBe('surgeles');
  });
});

describe('import de recettes', () => {
  it('lit les lignes d’ingrédients en français', () => {
    expect(parseIngredientLine('200 g de farine')).toMatchObject({ qty: 200, unit: 'g', name: 'farine' });
    expect(parseIngredientLine('3 œufs')).toMatchObject({ qty: 3, unit: 'pc', name: 'œufs' });
    expect(parseIngredientLine("1 c. à soupe d'huile d'olive")).toMatchObject({ qty: 1, unit: 'cs', name: "huile d'olive" });
    expect(parseIngredientLine('½ citron')).toMatchObject({ qty: 0.5, name: 'citron' });
    expect(parseIngredientLine('20 cl de crème liquide')).toMatchObject({ qty: 20, unit: 'cl', name: 'crème liquide' });
    expect(parseIngredientLine('2 gousses d’ail')).toMatchObject({ qty: 2, unit: 'pc', name: 'ail' });
    expect(parseIngredientLine('1 boîte de tomates concassées')).toMatchObject({ qty: 1, unit: 'pack' });
    expect(parseIngredientLine('Sel, poivre')).toMatchObject({ qty: null, name: 'Sel' });
  });

  it('lit un texte collé avec rubriques et construit une recette par portion', () => {
    const text = [
      'Gratin de courgettes',
      'Pour 4 personnes',
      'Temps de préparation : 15 min',
      'Ingrédients',
      '800 g de courgettes',
      '3 œufs',
      '20 cl de crème liquide',
      '100 g d’emmental râpé',
      'Préparation',
      '1. Couper les courgettes en rondelles et les faire revenir 10 min.',
      '2. Battre les œufs avec la crème, verser sur les courgettes,',
      'parsemer de fromage.',
      '3. Cuire 30 min à 180 °C.',
    ].join('\n');
    const parsed = parseRecipeText(text);
    expect(parsed.name).toBe('Gratin de courgettes');
    expect(parsed.servings).toBe(4);
    expect(parsed.ingredients).toHaveLength(4);
    expect(parsed.steps).toHaveLength(3);
    expect(parsed.steps[1]).toContain('parsemer de fromage');
    const lines = proposeLines(parsed, CATALOG);
    expect(lines.map((l) => l.ingredientId)).toEqual(['courgette', 'oeuf', 'creme_liquide', 'emmental_rape']);
    const r = toImportedRecipe(parsed, lines, 4, parsed.name, parsed.steps, CATALOG);
    expect(r.id).toMatch(/^imp-/);
    expect(r.category).toBe('four');
    expect(r.ingredients.find((i) => i.ingredientId === 'courgette')!.qty).toBe(200);
    expect(r.ingredients.find((i) => i.ingredientId === 'oeuf')!.qty).toBe(0.75);
    expect(r.activeMin).toBe(15);
    expect(r.vegetarian).toBe(true);
  });

  it('lit les données structurées schema.org d’une page', () => {
    const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Recipe","name":"Blanquette de veau","recipeYield":"6 personnes","prepTime":"PT30M","totalTime":"PT2H","image":["https://img.example/b.jpg"],"recipeIngredient":["1 kg de veau","2 carottes","25 cl de cr&egrave;me"],"recipeInstructions":[{"@type":"HowToStep","text":"Couper la viande."},{"@type":"HowToSection","itemListElement":[{"@type":"HowToStep","text":"Mijoter 1 h 30."}]}]}]}</script></head></html>`;
    const r = recipeFromLd(extractLdBlocks(html), 'https://www.marmiton.org/recettes/blanquette.aspx')!;
    expect(r).toMatchObject({ name: 'Blanquette de veau', servings: 6, activeMin: 30, totalMin: 120, sourceName: 'marmiton.org', imageUrl: 'https://img.example/b.jpg' });
    expect(r.ingredients).toHaveLength(3);
    expect(r.steps).toEqual(['Couper la viande.', 'Mijoter 1 h 30.']);
    expect(isoMinutes('PT1H15M')).toBe(75);
  });
});
