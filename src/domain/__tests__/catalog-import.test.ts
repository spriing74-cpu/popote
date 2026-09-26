import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../data/catalog';
import { defaultState } from '../../data/defaults';
import { reducer } from '../../state/reducer';
import { importStoreCatalog, isStoreCatalogCsv, parseSize, productName, splitCsvLine } from '../priceImport';

// Échantillon fictif au format d'un export de catalogue magasin.
const CSV = [
  '﻿category,brand,name,size,price,available,url',
  'Produits laitiers,MARQUE A,Lait demi-écrémé UHT,6x1L,6.00,True,https://ex/1',
  'Produits laitiers,MARQUE B,Lait demi-écrémé bio,1l,1.50,True,https://ex/2',
  'Produits laitiers,MARQUE C,Lait demi-écrémé,50cl,0.60,False,https://ex/3',
  'Hygiène,MARQUE D,Lait de toilette amande,200ml,4.00,True,https://ex/4',
  'Produits laitiers,MARQUE E,Camembert au lait pasteurisé,250g,2.50,True,https://ex/5',
  'Epicerie salée,MARQUE F,Thon sauce catalane,2x135g,3.00,True,https://ex/6',
  'Epicerie salée,MARQUE F,Thon entier nature,140g,2.10,True,https://ex/7',
  'Produits laitiers,SOLIDAIRES BIO,CULTIVONS LE BON Oeufs de poules élevées en plein air,6 pièces,2.40,True,https://ex/8',
  'Epicerie salée,MARQUE G,"Pâtes coquillettes, cuisson rapide",1kg,1.80,True,https://ex/9',
  'Tout pour bébé,BLEDINA,Mes moulinés pommes de terre dès 8 mois,2x200g,2.00,True,https://ex/10',
].join('\n');

describe('import de catalogue magasin', () => {
  it('outils de lecture', () => {
    expect(isStoreCatalogCsv(CSV)).toBe(true);
    expect(isStoreCatalogCsv('produit;prix\nLait;1')).toBe(false);
    expect(splitCsvLine('a,"b, c",d')).toEqual(['a', 'b, c', 'd']);
    expect(parseSize('6x1L')).toEqual({ qty: 6, unit: 'l' });
    expect(parseSize('4 x 115 g')).toEqual({ qty: 460, unit: 'g' });
    expect(parseSize('2.5kg')).toEqual({ qty: 2.5, unit: 'kg' });
    expect(parseSize('6 pièces')).toEqual({ qty: 6, unit: 'pc' });
    expect(parseSize('')).toBeNull();
    expect(productName('CULTIVONS LE BON Oeufs de poules')).toBe('Oeufs de poules');
  });

  it('rattache les bons produits, écarte non-alimentaire et plats préparés, prend le prix médian', () => {
    const r = importStoreCatalog(CSV, CATALOG, {}, 'auchan', '2026-09-26');
    const by = Object.fromEntries(r.summary.map((s) => [s.ingredientId, s]));
    // Lait : 1,00 €/l, 1,50 €/l, 1,20 €/l → médiane 1,20 €/l ; ni le lait de toilette ni le camembert.
    expect(by.lait).toMatchObject({ products: 3, price: 1.2, perQty: 1, perUnit: 'l' });
    // Thon : seul le thon nature (la sauce catalane est un plat préparé) → 15 €/kg
    expect(by.thon).toMatchObject({ products: 1, price: 15, perUnit: 'kg' });
    expect(by.oeuf).toMatchObject({ price: 0.4, perUnit: 'pc' });
    expect(by.pates_courtes).toMatchObject({ price: 1.8, perUnit: 'kg' });
    expect(by.pomme_de_terre).toBeUndefined(); // rayon bébé exclu
    expect(Object.keys(by).sort()).toEqual(['lait', 'oeuf', 'pates_courtes', 'thon']);
    expect(r.entries.every((e) => e.store === 'auchan' && e.source === 'import' && e.id.startsWith('cat-auchan-'))).toBe(true);
  });

  it('un nouvel import du même magasin remplace le précédent sans toucher au reste', () => {
    const reduce = reducer(CATALOG);
    let s = defaultState();
    s = reduce(s, { type: 'addPrice', entry: { id: 'ticket1', ingredientId: 'lait', store: 'auchan', price: 1.1, perQty: 1, perUnit: 'l', date: '2026-09-20', source: 'ticket' } });
    const first = importStoreCatalog(CSV, CATALOG, {}, 'auchan', '2026-09-26');
    s = reduce(s, { type: 'replaceCatalogPrices', store: 'auchan', entries: first.entries });
    s = reduce(s, { type: 'replaceCatalogPrices', store: 'auchan', entries: first.entries.slice(0, 1) });
    expect(s.prices.filter((p) => p.id.startsWith('cat-auchan-'))).toHaveLength(1);
    expect(s.prices.some((p) => p.id === 'ticket1')).toBe(true);
  });
});
