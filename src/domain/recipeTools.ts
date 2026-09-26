import type { Catalog, InventoryItem, PantryItem, Profile, ProfileId, Recipe, RecipeIngredient } from './types';
import { scaledQty } from './portions';
import { available } from './inventory';
import { toIngredientUnit } from './units';

// Outils de l'écran Recettes : minuteurs lus dans les étapes, portions, stock, recettes proches, rayons.

export interface StepTimer {
  minutes: number;
  label: string;
}

const NUM = '(\\d+(?:[,.]\\d+)?)';
/** « 1 h 30 », « 1h », « 20 à 25 min », « 45 minutes », « 2 heures ». */
const DURATION = new RegExp(`${NUM}\\s*(?:(?:à|-|–)\\s*${NUM}\\s*)?(h|heures?|min(?:utes?)?)\\b(?:\\s*(\\d{1,2})(?!\\s*(?:°|min|h)))?`, 'gi');

/** Durées mentionnées dans une étape (la plus courte d'un intervalle : on vérifie la cuisson plus tôt). */
export function stepTimers(step: string): StepTimer[] {
  const out: StepTimer[] = [];
  for (const m of step.matchAll(DURATION)) {
    const a = parseFloat(m[1].replace(',', '.'));
    const hours = m[3].toLowerCase().startsWith('h');
    let minutes = hours ? a * 60 + (m[4] ? parseInt(m[4], 10) : 0) : a;
    minutes = Math.round(minutes);
    if (minutes < 1 || minutes > 12 * 60) continue;
    const label = minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${String(minutes % 60).padStart(2, '0')}` : ''}` : `${minutes} min`;
    if (!out.some((t) => t.minutes === minutes)) out.push({ minutes, label });
  }
  return out;
}

/** Pour qui on affiche les quantités. */
export type Servings = { kind: 'foyer' } | { kind: 'profil'; id: ProfileId } | { kind: 'portions'; n: number };

/** Quantité d'un ingrédient (unité de la recette) selon le choix de portions. */
export function servingQty(ri: RecipeIngredient, servings: Servings, profiles: Record<ProfileId, Profile>): number {
  if (servings.kind === 'portions') return ri.qty * servings.n;
  if (servings.kind === 'profil') return scaledQty(ri, profiles[servings.id].factors, 1);
  return scaledQty(ri, profiles.moi.factors, 1) + scaledQty(ri, profiles.compagne.factors, 1);
}

export type StockState = 'frigo' | 'placard' | 'manque';

/** Ce qu'on a déjà : stock du frigo (non périmé, en quantité suffisante) ou placard de base. */
export function ingredientStock(ri: RecipeIngredient, need: number, catalog: Catalog, inventory: InventoryItem[], pantry: PantryItem[], today: string): StockState {
  const ing = catalog.ingredients[ri.ingredientId];
  if (!ing) return 'manque';
  if (ing.staple || pantry.some((p) => p.ingredientId === ri.ingredientId && p.qty === null)) return 'placard';
  const needBase = toIngredientUnit(need, ri.unit, ing);
  const have = available(inventory, ri.ingredientId, catalog, today);
  if (have > 0 && (needBase === null || have >= needBase * 0.9)) return 'frigo';
  return 'manque';
}

/** Recettes proches : même ingrédient principal, même famille de plats, ingrédients en commun. */
export function similarRecipes(recipe: Recipe, catalog: Catalog, limit = 8): Recipe[] {
  const mine = new Set(recipe.ingredients.map((i) => i.ingredientId).filter((id) => !catalog.ingredients[id]?.staple));
  return Object.values(catalog.recipes)
    .filter((r) => r.id !== recipe.id)
    .map((r) => {
      let s = 0;
      if (r.mainIngredient === recipe.mainIngredient) s += 3;
      if (r.category === recipe.category) s += 2;
      for (const i of r.ingredients) if (mine.has(i.ingredientId)) s += 0.6;
      return { r, s };
    })
    .filter((x) => x.s >= 2.5)
    .sort((a, b) => b.s - a.s || a.r.name.localeCompare(b.r.name, 'fr'))
    .slice(0, limit)
    .map((x) => x.r);
}

/** Mélange stable pour une graine donnée (les rayons changent chaque jour, pas à chaque affichage). */
export function seededShuffle<T>(list: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface Shelf {
  id: string;
  title: string;
  subtitle?: string;
  recipes: Recipe[];
}

/** Rayons de l'accueil Recettes. Les recettes « plus jamais » n'y figurent pas. */
export function recipeShelves(
  catalog: Catalog,
  opts: { favorites: string[]; ratings: Record<string, 1 | -1>; history: string[][]; planned: string[]; fromFridge: Recipe[]; today: string; allowed: (r: Recipe) => boolean },
): Shelf[] {
  const all = Object.values(catalog.recipes).filter((r) => opts.ratings[r.id] !== -1 && opts.allowed(r));
  const daily = (list: Recipe[], key: string) => seededShuffle(list, `${opts.today}:${key}`).slice(0, 12);
  const eaten = new Set([...opts.history.flat(), ...opts.planned]);
  const shelves: Shelf[] = [
    { id: 'frigo', title: 'Avec ce qu’il y a au frigo', subtitle: 'Ce qui périme en premier', recipes: opts.fromFridge.filter((r) => opts.ratings[r.id] !== -1) },
    {
      id: 'aimes',
      title: 'Vos préférées',
      subtitle: 'Favoris et « on aime »',
      recipes: all.filter((r) => opts.favorites.includes(r.id) || opts.ratings[r.id] === 1).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    },
    { id: 'rapide', title: 'Prêt en 20 minutes', subtitle: 'Pour les soirs pressés', recipes: daily(all.filter((r) => r.activeMin <= 20 && r.totalMin <= 30), 'rapide') },
    { id: 'decouvrir', title: 'À découvrir', subtitle: 'Jamais cuisinées ici', recipes: daily(all.filter((r) => !eaten.has(r.id) && !opts.favorites.includes(r.id)), 'decouvrir') },
    {
      id: 'boite',
      title: 'Pour la boîte du midi',
      subtitle: 'Se mangent froides',
      recipes: daily(all.filter((r) => r.lunchbox && r.temperature !== 'chaud'), 'boite'),
    },
    {
      id: 'batch',
      title: 'Spécial batch cooking',
      subtitle: 'Se gardent et se congèlent',
      recipes: daily(all.filter((r) => r.freezable && r.leftoverFriendly && r.fridgeDays >= 3), 'batch'),
    },
    { id: 'vege', title: 'Sans viande', recipes: daily(all.filter((r) => r.vegetarian), 'vege') },
  ];
  return shelves.filter((s) => s.recipes.length > 0);
}
