import { describe, expect, it } from 'vitest';
import { convertSameDimension, formatQty, roundForPurchase, toBase, toIngredientUnit } from '../units';
import { testCatalog } from './fixtures';

describe('conversion d’unités', () => {
  it('convertit vers les unités de base', () => {
    expect(toBase(1.5, 'kg')).toEqual({ qty: 1500, unit: 'g' });
    expect(toBase(25, 'cl')).toEqual({ qty: 250, unit: 'ml' });
    expect(toBase(2, 'cs')).toEqual({ qty: 30, unit: 'ml' });
    expect(toBase(1, 'cc')).toEqual({ qty: 5, unit: 'ml' });
    expect(toBase(0.75, 'l')).toEqual({ qty: 750, unit: 'ml' });
  });

  it('refuse de convertir des dimensions incompatibles sans donnée produit', () => {
    expect(convertSameDimension(1, 'kg', 'g')).toBe(1000);
    expect(convertSameDimension(1, 'kg', 'ml')).toBeNull();
    expect(convertSameDimension(3, 'pc', 'g')).toBeNull();
  });

  it('utilise le poids unitaire et la masse volumique de l’ingrédient', () => {
    const oignon = testCatalog.ingredients.oignon; // unité pc, 100 g/pièce
    expect(toIngredientUnit(250, 'g', oignon)).toBeCloseTo(2.5);
    expect(toIngredientUnit(1, 'pc', oignon)).toBe(1);
    const creme = testCatalog.ingredients.creme; // ml, densité 1
    expect(toIngredientUnit(100, 'g', creme)).toBeCloseTo(100);
    const riz = testCatalog.ingredients.riz; // g, pas de poids unitaire
    expect(toIngredientUnit(2, 'pc', riz)).toBeNull();
  });

  it('formate de façon lisible', () => {
    expect(formatQty(1250, 'g')).toBe('1,25 kg');
    expect(formatQty(350, 'g')).toBe('350 g');
    expect(formatQty(250, 'ml')).toBe('25 cl');
    expect(formatQty(1500, 'ml')).toBe('1,5 l');
    expect(formatQty(2, 'pc', 'œuf')).toBe('2 œufs');
    expect(formatQty(2.1, 'pc', 'œuf')).toBe('≈ 2 œufs');
    expect(formatQty(0.46, 'pc', 'rouleau')).toBe('≈ ½ rouleau');
    expect(formatQty(1.5, 'pc', 'oignon')).toBe('1 ½ oignon');
    expect(formatQty(0.1, 'pc', 'bouquet')).toBe('≈ ¼ bouquet');
    expect(formatQty(2, 'pc', 'poireau')).toBe('2 poireaux');
    expect(formatQty(1.2, 'pc', 'citron', true)).toBe('1,2 citron');
    expect(formatQty(2.5, 'pc', 'citron', true)).toBe('2,5 citrons');
  });

  it('arrondit pour l’achat sans jamais descendre sous le besoin', () => {
    expect(roundForPurchase(2.1, 'pc')).toBe(3);
    expect(roundForPurchase(3, 'pc')).toBe(3);
    expect(roundForPurchase(437.5, 'g')).toBe(440);
    expect(roundForPurchase(1203, 'g')).toBe(1250);
    expect(roundForPurchase(12, 'g')).toBe(15);
  });
});
