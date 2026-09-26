"""Extrait de la table CIQUAL (ANSES) les valeurs nutritionnelles des ingrédients de Popote.

Source : Anses. 2020. Table de composition nutritionnelle des aliments Ciqual. https://ciqual.anses.fr
Licence Ouverte / Etalab (réutilisation libre avec mention de la source).

Usage : télécharger et dézipper https://ciqual.anses.fr/cms/sites/default/files/inline-files/XML_2020_07_07.zip
puis : python scripts/build-nutrition.py <dossier_ciqual>  → écrit src/data/nutrition.json
"""
import json
import os
import re
import sys

# Ingrédient Popote → code aliment CIQUAL (valeurs pour 100 g de produit tel qu'acheté, cru / sec).
MAPPING = {
    'carotte': 20009, 'oignon': 20034, 'oignon_rouge': 20238, 'echalote': 20097, 'ail': 11000, 'pomme_de_terre': 4008,
    'patate_douce': 4101, 'courgette': 20020, 'aubergine': 20053, 'tomate': 20047, 'tomate_cerise': 20172, 'poivron': 20041,
    'concombre': 20019, 'salade_verte': 20031, 'jeunes_pousses': 20099, 'champignon': 20056, 'poireau': 20039, 'brocoli': 20057,
    'endive': 20026, 'avocat': 13004, 'citron': 13009, 'persil': 11014, 'coriandre': 11094, 'ciboulette': 11003, 'pomme': 13039,
    'banane': 13005, 'clementine': 13024,
    'poulet_filet': 36017, 'poulet_cuisse': 36002, 'dinde_escalope': 36304, 'boeuf_hache': 6250, 'boeuf_mijoter': 6231,
    'porc_filet': 28204, 'saucisse_toulouse': 30110, 'saumon_pave': 26036, 'oeuf': 22000, 'lait': 19041, 'creme_liquide': 19415,
    'creme_epaisse': 19410, 'beurre': 16400, 'emmental_rape': 12118, 'comte': 12110, 'parmesan': 12120, 'feta': 12066,
    'mozzarella': 19590, 'chevre_buche': 12802, 'fromage_frais': 12315, 'fromage_blanc': 19646, 'yaourt_nature': 19593,
    'jambon_blanc': 28900, 'lardons': 28720, 'saumon_fume': 26037, 'pate_brisee': 23410, 'pate_pizza': 37001, 'baguette': 7001,
    'pain_campagne': 7100, 'pates_courtes': 9810, 'spaghetti': 9810, 'lasagnes': 9810, 'riz': 9100, 'semoule': 9610,
    'quinoa': 9340, 'lentilles_vertes': 20585, 'lentilles_corail': 20535, 'pois_chiches': 20532, 'haricots_rouges': 20524,
    'mais': 20066, 'thon': 26039, 'tomates_concassees': 20169, 'passata': 20260, 'lait_coco': 18041, 'sauce_soja': 11104,
    'pesto': 11179, 'mayonnaise': 11054, 'olives': 13032, 'cornichons': 11004, 'tortilla': 7815, 'pain_pita': 7180,
    'bouillon': 11174, 'huile_olive': 17270, 'huile_neutre': 17440, 'vinaigre': 11018, 'moutarde': 11013, 'farine': 9436,
    'levure_chimique': 11046, 'sel': 11017, 'poivre': 11015, 'herbes_provence': 11060, 'cumin': 11042, 'paprika': 11049,
    'curry': 11005, 'ras_el_hanout': 11005, 'laurier': 11053, 'sucre': 31016, 'miel': 31008, 'compote': 13038, 'amandes': 15000,
    'barre_cereales': 31113, 'vin_rouge': 5214, 'haricots_verts': 20070, 'petits_pois': 20084, 'epinards': 20083,
    'poisson_blanc': 26043, 'chou_fleur': 20016, 'chou': 20116, 'courge': 20138, 'navet': 20064, 'celeri': 20023,
    'fenouil': 20028, 'betterave': 20003, 'radis': 20045, 'haricots_verts_frais': 20061, 'gingembre': 11074, 'basilic': 11033,
    'menthe': 11027, 'piment': 20151, 'porc_echine': 28302, 'agneau': 21504, 'boeuf_steak': 6212, 'merguez': 30150,
    'poulet_pilon': 36022, 'chorizo': 30315, 'jambon_cru': 28800, 'knacks': 30742, 'reblochon': 12045, 'fromage_raclette': 12749,
    'ricotta': 19585, 'gnocchi': 26264, 'pate_feuilletee': 23424, 'houmous': 25621, 'crevettes': 10007, 'moules': 10014,
    'merlan': 26095, 'sardines': 26034, 'pain_burger': 7259, 'pain_mie': 7200, 'nouilles': 9863, 'boulgour': 9690,
    'polenta': 9614, 'haricots_blancs': 20511, 'concentre_tomate': 20268, 'chapelure': 7500, 'beurre_cacahuete': 15202,
    'vin_blanc': 5215, 'frites_four': 4044, 'poelee_legumes': 20262,
}
APPROXIMATIONS = {'ras_el_hanout': 'mélange d’épices absent de CIQUAL : valeurs du curry en poudre'}

