import { describe, it, expect, vi } from 'vitest';
import { PortionManager } from '../src/catalog/PortionManager.js';
import type { ICatalogProvider } from '../src/catalog/CatalogSearchManager.js';
import type { BaseIngredient, Portion } from '../src/types.js';

describe('PortionManager', () => {
  const manager = new PortionManager();

  const mockCustomIngredient: BaseIngredient = {
    id: 'custom-avocado',
    name: 'Custom Avocado',
    source: 'custom',
    lang: 'en',
    calories_100g: 160,
    protein_100g: 2,
    carbs_100g: 9,
    fats_100g: 15
  };

  const mockSystemIngredient: BaseIngredient = {
    id: 'sys-mora',
    name: 'Mora',
    source: 'system',
    lang: 'es',
    calories_100g: 80,
    protein_100g: 1.4,
    carbs_100g: 12,
    fats_100g: 0.5
  };

  const mockCustomPortions: Portion[] = [
    {
      id: 'p-custom-1',
      base_food_id: 'custom-avocado',
      name: '1 medium avocado',
      equivalent_weight_g: 150
    },
    {
      id: 'p-generic-cup',
      base_food_id: 'generic',
      name: '1 cup',
      equivalent_weight_g: 240
    }
  ];

  const mockCatalogPortions: Portion[] = [
    {
      id: 'p-sys-punado',
      base_food_id: 'sys-mora',
      name: '1 puñado (30 g)',
      equivalent_weight_g: 30
    }
  ];

  const mockGenericCatalogPortions: Portion[] = [
    {
      id: 'p-sys-generic-tbsp',
      base_food_id: 'generic',
      name: '1 cucharada (15 g)',
      equivalent_weight_g: 15
    }
  ];

  const mockProvider: ICatalogProvider = {
    searchIngredients: vi.fn(),
    getPortionsForIngredient: vi.fn().mockImplementation(async (foodId: string) => {
      if (foodId === 'sys-mora') return mockCatalogPortions;
      if (foodId === 'generic') return mockGenericCatalogPortions;
      return [];
    })
  };

  it('resolves custom portions and generic portions for a custom food', async () => {
    const portions = await manager.resolvePortions({
      ingredient: mockCustomIngredient,
      customPortions: mockCustomPortions,
      catalogProvider: mockProvider
    });

    expect(portions.length).toBe(2);
    expect(portions[0].name).toBe('1 medium avocado');
    expect(portions[0].tag).toBe('Custom');
    expect(portions[1].name).toBe('1 cup');
    expect(portions[1].tag).toBe('Generic');
  });

  it('resolves standard catalog portions and generic portions for a system food', async () => {
    const portions = await manager.resolvePortions({
      ingredient: mockSystemIngredient,
      customPortions: mockCustomPortions,
      catalogProvider: mockProvider
    });

    expect(portions.length).toBe(2);
    expect(portions[0].name).toBe('1 puñado (30 g)');
    expect(portions[0].tag).toBe('Standard');
    expect(portions[1].name).toBe('1 cup');
    expect(portions[1].tag).toBe('Generic');
  });

  it('falls back to catalog generic portions if custom generic portions are empty', async () => {
    const portions = await manager.resolvePortions({
      ingredient: mockSystemIngredient,
      customPortions: [], // No custom generic portions
      catalogProvider: mockProvider
    });

    expect(portions.length).toBe(2);
    expect(portions[0].name).toBe('1 puñado (30 g)');
    expect(portions[0].tag).toBe('Standard');
    expect(portions[1].name).toBe('1 cucharada (15 g)');
    expect(portions[1].tag).toBe('Generic');
  });
});
