// TheMealDB : base de recettes collaborative (≈ 800 recettes, souvent avec une vidéo YouTube).
// Consultée en direct (réseau nécessaire) ; les textes sont en anglais et restent la propriété de leurs auteurs :
// Popote n'en importe une copie que sur demande de l'utilisateur, pour son usage personnel, avec la source.
import type { Catalog, Recipe, RecipeIngredient, Role, Unit } from './types';
import { normalizeText } from './matching';
import { foodInfo } from '../data/foodinfo';
import { toIngredientUnit } from './units';

const API = 'https://www.themealdb.com/api/json/v1/1';

export interface Meal {
  idMeal: string;
  strMeal: string;
  strCategory?: string | null;
  strArea?: string | null;
  strInstructions?: string | null;
  strMealThumb?: string | null;
  strYoutube?: string | null;
  strSource?: string | null;
  [key: string]: string | null | undefined;
}

export interface MealSummary {
  id: string;
  name: string;
  thumb: string | null;
}

export const CATEGORIES: { id: string; label: string }[] = [
  { id: 'Beef', label: 'Bœuf' },
  { id: 'Chicken', label: 'Poulet' },
  { id: 'Pork', label: 'Porc' },
  { id: 'Lamb', label: 'Agneau' },
  { id: 'Seafood', label: 'Poisson & fruits de mer' },
  { id: 'Pasta', label: 'Pâtes' },
  { id: 'Vegetarian', label: 'Végétarien' },
  { id: 'Side', label: 'Accompagnements' },
  { id: 'Dessert', label: 'Desserts' },
];

export const AREAS: { id: string; label: string }[] = [
  { id: 'French', label: 'Française' },
  { id: 'Italian', label: 'Italienne' },
  { id: 'Spanish', label: 'Espagnole' },
  { id: 'Moroccan', label: 'Marocaine' },
  { id: 'Greek', label: 'Grecque' },
  { id: 'Indian', label: 'Indienne' },
  { id: 'Mexican', label: 'Mexicaine' },
  { id: 'Chinese', label: 'Chinoise' },
  { id: 'Thai', label: 'Thaï' },
  { id: 'Japanese', label: 'Japonaise' },
  { id: 'Vietnamese', label: 'Vietnamienne' },
  { id: 'British', label: 'Britannique' },
  { id: 'American', label: 'Américaine' },
];

// Mots français fréquents → anglais, pour chercher dans une base anglophone.
const FR_EN: Record<string, string> = {
  poulet: 'chicken', boeuf: 'beef', porc: 'pork', agneau: 'lamb', veau: 'veal', canard: 'duck', dinde: 'turkey',
  poisson: 'fish', saumon: 'salmon', thon: 'tuna', cabillaud: 'cod', crevette: 'prawn', crevettes: 'prawns', moules: 'mussels',
  pates: 'pasta', riz: 'rice', nouilles: 'noodles', soupe: 'soup', salade: 'salad', gateau: 'cake', tarte: 'tart', tourte: 'pie',
  oeuf: 'egg', oeufs: 'eggs', fromage: 'cheese', legumes: 'vegetable', lentilles: 'lentil', pois: 'chickpea', haricots: 'beans',
  pomme: 'apple', 'pommes de terre': 'potato', pomme_de_terre: 'potato', patate: 'potato', champignon: 'mushroom', champignons: 'mushroom',
  epinards: 'spinach', aubergine: 'aubergine', courgette: 'courgette', tomate: 'tomato', oignon: 'onion', chocolat: 'chocolate',
  lasagnes: 'lasagne', ragout: 'stew', mijote: 'stew', roti: 'roast', grille: 'grilled', frit: 'fried', curry: 'curry', tajine: 'tagine',
  crepes: 'pancakes', crepe: 'pancake', burger: 'burger', sandwich: 'sandwich', brochettes: 'kebab',
};

export function translateQuery(q: string): string {
  const n = normalizeText(q);
  if (FR_EN[n]) return FR_EN[n];
  return n
    .split(' ')
    .map((w) => FR_EN[w] ?? w)
    .join(' ');
}

