import type { Catalog, ProductInfo, Unit } from './types';
import { bestMatch, normalizeText } from './matching';

// Open Food Facts : base collaborative et gratuite, sans clé d'API.
// Seul le code-barres est envoyé ; aucune donnée personnelle.
const API = 'https://world.openfoodfacts.org/api/v2/product/';
const FIELDS = 'product_name,product_name_fr,generic_name_fr,brands,quantity,product_quantity,product_quantity_unit,categories_tags';

export interface OffProduct {
  product_name?: string;
  product_name_fr?: string;
  generic_name_fr?: string;
  brands?: string;
  quantity?: string;
  product_quantity?: number | string;
  product_quantity_unit?: string;
  categories_tags?: string[];
}

/** « 500 g », « 1 L », « 6 x 125 g », « 20 cl » → quantité totale et unité. */
export function parseOffQuantity(q: string | undefined): { qty: number; unit: Unit } | null {
  if (!q) return null;
  const s = q.toLowerCase().replace(',', '.');
  const multi = s.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|cl|ml|l)\b/);
  if (multi) return { qty: +multi[1] * +multi[2], unit: multi[3] as Unit };
  const single = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|cl|ml|l)\b/);
  if (single) return { qty: +single[1], unit: single[2] as Unit };
  const pieces = s.match(/(\d+)\s*(oeufs|œufs|pi[eè]ces|pcs|tranches|galettes|x)\b/);
  if (pieces) return { qty: +pieces[1], unit: 'pc' };
  return null;
}

// Catégories Open Food Facts → ingrédient (vérifiées en premier, plus fiables que le nom).
const CATEGORY_MAP: [RegExp, string][] = [
  [/en:chicken-breasts|en:chicken-fillets|fr:filets-de-poulet|fr:aiguillettes-de-poulet/, 'poulet_filet'],
  [/en:chicken-legs|en:chicken-thighs|fr:cuisses-de-poulet/, 'poulet_cuisse'],
  [/en:turkey-cutlets|fr:escalopes-de-dinde/, 'dinde_escalope'],
  [/en:ground-beef|en:minced-beef|fr:steaks-haches|fr:viandes-hachees/, 'boeuf_hache'],
  [/en:toulouse-sausages|fr:saucisses-de-toulouse/, 'saucisse_toulouse'],
  [/en:smoked-salmons/, 'saumon_fume'],
  [/en:salmons|en:salmon-fillets/, 'saumon_pave'],
  [/en:canned-tunas|en:tunas/, 'thon'],
  [/en:eggs|en:chicken-eggs/, 'oeuf'],
  [/en:grated-cheeses|fr:emmentals-rapes/, 'emmental_rape'],
  [/en:mozzarella/, 'mozzarella'],
  [/en:feta/, 'feta'],
  [/en:parmigiano-reggiano|en:parmesan/, 'parmesan'],
  [/en:comte|en:beaufort/, 'comte'],
  [/en:goat-cheeses/, 'chevre_buche'],
  [/en:cream-cheeses|en:fresh-cheeses/, 'fromage_frais'],
  [/en:fromages-blancs|en:quark/, 'fromage_blanc'],
  [/en:plain-yogurts|en:yogurts/, 'yaourt_nature'],
  [/en:thick-creams|fr:cremes-fraiches-epaisses/, 'creme_epaisse'],
  [/en:creams|en:liquid-creams|fr:cremes-liquides/, 'creme_liquide'],
  [/en:butters/, 'beurre'],
  [/en:milks|en:semi-skimmed-milks/, 'lait'],
  [/en:cooked-hams|en:white-hams|fr:jambons-blancs/, 'jambon_blanc'],
  [/en:lardons|fr:lardons/, 'lardons'],
  [/en:shortcrust-pastry|fr:pates-brisees/, 'pate_brisee'],
  [/en:pizza-dough|fr:pates-a-pizza/, 'pate_pizza'],
  [/en:spaghetti/, 'spaghetti'],
  [/en:lasagna|en:lasagne-sheets/, 'lasagnes'],
  [/en:pastas|en:dry-pastas/, 'pates_courtes'],
  [/en:rices/, 'riz'],
  [/en:couscous|en:semolinas/, 'semoule'],
  [/en:quinoa/, 'quinoa'],
  [/en:red-lentils|en:coral-lentils/, 'lentilles_corail'],
  [/en:lentils|en:green-lentils/, 'lentilles_vertes'],
  [/en:chickpeas/, 'pois_chiches'],
  [/en:red-kidney-beans|en:kidney-beans/, 'haricots_rouges'],
  [/en:sweet-corn|en:corn/, 'mais'],
  [/en:crushed-tomatoes|en:chopped-tomatoes|en:peeled-tomatoes/, 'tomates_concassees'],
  [/en:tomato-sauces|en:passata|en:tomato-purees/, 'passata'],
  [/en:coconut-milks/, 'lait_coco'],
  [/en:soy-sauces/, 'sauce_soja'],
  [/en:pestos/, 'pesto'],
  [/en:mayonnaises/, 'mayonnaise'],
  [/en:tortillas|en:wraps/, 'tortilla'],
  [/en:pita/, 'pain_pita'],
  [/en:frozen-green-beans|en:green-beans/, 'haricots_verts'],
  [/en:frozen-peas|en:peas/, 'petits_pois'],
  [/en:frozen-spinachs|en:spinachs/, 'epinards'],
  [/en:frozen-fish-fillets|en:cods|en:pollocks|en:hakes/, 'poisson_blanc'],
  [/en:applesauces|en:compotes/, 'compote'],
  [/en:almonds/, 'amandes'],
  [/en:cereal-bars/, 'barre_cereales'],
  [/en:honeys/, 'miel'],
  [/en:olives/, 'olives'],
  [/en:gherkins/, 'cornichons'],
];

