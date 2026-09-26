import type { Equipment } from './equipment';
// Modèle de données de Popote. Aucune logique ici : uniquement des types.

export type Unit = 'g' | 'kg' | 'ml' | 'cl' | 'l' | 'cc' | 'cs' | 'pc';
/** Unité de base d'une dimension : masse (g), volume (ml) ou nombre (pc). */
export type BaseUnit = 'g' | 'ml' | 'pc';

export type AisleId =
  | 'fruits_legumes'
  | 'boucherie'
  | 'poissonnerie'
  | 'frais'
  | 'boulangerie'
  | 'epicerie_salee'
  | 'epicerie_sucree'
  | 'surgeles'
  | 'boissons'
  | 'divers';

export type Allergen =
  | 'gluten'
  | 'crustaces'
  | 'oeuf'
  | 'poisson'
  | 'arachide'
  | 'soja'
  | 'lait'
  | 'fruits_a_coque'
  | 'celeri'
  | 'moutarde'
  | 'sesame'
  | 'sulfites'
  | 'lupin'
  | 'mollusques';

export interface Pack {
  /** Contenance dans l'unité de base de l'ingrédient. */
  size: number;
  label: string;
}

export interface Ingredient {
  id: string;
  name: string;
  aisle: AisleId;
  /** Unité de base dans laquelle les quantités sont additionnées et achetées. */
  unit: BaseUnit;
  /** Poids moyen d'une pièce (permet de convertir pc <-> g). */
  pieceWeightG?: number;
  /** Nom d'une pièce, ex. « gousse », « tranche », « bouquet ». */
  pieceLabel?: string;
  /** Masse volumique (g/ml) pour convertir volume <-> masse. */
  densityGPerMl?: number;
  /** Conditionnement courant (indicatif), pour afficher un nombre de paquets. */
  pack?: Pack;
  allergens?: Allergen[];
  /** Produit de placard supposé déjà disponible (sel, huile…). */
  staple?: boolean;
}

/** Rôle d'un ingrédient dans l'assiette : sert à ajuster les portions par profil. */
export type Role = 'proteine' | 'feculent' | 'legume' | 'sauce' | 'autre';

export interface RecipeIngredient {
  ingredientId: string;
  /** Quantité pour UNE portion adulte standard. */
  qty: number;
  unit: Unit;
  role: Role;
  /** Forme du produit si utile : « émincé », « en conserve », « penne »… */
  form?: string;
  note?: string;
}

export type MealKind = 'dejeuner' | 'diner';
export type Temperature = 'froid' | 'chaud' | 'froid_ou_chaud';

export interface Recipe {
  id: string;
  name: string;
  summary: string;
  category: 'familial' | 'wrap_sandwich' | 'quiche_tarte' | 'pates_riz' | 'mijote' | 'bowl_salade' | 'monde' | 'four';
  meals: MealKind[];
  /** Se transporte bien en boîte (déjeuner au travail). */
  lunchbox: boolean;
  temperature: Temperature;
  activeMin: number;
  totalMin: number;
  /** Coût relatif estimé (1 = économique, 3 = plus cher). Ce n'est pas un prix. */
  costLevel: 1 | 2 | 3;
  /** Ingrédient principal, pour éviter les répétitions dans le planning. */
  mainIngredient: string;
  ingredients: RecipeIngredient[];
  steps: string[];
  /** Conservation indicative au réfrigérateur (≤ 4 °C), en jours après préparation. */
  fridgeDays: number;
  freezable: boolean;
  /** Se prépare en moins de 10 min la veille à partir d'éléments préparés (sandwich, wrap). */
  quickAssembly?: boolean;
  storageTips: string;
  transportTips?: string;
  suggestedSides: string[];
  defaultSide: string | null;
  leftoverFriendly: boolean;
  vegetarian?: boolean;
  tags?: string[];
  /** Lien direct vers une vidéo vérifiée (ex. fournie par TheMealDB). */
  videoUrl?: string;
  /** Recette importée : origine et lien vers la page d'origine. */
  source?: { name: string; url: string };
  imageUrl?: string;
}

export interface Side {
  id: string;
  name: string;
  kind: 'accompagnement' | 'complement';
  ingredients: RecipeIngredient[];
  fridgeDays: number;
  freezable: boolean;
}

export interface Catalog {
  ingredients: Record<string, Ingredient>;
  recipes: Record<string, Recipe>;
  sides: Record<string, Side>;
}

// ---------- Profils ----------

export type ProfileId = 'moi' | 'compagne';

export interface RoleFactors {
  /** Multiplicateur global de la portion. */
  portion: number;
  feculent: number;
  legume: number;
  proteine: number;
  /** Sauces, fromage, matières grasses. */
  sauce: number;
}

export interface Profile {
  id: ProfileId;
  name: string;
  factors: RoleFactors;
  /** Où ce profil déjeune les jours travaillés. */
  lunchPlace: 'chantier' | 'travail' | 'maison';
  /** Jours travaillés (0 = dimanche) : les autres jours, le déjeuner se prend à la maison. */
  workWeekdays: number[];
  microwaveAtLunch: boolean;
  /** Compléments ajoutés par défaut au déjeuner (fruit, yaourt, collation…). */
  defaultLunchExtras: string[];
  defaultDinnerExtras: string[];
  /** Repère personnel saisi librement (ex. conseil d'un diététicien). */
  personalNote: string;
}

// ---------- Planning ----------

/** Jour du planning, par position : d0 = premier jour, d1 = lendemain… */
export type Day = `d${number}`;
export type SlotId = `${Day}-${MealKind}`;

