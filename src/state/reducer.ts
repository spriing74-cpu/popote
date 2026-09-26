import type {
  AppState,
  Catalog,
  DinerChoice,
  InventoryItem,
  ProductInfo,
  Recipe,
  ManualItem,
  PantryItem,
  PriceEntry,
  Profile,
  ProfileId,
  Settings,
  Slot,
  SlotId,
  WeekPlan,
} from '../domain/types';
import { SLOT_IDS, defaultPrepDay, emptyPlan, leftoverTargets, parseSlotId, slotIndex } from '../domain/week';
import { withLeftover, withRecipe } from '../domain/planner';
import { defaultState } from '../data/defaults';
import { mergeCatalog } from '../data/catalog';
import { consume } from '../domain/inventory';
import type { ConsumptionLine } from '../domain/portions';

export type Action =
  | { type: 'setRecipe'; slot: SlotId; recipeId: string | null }
  | { type: 'setLeftover'; slot: SlotId; source: SlotId | null }
  | { type: 'reserveLeftovers'; source: SlotId; targets: SlotId[] }
  | { type: 'setDiner'; slot: SlotId; profile: ProfileId; patch: Partial<DinerChoice> }
  | { type: 'setSlot'; slot: SlotId; patch: Partial<Pick<Slot, 'prepDay' | 'extraPortions' | 'note'>> }
  | { type: 'clearSlot'; slot: SlotId }
  | { type: 'setPlan'; plan: WeekPlan }
  | { type: 'newWeek'; weekOf: string | null }
  | { type: 'setWeekOf'; weekOf: string | null }
  | { type: 'applyPrepDays' }
  | { type: 'updateProfile'; profile: ProfileId; patch: Partial<Profile> }
  | { type: 'updateSettings'; patch: Partial<Settings> }
  | { type: 'setPantryItem'; item: PantryItem }
  | { type: 'removePantryItem'; ingredientId: string }
  | { type: 'addManualItem'; item: ManualItem }
  | { type: 'removeManualItem'; id: string }
  | { type: 'toggleChecked'; key: string }
  | { type: 'clearChecked' }
  | { type: 'addPrice'; entry: PriceEntry }
  | { type: 'removePrice'; id: string }
  | { type: 'toggleFavorite'; recipeId: string }
  | { type: 'addInventory'; items: InventoryItem[] }
  | { type: 'updateInventory'; id: string; patch: Partial<InventoryItem> }
  | { type: 'removeInventory'; id: string }
  | { type: 'markCooked'; slot: SlotId; lines: ConsumptionLine[]; date: string }
  | { type: 'saveProduct'; product: ProductInfo }
  | { type: 'learnAliases'; entries: Record<string, string> }
  | { type: 'clearAliases' }
  | { type: 'keepRecipe'; recipe: Recipe }
  | { type: 'removeCustomRecipe'; id: string }
  | { type: 'replaceState'; state: AppState }
  | { type: 'reset' };

function setSlots(state: AppState, slots: Record<SlotId, Slot>): AppState {
  return { ...state, plan: { ...state.plan, slots } };
}

/** Détache (et vide) les créneaux qui mangeaient les restes d'un créneau source. */
function detachTargets(slots: Record<SlotId, Slot>, plan: WeekPlan, source: SlotId): void {
  for (const t of leftoverTargets(plan, source)) slots[t] = { ...withRecipe(slots[t], null) };
}

