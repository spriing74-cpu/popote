import type { Catalog, Family, InventoryItem, MealKind, Recipe, RecipeIngredient, Role, Settings, Temperature } from './types';
import { daysLeft, available } from './inventory';
import { toIngredientUnit } from './units';
import { recipeAllowed } from './planner';
import { foodInfo } from '../data/foodinfo';

/** Ce que le stock contient d'utilisable, par ingrédient, avec l'échéance la plus proche. */
export interface StockEntry {
  ingredientId: string;
  daysLeft: number | null;
  qty: number;
}

export function stockEntries(inventory: InventoryItem[], catalog: Catalog, today: string): StockEntry[] {
  const map = new Map<string, StockEntry>();
  for (const it of inventory) {
    if (!it.ingredientId || !catalog.ingredients[it.ingredientId]) continue;
    const d = daysLeft(it.expiry, today);
    if (d !== null && d < 0) continue;
    const e = map.get(it.ingredientId);
    if (!e) map.set(it.ingredientId, { ingredientId: it.ingredientId, daysLeft: d, qty: available(inventory, it.ingredientId, catalog, today) });
    else if (d !== null && (e.daysLeft === null || d < e.daysLeft)) e.daysLeft = d;
  }
  return [...map.values()].filter((e) => e.qty > 0);
}

/** Poids anti-gaspi : plus la date est proche, plus utiliser l'aliment rapporte. */
export function urgencyWeight(d: number | null): number {
  if (d === null) return 0.3;
  if (d < 0) return 0;
  if (d <= 1) return 4;
  if (d <= 2) return 3;
  if (d <= 5) return 1.5;
  if (d <= 10) return 0.6;
  return 0.2;
}

export interface StockUse {
  ingredientId: string;
  daysLeft: number | null;
}

export interface RankedRecipe {
  recipe: Recipe;
  score: number;
  uses: StockUse[];
  /** Ingrédients (hors placard de base) à acheter. */
  missing: string[];
}

function isBasic(id: string, catalog: Catalog): boolean {
  const ing = catalog.ingredients[id];
  return !ing || !!ing.staple;
}

