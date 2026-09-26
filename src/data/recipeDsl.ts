import type { MealKind, Recipe, RecipeIngredient, Role, Temperature, Unit } from '../domain/types';

// Écriture compacte des recettes du catalogue étendu. Toutes les quantités sont pour UNE portion adulte.
//
// Ingrédients : « id qty+unité rôle[|forme] », séparés par « ; »
//   ex. « poulet_filet 130g P|en dés; riz 75g F; creme_liquide 4cl S; ail 1pc A »
//   rôles : P protéine, F féculent, L légume, S sauce/fromage/matière grasse, A autre (aromates, épices).

const ROLES: Record<string, Role> = { P: 'proteine', F: 'feculent', L: 'legume', S: 'sauce', A: 'autre' };
const LINE = /^([a-z_]+)\s+(\d+(?:\.\d+)?)\s*(g|kg|ml|cl|l|cc|cs|pc)\s+([PFLSA])(?:\|(.+))?$/;

export function parseIngredients(spec: string, recipeId: string): RecipeIngredient[] {
  return spec
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = LINE.exec(s);
      if (!m) throw new Error(`Recette ${recipeId} : ligne d’ingrédient illisible « ${s} »`);
      const line: RecipeIngredient = { ingredientId: m[1], qty: parseFloat(m[2]), unit: m[3] as Unit, role: ROLES[m[4]] };
      if (m[5]) line.form = m[5].trim();
      return line;
    });
}

export const BOITE_FROIDE =
  'Boîte hermétique sortie du réfrigérateur au dernier moment, contre 2 pains de glace dans le sac isotherme fermé et à l’ombre. Réfrigérateur sur place si possible.';
export const A_RECHAUFFER = 'À réchauffer : seulement si un micro-ondes est disponible sur place.';

export interface Opts {
  /** Repas : 'D' dîner, 'L' déjeuner, 'DL' les deux. */
  m: 'D' | 'L' | 'DL';
  /** Se transporte en boîte. */
  box?: boolean;
  /** Température : 'f' froid, 'c' chaud, 'fc' les deux. */
  t: 'f' | 'c' | 'fc';
  /** [temps actif, temps total] en minutes. */
  time: [number, number];
  cost: 1 | 2 | 3;
  main: string;
  cat: Recipe['category'];
  /** Conservation au réfrigérateur (jours). */
  fridge: number;
  freeze?: boolean;
  quick?: boolean;
  sides?: string[];
  side?: string | null;
  leftovers?: boolean;
  veg?: boolean;
  tags?: string[];
  transport?: string;
}

const TEMPS: Record<Opts['t'], Temperature> = { f: 'froid', c: 'chaud', fc: 'froid_ou_chaud' };
const MEALS: Record<Opts['m'], MealKind[]> = { D: ['diner'], L: ['dejeuner'], DL: ['dejeuner', 'diner'] };

export function R(id: string, name: string, summary: string, o: Opts, ingredients: string, steps: string[], storage: string): Recipe {
  const box = o.box ?? false;
  return {
    id,
    name,
    summary,
    category: o.cat,
    meals: MEALS[o.m],
    lunchbox: box,
    temperature: TEMPS[o.t],
    activeMin: o.time[0],
    totalMin: o.time[1],
    costLevel: o.cost,
    mainIngredient: o.main,
    ingredients: parseIngredients(ingredients, id),
    steps,
    fridgeDays: o.fridge,
    freezable: o.freeze ?? false,
    quickAssembly: o.quick,
    storageTips: storage,
    transportTips: o.transport ?? (box ? (o.t === 'c' ? A_RECHAUFFER : BOITE_FROIDE) : undefined),
    suggestedSides: o.sides ?? [],
    defaultSide: o.side ?? null,
    leftoverFriendly: o.leftovers ?? true,
    vegetarian: o.veg,
    tags: o.tags,
  };
}