CONSTS = {'328': 'kcal', '25000': 'proteines', '31000': 'glucides', '40000': 'lipides', '34100': 'fibres', '10004': 'sel'}


def value(raw: str) -> float:
    s = raw.strip().replace(',', '.')
    if s in ('', '-'):
        return 0.0
    if s.lower() == 'traces':
        return 0.0
    if s.startswith('<'):
        return float(s[1:].strip()) / 2  # « < x » : on retient la moitié du seuil
    return float(s)


def main(folder: str) -> None:
    read = lambda name: open(os.path.join(folder, name), encoding='cp1252').read()
    names = dict(re.findall(r'<alim_code>\s*(\d+)\s*</alim_code>\s*<alim_nom_fr>\s*(.*?)\s*</alim_nom_fr>', read('alim_2020_07_07.xml'), re.S))
    wanted = set(str(c) for c in MAPPING.values())
    compo: dict[str, dict[str, float]] = {}
    for alim, const, teneur in re.findall(
        r'<alim_code>\s*(\d+)\s*</alim_code>\s*<const_code>\s*(\d+)\s*</const_code>\s*<teneur>\s*(.*?)\s*</teneur>',
        read('compo_2020_07_07.xml'),
        re.S,
    ):
        if alim in wanted and const in CONSTS:
            compo.setdefault(alim, {})[CONSTS[const]] = round(value(teneur), 2)
    items = {}
    missing = [f'{i} ({c})' for i, c in MAPPING.items() if str(c) not in names or 'kcal' not in compo.get(str(c), {})]
    if missing:
        raise SystemExit('Codes CIQUAL introuvables ou sans énergie : ' + ', '.join(missing))
    for ingredient, code in sorted(MAPPING.items()):
        c = str(code)
        v = {k: compo[c].get(k, 0.0) for k in CONSTS.values()}
        if v['kcal'] == 0 and (v['proteines'] or v['glucides'] or v['lipides']):
            # Énergie non renseignée : calcul réglementaire (UE 1169/2011) à partir des macronutriments.
            v['kcal'] = round(4 * v['proteines'] + 4 * v['glucides'] + 9 * v['lipides'] + 2 * v['fibres'], 1)
        items[ingredient] = {'code': code, 'aliment': names[c], **v}
        if ingredient in APPROXIMATIONS:
            items[ingredient]['note'] = APPROXIMATIONS[ingredient]
    out = {
        'source': 'Anses. 2020. Table de composition nutritionnelle des aliments Ciqual',
        'url': 'https://ciqual.anses.fr',
        'licence': 'Licence Ouverte / Etalab',
        'unite': 'pour 100 g',
        'items': items,
    }
    target = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'data', 'nutrition.json')
    with open(target, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(f'{len(items)} ingrédients écrits dans {os.path.normpath(target)}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
