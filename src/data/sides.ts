import type { Side } from '../domain/types';

// Quantités pour une portion adulte standard (poids cru / sec).
const list: Side[] = [
  // Accompagnements (un par personne et par repas, ajusté par les facteurs du profil)
  { id: 'riz', name: 'Riz', kind: 'accompagnement', fridgeDays: 1, freezable: true, ingredients: [{ ingredientId: 'riz', qty: 75, unit: 'g', role: 'feculent' }] },
  { id: 'pates', name: 'Pâtes', kind: 'accompagnement', fridgeDays: 3, freezable: true, ingredients: [{ ingredientId: 'pates_courtes', qty: 90, unit: 'g', role: 'feculent' }] },
  { id: 'pdt_vapeur', name: 'Pommes de terre vapeur', kind: 'accompagnement', fridgeDays: 3, freezable: false, ingredients: [{ ingredientId: 'pomme_de_terre', qty: 250, unit: 'g', role: 'feculent' }] },
  {
    id: 'pdt_four',
    name: 'Pommes de terre rôties (four ou airfryer)',
    kind: 'accompagnement',
    fridgeDays: 3,
    freezable: false,
    ingredients: [
      { ingredientId: 'pomme_de_terre', qty: 250, unit: 'g', role: 'feculent' },
      { ingredientId: 'huile_olive', qty: 1, unit: 'cs', role: 'sauce' },
    ],
  },
  { id: 'semoule', name: 'Semoule', kind: 'accompagnement', fridgeDays: 3, freezable: true, ingredients: [{ ingredientId: 'semoule', qty: 70, unit: 'g', role: 'feculent' }] },
  { id: 'quinoa', name: 'Quinoa', kind: 'accompagnement', fridgeDays: 3, freezable: true, ingredients: [{ ingredientId: 'quinoa', qty: 70, unit: 'g', role: 'feculent' }] },
  { id: 'pain', name: 'Pain (¼ de baguette)', kind: 'accompagnement', fridgeDays: 2, freezable: true, ingredients: [{ ingredientId: 'baguette', qty: 0.25, unit: 'pc', role: 'feculent' }] },
  { id: 'haricots_verts', name: 'Haricots verts', kind: 'accompagnement', fridgeDays: 3, freezable: true, ingredients: [{ ingredientId: 'haricots_verts', qty: 150, unit: 'g', role: 'legume' }] },
  { id: 'brocoli', name: 'Brocoli vapeur', kind: 'accompagnement', fridgeDays: 3, freezable: true, ingredients: [{ ingredientId: 'brocoli', qty: 150, unit: 'g', role: 'legume' }] },
  {
    id: 'salade_verte',
    // Salade lavée et essorée : 3 jours en boîte avec un essuie-tout ; vinaigrette au moment du repas.
    name: 'Salade verte vinaigrette',
    kind: 'accompagnement',
    fridgeDays: 3,
    freezable: false,
    ingredients: [
      { ingredientId: 'salade_verte', qty: 0.2, unit: 'pc', role: 'legume' },
      { ingredientId: 'huile_olive', qty: 1, unit: 'cs', role: 'sauce' },
      { ingredientId: 'vinaigre', qty: 1, unit: 'cc', role: 'autre' },
    ],
  },
  {
    id: 'riz_legumes',
    name: 'Moitié riz / moitié haricots verts',
    kind: 'accompagnement',
    fridgeDays: 1,
    freezable: true,
    ingredients: [
      { ingredientId: 'riz', qty: 40, unit: 'g', role: 'feculent' },
      { ingredientId: 'haricots_verts', qty: 100, unit: 'g', role: 'legume' },
    ],
  },
  {
    id: 'pates_legumes',
    name: 'Moitié pâtes / moitié brocoli',
    kind: 'accompagnement',
    fridgeDays: 3,
    freezable: true,
    ingredients: [
      { ingredientId: 'pates_courtes', qty: 50, unit: 'g', role: 'feculent' },
      { ingredientId: 'brocoli', qty: 100, unit: 'g', role: 'legume' },
    ],
  },

  // Compléments (quantité fixe, non ajustée) : dessert, collation, en-cas chantier
  { id: 'fruit', name: 'Fruit (pomme)', kind: 'complement', fridgeDays: 7, freezable: false, ingredients: [{ ingredientId: 'pomme', qty: 1, unit: 'pc', role: 'autre' }] },
  { id: 'banane', name: 'Banane', kind: 'complement', fridgeDays: 4, freezable: false, ingredients: [{ ingredientId: 'banane', qty: 1, unit: 'pc', role: 'autre' }] },
  { id: 'fruit_saison', name: 'Fruit de saison', kind: 'complement', fridgeDays: 5, freezable: false, ingredients: [{ ingredientId: 'clementine', qty: 2, unit: 'pc', role: 'autre' }] },
  { id: 'yaourt', name: 'Yaourt nature', kind: 'complement', fridgeDays: 7, freezable: false, ingredients: [{ ingredientId: 'yaourt_nature', qty: 1, unit: 'pc', role: 'autre' }] },
  { id: 'compote', name: 'Compote', kind: 'complement', fridgeDays: 30, freezable: false, ingredients: [{ ingredientId: 'compote', qty: 1, unit: 'pc', role: 'autre' }] },
  { id: 'fromage', name: 'Portion de fromage (30 g)', kind: 'complement', fridgeDays: 7, freezable: false, ingredients: [{ ingredientId: 'comte', qty: 30, unit: 'g', role: 'autre' }] },
  { id: 'amandes', name: 'Poignée d’amandes (25 g)', kind: 'complement', fridgeDays: 60, freezable: false, ingredients: [{ ingredientId: 'amandes', qty: 25, unit: 'g', role: 'autre' }] },
  { id: 'barre', name: 'Barre de céréales', kind: 'complement', fridgeDays: 60, freezable: false, ingredients: [{ ingredientId: 'barre_cereales', qty: 1, unit: 'pc', role: 'autre' }] },
  { id: 'pain_complement', name: 'Morceau de pain (⅛ baguette)', kind: 'complement', fridgeDays: 2, freezable: true, ingredients: [{ ingredientId: 'baguette', qty: 0.125, unit: 'pc', role: 'autre' }] },
];

export const SIDES: Record<string, Side> = Object.fromEntries(list.map((s) => [s.id, s]));
export const ACCOMPAGNEMENTS = list.filter((s) => s.kind === 'accompagnement');
export const COMPLEMENTS = list.filter((s) => s.kind === 'complement');
