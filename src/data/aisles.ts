import type { AisleId, Allergen } from '../domain/types';

/** Ordre de parcours typique d'un supermarché français. */
export const AISLE_ORDER: AisleId[] = [
  'fruits_legumes',
  'boulangerie',
  'boucherie',
  'poissonnerie',
  'frais',
  'epicerie_salee',
  'epicerie_sucree',
  'boissons',
  'surgeles',
  'divers',
];

export const AISLE_LABELS: Record<AisleId, string> = {
  fruits_legumes: 'Fruits et légumes',
  boulangerie: 'Boulangerie',
  boucherie: 'Boucherie / volaille',
  poissonnerie: 'Poissonnerie',
  frais: 'Produits frais (crèmerie, charcuterie)',
  epicerie_salee: 'Épicerie salée',
  epicerie_sucree: 'Épicerie sucrée',
  boissons: 'Boissons / vins',
  surgeles: 'Surgelés',
  divers: 'Divers',
};

export const ALLERGEN_LABELS: Record<Allergen, string> = {
  gluten: 'Gluten',
  crustaces: 'Crustacés',
  oeuf: 'Œuf',
  poisson: 'Poisson',
  arachide: 'Arachide',
  soja: 'Soja',
  lait: 'Lait',
  fruits_a_coque: 'Fruits à coque',
  celeri: 'Céleri',
  moutarde: 'Moutarde',
  sesame: 'Sésame',
  sulfites: 'Sulfites',
  lupin: 'Lupin',
  mollusques: 'Mollusques',
};
