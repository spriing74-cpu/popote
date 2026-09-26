import type { AppState, PantryItem, Profile, ProfileId, Settings } from '../domain/types';
import { emptyPlan, upcomingSaturday } from '../domain/week';
import { INGREDIENTS } from './ingredients';

// Tout ce qui est SUPPOSÉ faute de réponse est listé ici et modifiable dans Paramètres.
export const ASSUMPTIONS: string[] = [
  'Vous déjeunez tous les deux au travail du samedi au mercredi (présence modifiable repas par repas).',
  'Pas de micro-ondes sur le chantier : déjeuners « Moi » mangeables froids. Même hypothèse pour votre compagne tant que ce n’est pas précisé.',
  'Préparation groupée le samedi et le dimanche (batch cooking).',
  'Placard de base disponible : sel, poivre, huiles, vinaigre, moutarde, farine, sucre, levure, bouillon, épices courantes.',
  'Profil « Moi » : point de départ modéré (féculents ×0,85, sauces/fromage ×0,75, légumes ×1,25, protéines ×1,1). À ajuster selon votre faim et l’intensité du chantier.',
  'Profil « Ma compagne » : portions standard, sans réduction.',
  'Aucun budget cible, aucun magasin favori et aucun prix pré-rempli.',
  'Conditionnements (paquets, boîtes) indicatifs : la quantité réellement nécessaire est toujours affichée.',
  'Frigo : sans date lue sur l’emballage, la date limite est ESTIMÉE selon le type de produit (signalée « estimée »).',
];

export function defaultProfiles(): Record<ProfileId, Profile> {
  return {
    moi: {
      id: 'moi',
      name: 'Moi',
      factors: { portion: 1, feculent: 0.85, legume: 1.25, proteine: 1.1, sauce: 0.75 },
      lunchPlace: 'chantier',
      microwaveAtLunch: false,
      defaultLunchExtras: ['fruit'],
      defaultDinnerExtras: [],
      personalNote: '',
    },
    compagne: {
      id: 'compagne',
      name: 'Ma compagne',
      factors: { portion: 1, feculent: 1, legume: 1, proteine: 1, sauce: 1 },
      lunchPlace: 'travail',
      microwaveAtLunch: false,
      defaultLunchExtras: [],
      defaultDinnerExtras: [],
      personalNote: '',
    },
  };
}

export function defaultSettings(): Settings {
  return {
    prepDays: ['sam', 'dim'],
    maxActiveMin: null,
    maxCostLevel: null,
    excludedAllergens: [],
    excludedIngredients: [],
    preferredStore: null,
    useLeftoversInSuggestions: true,
    deductInventory: true,
    aiServiceUrl: '',
  };
}

export function defaultPantry(): PantryItem[] {
  return Object.values(INGREDIENTS)
    .filter((i) => i.staple)
    .map((i) => ({ ingredientId: i.id, qty: null, unit: i.unit }));
}

export function defaultState(): AppState {
  const profiles = defaultProfiles();
  const settings = defaultSettings();
  return {
    version: 1,
    profiles,
    settings,
    plan: emptyPlan(profiles, settings.prepDays, upcomingSaturday()),
    pantry: defaultPantry(),
    manualItems: [],
    checked: {},
    prices: [],
    favorites: [],
    inventory: [],
    products: {},
    aliases: {},
    customRecipes: [],
    equipment: [],
  };
}
