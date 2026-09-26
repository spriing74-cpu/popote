import type { AisleId, BaseUnit, Catalog, ManualItem, PantryItem, SlotId, Unit } from './types';
import type { ConsumptionLine } from './portions';
import { formatQty, roundForPurchase, toBase, toIngredientUnit } from './units';

export interface AggregatedIngredient {
  ingredientId: string;
  /** Total dans l'unité de base de l'ingrédient. */
  qty: number;
  unit: BaseUnit;
  /** Quantités impossibles à convertir (affichées à part, jamais perdues). */
  unconvertible: { qty: number; unit: BaseUnit }[];
  sources: { name: string; slots: SlotId[] }[];
  forms: string[];
}

/** Additionne les lignes de consommation par ingrédient en convertissant les unités compatibles. */
export function aggregate(lines: ConsumptionLine[], catalog: Catalog): Map<string, AggregatedIngredient> {
  const map = new Map<string, AggregatedIngredient>();
  for (const line of lines) {
    const ing = catalog.ingredients[line.ingredientId];
    if (!ing) throw new Error(`Ingrédient inconnu : ${line.ingredientId}`);
    let agg = map.get(ing.id);
    if (!agg) {
      agg = { ingredientId: ing.id, qty: 0, unit: ing.unit, unconvertible: [], sources: [], forms: [] };
      map.set(ing.id, agg);
    }
    const converted = toIngredientUnit(line.qty, line.unit, ing);
    if (converted === null) {
      const b = toBase(line.qty, line.unit);
      const existing = agg.unconvertible.find((u) => u.unit === b.unit);
      if (existing) existing.qty += b.qty;
      else agg.unconvertible.push({ ...b });
    } else {
      agg.qty += converted;
    }
    const src = agg.sources.find((s) => s.name === line.sourceName);
    if (src) {
      if (!src.slots.includes(line.slotId)) src.slots.push(line.slotId);
    } else agg.sources.push({ name: line.sourceName, slots: [line.slotId] });
    if (line.form && !agg.forms.includes(line.form)) agg.forms.push(line.form);
  }
  return map;
}

export interface ShoppingItem {
  key: string;
  label: string;
  aisle: AisleId;
  ingredientId?: string;
  /** Besoin total du planning (unité de base). */
  needed: number;
  /** Quantité couverte par le placard. */
  fromPantry: number;
  /** Reste à acheter avant arrondi. */
  toBuy: number;
  unit: BaseUnit;
  /** Quantité d'achat arrondie ou nombre de paquets. */
  purchase: { qty: number; packs: number | null; packLabel: string | null; packSize: number | null };
  display: string;
  detail: string;
  sources: { name: string; slots: SlotId[] }[];
  unconvertible: { qty: number; unit: BaseUnit }[];
  manual: boolean;
}

export interface ShoppingList {
  items: ShoppingItem[];
  /** Ingrédients nécessaires mais entièrement couverts par le placard (à vérifier). */
  covered: ShoppingItem[];
}

function pantryAvailable(pantry: PantryItem[], ingredientId: string, catalog: Catalog): number | 'illimite' {
  const ing = catalog.ingredients[ingredientId];
  let total = 0;
  for (const p of pantry) {
    if (p.ingredientId !== ingredientId) continue;
    if (p.qty === null) return 'illimite';
    const c = toIngredientUnit(p.qty, p.unit, ing);
    if (c !== null) total += c;
  }
  return total;
}

export function buildShoppingList(
  lines: ConsumptionLine[],
  catalog: Catalog,
  pantry: PantryItem[],
  manualItems: ManualItem[],
): ShoppingList {
  const agg = aggregate(lines, catalog);
  const items: ShoppingItem[] = [];
  const covered: ShoppingItem[] = [];
  const EPS = 1e-6;

  for (const a of agg.values()) {
    const ing = catalog.ingredients[a.ingredientId];
    const available = pantryAvailable(pantry, a.ingredientId, catalog);
    const fromPantry = available === 'illimite' ? a.qty : Math.min(a.qty, available);
    const toBuy = Math.max(0, a.qty - fromPantry);
    const unconvertibleText = a.unconvertible.map((u) => ` + ${formatQty(u.qty, u.unit)}`).join('');

    let purchase: ShoppingItem['purchase'];
    let display: string;
    if (ing.pack && toBuy > EPS) {
      const packs = Math.ceil(toBuy / ing.pack.size - EPS);
      purchase = { qty: packs * ing.pack.size, packs, packLabel: ing.pack.label, packSize: ing.pack.size };
      display = `${packs} × ${ing.pack.label}`;
    } else {
      const q = roundForPurchase(toBuy, a.unit);
      purchase = { qty: q, packs: null, packLabel: null, packSize: null };
      display = formatQty(q, a.unit, ing.pieceLabel);
    }
    display += unconvertibleText;

    const parts = [`besoin : ${formatQty(a.qty, a.unit, ing.pieceLabel, true)}${unconvertibleText}`];
    if (fromPantry > EPS) parts.push(`placard : ${available === 'illimite' ? 'en stock' : formatQty(fromPantry, a.unit, ing.pieceLabel, true)}`);
    if (a.forms.length) parts.push(a.forms.join(', '));

    const item: ShoppingItem = {
      key: `ing:${a.ingredientId}`,
      label: ing.name,
      aisle: ing.aisle,
      ingredientId: a.ingredientId,
      needed: a.qty,
      fromPantry,
      toBuy,
      unit: a.unit,
      purchase,
      display,
      detail: parts.join(' · '),
      sources: a.sources,
      unconvertible: a.unconvertible,
      manual: false,
    };
    if (toBuy <= EPS && a.unconvertible.length === 0) covered.push(item);
    else items.push(item);
  }

  for (const m of manualItems) {
    items.push({
      key: `manuel:${m.id}`,
      label: m.label,
      aisle: m.aisle,
      needed: 0,
      fromPantry: 0,
      toBuy: 0,
      unit: 'pc',
      purchase: { qty: 0, packs: null, packLabel: null, packSize: null },
      display: m.quantity || '',
      detail: 'ajouté à la main',
      sources: [],
      unconvertible: [],
      manual: true,
    });
  }

  const byName = (a: ShoppingItem, b: ShoppingItem) => a.label.localeCompare(b.label, 'fr');
  items.sort(byName);
  covered.sort(byName);
  return { items, covered };
}

export function groupByAisle<T extends { aisle: AisleId }>(items: T[], order: AisleId[]): { aisle: AisleId; items: T[] }[] {
  return order
    .map((aisle) => ({ aisle, items: items.filter((i) => i.aisle === aisle) }))
    .filter((g) => g.items.length > 0);
}

/** Utilitaire : une quantité exprimée dans une unité de recette, pour l'affichage d'une fiche. */
export function lineInIngredientUnit(qty: number, unit: Unit, ingredientId: string, catalog: Catalog): number | null {
  return toIngredientUnit(qty, unit, catalog.ingredients[ingredientId]);
}