export function reducer(baseCatalog: Catalog) {
  return function reduce(state: AppState, action: Action): AppState {
    const catalog = mergeCatalog(baseCatalog, state.customRecipes);
    const plan = state.plan;
    switch (action.type) {
      case 'setRecipe': {
        const slots = { ...plan.slots };
        const current = slots[action.slot];
        if (current.recipeId !== action.recipeId) detachTargets(slots, plan, action.slot);
        const recipe = action.recipeId ? catalog.recipes[action.recipeId] ?? null : null;
        slots[action.slot] = { ...withRecipe(current, recipe), extraPortions: recipe ? current.extraPortions : 0 };
        return setSlots(state, slots);
      }
      case 'setLeftover': {
        const slots = { ...plan.slots };
        if (action.source === null) {
          slots[action.slot] = withRecipe(slots[action.slot], null);
          return setSlots(state, slots);
        }
        const src = slots[action.source];
        if (!src.recipeId || src.leftoverOf || slotIndex(action.source) >= slotIndex(action.slot)) return state;
        detachTargets(slots, plan, action.slot);
        slots[action.slot] = withLeftover(slots[action.slot], action.source, catalog.recipes[src.recipeId] ?? null);
        return setSlots(state, slots);
      }
      case 'reserveLeftovers': {
        const slots = { ...plan.slots };
        const src = slots[action.source];
        if (!src.recipeId || src.leftoverOf) return state;
        const recipe = catalog.recipes[src.recipeId] ?? null;
        for (const t of leftoverTargets(plan, action.source)) {
          if (!action.targets.includes(t)) slots[t] = withRecipe(slots[t], null);
        }
        for (const t of action.targets) {
          if (slotIndex(t) <= slotIndex(action.source)) continue;
          if (slots[t].leftoverOf === action.source) continue;
          detachTargets(slots, plan, t);
          slots[t] = withLeftover(slots[t], action.source, recipe);
        }
        return setSlots(state, slots);
      }
      case 'setDiner': {
        const slots = { ...plan.slots };
        const s = slots[action.slot];
        slots[action.slot] = { ...s, diners: { ...s.diners, [action.profile]: { ...s.diners[action.profile], ...action.patch } } };
        return setSlots(state, slots);
      }
      case 'setSlot': {
        const slots = { ...plan.slots };
        slots[action.slot] = { ...slots[action.slot], ...action.patch };
        return setSlots(state, slots);
      }
      case 'clearSlot': {
        const slots = { ...plan.slots };
        detachTargets(slots, plan, action.slot);
        slots[action.slot] = { ...withRecipe(slots[action.slot], null), extraPortions: 0, note: '' };
        return setSlots(state, slots);
      }
      case 'setPlan':
        return { ...state, plan: action.plan };
      case 'newWeek':
        return { ...state, plan: emptyPlan(state.profiles, state.settings.prepDays, action.weekOf), checked: {} };
      case 'setWeekOf':
        return { ...state, plan: { ...plan, weekOf: action.weekOf } };
      case 'applyPrepDays': {
        const slots = { ...plan.slots };
        for (const id of SLOT_IDS) {
          slots[id] = { ...slots[id], prepDay: defaultPrepDay(parseSlotId(id).day, state.settings.prepDays) };
        }
        return setSlots(state, slots);
      }
      case 'updateProfile':
        return { ...state, profiles: { ...state.profiles, [action.profile]: { ...state.profiles[action.profile], ...action.patch } } };
      case 'updateSettings':
        return { ...state, settings: { ...state.settings, ...action.patch } };
      case 'setPantryItem':
        return { ...state, pantry: [...state.pantry.filter((p) => p.ingredientId !== action.item.ingredientId), action.item] };
      case 'removePantryItem':
        return { ...state, pantry: state.pantry.filter((p) => p.ingredientId !== action.ingredientId) };
      case 'addManualItem':
        return { ...state, manualItems: [...state.manualItems, action.item] };
      case 'removeManualItem': {
        const checked = { ...state.checked };
        delete checked[`manuel:${action.id}`];
        return { ...state, manualItems: state.manualItems.filter((m) => m.id !== action.id), checked };
      }
      case 'toggleChecked': {
        const checked = { ...state.checked };
        if (checked[action.key]) delete checked[action.key];
        else checked[action.key] = true;
        return { ...state, checked };
      }
      case 'clearChecked':
        return { ...state, checked: {} };
      case 'addPrice':
        return { ...state, prices: [...state.prices, action.entry] };
      case 'removePrice':
        return { ...state, prices: state.prices.filter((p) => p.id !== action.id) };
      case 'toggleFavorite':
        return {
          ...state,
          favorites: state.favorites.includes(action.recipeId)
            ? state.favorites.filter((f) => f !== action.recipeId)
            : [...state.favorites, action.recipeId],
        };
      case 'addInventory':
        return { ...state, inventory: [...state.inventory, ...action.items] };
      case 'updateInventory':
        return { ...state, inventory: state.inventory.map((i) => (i.id === action.id ? { ...i, ...action.patch } : i)) };
      case 'removeInventory':
        return { ...state, inventory: state.inventory.filter((i) => i.id !== action.id) };
      case 'markCooked': {
        if (plan.slots[action.slot].cookedOn) return state;
        const { inventory } = consume(state.inventory, action.lines, catalog);
        const slots = { ...plan.slots };
        slots[action.slot] = { ...slots[action.slot], cookedOn: action.date };
        return { ...setSlots(state, slots), inventory };
      }
      case 'saveProduct':
        return { ...state, products: { ...state.products, [action.product.barcode]: action.product } };
      case 'learnAliases':
        return { ...state, aliases: { ...state.aliases, ...action.entries } };
      case 'clearAliases':
        return { ...state, aliases: {} };
      case 'keepRecipe':
        if (state.customRecipes.some((r) => r.id === action.recipe.id)) return state;
        return { ...state, customRecipes: [...state.customRecipes, action.recipe] };
      case 'removeCustomRecipe': {
        const inUse = SLOT_IDS.some((id) => plan.slots[id].recipeId === action.id);
        if (inUse) return state;
        return { ...state, customRecipes: state.customRecipes.filter((r) => r.id !== action.id), favorites: state.favorites.filter((f) => f !== action.id) };
      }
      case 'replaceState':
        return action.state;
      case 'reset':
        return defaultState();
    }
  };
}

