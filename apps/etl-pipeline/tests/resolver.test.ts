import { describe, it, expect } from 'vitest';
import { resolveIngredients } from '../src/resolver.js';
import type { RawIngredientItem } from '../src/types.js';

describe('ETL Ingredient Resolver [ETL-RESOLVER]', () => {
  it('enforces source hierarchy: SYSTEM > ARGENFOODS > SARA2 > TBCA > OPENFOODFACTS', () => {
    const argenItem: RawIngredientItem = {
      id: 'ing-argen-1234567890',
      name: 'Asado vacuno',
      source: 'system',
      lang: 'es-AR',
      calories_100g: 250,
      protein_100g: 18,
      carbs_100g: 0,
      fats_100g: 20,
      originSource: 'ARGENFOODS'
    };

    const saraItem: RawIngredientItem = {
      id: 'ing-sara-0987654321',
      name: 'Asado Vacuno',
      source: 'system',
      lang: 'es-AR',
      calories_100g: 240,
      protein_100g: 19,
      carbs_100g: 0,
      fats_100g: 18,
      originSource: 'SARA2'
    };

    const tbcaItem: RawIngredientItem = {
      id: 'ing-tbca-1122334455',
      name: 'asado vacuno',
      source: 'system',
      lang: 'pt-BR',
      calories_100g: 245,
      protein_100g: 18.5,
      carbs_100g: 0,
      fats_100g: 19,
      originSource: 'TBCA'
    };

    // Feeding in reverse priority order
    const resolved = resolveIngredients([tbcaItem, saraItem, argenItem]);

    expect(resolved.length).toBe(1);
    expect(resolved[0].id).toBe(argenItem.id);
    expect(resolved[0].originSource).toBe('ARGENFOODS');
    expect(resolved[0].calories_100g).toBe(250);
  });

  it('preserves SYSTEM items above ARGENFOODS', () => {
    const systemItem: RawIngredientItem = {
      id: 'ing-apple',
      name: 'Manzana roja',
      source: 'system',
      lang: 'es',
      calories_100g: 52,
      protein_100g: 0.3,
      carbs_100g: 13.8,
      fats_100g: 0.2,
      originSource: 'SYSTEM'
    };

    const argenItem: RawIngredientItem = {
      id: 'ing-argen-manzana',
      name: 'Manzana Roja',
      source: 'system',
      lang: 'es-AR',
      calories_100g: 54,
      protein_100g: 0.4,
      carbs_100g: 14,
      fats_100g: 0.2,
      originSource: 'ARGENFOODS'
    };

    const resolved = resolveIngredients([argenItem, systemItem]);
    expect(resolved.length).toBe(1);
    expect(resolved[0].id).toBe('ing-apple');
    expect(resolved[0].originSource).toBe('SYSTEM');
  });

  it('keeps commercial Open Food Facts products distinct based on barcode/EAN', () => {
    const offProduct1: RawIngredientItem = {
      id: 'ing-off-7791234567890',
      name: 'Dulce de Leche',
      source: 'system',
      lang: 'es-AR',
      calories_100g: 315,
      protein_100g: 7,
      carbs_100g: 55,
      fats_100g: 6.5,
      originSource: 'OPENFOODFACTS',
      barcode: '7791234567890'
    };

    const offProduct2: RawIngredientItem = {
      id: 'ing-off-7799999999999',
      name: 'Dulce de Leche',
      source: 'system',
      lang: 'es-AR',
      calories_100g: 300,
      protein_100g: 6.5,
      carbs_100g: 54,
      fats_100g: 6,
      originSource: 'OPENFOODFACTS',
      barcode: '7799999999999'
    };

    const genericDulceDeLeche: RawIngredientItem = {
      id: 'ing-argen-ddl',
      name: 'Dulce de Leche',
      source: 'system',
      lang: 'es-AR',
      calories_100g: 310,
      protein_100g: 6.8,
      carbs_100g: 54.5,
      fats_100g: 6.2,
      originSource: 'ARGENFOODS'
    };

    const resolved = resolveIngredients([genericDulceDeLeche, offProduct1, offProduct2]);

    // All 3 should be kept: the generic one and the 2 distinct barcodes
    expect(resolved.length).toBe(3);
    const ids = resolved.map(r => r.id);
    expect(ids).toContain('ing-argen-ddl');
    expect(ids).toContain('ing-off-7791234567890');
    expect(ids).toContain('ing-off-7799999999999');
  });

  it('deduplicates duplicate items from the same source by normalized name', () => {
    const item1: RawIngredientItem = {
      id: 'ing-sara-1',
      name: '  Pan   francés  ',
      source: 'system',
      lang: 'es-AR',
      calories_100g: 270,
      protein_100g: 9,
      carbs_100g: 55,
      fats_100g: 1.5,
      originSource: 'SARA2'
    };

    const item2: RawIngredientItem = {
      id: 'ing-sara-2',
      name: 'Pan Frances',
      source: 'system',
      lang: 'es-AR',
      calories_100g: 270,
      protein_100g: 9,
      carbs_100g: 55,
      fats_100g: 1.5,
      originSource: 'SARA2'
    };

    const resolved = resolveIngredients([item1, item2]);
    expect(resolved.length).toBe(1);
    expect(resolved[0].id).toBe('ing-sara-1');
  });
});