// Noms anglais d'ingrédients → ingrédient Popote (comparaison sur le nom normalisé).
const EN_NAMES: Record<string, string[]> = {
  poulet_filet: ['chicken breast', 'chicken breasts', 'chicken fillets', 'chicken fillet', 'chicken', 'boneless chicken'],
  poulet_cuisse: ['chicken thighs', 'chicken thigh', 'chicken legs', 'chicken drumsticks', 'chicken leg'],
  dinde_escalope: ['turkey', 'turkey breast'],
  boeuf_hache: ['minced beef', 'ground beef', 'beef mince', 'mince', 'lean minced steak'],
  boeuf_mijoter: ['beef', 'stewing beef', 'braising steak', 'beef brisket', 'chuck steak', 'beef shin', 'diced beef'],
  porc_filet: ['pork', 'pork tenderloin', 'pork loin', 'pork fillet'],
  saucisse_toulouse: ['sausages', 'sausage', 'pork sausages'],
  lardons: ['bacon', 'lardons', 'pancetta', 'smoked bacon', 'streaky bacon'],
  jambon_blanc: ['ham', 'cooked ham'],
  saumon_pave: ['salmon', 'salmon fillets', 'salmon fillet'],
  saumon_fume: ['smoked salmon'],
  poisson_blanc: ['cod', 'white fish', 'haddock', 'hake', 'pollock', 'white fish fillets'],
  thon: ['tuna', 'tinned tuna', 'canned tuna'],
  oeuf: ['egg', 'eggs', 'egg yolks', 'egg yolk', 'free range eggs'],
  lait: ['milk', 'whole milk', 'semi skimmed milk'],
  creme_liquide: ['double cream', 'single cream', 'heavy cream', 'cream', 'whipping cream'],
  creme_epaisse: ['creme fraiche', 'sour cream'],
  beurre: ['butter', 'unsalted butter', 'salted butter'],
  emmental_rape: ['gruyere', 'grated cheese', 'emmental'],
  comte: ['cheddar cheese', 'cheddar', 'cheese', 'comte'],
  parmesan: ['parmesan', 'parmesan cheese', 'parmigiano reggiano'],
  feta: ['feta', 'feta cheese'],
  mozzarella: ['mozzarella', 'mozzarella balls'],
  chevre_buche: ['goats cheese', 'goat cheese'],
  fromage_frais: ['cream cheese', 'ricotta'],
  yaourt_nature: ['yogurt', 'greek yogurt', 'natural yogurt', 'plain yogurt', 'natural yoghurt', 'yoghurt', 'greek yoghurt'],
  oignon: ['onion', 'onions', 'brown onion', 'white onion', 'yellow onion'],
  oignon_rouge: ['red onion', 'red onions'],
  echalote: ['shallot', 'shallots', 'challots'],
  ail: ['garlic', 'garlic clove', 'garlic cloves', 'cloves garlic'],
  carotte: ['carrot', 'carrots'],
  pomme_de_terre: ['potato', 'potatoes', 'new potatoes', 'floury potatoes', 'maris piper potatoes', 'baby new potatoes'],
  patate_douce: ['sweet potato', 'sweet potatoes'],
  courgette: ['courgette', 'courgettes', 'zucchini'],
  aubergine: ['aubergine', 'aubergines', 'eggplant'],
  tomate: ['tomato', 'tomatoes', 'plum tomatoes'],
  tomate_cerise: ['cherry tomatoes', 'cherry tomato'],
  poivron: ['red pepper', 'green pepper', 'yellow pepper', 'peppers', 'bell pepper', 'red bell pepper', 'red peppers'],
  concombre: ['cucumber'],
  salade_verte: ['lettuce', 'little gem lettuce', 'iceberg lettuce'],
  jeunes_pousses: ['rocket', 'spinach leaves', 'baby spinach', 'mixed salad leaves'],
  champignon: ['mushrooms', 'mushroom', 'chestnut mushroom', 'button mushrooms'],
  poireau: ['leek', 'leeks'],
  brocoli: ['broccoli'],
  avocat: ['avocado'],
  citron: ['lemon', 'lemons', 'lemon juice', 'lime', 'limes', 'lime juice'],
  persil: ['parsley', 'flat leaf parsley'],
  coriandre: ['coriander', 'cilantro', 'coriander leaves'],
  ciboulette: ['chives'],
  pates_courtes: ['penne rigate', 'penne', 'fusilli', 'pasta', 'macaroni', 'rigatoni', 'farfalle'],
  spaghetti: ['spaghetti', 'linguine pasta', 'linguine', 'tagliatelle', 'fettuccine'],
  lasagnes: ['lasagne sheets', 'lasagna sheets'],
  riz: ['rice', 'basmati rice', 'long grain rice', 'jasmine rice', 'white rice', 'arborio rice', 'risotto rice'],
  semoule: ['couscous'],
  quinoa: ['quinoa'],
  lentilles_vertes: ['green lentils', 'lentils', 'puy lentils', 'brown lentils'],
  lentilles_corail: ['red lentils'],
  pois_chiches: ['chickpeas', 'chick peas'],
  haricots_rouges: ['kidney beans', 'red kidney beans'],
  mais: ['sweetcorn', 'corn'],
  tomates_concassees: ['chopped tomatoes', 'tinned tomatoes', 'canned tomatoes', 'tinned tomatos'],
  passata: ['passata', 'tomato sauce', 'tomato puree'],
  lait_coco: ['coconut milk', 'coconut cream'],
  sauce_soja: ['soy sauce', 'dark soy sauce', 'light soy sauce'],
  pesto: ['pesto'],
  mayonnaise: ['mayonnaise'],
  olives: ['black olives', 'olives', 'green olives', 'kalamata olives'],
  tortilla: ['tortillas', 'flour tortilla', 'tortilla wraps', 'wraps'],
  pain_pita: ['pitta bread', 'pita bread'],
  baguette: ['baguette', 'french bread'],
  pain_campagne: ['bread', 'breadcrumbs', 'white bread', 'sourdough'],
  pate_brisee: ['shortcrust pastry', 'pastry', 'puff pastry'],
  bouillon: ['chicken stock', 'beef stock', 'vegetable stock', 'stock', 'stock cube', 'chicken stock cube', 'beef stock cube'],
  huile_olive: ['olive oil', 'extra virgin olive oil'],
  huile_neutre: ['vegetable oil', 'sunflower oil', 'oil', 'rapeseed oil', 'groundnut oil'],
  vinaigre: ['vinegar', 'white wine vinegar', 'red wine vinegar', 'balsamic vinegar', 'cider vinegar'],
  moutarde: ['mustard', 'dijon mustard', 'english mustard', 'wholegrain mustard'],
  farine: ['plain flour', 'flour', 'self raising flour', 'all purpose flour'],
  levure_chimique: ['baking powder'],
  sel: ['salt', 'sea salt'],
  poivre: ['black pepper', 'ground black pepper', 'pepper', 'white pepper'],
  herbes_provence: ['thyme', 'dried thyme', 'oregano', 'dried oregano', 'mixed herbs', 'herbes de provence', 'rosemary'],
  cumin: ['cumin', 'ground cumin', 'cumin seeds'],
  paprika: ['paprika', 'smoked paprika', 'cayenne pepper', 'chilli powder', 'hot chilli powder', 'red chilli powder', 'chili powder'],
  curry: ['curry powder', 'garam masala', 'turmeric'],
  laurier: ['bay leaf', 'bay leaves'],
  sucre: ['sugar', 'caster sugar', 'brown sugar', 'granulated sugar', 'icing sugar'],
  miel: ['honey'],
  vin_rouge: ['red wine'],
  haricots_verts: ['green beans'],
  petits_pois: ['peas', 'frozen peas'],
  epinards: ['spinach'],
  amandes: ['almonds', 'ground almonds', 'walnuts', 'cashew nuts'],
};