export function guessIngredient(p: OffProduct, catalog: Catalog, aliases: Record<string, string> = {}): string | null {
  const cats = p.categories_tags ?? [];
  // Table parcourue dans l'ordre (le plus spécifique d'abord) ; chaque motif doit couvrir toute l'étiquette.
  for (const [re, id] of CATEGORY_MAP) {
    const exact = new RegExp(`^(?:${re.source})$`);
    if (cats.some((c) => exact.test(c)) && catalog.ingredients[id]) return id;
  }
  const name = [p.product_name_fr, p.product_name, p.generic_name_fr].filter(Boolean).join(' ');
  return name ? bestMatch(name, catalog, aliases, { strict: true, head: true }) : null;
}

export function toProductInfo(barcode: string, p: OffProduct, catalog: Catalog, aliases: Record<string, string> = {}): ProductInfo {
  const q = parseOffQuantity(p.quantity) ??
    (p.product_quantity && p.product_quantity_unit ? parseOffQuantity(`${p.product_quantity} ${p.product_quantity_unit}`) : null);
  return {
    barcode,
    name: (p.product_name_fr || p.product_name || p.generic_name_fr || 'Produit inconnu').trim(),
    brand: (p.brands ?? '').split(',')[0].trim(),
    ingredientId: guessIngredient(p, catalog, aliases),
    qty: q?.qty ?? null,
    unit: q?.unit ?? null,
    source: 'openfoodfacts',
  };
}

export type LookupResult = { status: 'trouve'; product: ProductInfo } | { status: 'inconnu' } | { status: 'hors_ligne' } | { status: 'erreur'; message: string };

export async function lookupBarcode(
  barcode: string,
  catalog: Catalog,
  aliases: Record<string, string> = {},
  fetchImpl: typeof fetch = fetch,
): Promise<LookupResult> {
  if (!/^\d{8,14}$/.test(barcode)) return { status: 'erreur', message: 'Code-barres invalide.' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'hors_ligne' };
  try {
    const res = await fetchImpl(`${API}${barcode}.json?fields=${FIELDS}&lc=fr`);
    if (res.status === 404) return { status: 'inconnu' };
    if (!res.ok) return { status: 'erreur', message: `Open Food Facts a répondu ${res.status}.` };
    const data = (await res.json()) as { status?: number; product?: OffProduct };
    if (data.status === 0 || !data.product) return { status: 'inconnu' };
    return { status: 'trouve', product: toProductInfo(barcode, data.product, catalog, aliases) };
  } catch {
    return { status: 'hors_ligne' };
  }
}

export function aliasKey(label: string): string {
  return normalizeText(label);
}
