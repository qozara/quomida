import { describe, it, expect, vi } from 'vitest';
import { CatalogSearchManager, ICatalogProvider } from '../src/catalog/CatalogSearchManager.js';
import type { BaseIngredient } from '../src/types.js';

describe('CatalogSearchManager', () => {
  const manager = new CatalogSearchManager();

  const mockCustomIngredients: BaseIngredient[] = [
    {
      id: 'custom-1',
      name: 'Homemade Apple Pie',
      source: 'custom',
      lang: 'en',
      calories_100g: 250,
      protein_100g: 3,
      carbs_100g: 35,
      fats_100g: 10
    },
    {
      id: 'custom-2',
      name: 'Fresh Mora Jam',
      source: 'custom',
      lang: 'es',
      calories_100g: 180,
      protein_100g: 1,
      carbs_100g: 45,
      fats_100g: 0.2
    }
  ];

  const mockCatalogIngredients: BaseIngredient[] = [
    {
      id: 'sys-mora',
      name: 'Mora',
      source: 'system',
      lang: 'es',
      calories_100g: 80,
      protein_100g: 1.4,
      carbs_100g: 12,
      fats_100g: 0.5
    },
    {
      id: 'sys-apple',
      name: 'Apple Red Delicious',
      source: 'system',
      lang: 'en',
      calories_100g: 52,
      protein_100g: 0.3,
      carbs_100g: 14,
      fats_100g: 0.2
    }
  ];

  const mockProvider: ICatalogProvider = {
    searchIngredients: vi.fn().mockImplementation(async (query: string) => {
      const q = query.toLowerCase();
      return mockCatalogIngredients.filter(i => i.name.toLowerCase().includes(q));
    }),
    getPortionsForIngredient: vi.fn().mockResolvedValue([])
  };

  it('searches custom ingredients in-memory and prioritizes them over catalog ingredients', async () => {
    const result = await manager.search({
      query: 'mora',
      customIngredients: mockCustomIngredients,
      limit: 10
    }, mockProvider);

    expect(result.items.length).toBe(2);
    expect(result.items[0].id).toBe('custom-2'); // Custom first
    expect(result.items[1].id).toBe('sys-mora'); // Catalog second
    expect(result.customCount).toBe(1);
    expect(result.catalogCount).toBe(1);
  });

  it('deduplicates items if custom and catalog share the same id', async () => {
    const duplicateCatalogProvider: ICatalogProvider = {
      searchIngredients: vi.fn().mockResolvedValue([
        {
          id: 'custom-1', // Duplicate ID
          name: 'Homemade Apple Pie (Catalog version)',
          source: 'system',
          lang: 'en',
          calories_100g: 250,
          protein_100g: 3,
          carbs_100g: 35,
          fats_100g: 10
        }
      ]),
      getPortionsForIngredient: vi.fn().mockResolvedValue([])
    };

    const result = await manager.search({
      query: 'apple',
      customIngredients: mockCustomIngredients,
      limit: 10
    }, duplicateCatalogProvider);

    expect(result.items.length).toBe(1);
    expect(result.items[0].id).toBe('custom-1');
    expect(result.items[0].source).toBe('custom'); // Preserves custom item
  });

  it('works smoothly without a catalogProvider (pure custom search)', async () => {
    const result = await manager.search({
      query: 'apple',
      customIngredients: mockCustomIngredients
    });

    expect(result.items.length).toBe(1);
    expect(result.items[0].name).toBe('Homemade Apple Pie');
    expect(result.catalogCount).toBe(0);
  });

  it('resolves AI natural language query match from custom ingredients first', async () => {
    const match = await manager.resolveAiMatch('homemade apple', mockCustomIngredients, mockProvider);
    expect(match).not.toBeNull();
    expect(match?.id).toBe('custom-1');
  });

  it('resolves AI natural language query match from catalogProvider if not found in custom', async () => {
    const match = await manager.resolveAiMatch('red delicious', mockCustomIngredients, mockProvider);
    expect(match).not.toBeNull();
    expect(match?.id).toBe('sys-apple');
  });

  it('returns null if AI query does not match custom or catalog items', async () => {
    const match = await manager.resolveAiMatch('unknown space fruit', mockCustomIngredients, mockProvider);
    expect(match).toBeNull();
  });

  it('custom ingredients override system ingredients on normalized name collision (PRODUCT_SPEC §2.B)', async () => {
    const customWithApple: BaseIngredient[] = [
      {
        id: 'custom-apple-uuid',
        name: 'Apple',
        source: 'custom',
        lang: 'en',
        calories_100g: 60,
        protein_100g: 0.5,
        carbs_100g: 15,
        fats_100g: 0.3
      }
    ];

    const catalogWithSameApple: ICatalogProvider = {
      searchIngredients: vi.fn().mockResolvedValue([
        {
          id: 'sys-apple-off-12345',
          name: '  apple  ', // Same name, whitespace & lowercase
          source: 'system',
          lang: 'en',
          calories_100g: 52,
          protein_100g: 0.3,
          carbs_100g: 14,
          fats_100g: 0.2
        },
        {
          id: 'sys-apple-juice',
          name: 'Apple Juice',
          source: 'system',
          lang: 'en',
          calories_100g: 45,
          protein_100g: 0.1,
          carbs_100g: 11,
          fats_100g: 0.1
        }
      ]),
      getPortionsForIngredient: vi.fn().mockResolvedValue([])
    };

    const result = await manager.search({
      query: 'apple',
      customIngredients: customWithApple,
      limit: 10
    }, catalogWithSameApple);

    // Should contain 2 items: Custom Apple (overrode System Apple) + System Apple Juice
    expect(result.items.length).toBe(2);
    expect(result.items[0].id).toBe('custom-apple-uuid');
    expect(result.items[0].source).toBe('custom');
    expect(result.items[1].id).toBe('sys-apple-juice');
    // Ensure the system duplicate 'sys-apple-off-12345' was filtered out
    expect(result.items.some(i => i.id === 'sys-apple-off-12345')).toBe(false);
  });

  it('handles accent normalization on name collision (e.g. Café vs cafe)', async () => {
    const customCafe: BaseIngredient[] = [
      {
        id: 'custom-cafe-1',
        name: 'Café',
        source: 'custom',
        lang: 'es',
        calories_100g: 2,
        protein_100g: 0.1,
        carbs_100g: 0,
        fats_100g: 0
      }
    ];

    const catalogCafe: ICatalogProvider = {
      searchIngredients: vi.fn().mockResolvedValue([
        {
          id: 'sys-cafe-off',
          name: 'cafe',
          source: 'system',
          lang: 'es',
          calories_100g: 1,
          protein_100g: 0.1,
          carbs_100g: 0,
          fats_100g: 0
        }
      ]),
      getPortionsForIngredient: vi.fn().mockResolvedValue([])
    };

    const result = await manager.search({
      query: 'cafe',
      customIngredients: customCafe,
      limit: 10
    }, catalogCafe);

    expect(result.items.length).toBe(1);
    expect(result.items[0].id).toBe('custom-cafe-1');
  });
});