const EN_INDEX: [string, string][] = Object.entries(EN_NAMES).flatMap(([id, names]) => names.map((n) => [normalizeText(n), id] as [string, string]));

/** Ingrédient Popote correspondant à un nom anglais (égalité exacte, puis plus longue expression contenue). */
export function matchEnglish(name: string, catalog: Catalog): string | null {
  const n = normalizeText(name);
  const exact = EN_INDEX.find(([k]) => k === n);
  if (exact && catalog.ingredients[exact[1]]) return exact[1];
  let best: [string, string] | null = null;
  for (const e of EN_INDEX) {
    if (new RegExp(`\\b${e[0]}\\b`).test(n) && (!best || e[0].length > best[0].length)) best = e;
  }
  return best && catalog.ingredients[best[1]] ? best[1] : null;
}

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

/** « 1 1/2 tbsp », « 200g », « 2 cups », « ½ tsp », « 3 large » → quantité et unité Popote. */
export function parseMeasure(measure: string | null | undefined): { qty: number; unit: Unit } | null {
  if (!measure) return null;
  let s = measure.toLowerCase().trim();
  for (const [f, v] of Object.entries(FRACTIONS)) s = s.replace(f, ` ${v}`);
  s = s.trim();
  const num = s.match(/^(\d+(?:[.,]\d+)?)?\s*(?:(\d+)\/(\d+))?/);
  let qty = 0;
  if (num?.[1]) qty += parseFloat(num[1].replace(',', '.'));
  if (num?.[2] && num?.[3]) qty += +num[2] / +num[3];
  const rest = s.slice(num?.[0].length ?? 0).trim();
  if (qty === 0) {
    // « Pinch », « knob », « handful » sans nombre : une unité.
    if (/^(pinch|dash|knob|handful|sprinkl)/.test(rest)) qty = 1;
    else return null;
  }
  const u = rest.replace(/^[-\s]+/, '');
  const table: [RegExp, Unit, number][] = [
    [/^kg\b|^kilo/, 'kg', 1],
    [/^g\b|^grams?\b|^gr\b/, 'g', 1],
    [/^ml\b|^millilit/, 'ml', 1],
    [/^cl\b/, 'cl', 1],
    [/^l\b|^lit(re|er)s?\b/, 'l', 1],
    [/^tbsp|^tablespoons?|^tbs\b|^tbls/, 'cs', 1],
    [/^tsp|^teaspoons?/, 'cc', 1],
    [/^cups?\b/, 'ml', 240],
    [/^oz\b|^ounces?/, 'g', 28.35],
    [/^lbs?\b|^pounds?/, 'g', 453.6],
    [/^pinch|^dash|^sprinkl/, 'g', 0.5],
    [/^knob/, 'g', 15],
    [/^handfuls?/, 'g', 30],
  ];
  for (const [re, unit, factor] of table) if (re.test(u)) return { qty: qty * factor, unit };
  if (/to taste|garnish|drizzle|splash/.test(u)) return null;
  return { qty, unit: 'pc' };
}

