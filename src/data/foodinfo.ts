import type { Family, StorageLocation } from '../domain/types';

/**
 * Informations complémentaires par ingrédient, pour le stock et le vide-frigo :
 * - family : famille d'aliment ;
 * - loc : rangement habituel ;
 * - days : durée de conservation ESTIMÉE après achat (produit fermé), utilisée seulement
 *   si la date de l'emballage n'est pas saisie — toujours signalée comme « estimée » ;
 * - cook / raw : légume utilisable cuit / cru dans une recette vide-frigo ;
 * - kw : mots-clés et abréviations fréquentes sur les tickets et fiches produits.
 */
export interface FoodInfo {
  family: Family;
  loc: StorageLocation;
  days: number;
  cook?: boolean;
  raw?: boolean;
  kw: string[];
}

const F = (family: Family, loc: StorageLocation, days: number, kw: string[], extra: Partial<FoodInfo> = {}): FoodInfo => ({ family, loc, days, kw, ...extra });
const LEG = (days: number, kw: string[], cook: boolean, raw: boolean) => F('legume', 'frigo', days, kw, { cook, raw });

export const FOOD_INFO: Record<string, FoodInfo> = {
  // Légumes
  carotte: LEG(14, ['carotte', 'carottes', 'carot'], true, true),
  oignon: LEG(30, ['oignon jaune', 'oignons', 'oign'], true, false),
  oignon_rouge: LEG(30, ['oignon rouge'], true, true),
  echalote: LEG(30, ['echalote', 'echal'], true, false),
  ail: F('condiment', 'placard', 30, ['ail', 'tete ail']),
  pomme_de_terre: F('feculent', 'placard', 21, ['pomme de terre', 'pommes de terre', 'pdt', 'p de terre', 'pom terre']),
  patate_douce: F('feculent', 'placard', 21, ['patate douce']),
  courgette: LEG(7, ['courgette', 'courg'], true, false),
  aubergine: LEG(7, ['aubergine', 'auberg'], true, false),
  tomate: LEG(6, ['tomate', 'tomates', 'tom grappe', 'tomate ronde'], true, true),
  tomate_cerise: LEG(6, ['tomate cerise', 'tomates cerises', 'tom cerise'], true, true),
  poivron: LEG(10, ['poivron', 'poivr'], true, true),
  concombre: LEG(7, ['concombre', 'concomb'], false, true),
  salade_verte: LEG(5, ['salade', 'laitue', 'batavia', 'feuille de chene', 'iceberg', 'romaine'], false, true),
  jeunes_pousses: LEG(4, ['jeunes pousses', 'mache', 'roquette', 'mesclun', 'epinard pousse'], false, true),
  champignon: LEG(4, ['champignon', 'champ paris', 'champignons de paris', 'champ'], true, true),
  poireau: LEG(10, ['poireau', 'poir'], true, false),
  brocoli: LEG(5, ['brocoli', 'brocolis'], true, false),
  endive: LEG(7, ['endive', 'endives', 'chicon'], true, true),
  avocat: LEG(4, ['avocat', 'avoc'], false, true),
  citron: F('fruit', 'frigo', 21, ['citron', 'citr']),
  persil: F('condiment', 'frigo', 5, ['persil']),
  coriandre: F('condiment', 'frigo', 5, ['coriandre']),
  ciboulette: F('condiment', 'frigo', 5, ['ciboulette']),
  pomme: F('fruit', 'placard', 21, ['pomme gala', 'pomme golden', 'pommes', 'pom']),
  banane: F('fruit', 'placard', 5, ['banane', 'banan', 'bananes']),
  clementine: F('fruit', 'placard', 10, ['clementine', 'mandarine', 'orange', 'poire', 'kiwi', 'fruit']),

  // Viandes et poissons
  poulet_filet: F('viande', 'frigo', 3, ['filet de poulet', 'filet poulet', 'fil poul', 'blanc de poulet', 'aiguillette poulet', 'aiguil poul', 'escalope poulet', 'poulet']),
  poulet_cuisse: F('viande', 'frigo', 3, ['cuisse de poulet', 'cuisse poulet', 'cuis poul', 'pilon poulet', 'haut de cuisse']),
  dinde_escalope: F('viande', 'frigo', 3, ['escalope de dinde', 'esc dinde', 'dinde', 'filet dinde']),
  boeuf_hache: F('viande', 'frigo', 2, ['steak hache', 'stk hache', 'viande hachee', 'hache boeuf', 'boeuf hache', 'hache 5', 'hache']),
  boeuf_mijoter: F('viande', 'frigo', 3, ['boeuf bourguignon', 'bourguignon', 'paleron', 'macreuse', 'joue de boeuf', 'boeuf a braiser', 'pot au feu']),
  porc_filet: F('viande', 'frigo', 3, ['filet mignon', 'fil mignon', 'filet de porc', 'roti de porc', 'echine', 'cote de porc', 'porc']),
  saucisse_toulouse: F('viande', 'frigo', 3, ['saucisse de toulouse', 'saucisse toulouse', 'sauc toul', 'saucisse', 'chipolata', 'merguez']),
  saumon_pave: F('poisson', 'frigo', 2, ['pave de saumon', 'pave saumon', 'saumon frais', 'saumon']),
  poisson_blanc: F('poisson', 'congelateur', 180, ['cabillaud', 'colin', 'lieu', 'merlu', 'poisson blanc', 'filet de colin', 'dos de cabillaud']),

  // Crèmerie, charcuterie
  oeuf: F('oeuf', 'frigo', 21, ['oeuf', 'oeufs', 'oeufs frais', 'x6 oeufs', 'boite 6 oeufs', 'oeufs plein air', 'oeuf pa']),
  lait: F('cremerie', 'placard', 60, ['lait', 'lait demi ecreme', 'lait 1 2 ecr', 'lait ecreme', 'lait entier', 'ldemi']),
  creme_liquide: F('cremerie', 'frigo', 21, ['creme liquide', 'cr liq', 'creme entiere liquide', 'creme fluide', 'creme legere']),
  creme_epaisse: F('cremerie', 'frigo', 21, ['creme fraiche', 'creme epaisse', 'cr fraiche', 'cr epaisse', 'creme fraiche epaisse']),
  beurre: F('cremerie', 'frigo', 45, ['beurre', 'beur', 'beurre doux', 'beurre demi sel']),
  emmental_rape: F('fromage', 'frigo', 21, ['emmental rape', 'emmental', 'rape', 'fromage rape', 'emment']),
  comte: F('fromage', 'frigo', 21, ['comte', 'beaufort', 'cantal', 'gruyere', 'tomme', 'fromage']),
  parmesan: F('fromage', 'frigo', 30, ['parmesan', 'parmigiano', 'grana padano']),
  feta: F('fromage', 'frigo', 21, ['feta']),
  mozzarella: F('fromage', 'frigo', 10, ['mozzarella', 'mozza']),
  chevre_buche: F('fromage', 'frigo', 14, ['buche de chevre', 'buche chevre', 'chevre']),
  fromage_frais: F('fromage', 'frigo', 14, ['fromage frais', 'carre frais', 'st moret', 'saint moret', 'philadelphia', 'boursin', 'kiri']),
  fromage_blanc: F('cremerie', 'frigo', 14, ['fromage blanc', 'from blanc', 'faisselle', 'skyr']),
  yaourt_nature: F('cremerie', 'frigo', 21, ['yaourt', 'yaourts', 'yaourt nature', 'yog', 'yogourt']),
  jambon_blanc: F('charcuterie', 'frigo', 7, ['jambon blanc', 'jambon', 'jamb', 'jbon', 'jambon superieur', 'jamb sup']),
  lardons: F('charcuterie', 'frigo', 14, ['lardons', 'lardon', 'lard fume', 'allumettes']),
  saumon_fume: F('poisson', 'frigo', 7, ['saumon fume', 'saum fume', 'saumon fum']),
  pate_brisee: F('pain_pate', 'frigo', 14, ['pate brisee', 'pte brisee', 'pate feuilletee', 'pate sablee']),
  pate_pizza: F('pain_pate', 'frigo', 14, ['pate a pizza', 'pate pizza', 'pte pizza']),

  // Boulangerie
  baguette: F('pain_pate', 'placard', 1, ['baguette', 'bag', 'tradition', 'flute']),
  pain_campagne: F('pain_pate', 'placard', 3, ['pain de campagne', 'pain campagne', 'pain complet', 'pain de mie', 'pain']),

  // Épicerie salée
  pates_courtes: F('feculent', 'placard', 365, ['penne', 'fusilli', 'coquillettes', 'macaroni', 'farfalle', 'torsades', 'pates']),
  spaghetti: F('feculent', 'placard', 365, ['spaghetti', 'spaghettis', 'tagliatelle', 'linguine']),
  lasagnes: F('feculent', 'placard', 365, ['lasagnes', 'lasagne', 'pate a lasagnes', 'feuilles de lasagnes']),
  riz: F('feculent', 'placard', 365, ['riz', 'riz basmati', 'riz long', 'riz thai', 'basmati']),
  semoule: F('feculent', 'placard', 365, ['semoule', 'couscous']),
  quinoa: F('feculent', 'placard', 365, ['quinoa']),
  lentilles_vertes: F('legumineuse', 'placard', 365, ['lentilles vertes', 'lentilles', 'lentille']),
  lentilles_corail: F('legumineuse', 'placard', 365, ['lentilles corail', 'lentille corail']),
  pois_chiches: F('legumineuse', 'placard', 730, ['pois chiches', 'pois chiche']),
  haricots_rouges: F('legumineuse', 'placard', 730, ['haricots rouges', 'haricot rouge']),
  mais: F('legume', 'placard', 730, ['mais doux', 'mais'], { cook: true, raw: true }),
  thon: F('poisson', 'placard', 730, ['thon', 'thon naturel', 'thon au naturel', 'miettes de thon']),
  tomates_concassees: F('sauce', 'placard', 730, ['tomates concassees', 'tom concassees', 'pulpe de tomate', 'tomates pelees']),
  passata: F('sauce', 'placard', 365, ['coulis de tomate', 'passata', 'sauce tomate', 'coulis tomate']),
  lait_coco: F('sauce', 'placard', 365, ['lait de coco', 'lait coco', 'creme de coco']),
  sauce_soja: F('condiment', 'placard', 365, ['sauce soja', 'soja sucree', 'soja']),
  pesto: F('sauce', 'placard', 180, ['pesto']),
  mayonnaise: F('condiment', 'placard', 180, ['mayonnaise', 'mayo']),
  olives: F('condiment', 'placard', 365, ['olives', 'olive noire', 'olive verte']),
  cornichons: F('condiment', 'placard', 365, ['cornichons', 'cornichon']),
  tortilla: F('pain_pate', 'placard', 60, ['wraps', 'wrap', 'tortilla', 'tortillas', 'galette de ble']),
  pain_pita: F('pain_pate', 'placard', 30, ['pita', 'pain pita']),
  bouillon: F('condiment', 'placard', 365, ['bouillon', 'cube']),
  huile_olive: F('condiment', 'placard', 365, ['huile d olive', 'huile olive', 'h olive']),
  huile_neutre: F('condiment', 'placard', 365, ['huile de tournesol', 'huile tournesol', 'huile colza', 'huile']),
  vinaigre: F('condiment', 'placard', 730, ['vinaigre']),
  moutarde: F('condiment', 'placard', 365, ['moutarde', 'dijon']),
  farine: F('condiment', 'placard', 365, ['farine']),
  levure_chimique: F('condiment', 'placard', 365, ['levure']),
  sel: F('condiment', 'placard', 3650, ['sel']),
  poivre: F('condiment', 'placard', 730, ['poivre']),
  herbes_provence: F('condiment', 'placard', 730, ['herbes de provence', 'thym']),
  cumin: F('condiment', 'placard', 730, ['cumin']),
  paprika: F('condiment', 'placard', 730, ['paprika']),
  curry: F('condiment', 'placard', 730, ['curry']),
  ras_el_hanout: F('condiment', 'placard', 730, ['ras el hanout']),
  laurier: F('condiment', 'placard', 730, ['laurier']),

  // Épicerie sucrée, boissons
  sucre: F('condiment', 'placard', 3650, ['sucre']),
  miel: F('condiment', 'placard', 730, ['miel']),
  compote: F('fruit', 'placard', 180, ['compote', 'gourde', 'pom potes']),
  amandes: F('condiment', 'placard', 180, ['amandes', 'noix', 'noisettes', 'cajou']),
  barre_cereales: F('condiment', 'placard', 180, ['barre cereales', 'barres cereales', 'barre']),
  vin_rouge: F('condiment', 'placard', 730, ['vin rouge', 'vin']),

  // Surgelés
  haricots_verts: F('legume', 'congelateur', 365, ['haricots verts', 'haricot vert', 'har verts'], { cook: true }),
  petits_pois: F('legume', 'congelateur', 365, ['petits pois', 'pt pois', 'petit pois'], { cook: true }),
  epinards: F('legume', 'congelateur', 365, ['epinards', 'epinard', 'epin'], { cook: true }),

  // --- Ajouts catalogue étendu ---
  chou_fleur: LEG(7, ['chou fleur', 'choufleur'], true, true),
  chou: LEG(14, ['chou blanc', 'chou vert', 'chou rouge', 'chou pomme', 'chou'], true, true),
  courge: LEG(30, ['butternut', 'potiron', 'courge', 'potimarron'], true, false),
  navet: LEG(14, ['navet', 'navets'], true, false),
  celeri: LEG(10, ['celeri branche', 'celeri'], true, true),
  fenouil: LEG(7, ['fenouil'], true, true),
  betterave: LEG(7, ['betterave', 'betteraves'], false, true),
  radis: LEG(5, ['radis'], false, true),
  haricots_verts_frais: LEG(4, ['haricots verts frais', 'haricot vert'], true, false),
  gingembre: F('condiment', 'frigo', 21, ['gingembre']),
  basilic: F('condiment', 'frigo', 7, ['basilic']),
  menthe: F('condiment', 'frigo', 5, ['menthe']),
  piment: F('condiment', 'frigo', 14, ['piment']),
  porc_echine: F('viande', 'frigo', 3, ['echine', 'cote de porc', 'cotes de porc', 'porc echine', 'travers']),
  agneau: F('viande', 'frigo', 3, ['agneau', 'gigot', 'epaule agneau', 'souris agneau']),
  boeuf_steak: F('viande', 'frigo', 3, ['bavette', 'rumsteck', 'steak', 'entrecote', 'pave de boeuf']),
  merguez: F('viande', 'frigo', 3, ['merguez']),
  poulet_pilon: F('viande', 'frigo', 3, ['pilon', 'pilons', 'pilons de poulet']),
  chorizo: F('charcuterie', 'frigo', 30, ['chorizo']),
  jambon_cru: F('charcuterie', 'frigo', 14, ['jambon cru', 'jambon sec', 'bayonne', 'serrano']),
  knacks: F('charcuterie', 'frigo', 21, ['knacki', 'knack', 'saucisse de strasbourg', 'saucisses strasbourg', 'saucisse fumee']),
  reblochon: F('fromage', 'frigo', 21, ['reblochon']),
  fromage_raclette: F('fromage', 'frigo', 21, ['raclette']),
  ricotta: F('fromage', 'frigo', 10, ['ricotta']),
  gnocchi: F('feculent', 'frigo', 30, ['gnocchi']),
  pate_feuilletee: F('pain_pate', 'frigo', 14, ['pate feuilletee', 'pte feuilletee']),
  houmous: F('sauce', 'frigo', 10, ['houmous', 'hummus']),
  crevettes: F('poisson', 'frigo', 3, ['crevettes', 'crevette', 'gambas']),
  moules: F('poisson', 'frigo', 2, ['moules', 'moule']),
  merlan: F('poisson', 'frigo', 2, ['merlan', 'lieu noir', 'filet de lieu', 'cabillaud frais']),
  sardines: F('poisson', 'placard', 730, ['sardines', 'sardine']),
  pain_burger: F('pain_pate', 'placard', 7, ['pain burger', 'pains burger', 'buns', 'bun']),
  pain_mie: F('pain_pate', 'placard', 10, ['pain de mie', 'harrys', 'mie']),
  nouilles: F('feculent', 'placard', 365, ['nouilles', 'noodles', 'vermicelles de riz', 'udon', 'ramen']),
  boulgour: F('feculent', 'placard', 365, ['boulgour', 'boulghour']),
  polenta: F('feculent', 'placard', 365, ['polenta']),
  haricots_blancs: F('legumineuse', 'placard', 730, ['haricots blancs', 'lingots', 'flageolets']),
  concentre_tomate: F('sauce', 'placard', 730, ['concentre de tomate', 'double concentre', 'concentre']),
  chapelure: F('condiment', 'placard', 365, ['chapelure']),
  beurre_cacahuete: F('sauce', 'placard', 365, ['beurre de cacahuete', 'pate arachide', 'beurre cacahuete']),
  vin_blanc: F('condiment', 'placard', 730, ['vin blanc']),
  frites_four: F('feculent', 'congelateur', 365, ['frites', 'frites four', 'pommes frites']),
  poelee_legumes: F('legume', 'congelateur', 365, ['poelee', 'poelee de legumes', 'legumes pour wok', 'wok legumes'], { cook: true }),
};

/** Informations d'un ingrédient (valeur prudente si absent de la table). */
export function foodInfo(ingredientId: string): FoodInfo {
  return FOOD_INFO[ingredientId] ?? { family: 'condiment', loc: 'placard', days: 7, kw: [] };
}
