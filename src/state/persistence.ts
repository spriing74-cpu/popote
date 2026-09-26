import type { AppState, Catalog, DinerChoice, InventoryItem, ProductInfo, ProfileId, Recipe, RecipeIngredient, Settings, Slot, SlotId, Unit } from '../domain/types';
import { mergeCatalog } from '../data/catalog';
import type { Equipment } from '../domain/equipment';
import { DAYS, PROFILE_IDS, SLOT_IDS, emptySlot, slotIndex } from '../domain/week';
import { defaultState } from '../data/defaults';

export const STORAGE_KEY = 'popote:v1';

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
const arr = <T>(v: unknown, guard: (x: unknown) => x is T): T[] => (Array.isArray(v) ? v.filter(guard) : []);
const isStr = (x: unknown): x is string => typeof x === 'string';

/**
 * Transforme n'importe quelle donnée (localStorage ou fichier importé) en état valide :
 * champs manquants complétés par les valeurs par défaut, références inconnues retirées.
 */
const KINDS = ['four', 'airfryer', 'microondes', 'plaques', 'autocuiseur', 'robot', 'autre'];
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function normalizeEquipment(e: Loose): Equipment | null {
  if (typeof e.kind !== 'string' || !KINDS.includes(e.kind)) return null;
  const ai = isObj(e.ai) ? e.ai : null;
  return {
    id: str(e.id, Math.random().toString(36).slice(2)),
    kind: e.kind as Equipment['kind'],
    brand: str(e.brand, ''),
    model: str(e.model, ''),
    convection: typeof e.convection === 'boolean' ? e.convection : undefined,
    maxTempC: numOrNull(e.maxTempC),
    basketLiters: numOrNull(e.basketLiters),
    watts: numOrNull(e.watts),
    hob: e.hob === 'induction' || e.hob === 'vitroceramique' || e.hob === 'gaz' || e.hob === 'electrique' ? e.hob : undefined,
    notes: str(e.notes, ''),
    ai: ai
      ? {
          summary: str(ai.summary, ''),
          functions: arr(ai.functions, isStr),
          maxTempC: numOrNull(ai.maxTempC),
          capacity: typeof ai.capacity === 'string' ? ai.capacity : null,
          dishSettings: Array.isArray(ai.dishSettings)
            ? ai.dishSettings.filter(isObj).map((d) => ({
                dish: str(d.dish, ''),
                mode: str(d.mode, ''),
                tempC: numOrNull(d.tempC),
                timeMin: typeof d.timeMin === 'string' ? d.timeMin : null,
                notes: str(d.notes, ''),
              }))
            : [],
          tips: arr(ai.tips, isStr),
          sources: Array.isArray(ai.sources)
            ? ai.sources.filter(isObj).filter((s) => typeof s.url === 'string' && /^https?:\/\//.test(s.url)).map((s) => ({ title: str(s.title, str(s.url, '')), url: s.url as string }))
            : [],
          caveats: str(ai.caveats, ''),
          fetchedAt: str(ai.fetchedAt, ''),
        }
      : undefined,
  };
}

const UNITS: Unit[] = ['g', 'kg', 'ml', 'cl', 'l', 'cc', 'cs', 'pc'];
const isUnit = (u: unknown): u is Unit => typeof u === 'string' && (UNITS as string[]).includes(u);
const isIsoDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Recette personnelle (vide-frigo « vf- » ou importée « mdb- ») : on ne garde que des données valides et convertibles. */
function normalizeRecipe(r: Loose, catalog: Catalog): Recipe | null {
  if (typeof r.id !== 'string' || !/^(vf|mdb)-/.test(r.id) || typeof r.name !== 'string' || !Array.isArray(r.ingredients)) return null;
  const ingredients: RecipeIngredient[] = [];
  for (const x of r.ingredients) {
    if (!isObj(x) || typeof x.ingredientId !== 'string' || !catalog.ingredients[x.ingredientId] || !isUnit(x.unit) || typeof x.qty !== 'number' || !(x.qty > 0)) return null;
    const role = ['proteine', 'feculent', 'legume', 'sauce', 'autre'].includes(x.role as string) ? (x.role as RecipeIngredient['role']) : 'autre';
    ingredients.push({ ingredientId: x.ingredientId, qty: x.qty, unit: x.unit, role });
  }
  if (ingredients.length === 0) return null;
  const meals = arr(r.meals, isStr).filter((m): m is 'dejeuner' | 'diner' => m === 'dejeuner' || m === 'diner');
  return {
    id: r.id,
    name: r.name,
    summary: str(r.summary, ''),
    category: (typeof r.category === 'string' ? r.category : 'familial') as Recipe['category'],
    meals: meals.length ? meals : ['diner'],
    lunchbox: r.lunchbox === true,
    temperature: r.temperature === 'froid' || r.temperature === 'chaud' ? r.temperature : 'froid_ou_chaud',
    activeMin: num(r.activeMin, 20),
    totalMin: num(r.totalMin, 30),
    costLevel: 1,
    mainIngredient: str(r.mainIngredient, ingredients[0].ingredientId),
    ingredients,
    steps: arr(r.steps, isStr),
    fridgeDays: num(r.fridgeDays, 2),
    freezable: r.freezable === true,
    storageTips: str(r.storageTips, ''),
    transportTips: typeof r.transportTips === 'string' ? r.transportTips : undefined,
    suggestedSides: arr(r.suggestedSides, isStr).filter((x) => catalog.sides[x]),
    defaultSide: null,
    leftoverFriendly: r.leftoverFriendly !== false,
    vegetarian: r.vegetarian === true,
    tags: arr(r.tags, isStr),
    videoUrl: typeof r.videoUrl === 'string' && r.videoUrl.startsWith('https://www.youtube.com/') ? r.videoUrl : undefined,
    source: isObj(r.source) && typeof r.source.url === 'string' && /^https?:\/\//.test(r.source.url) ? { name: str(r.source.name, 'Source'), url: r.source.url } : undefined,
    imageUrl: typeof r.imageUrl === 'string' && r.imageUrl.startsWith('https://') ? r.imageUrl : undefined,
  };
}

export function normalizeState(raw: unknown, baseCatalog: Catalog): AppState {
  const base = defaultState();
  if (!isObj(raw)) return base;
  const customRecipes = Array.isArray(raw.customRecipes)
    ? raw.customRecipes.filter(isObj).map((r) => normalizeRecipe(r, baseCatalog)).filter((r): r is Recipe => r !== null)
    : [];
  const catalog = mergeCatalog(baseCatalog, customRecipes);

  const profiles = { ...base.profiles };
  if (isObj(raw.profiles)) {
    for (const id of PROFILE_IDS) {
      const p = raw.profiles[id];
      if (!isObj(p)) continue;
      const d = base.profiles[id];
      const f = isObj(p.factors) ? p.factors : {};
      profiles[id] = {
        id,
        name: str(p.name, d.name),
        factors: {
          portion: num(f.portion, d.factors.portion),
          feculent: num(f.feculent, d.factors.feculent),
          legume: num(f.legume, d.factors.legume),
          proteine: num(f.proteine, d.factors.proteine),
          sauce: num(f.sauce, d.factors.sauce),
        },
        lunchPlace: p.lunchPlace === 'chantier' || p.lunchPlace === 'travail' || p.lunchPlace === 'maison' ? p.lunchPlace : d.lunchPlace,
        microwaveAtLunch: typeof p.microwaveAtLunch === 'boolean' ? p.microwaveAtLunch : d.microwaveAtLunch,
        defaultLunchExtras: arr(p.defaultLunchExtras, isStr).filter((s) => catalog.sides[s]),
        defaultDinnerExtras: arr(p.defaultDinnerExtras, isStr).filter((s) => catalog.sides[s]),
        personalNote: str(p.personalNote, ''),
      };
    }
  }

  const s = isObj(raw.settings) ? raw.settings : {};
  const settings: Settings = {
    ...base.settings,
    prepDays: arr(s.prepDays, isStr).filter((d): d is (typeof DAYS)[number] => (DAYS as string[]).includes(d)),
    maxActiveMin: typeof s.maxActiveMin === 'number' ? s.maxActiveMin : null,
    maxCostLevel: s.maxCostLevel === 1 || s.maxCostLevel === 2 || s.maxCostLevel === 3 ? s.maxCostLevel : null,
    excludedAllergens: arr(s.excludedAllergens, isStr) as AppState['settings']['excludedAllergens'],
    excludedIngredients: arr(s.excludedIngredients, isStr).filter((i) => catalog.ingredients[i]),
    preferredStore:
      s.preferredStore === 'auchan' || s.preferredStore === 'leclerc' || s.preferredStore === 'lidl' || s.preferredStore === 'autre'
        ? s.preferredStore
        : null,
    useLeftoversInSuggestions: typeof s.useLeftoversInSuggestions === 'boolean' ? s.useLeftoversInSuggestions : true,
    deductInventory: typeof s.deductInventory === 'boolean' ? s.deductInventory : true,
    aiServiceUrl: typeof s.aiServiceUrl === 'string' && /^https:\/\//.test(s.aiServiceUrl) ? s.aiServiceUrl : '',
  };
  if (!isObj(raw.settings) || !Array.isArray(s.prepDays)) settings.prepDays = base.settings.prepDays;

  const rawPlan = isObj(raw.plan) ? raw.plan : {};
  const rawSlots = isObj(rawPlan.slots) ? rawPlan.slots : {};
  const slots = {} as Record<SlotId, Slot>;
  for (const id of SLOT_IDS) {
    const def = emptySlot(id, profiles, settings.prepDays);
    const r = rawSlots[id];
    if (!isObj(r)) {
      slots[id] = def;
      continue;
    }
    const diners = {} as Record<ProfileId, DinerChoice>;
    for (const p of PROFILE_IDS) {
      const d = isObj(r.diners) && isObj(r.diners[p]) ? (r.diners[p] as Loose) : null;
      diners[p] = d
        ? {
            present: typeof d.present === 'boolean' ? d.present : true,
            portion: Math.max(0, num(d.portion, 1)),
            sideId: typeof d.sideId === 'string' && catalog.sides[d.sideId] ? d.sideId : null,
            extras: arr(d.extras, isStr).filter((e) => catalog.sides[e]),
          }
        : def.diners[p];
    }
    const recipeId = typeof r.recipeId === 'string' && catalog.recipes[r.recipeId] ? r.recipeId : null;
    const leftoverOf = typeof r.leftoverOf === 'string' && (SLOT_IDS as string[]).includes(r.leftoverOf) ? (r.leftoverOf as SlotId) : null;
    slots[id] = {
      recipeId: leftoverOf ? null : recipeId,
      leftoverOf,
      prepDay: typeof r.prepDay === 'string' && (DAYS as string[]).includes(r.prepDay) ? (r.prepDay as Slot['prepDay']) : def.prepDay,
      extraPortions: Math.max(0, Math.round(num(r.extraPortions, 0))),
      diners,
      note: str(r.note, ''),
      cookedOn: isIsoDate(r.cookedOn) ? r.cookedOn : null,
    };
  }
  // Restes incohérents (source absente, source elle-même en restes, source postérieure) : on les détache.
  for (const id of SLOT_IDS) {
    const src = slots[id].leftoverOf;
    if (src && (!slots[src].recipeId || slots[src].leftoverOf || slotIndex(src) >= slotIndex(id))) {
      slots[id] = { ...slots[id], leftoverOf: null };
    }
  }

  const pantry = Array.isArray(raw.pantry)
    ? raw.pantry
        .filter(isObj)
        .filter((p) => typeof p.ingredientId === 'string' && catalog.ingredients[p.ingredientId])
        .map((p) => ({
          ingredientId: p.ingredientId as string,
          qty: typeof p.qty === 'number' ? p.qty : null,
          unit: (typeof p.unit === 'string' ? p.unit : catalog.ingredients[p.ingredientId as string].unit) as AppState['pantry'][number]['unit'],
        }))
    : base.pantry;

  const manualItems = Array.isArray(raw.manualItems)
    ? raw.manualItems.filter(isObj).map((m) => ({
        id: str(m.id, Math.random().toString(36).slice(2)),
        label: str(m.label, 'Article'),
        quantity: str(m.quantity, ''),
        aisle: (typeof m.aisle === 'string' ? m.aisle : 'divers') as AppState['manualItems'][number]['aisle'],
      }))
    : [];

  const checked: Record<string, boolean> = {};
  if (isObj(raw.checked)) for (const [k, v] of Object.entries(raw.checked)) if (v === true) checked[k] = true;

  const prices = Array.isArray(raw.prices)
    ? raw.prices
        .filter(isObj)
        .filter((p) => typeof p.ingredientId === 'string' && catalog.ingredients[p.ingredientId] && typeof p.price === 'number')
        .map((p) => ({
          id: str(p.id, Math.random().toString(36).slice(2)),
          ingredientId: p.ingredientId as string,
          store: (['auchan', 'leclerc', 'lidl', 'autre'].includes(p.store as string) ? p.store : 'autre') as AppState['prices'][number]['store'],
          price: p.price as number,
          perQty: num(p.perQty, 1),
          perUnit: (typeof p.perUnit === 'string' ? p.perUnit : 'kg') as AppState['prices'][number]['perUnit'],
          date: str(p.date, new Date().toISOString().slice(0, 10)),
          source: (p.source === 'ticket' || p.source === 'import' ? p.source : 'saisie') as 'ticket' | 'import' | 'saisie',
        }))
    : [];

  return {
    version: 1,
    profiles,
    settings,
    plan: { weekOf: typeof rawPlan.weekOf === 'string' ? rawPlan.weekOf : null, slots },
    pantry,
    manualItems,
    checked,
    prices,
    favorites: arr(raw.favorites, isStr).filter((f) => catalog.recipes[f]),
    inventory: Array.isArray(raw.inventory)
      ? raw.inventory.filter(isObj).flatMap((i): InventoryItem[] => {
          if (typeof i.label !== 'string' || typeof i.qty !== 'number' || !isUnit(i.unit)) return [];
          const ingredientId = typeof i.ingredientId === 'string' && catalog.ingredients[i.ingredientId] ? i.ingredientId : null;
          return [
            {
              id: str(i.id, Math.random().toString(36).slice(2)),
              ingredientId,
              label: i.label,
              brand: typeof i.brand === 'string' ? i.brand : undefined,
              barcode: typeof i.barcode === 'string' ? i.barcode : undefined,
              qty: Math.max(0, i.qty),
              unit: i.unit,
              expiry: isIsoDate(i.expiry) ? i.expiry : null,
              expirySource: i.expirySource === 'emballage' || i.expirySource === 'estimee' ? i.expirySource : 'aucune',
              location: i.location === 'congelateur' || i.location === 'placard' ? i.location : 'frigo',
              addedAt: isIsoDate(i.addedAt) ? i.addedAt : new Date().toISOString().slice(0, 10),
            },
          ];
        })
      : [],
    products: isObj(raw.products)
      ? Object.fromEntries(
          Object.entries(raw.products).flatMap(([code, p]): [string, ProductInfo][] => {
            if (!isObj(p) || !/^\d{8,14}$/.test(code)) return [];
            return [
              [
                code,
                {
                  barcode: code,
                  name: str(p.name, 'Produit'),
                  brand: str(p.brand, ''),
                  ingredientId: typeof p.ingredientId === 'string' && catalog.ingredients[p.ingredientId] ? p.ingredientId : null,
                  qty: typeof p.qty === 'number' ? p.qty : null,
                  unit: isUnit(p.unit) ? p.unit : null,
                  source: p.source === 'manuel' ? 'manuel' : 'openfoodfacts',
                },
              ],
            ];
          }),
        )
      : {},
    aliases: isObj(raw.aliases)
      ? Object.fromEntries(Object.entries(raw.aliases).filter((e): e is [string, string] => typeof e[1] === 'string' && !!catalog.ingredients[e[1]]))
      : {},
    customRecipes,
    ratings: isObj(raw.ratings)
      ? Object.fromEntries(Object.entries(raw.ratings).filter((e): e is [string, 1 | -1] => (e[1] === 1 || e[1] === -1) && !!catalog.recipes[e[0]]))
      : {},
    history: Array.isArray(raw.history)
      ? raw.history
          .filter(isObj)
          .map((h) => ({ weekOf: isIsoDate(h.weekOf) ? h.weekOf : null, recipeIds: arr(h.recipeIds, isStr).filter((r) => catalog.recipes[r]) }))
          .slice(0, 8)
      : [],
    equipment: Array.isArray(raw.equipment) ? raw.equipment.filter(isObj).map(normalizeEquipment).filter((e): e is Equipment => e !== null) : [],
  };
}

export function loadState(catalog: Catalog): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return normalizeState(JSON.parse(raw), catalog);
  } catch {
    return defaultState();
  }
}

export function saveState(state: AppState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function exportJson(state: AppState): string {
  return JSON.stringify({ app: 'popote', exportedAt: new Date().toISOString(), ...state }, null, 2);
}

/** Lève une erreur lisible si le fichier n'est pas une sauvegarde Popote. */
export function parseImport(text: string, catalog: Catalog): AppState {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Le fichier n’est pas un JSON valide.');
  }
  if (!isObj(data) || data.app !== 'popote' || data.version !== 1) {
    throw new Error('Ce fichier ne ressemble pas à une sauvegarde Popote (version 1).');
  }
  return normalizeState(data, catalog);
}