export function mealIngredients(meal: Meal): { name: string; measure: string }[] {
  const out: { name: string; measure: string }[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = (meal[`strIngredient${i}`] ?? '').trim();
    if (name) out.push({ name, measure: (meal[`strMeasure${i}`] ?? '').trim() });
  }
  return out;
}

export interface ImportLine {
  name: string;
  measure: string;
  ingredientId: string | null;
  /** Quantité TOTALE pour la recette (sera divisée par le nombre de portions). */
  qty: number | null;
  unit: Unit | null;
}

/** Première proposition d'import : chaque ligne est rattachée et convertie quand c'est possible. */
export function proposeImport(meal: Meal, catalog: Catalog): ImportLine[] {
  return mealIngredients(meal).map(({ name, measure }) => {
    const ingredientId = matchEnglish(name, catalog);
    let m = parseMeasure(measure);
    if (ingredientId && m) {
      const ing = catalog.ingredients[ingredientId];
      // Bouillon : 1 cube pour 500 ml de liquide.
      if (ingredientId === 'bouillon' && (m.unit === 'ml' || m.unit === 'l' || m.unit === 'cl')) {
        const ml = toIngredientUnit(m.qty, m.unit, { ...ing, unit: 'ml' }) ?? 0;
        m = { qty: Math.max(0.5, Math.round((ml / 500) * 2) / 2), unit: 'pc' };
      }
      // « 1 can », « 2 tins » : un conditionnement habituel.
      if (m.unit === 'pc' && /(^|[^a-z])(can|cans|tin|tins|jar|pack|packet)([^a-z]|$)/.test(measure.toLowerCase()) && ing.pack) {
        m = { qty: m.qty * ing.pack.size, unit: ing.unit };
      }
      if (toIngredientUnit(m.qty, m.unit, ing) === null) {
        // « 2 large » pour un ingrédient en grammes : on passe par le poids unitaire si possible.
        m = ing.pieceWeightG && m.unit === 'pc' ? { qty: m.qty * ing.pieceWeightG, unit: 'g' } : null;
      }
    }
    return { name, measure, ingredientId, qty: m?.qty ?? null, unit: m?.unit ?? null };
  });
}

function roleOf(ingredientId: string): Role {
  const f = foodInfo(ingredientId).family;
  if (f === 'viande' || f === 'charcuterie' || f === 'poisson' || f === 'oeuf' || f === 'legumineuse') return 'proteine';
  if (f === 'feculent' || f === 'pain_pate') return 'feculent';
  if (f === 'legume') return 'legume';
  if (f === 'fromage' || f === 'cremerie' || f === 'sauce') return 'sauce';
  return 'autre';
}

