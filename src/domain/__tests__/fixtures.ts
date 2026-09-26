import type { Catalog, Profile, ProfileId, Recipe } from '../types';
import { emptyPlan } from '../week';

/** Petit catalogue maîtrisé pour des tests aux chiffres faciles à vérifier. */
export const testCatalog: Catalog = {
  ingredients: {
    pates: { id: 'pates', name: 'Pâtes', aisle: 'epicerie_salee', unit: 'g', pack: { size: 500, label: 'paquet de 500 g' } },
    poulet: { id: 'poulet', name: 'Poulet', aisle: 'boucherie', unit: 'g' },
    creme: { id: 'creme', name: 'Crème', aisle: 'frais', unit: 'ml', densityGPerMl: 1 },
    oignon: { id: 'oignon', name: 'Oignon', aisle: 'fruits_legumes', unit: 'pc', pieceWeightG: 100, pieceLabel: 'oignon' },
    brocoli: { id: 'brocoli', name: 'Brocoli', aisle: 'fruits_legumes', unit: 'g' },
    riz: { id: 'riz', name: 'Riz', aisle: 'epicerie_salee', unit: 'g' },
    oeuf: { id: 'oeuf', name: 'Œufs', aisle: 'frais', unit: 'pc', pack: { size: 6, label: 'boîte de 6' }, allergens: ['oeuf'] },
    sel: { id: 'sel', name: 'Sel', aisle: 'epicerie_salee', unit: 'g', staple: true },
    pomme: { id: 'pomme', name: 'Pomme', aisle: 'fruits_legumes', unit: 'pc' },
    persil: { id: 'persil', name: 'Persil', aisle: 'fruits_legumes', unit: 'pc', pieceLabel: 'bouquet' },
  },
  recipes: {},
  sides: {
    riz: { id: 'riz', name: 'Riz', kind: 'accompagnement', fridgeDays: 1, freezable: true, ingredients: [{ ingredientId: 'riz', qty: 80, unit: 'g', role: 'feculent' }] },
    brocoli: { id: 'brocoli', name: 'Brocoli', kind: 'accompagnement', fridgeDays: 3, freezable: true, ingredients: [{ ingredientId: 'brocoli', qty: 150, unit: 'g', role: 'legume' }] },
    fruit: { id: 'fruit', name: 'Pomme', kind: 'complement', fridgeDays: 7, freezable: false, ingredients: [{ ingredientId: 'pomme', qty: 1, unit: 'pc', role: 'autre' }] },
  },
};

function recipe(partial: Partial<Recipe> & Pick<Recipe, 'id' | 'ingredients'>): Recipe {
  return {
    name: partial.id,
    summary: '',
    category: 'familial',
    meals: ['diner'],
    lunchbox: false,
    temperature: 'chaud',
    activeMin: 20,
    totalMin: 30,
    costLevel: 1,
    mainIngredient: partial.id,
    steps: [],
    fridgeDays: 3,
    freezable: true,
    storageTips: '',
    suggestedSides: [],
    defaultSide: null,
    leftoverFriendly: true,
    ...partial,
  };
}

testCatalog.recipes = {
  pates_poulet: recipe({
    id: 'pates_poulet',
    name: 'Pâtes poulet crème',
    meals: ['dejeuner', 'diner'],
    lunchbox: true,
    temperature: 'froid_ou_chaud',
    mainIngredient: 'poulet',
    ingredients: [
      { ingredientId: 'pates', qty: 100, unit: 'g', role: 'feculent' },
      { ingredientId: 'poulet', qty: 100, unit: 'g', role: 'proteine' },
      { ingredientId: 'creme', qty: 5, unit: 'cl', role: 'sauce' },
      { ingredientId: 'oignon', qty: 0.5, unit: 'pc', role: 'legume' },
      { ingredientId: 'sel', qty: 1, unit: 'g', role: 'autre' },
    ],
  }),
  omelette: recipe({
    id: 'omelette',
    name: 'Omelette oignon',
    meals: ['diner'],
    mainIngredient: 'oeuf',
    ingredients: [
      { ingredientId: 'oeuf', qty: 2, unit: 'pc', role: 'proteine' },
      { ingredientId: 'oignon', qty: 50, unit: 'g', role: 'legume' },
      { ingredientId: 'creme', qty: 20, unit: 'ml', role: 'sauce' },
    ],
  }),
  salade_froide: recipe({
    id: 'salade_froide',
    name: 'Salade froide',
    meals: ['dejeuner'],
    lunchbox: true,
    temperature: 'froid',
    mainIngredient: 'oeuf',
    fridgeDays: 2,
    freezable: false,
    ingredients: [
      { ingredientId: 'pates', qty: 80, unit: 'g', role: 'feculent' },
      { ingredientId: 'oeuf', qty: 1, unit: 'pc', role: 'proteine' },
    ],
  }),
  gratin_chaud: recipe({
    id: 'gratin_chaud',
    name: 'Gratin (à réchauffer)',
    meals: ['diner'],
    lunchbox: true,
    temperature: 'chaud',
    mainIngredient: 'poulet',
    ingredients: [{ ingredientId: 'poulet', qty: 120, unit: 'g', role: 'proteine' }],
  }),
};

export function testProfiles(): Record<ProfileId, Profile> {
  return {
    moi: {
      id: 'moi',
      name: 'Moi',
      factors: { portion: 1, feculent: 0.8, legume: 1.5, proteine: 1.2, sauce: 0.5 },
      lunchPlace: 'chantier',
      workWeekdays: [6, 0, 1, 2, 3],
      microwaveAtLunch: false,
      defaultLunchExtras: [],
      defaultDinnerExtras: [],
      personalNote: '',
    },
    compagne: {
      id: 'compagne',
      name: 'Compagne',
      factors: { portion: 1, feculent: 1, legume: 1, proteine: 1, sauce: 1 },
      lunchPlace: 'travail',
      workWeekdays: [6, 0, 1, 2, 3],
      microwaveAtLunch: true,
      defaultLunchExtras: [],
      defaultDinnerExtras: [],
      personalNote: '',
    },
  };
}

export function testPlan() {
  // Planning de 5 jours commençant un samedi, batch le samedi et le dimanche.
  return emptyPlan(testProfiles(), [6, 0], '2026-10-03', 5);
}