/** Classe les recettes existantes selon ce qu'elles sauvent du stock. */
export function rankCatalog(catalog: Catalog, inventory: InventoryItem[], today: string, settings: Settings | null, limit = 8): RankedRecipe[] {
  const stock = new Map(stockEntries(inventory, catalog, today).map((e) => [e.ingredientId, e]));
  if (stock.size === 0) return [];
  const out: RankedRecipe[] = [];
  for (const r of Object.values(catalog.recipes)) {
    if (settings && !recipeAllowed(r, settings, catalog)) continue;
    const ids = [...new Set(r.ingredients.map((i) => i.ingredientId))].filter((id) => !isBasic(id, catalog));
    const uses: StockUse[] = [];
    const missing: string[] = [];
    for (const id of ids) {
      const e = stock.get(id);
      if (e) uses.push({ ingredientId: id, daysLeft: e.daysLeft });
      else missing.push(id);
    }
    if (uses.length === 0) continue;
    const urgency = uses.reduce((s, u) => s + urgencyWeight(u.daysLeft), 0);
    const coverage = uses.length / Math.max(1, ids.length);
    const score = urgency + coverage * 2 - missing.length * 0.4;
    if (urgency < 1.5 && coverage < 0.6) continue;
    out.push({ recipe: r, score, uses: uses.sort((a, b) => (a.daysLeft ?? 99) - (b.daysLeft ?? 99)), missing });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Recettes vide-frigo générées hors ligne à partir de modèles.
// ---------------------------------------------------------------------------

interface TemplateSlot {
  key: string;
  families: Family[];
  /** Restreint à certains ingrédients (sinon toute la famille). */
  only?: string[];
  /** Légumes : cuits ou crus. */
  legume?: 'cuit' | 'cru';
  /** Grammes par portion pour l'ensemble du rôle (réparti entre les ingrédients choisis). */
  grams: number;
  /** Grammes spécifiques à certains ingrédients (ex. pommes de terre plus lourdes que les pâtes). */
  gramsFor?: Record<string, number>;
  max: number;
  required: boolean;
  fallback: string | null;
  role: Role;
}

interface Template {
  id: string;
  label: string;
  meals: MealKind[];
  lunchbox: boolean;
  temperature: Temperature;
  category: Recipe['category'];
  activeMin: number;
  totalMin: number;
  fridgeDays: number;
  freezable: boolean;
  fixed: RecipeIngredient[];
  slots: TemplateSlot[];
  sides: string[];
  steps: (n: Names) => string[];
  storage: string;
  transport?: string;
}

type Names = Record<string, string>;

const COOKED_PROTEINS: Family[] = ['viande', 'charcuterie', 'poisson'];
const FECULENTS_CUISSON = ['riz', 'pates_courtes', 'spaghetti', 'semoule', 'quinoa'];
const BOITE =
  "Boîte hermétique sortie du réfrigérateur au dernier moment, contre 2 pains de glace dans le sac isotherme fermé. Réfrigérateur sur place si possible.";

const TEMPLATES: Template[] = [
  {
    id: 'omelette',
    label: 'Omelette garnie',
    meals: ['dejeuner', 'diner'],
    lunchbox: true,
    temperature: 'froid_ou_chaud',
    category: 'familial',
    activeMin: 15,
    totalMin: 25,
    fridgeDays: 2,
    freezable: false,
    fixed: [
      { ingredientId: 'oeuf', qty: 2.5, unit: 'pc', role: 'proteine' },
      { ingredientId: 'huile_olive', qty: 1, unit: 'cc', role: 'sauce' },
    ],
    slots: [
      { key: 'legumes', families: ['legume'], legume: 'cuit', grams: 130, max: 2, required: true, fallback: 'oignon', role: 'legume' },
      { key: 'garniture', families: COOKED_PROTEINS, grams: 50, max: 1, required: false, fallback: null, role: 'proteine' },
      { key: 'fromage', families: ['fromage'], grams: 25, max: 1, required: false, fallback: null, role: 'sauce' },
    ],
    sides: ['salade_verte', 'pain', 'pdt_four'],
    steps: (n) => [
      `Couper ${n.legumes} en petits morceaux et les faire revenir 8 à 10 min dans l’huile à la poêle.`,
      n.garniture ? `Ajouter ${n.garniture} coupé en dés et cuire jusqu’à ce que ce soit bien cuit à cœur.` : 'Saler, poivrer.',
      `Battre les œufs${n.fromage ? ` avec ${n.fromage}` : ''}, verser sur la garniture, couvrir et cuire à feu doux 8 à 10 min (omelette épaisse, façon frittata).`,
      'Servir chaud, ou laisser refroidir et couper en parts pour une boîte.',
    ],
    storage: '2 jours au frais, en parts.',
    transport: BOITE,
  },
  {
    id: 'poelee',
    label: 'Poêlée sautée',
    meals: ['dejeuner', 'diner'],
    lunchbox: true,
    temperature: 'froid_ou_chaud',
    category: 'monde',
    activeMin: 20,
    totalMin: 30,
    fridgeDays: 3,
    freezable: true,
    fixed: [
      { ingredientId: 'sauce_soja', qty: 10, unit: 'ml', role: 'sauce' },
      { ingredientId: 'huile_neutre', qty: 1, unit: 'cs', role: 'sauce' },
      { ingredientId: 'ail', qty: 0.5, unit: 'pc', role: 'autre' },
    ],
    slots: [
      { key: 'feculent', families: ['feculent'], only: FECULENTS_CUISSON, grams: 75, gramsFor: { pates_courtes: 85, spaghetti: 85 }, max: 1, required: true, fallback: 'riz', role: 'feculent' },
      { key: 'proteine', families: ['viande', 'charcuterie', 'poisson', 'oeuf', 'legumineuse'], grams: 110, max: 1, required: true, fallback: 'oeuf', role: 'proteine' },
      { key: 'legumes', families: ['legume'], legume: 'cuit', grams: 180, max: 3, required: true, fallback: 'haricots_verts', role: 'legume' },
    ],
    sides: [],
    steps: (n) => [
      `Cuire ${n.feculent} ; étaler pour refroidir vite si c’est pour des boîtes.`,
      `Couper ${n.proteine} en morceaux et le saisir à feu vif dans l’huile jusqu’à cuisson complète. Réserver.`,
      `Faire sauter ${n.legumes} 6 à 8 min avec l’ail, ils doivent rester croquants.`,
      `Remettre ${n.proteine} et ${n.feculent}, ajouter la sauce soja, mélanger 2 min.`,
    ],
    storage: '3 jours au frais (1 seul jour si c’est du riz : congelez le reste).',
    transport: BOITE,
  },
  {
    id: 'gratin',
    label: 'Gratin',
    meals: ['diner'],
    lunchbox: true,
    temperature: 'chaud',
    category: 'four',
    activeMin: 20,
    totalMin: 50,
    fridgeDays: 3,
    freezable: true,
    fixed: [],
    slots: [
      { key: 'feculent', families: ['feculent'], only: ['pates_courtes', 'pomme_de_terre', 'patate_douce', 'riz'], grams: 90, gramsFor: { pomme_de_terre: 250, patate_douce: 220, riz: 70 }, max: 1, required: true, fallback: 'pates_courtes', role: 'feculent' },
      { key: 'legumes', families: ['legume'], legume: 'cuit', grams: 150, max: 2, required: true, fallback: 'brocoli', role: 'legume' },
      { key: 'proteine', families: COOKED_PROTEINS, grams: 90, max: 1, required: false, fallback: null, role: 'proteine' },
      { key: 'liant', families: ['cremerie'], only: ['creme_liquide', 'creme_epaisse', 'lait'], grams: 50, gramsFor: { lait: 100 }, max: 1, required: true, fallback: 'creme_liquide', role: 'sauce' },
      { key: 'fromage', families: ['fromage'], grams: 30, max: 1, required: true, fallback: 'emmental_rape', role: 'sauce' },
    ],
    sides: ['salade_verte'],
    steps: (n) => [
      `Préchauffer le four à 200 °C. Précuire ${n.feculent} (pâtes al dente, pommes de terre en rondelles 10 min à l’eau).`,
      `Précuire ${n.legumes} 5 min à la vapeur ou à la poêle.${n.proteine ? ` Cuire ${n.proteine} coupé en dés.` : ''}`,
      `Mélanger le tout dans un plat avec ${n.liant}, sel, poivre.`,
      `Couvrir de ${n.fromage} et gratiner 25 min.`,
    ],
    storage: '3 jours au frais, se congèle en parts.',
    transport: 'À réchauffer : seulement si un micro-ondes est disponible.',
  },
  {
    id: 'soupe',
    label: 'Soupe maison',
    meals: ['diner'],
    lunchbox: false,
    temperature: 'chaud',
    category: 'familial',
    activeMin: 15,
    totalMin: 40,
    fridgeDays: 3,
    freezable: true,
    fixed: [
      { ingredientId: 'bouillon', qty: 0.5, unit: 'pc', role: 'autre' },
      { ingredientId: 'huile_olive', qty: 1, unit: 'cc', role: 'sauce' },
      { ingredientId: 'pain_campagne', qty: 60, unit: 'g', role: 'feculent' },
    ],
    slots: [
      { key: 'legumes', families: ['legume'], legume: 'cuit', grams: 300, max: 4, required: true, fallback: 'carotte', role: 'legume' },
      { key: 'feculent', families: ['feculent'], only: ['pomme_de_terre', 'patate_douce'], grams: 100, max: 1, required: false, fallback: null, role: 'feculent' },
      { key: 'fromage', families: ['fromage', 'cremerie'], only: ['comte', 'emmental_rape', 'parmesan', 'chevre_buche', 'creme_liquide', 'creme_epaisse', 'fromage_frais'], grams: 30, max: 1, required: false, fallback: null, role: 'proteine' },
    ],
    sides: [],
    steps: (n) => [
      `Couper ${n.legumes}${n.feculent ? ` et ${n.feculent}` : ''} en morceaux.`,
      'Faire revenir 5 min dans l’huile, couvrir d’eau à hauteur avec le bouillon, cuire 25 min.',
      `Mixer${n.fromage ? `, servir avec ${n.fromage}` : ''} et des tartines de pain grillé.`,
    ],
    storage: '3 jours au frais ou congelée en portions.',
  },
  {
    id: 'quiche',
    label: 'Quiche vide-frigo',
    meals: ['dejeuner', 'diner'],
    lunchbox: true,
    temperature: 'froid_ou_chaud',
    category: 'quiche_tarte',
    activeMin: 15,
    totalMin: 55,
    fridgeDays: 3,
    freezable: true,
    fixed: [
      { ingredientId: 'pate_brisee', qty: 0.25, unit: 'pc', role: 'feculent' },
      { ingredientId: 'oeuf', qty: 1, unit: 'pc', role: 'proteine' },
    ],
    slots: [
      { key: 'liant', families: ['cremerie'], only: ['creme_liquide', 'creme_epaisse', 'lait'], grams: 60, max: 1, required: true, fallback: 'creme_liquide', role: 'sauce' },
      { key: 'legumes', families: ['legume'], legume: 'cuit', grams: 100, max: 2, required: false, fallback: null, role: 'legume' },
      { key: 'garniture', families: COOKED_PROTEINS, grams: 50, max: 1, required: false, fallback: null, role: 'proteine' },
      { key: 'fromage', families: ['fromage'], grams: 25, max: 1, required: false, fallback: null, role: 'sauce' },
    ],
    sides: ['salade_verte'],
    steps: (n) => [
      'Préchauffer le four à 200 °C, foncer un moule avec la pâte.',
      [n.legumes && `Faire revenir ${n.legumes} 8 min`, n.garniture && `cuire ${n.garniture} en dés`].filter(Boolean).join(', ') + '.',
      `Battre les œufs avec ${n.liant}, sel, poivre. Répartir la garniture sur la pâte${n.fromage ? `, ajouter ${n.fromage}` : ''}, verser l’appareil.`,
      'Cuire 30 à 35 min, laisser refroidir avant de découper.',
    ],
    storage: '3 jours au frais, congélation possible en parts.',
    transport: BOITE,
  },
  {
    id: 'salade',
    label: 'Salade complète',
    meals: ['dejeuner'],
    lunchbox: true,
    temperature: 'froid',
    category: 'bowl_salade',
    activeMin: 15,
    totalMin: 25,
    fridgeDays: 2,
    freezable: false,
    fixed: [
      { ingredientId: 'huile_olive', qty: 1, unit: 'cs', role: 'sauce' },
      { ingredientId: 'vinaigre', qty: 1, unit: 'cc', role: 'autre' },
      { ingredientId: 'moutarde', qty: 3, unit: 'g', role: 'autre' },
    ],
    slots: [
      { key: 'feculent', families: ['feculent', 'legumineuse'], only: ['pates_courtes', 'riz', 'quinoa', 'semoule', 'lentilles_vertes', 'pomme_de_terre', 'pois_chiches'], grams: 70, gramsFor: { pomme_de_terre: 200, pois_chiches: 120 }, max: 1, required: true, fallback: 'pates_courtes', role: 'feculent' },
      { key: 'proteine', families: ['oeuf', 'poisson', 'charcuterie', 'viande', 'fromage', 'legumineuse'], only: ['oeuf', 'thon', 'saumon_fume', 'jambon_blanc', 'poulet_filet', 'dinde_escalope', 'feta', 'mozzarella', 'comte', 'chevre_buche', 'pois_chiches', 'haricots_rouges'], grams: 90, max: 2, required: true, fallback: 'thon', role: 'proteine' },
      { key: 'legumes', families: ['legume'], legume: 'cru', grams: 150, max: 3, required: true, fallback: 'tomate', role: 'legume' },
    ],
    sides: [],
    steps: (n) => [
      `Cuire ${n.feculent} si besoin, rincer à l’eau froide.`,
      `Préparer ${n.proteine} (viande cuite à cœur puis refroidie, œufs durs 10 min).`,
      `Couper ${n.legumes}, mélanger avec le reste.`,
      'Vinaigrette (huile, vinaigre, moutarde) dans un petit pot à part, à verser au moment du repas.',
    ],
    storage: '2 jours au frais (1 jour si riz).',
    transport: BOITE,
  },
  {
    id: 'pates',
    label: 'Pâtes vide-frigo',
    meals: ['diner'],
    lunchbox: true,
    temperature: 'chaud',
    category: 'pates_riz',
    activeMin: 20,
    totalMin: 25,
    fridgeDays: 3,
    freezable: true,
    fixed: [{ ingredientId: 'huile_olive', qty: 1, unit: 'cc', role: 'sauce' }],
    slots: [
      { key: 'feculent', families: ['feculent'], only: ['pates_courtes', 'spaghetti'], grams: 90, max: 1, required: true, fallback: 'pates_courtes', role: 'feculent' },
      { key: 'legumes', families: ['legume'], legume: 'cuit', grams: 150, max: 2, required: true, fallback: 'courgette', role: 'legume' },
      { key: 'proteine', families: COOKED_PROTEINS, grams: 80, max: 1, required: false, fallback: null, role: 'proteine' },
      { key: 'sauce', families: ['sauce', 'cremerie'], only: ['passata', 'tomates_concassees', 'pesto', 'creme_liquide', 'creme_epaisse', 'lait_coco'], grams: 70, gramsFor: { pesto: 30, creme_liquide: 40, creme_epaisse: 35 }, max: 1, required: true, fallback: 'passata', role: 'sauce' },
      { key: 'fromage', families: ['fromage'], only: ['parmesan', 'emmental_rape', 'comte', 'mozzarella', 'feta', 'chevre_buche'], grams: 15, max: 1, required: false, fallback: null, role: 'sauce' },
    ],
    sides: [],
    steps: (n) => [
      `Cuire ${n.feculent} al dente.`,
      `Pendant ce temps, faire revenir ${n.legumes}${n.proteine ? ` puis ${n.proteine} (cuit à cœur)` : ''} dans l’huile.`,
      `Ajouter ${n.sauce}, laisser mijoter 5 min, mélanger avec les pâtes.`,
      n.fromage ? `Servir avec ${n.fromage}.` : 'Poivrer et servir.',
    ],
    storage: '3 jours au frais.',
    transport: 'À réchauffer : seulement si un micro-ondes est disponible.',
  },
];

function fits(slot: TemplateSlot, id: string): boolean {
  const info = foodInfo(id);
  if (slot.only) return slot.only.includes(id);
  if (!slot.families.includes(info.family)) return false;
  if (slot.legume === 'cuit' && info.family === 'legume' && !info.cook) return false;
  if (slot.legume === 'cru' && info.family === 'legume' && !info.raw) return false;
  return true;
}

function lower(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function joinNames(ids: string[], catalog: Catalog): string {
  const names = ids.map((id) => lower(catalog.ingredients[id].name.replace(/\s*\(.*\)$/, '')));
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

export interface GeneratedIdea extends RankedRecipe {
  templateId: string;
}

/**
 * Compose des recettes à partir du stock, en utilisant d'abord ce qui périme.
 * `variant` décale le choix des ingrédients pour proposer « une autre idée ».
 */
export function generateIdeas(catalog: Catalog, inventory: InventoryItem[], today: string, settings: Settings | null, variant = 0): GeneratedIdea[] {
  const stock = stockEntries(inventory, catalog, today)
    .filter((e) => !settings?.excludedIngredients.includes(e.ingredientId))
    .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
  if (stock.length === 0) return [];
  const pantryIds = new Set(Object.values(catalog.ingredients).filter((i) => i.staple).map((i) => i.id));
  const ideas: GeneratedIdea[] = [];

  for (const t of TEMPLATES) {
    const used = new Set(t.fixed.map((f) => f.ingredientId));
    const chosen: Record<string, string[]> = {};
    const lines: RecipeIngredient[] = [...t.fixed];
    const uses: StockUse[] = [];
    const missing: string[] = [];
    let ok = true;

    for (const slot of t.slots) {
      const cands = stock.filter((e) => !used.has(e.ingredientId) && fits(slot, e.ingredientId));
      // Variante : on fait tourner le premier choix parmi les candidats.
      const shift = cands.length ? variant % cands.length : 0;
      const ordered = [...cands.slice(shift), ...cands.slice(0, shift)];
      let picks = ordered.slice(0, slot.max).map((e) => e.ingredientId);
      // Au-delà du premier, on n'ajoute que des ingrédients qui périment dans la semaine.
      picks = picks.filter((id, i) => i === 0 || (stock.find((e) => e.ingredientId === id)!.daysLeft ?? 99) <= 7);
      if (picks.length === 0) {
        if (!slot.required) continue;
        if (!slot.fallback || !catalog.ingredients[slot.fallback] || used.has(slot.fallback)) {
          ok = false;
          break;
        }
        picks = [slot.fallback];
        if (!pantryIds.has(slot.fallback)) missing.push(slot.fallback);
      }
      const kept: string[] = [];
      for (const id of picks) {
        const ing = catalog.ingredients[id];
        const grams = (slot.gramsFor?.[id] ?? slot.grams) / picks.length;
        const qty = toIngredientUnit(grams, 'g', ing);
        if (qty === null) continue; // pas de poids unitaire connu : on ne devine pas
        lines.push({ ingredientId: id, qty: Math.round(qty * 100) / 100, unit: ing.unit === 'g' ? 'g' : ing.unit === 'ml' ? 'ml' : 'pc', role: slot.role });
        used.add(id);
        kept.push(id);
        const e = stock.find((s) => s.ingredientId === id);
        if (e) uses.push({ ingredientId: id, daysLeft: e.daysLeft });
      }
      if (kept.length === 0 && slot.required) {
        ok = false;
        break;
      }
      if (kept.length) chosen[slot.key] = kept;
    }
    if (!ok) continue;
    for (const f of t.fixed) {
      if (stock.some((e) => e.ingredientId === f.ingredientId)) {
        const e = stock.find((s) => s.ingredientId === f.ingredientId)!;
        if (!uses.some((u) => u.ingredientId === e.ingredientId)) uses.push({ ingredientId: e.ingredientId, daysLeft: e.daysLeft });
      } else if (!pantryIds.has(f.ingredientId)) missing.push(f.ingredientId);
    }
    // Anti-gaspi : il faut sauver au moins un produit qui périme dans les 7 jours, ou utiliser 2 produits du stock.
    const urgent = uses.filter((u) => u.daysLeft !== null && u.daysLeft <= 7).length;
    if (urgent === 0 && uses.length < 2) continue;

    const names: Names = Object.fromEntries(Object.entries(chosen).map(([k, ids]) => [k, joinNames(ids, catalog)]));
    const titleParts = [chosen.legumes, chosen.proteine ?? chosen.garniture, chosen.fromage].filter(Boolean).flat() as string[];
    const title = `${t.label} ${titleParts.length ? `: ${joinNames(titleParts.slice(0, 3), catalog)}` : ''}`.trim();
    const allIds = lines.map((l) => l.ingredientId);
    const hasRice = allIds.includes('riz');
    const main = (chosen.proteine ?? chosen.garniture ?? chosen.legumes ?? [allIds[0]])[0];

    const recipe: Recipe = {
      id: `vf-${t.id}-${[...allIds].sort().join('-')}`,
      name: title,
      summary: 'Recette vide-frigo composée à partir de votre stock, en priorité avec ce qui périme bientôt.',
      category: t.category,
      meals: t.meals,
      lunchbox: t.lunchbox,
      temperature: t.temperature,
      activeMin: t.activeMin,
      totalMin: t.totalMin,
      costLevel: 1,
      mainIngredient: foodInfo(main).family === 'legume' ? 'legumes' : main,
      ingredients: lines,
      steps: t.steps(names).filter((s) => s && s !== '.'),
      fridgeDays: hasRice ? 1 : t.fridgeDays,
      freezable: t.freezable,
      storageTips: t.storage,
      transportTips: t.transport,
      suggestedSides: t.sides,
      defaultSide: null,
      leftoverFriendly: true,
      vegetarian: !lines.some((l) => ['viande', 'charcuterie', 'poisson'].includes(foodInfo(l.ingredientId).family)),
      tags: ['vide-frigo'],
    };
    if (settings && !recipeAllowed(recipe, settings, catalog)) continue;
    const score = uses.reduce((s, u) => s + urgencyWeight(u.daysLeft), 0) + uses.length * 0.3 - missing.length;
    ideas.push({ recipe, score, uses: uses.sort((a, b) => (a.daysLeft ?? 99) - (b.daysLeft ?? 99)), missing: [...new Set(missing)], templateId: t.id });
  }
  return ideas.sort((a, b) => b.score - a.score);
}

export const TEMPLATE_COUNT = TEMPLATES.length;
