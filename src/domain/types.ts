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
  /** Où ce profil déjeune en semaine. */
  lunchPlace: 'chantier' | 'travail' | 'maison';
  microwaveAtLunch: boolean;
  /** Compléments ajoutés par défaut au déjeuner (fruit, yaourt, collation…). */
  defaultLunchExtras: string[];
  defaultDinnerExtras: string[];
  /** Repère personnel saisi librement (ex. conseil d'un diététicien). */
  personalNote: string;
}

// ---------- Planning ----------

export type Day = 'sam' | 'dim' | 'lun' | 'mar' | 'mer';
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
  /** Date ISO (AAAA-MM-JJ) du samedi de la semaine, facultative. */
  weekOf: string | null;
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
}

export interface Settings {
  prepDays: Day[];
  maxActiveMin: number | null;
  maxCostLevel: 1 | 2 | 3 | null;
  excludedAllergens: Allergen[];
  excludedIngredients: string[];
  preferredStore: StoreId | null;
  useLeftoversInSuggestions: boolean;
  /** Déduire le stock du frigo (non périmé) de la liste de courses. */
  deductInventory: boolean;
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