export interface DinerChoice {
  present: boolean;
  /** Multiplicateur ponctuel pour ce repas (ex. 1.25 journée chantier intense). */
  portion: number;
  sideId: string | null;
  extras: string[];
}

export interface Slot {
  recipeId: string | null;
  /** Si défini, ce repas consomme des restes cuisinés pour ce créneau source. */
  leftoverOf: SlotId | null;
  /** Jour où le plat est cuisiné (batch cooking). */
  prepDay: Day;
  /** Portions standard supplémentaires cuisinées (ex. pour le congélateur). */
  extraPortions: number;
  diners: Record<ProfileId, DinerChoice>;
  note: string;
  /** Date ISO à laquelle le plat a été marqué « cuisiné » (stock déjà déduit). */
  cookedOn: string | null;
}

export interface WeekPlan {
  /** Date ISO (AAAA-MM-JJ) du premier jour du planning. */
  weekOf: string;
  /** Nombre de jours planifiés (1 à 14). */
  days: number;
  slots: Record<SlotId, Slot>;
}

// ---------- Courses, placard, prix ----------

export interface PantryItem {
  ingredientId: string;
  /** null = « en stock, ne pas acheter » ; sinon quantité disponible. */
  qty: number | null;
  unit: Unit;
}

export interface ManualItem {
  id: string;
  label: string;
  quantity: string;
  aisle: AisleId;
}

export type StoreId = 'auchan' | 'leclerc' | 'lidl' | 'autre';

export interface PriceEntry {
  id: string;
  ingredientId: string;
  store: StoreId;
  /** Prix en euros pour `perQty` `perUnit`. */
  price: number;
  perQty: number;
  perUnit: Unit;
  /** Date ISO de relevé du prix. */
  date: string;
  /** Origine du prix : saisie manuelle, ticket scanné, import de fichier. */
  source?: 'saisie' | 'ticket' | 'import';
}

/** Prix moyen national (INSEE), utilisé seulement à défaut de vos propres prix. */
export interface ReferencePrice {
  ingredientId: string;
  label: string;
  price: number;
  perQty: number;
  perUnit: Unit;
  /** Mois de l'observation (AAAA-MM). */
  period: string;
}

export type ThemeId = 'glass' | 'nothing';

export interface Settings {
  /** Jours de batch cooking (0 = dimanche). */
  prepWeekdays: number[];
  /** Premier jour d'un nouveau planning (0 = dimanche). */
  startWeekday: number;
  /** Durée d'un nouveau planning, en jours. */
  planDays: number;
  theme: ThemeId;
  /** Clair / sombre : suivre le système ou forcer. */
  colorScheme: 'auto' | 'light' | 'dark';
  /** Afficher les repères nutritionnels (indicatifs) sur les fiches recettes. */
  showNutrition: boolean;
  maxActiveMin: number | null;
  maxCostLevel: 1 | 2 | 3 | null;
  excludedAllergens: Allergen[];
  excludedIngredients: string[];
  preferredStore: StoreId | null;
  useLeftoversInSuggestions: boolean;
  /** Déduire le stock du frigo (non périmé) de la liste de courses. */
  deductInventory: boolean;
  /** Adresse du service IA personnel (Cloudflare Worker) ; vide = IA désactivée. */
  aiServiceUrl: string;
}

export interface AppState {
  version: 1;
  profiles: Record<ProfileId, Profile>;
  settings: Settings;
  plan: WeekPlan;
  pantry: PantryItem[];
  manualItems: ManualItem[];
  /** Cases cochées de la liste de courses (clé d'article). */
  checked: Record<string, boolean>;
  prices: PriceEntry[];
  favorites: string[];
  /** Stock réel : frigo, congélateur, placard (scanné ou saisi). */
  inventory: InventoryItem[];
  /** Produits déjà identifiés par code-barres (cache local + choix de l'utilisateur). */
  products: Record<string, ProductInfo>;
  /** Libellés de ticket appris → ingrédient (ex. « fil poul » → poulet_filet). */
  aliases: Record<string, string>;
  /** Recettes vide-frigo gardées par l'utilisateur. */
  customRecipes: Recipe[];
  /** Équipements de la cuisine (four, airfryer…). */
  equipment: Equipment[];
  /** Notes sur les recettes : 1 = on aime, -1 = plus jamais. */
  ratings: Record<string, 1 | -1>;
  /** Recettes des semaines passées (la plus récente en premier, 8 semaines max). */
  history: { weekOf: string | null; recipeIds: string[] }[];
}

// ---------- Stock (frigo) ----------

export type StorageLocation = 'frigo' | 'congelateur' | 'placard';

export interface InventoryItem {
  id: string;
  /** null = produit non rattaché à un ingrédient (affiché mais non utilisé dans les calculs). */
  ingredientId: string | null;
  label: string;
  brand?: string;
  barcode?: string;
  qty: number;
  unit: Unit;
  /** Date limite (ISO AAAA-MM-JJ) ou null si inconnue. */
  expiry: string | null;
  expirySource: 'emballage' | 'estimee' | 'aucune';
  location: StorageLocation;
  addedAt: string;
}

export interface ProductInfo {
  barcode: string;
  name: string;
  brand: string;
  ingredientId: string | null;
  qty: number | null;
  unit: Unit | null;
  /** Source : Open Food Facts ou saisie manuelle. */
  source: 'openfoodfacts' | 'manuel';
}

/** Famille d'aliment, pour composer des recettes vide-frigo. */
export type Family =
  | 'viande'
  | 'charcuterie'
  | 'poisson'
  | 'oeuf'
  | 'fromage'
  | 'cremerie'
  | 'legume'
  | 'fruit'
  | 'feculent'
  | 'legumineuse'
  | 'pain_pate'
  | 'sauce'
  | 'condiment';