/** Construit une recette Popote structurée à partir des lignes validées par l'utilisateur. */
export function toPopoteRecipe(meal: Meal, lines: ImportLine[], servings: number, name: string, catalog: Catalog): Recipe {
  const merged = new Map<string, RecipeIngredient>();
  for (const l of lines) {
    if (!l.ingredientId || !l.qty || !l.unit) continue;
    const ing = catalog.ingredients[l.ingredientId];
    const base = toIngredientUnit(l.qty, l.unit, ing);
    if (base === null || base <= 0) continue;
    const perPortion = base / Math.max(1, servings);
    const unit: Unit = ing.unit === 'g' ? 'g' : ing.unit === 'ml' ? 'ml' : 'pc';
    const prev = merged.get(ing.id);
    if (prev) prev.qty = Math.round((prev.qty + perPortion) * 100) / 100;
    else merged.set(ing.id, { ingredientId: ing.id, qty: Math.round(perPortion * 100) / 100, unit, role: roleOf(ing.id) });
  }
  const steps = (meal.strInstructions ?? '')
    .split(/\r?\n+/)
    .map((s) => s.replace(/^(step\s*\d+[:.)]?|\d+[.)])\s*/i, '').trim())
    .filter((s) => s.length > 3);
  const ingredients = [...merged.values()].filter((i) => i.qty > 0);
  const main = ingredients.find((i) => i.role === 'proteine')?.ingredientId ?? ingredients[0]?.ingredientId ?? 'legumes';
  const dessert = meal.strCategory === 'Dessert';
  return {
    id: `mdb-${meal.idMeal}`,
    name,
    summary: `Importée de TheMealDB (${meal.strArea ?? 'cuisine du monde'}, ${meal.strCategory ?? 'plat'}). Étapes en anglais.`,
    category: 'monde',
    meals: dessert ? ['diner'] : ['dejeuner', 'diner'],
    lunchbox: false,
    temperature: 'chaud',
    activeMin: 30,
    totalMin: 60,
    costLevel: 2,
    mainIngredient: main,
    ingredients,
    steps,
    fridgeDays: 2,
    freezable: false,
    storageTips: 'Repère prudent : 2 jours au réfrigérateur (recette importée, durée non vérifiée).',
    suggestedSides: [],
    defaultSide: null,
    leftoverFriendly: !dessert,
    tags: ['importee', 'themealdb'],
    videoUrl: meal.strYoutube?.startsWith('https://www.youtube.com/') ? meal.strYoutube : undefined,
    source: { name: 'TheMealDB', url: meal.strSource?.startsWith('http') ? meal.strSource : `https://www.themealdb.com/meal/${meal.idMeal}` },
    imageUrl: meal.strMealThumb ?? undefined,
  };
}

// ---------- Appels réseau ----------

async function get<T>(path: string, fetchImpl: typeof fetch): Promise<T | null> {
  try {
    const res = await fetchImpl(`${API}/${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const summary = (m: Meal): MealSummary => ({ id: m.idMeal, name: m.strMeal, thumb: m.strMealThumb ?? null });

export async function searchMeals(query: string, fetchImpl: typeof fetch = fetch): Promise<MealSummary[] | null> {
  const q = translateQuery(query);
  const byName = await get<{ meals: Meal[] | null }>(`search.php?s=${encodeURIComponent(q)}`, fetchImpl);
  if (byName === null) return null;
  const results = (byName.meals ?? []).map(summary);
  // Recherche par ingrédient principal en complément (ex. « poulet » → chicken).
  const byIngredient = await get<{ meals: Meal[] | null }>(`filter.php?i=${encodeURIComponent(q.replace(/ /g, '_'))}`, fetchImpl);
  for (const m of byIngredient?.meals ?? []) if (!results.some((r) => r.id === m.idMeal)) results.push(summary(m));
  return results;
}

export async function browse(kind: 'c' | 'a', value: string, fetchImpl: typeof fetch = fetch): Promise<MealSummary[] | null> {
  const r = await get<{ meals: Meal[] | null }>(`filter.php?${kind}=${encodeURIComponent(value)}`, fetchImpl);
  return r ? (r.meals ?? []).map(summary) : null;
}

export async function lookupMeal(id: string, fetchImpl: typeof fetch = fetch): Promise<Meal | null> {
  const r = await get<{ meals: Meal[] | null }>(`lookup.php?i=${encodeURIComponent(id)}`, fetchImpl);
  return r?.meals?.[0] ?? null;
}
