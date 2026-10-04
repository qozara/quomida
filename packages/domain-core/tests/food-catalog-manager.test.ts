import { describe, it, expect } from 'vitest';
import { FoodCatalogManager } from '../src/catalog/FoodCatalogManager.js';

describe('FoodCatalogManager', () => {
  const manager = new FoodCatalogManager();

  it('validates and creates a valid custom ingredient', () => {
    const item = manager.validateAndCreateCustomIngredient({
      name: '  Homemade Bread  ',
      calories_100g: 260,
      protein_100g: 9,
      carbs_100g: 49,
      fats_100g: 3.2,
      lang: 'es'
    });

    expect(item.id).toMatch(/^ing-custom-/);
    expect(item.name).toBe('Homemade Bread');
    expect(item.source).toBe('custom');
    expect(item.lang).toBe('es');
    expect(item.calories_100g).toBe(260);
  });

  it('throws an error if ingredient name is empty', () => {
    expect(() => {
      manager.validateAndCreateCustomIngredient({
        name: '   ',
        calories_100g: 100
      });
    }).toThrow('Food name is required');
  });

  it('throws an error if calories or macros are negative', () => {
    expect(() => {
      manager.validateAndCreateCustomIngredient({
        name: 'Invalid Food',
        calories_100g: -50
      });
    }).toThrow('Nutritional values cannot be negative');
  });

  it('validates and creates a valid custom portion', () => {
    const portion = manager.validateAndCreateCustomPortion({
      base_food_id: 'ing-custom-123',
      name: '  1 slice  ',
      equivalent_weight_g: 30
    });

    expect(portion.id).toMatch(/^port-custom-/);
    expect(portion.base_food_id).toBe('ing-custom-123');
    expect(portion.name).toBe('1 slice');
    expect(portion.equivalent_weight_g).toBe(30);
  });

  it('throws an error if portion weight is zero or negative', () => {
    expect(() => {
      manager.validateAndCreateCustomPortion({
        base_food_id: 'ing-custom-123',
        name: 'Invalid Slice',
        equivalent_weight_g: 0
      });
    }).toThrow('Portion equivalent weight must be greater than zero');
  });
});
