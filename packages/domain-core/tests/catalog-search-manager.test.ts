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

  it('unifies recipes, custom ingredients, and catalog in search results, prioritizing recipes first', async () => {
    const mockRecipes: any[] = [
      {
        kind: 'recipe',
        id: 'rec-apple-pie',
        name: 'Grandma Apple Pie',
        source: 'custom',
        cooked_weight_g: 800,
        calories_100g: 280,
        protein_100g: 4,
        carbs_100g: 45,
        fats_100g: 10
      }
    ];

    const result = await manager.search({
      query: 'apple',
      customIngredients: mockCustomIngredients, // Has 'Homemade Apple Pie'
      customRecipes: mockRecipes,
      limit: 10
    }, mockProvider); // Has 'Apple Red Delicious'

    // Order: 1. Recipe, 2. Custom Ingredient, 3. System Catalog Ingredient
    expect(result.items.length).toBe(3);
    expect(result.items[0].id).toBe('rec-apple-pie');
    expect(result.items[0].kind).toBe('recipe');
    expect(result.items[1].id).toBe('custom-1');
    expect(result.items[1].kind).toBe('ingredient');
    expect(result.items[2].id).toBe('sys-apple');
    expect(result.items[2].kind).toBe('ingredient');

    expect(result.recipeCount).toBe(1);
    expect(result.customCount).toBe(1);
    expect(result.catalogCount).toBe(1);
  });

  it('filters search results strictly by kinds option (e.g. ingredient-only builder search)', async () => {
    const mockRecipes: any[] = [
      {
        kind: 'recipe',
        id: 'rec-mora-dessert',
        name: 'Mora Dessert',
        source: 'custom',
        cooked_weight_g: 300,
        calories_100g: 150,
        protein_100g: 2,
        carbs_100g: 30,
        fats_100g: 2
      }
    ];

    // Only search ingredients (e.g. when building a recipe from pure ingredients)
    const result = await manager.search({
      query: 'mora',
      customIngredients: mockCustomIngredients, // Has 'Fresh Mora Jam'
      customRecipes: mockRecipes,
      kinds: ['ingredient'],
      limit: 10
    }, mockProvider);

    expect(result.items.every(i => i.kind === 'ingredient')).toBe(true);
    expect(result.items.some(i => i.id === 'rec-mora-dessert')).toBe(false);
  });

  it('allows same-name recipe and system ingredient to both appear with distinct kinds', async () => {
    const pizzaRecipe: any = {
      kind: 'recipe',
      id: 'rec-pizza',
      name: 'Pizza Napoletana',
      source: 'custom',
      cooked_weight_g: 400,
      calories_100g: 240,
      protein_100g: 10,
      carbs_100g: 30,
      fats_100g: 8
    };

    const pizzaCatalogProvider: ICatalogProvider = {
      searchIngredients: vi.fn().mockResolvedValue([
        {
          id: 'sys-pizza-off',
          name: 'pizza napoletana',
          source: 'system',
          lang: 'it',
          calories_100g: 220,
          protein_100g: 9,
          carbs_100g: 28,
          fats_100g: 7
        }
      ]),
      getPortionsForIngredient: vi.fn().mockResolvedValue([])
    };

    const result = await manager.search({
      query: 'pizza',
      customIngredients: [],
      customRecipes: [pizzaRecipe],
      limit: 10
    }, pizzaCatalogProvider);

    // Both should appear: the custom recipe and the system catalog item
    expect(result.items.length).toBe(2);
    expect(result.items[0].kind).toBe('recipe');
    expect(result.items[0].id).toBe('rec-pizza');
    expect(result.items[1].kind).toBe('ingredient');
    expect(result.items[1].id).toBe('sys-pizza-off');
  });

  it('resolves AI natural match prioritizing custom recipes before ingredients', async () => {
    const mockRecipes: any[] = [
      {
        kind: 'recipe',
        id: 'rec-special-mora',
        name: 'Fresh Mora Tart',
        source: 'custom',
        cooked_weight_g: 500,
        calories_100g: 200,
        protein_100g: 3,
        carbs_100g: 35,
        fats_100g: 5
      }
    ];

    const match = await manager.resolveAiMatch(
      'fresh mora',
      mockCustomIngredients, // Has 'Fresh Mora Jam'
      mockProvider,
      mockRecipes // Has 'Fresh Mora Tart'
    );

    expect(match).not.toBeNull();
    expect(match?.id).toBe('rec-special-mora');
    expect(match?.kind).toBe('recipe');
  });

  describe('retrieveRagCandidates', () => {
    const mockRecipes: any[] = [
      {
        kind: 'recipe',
        id: 'rec-milanesa-pure',
        name: 'Milanesa con puré de papas',
        source: 'custom',
        calories_100g: 150,
        protein_100g: 9,
        carbs_100g: 16,
        fats_100g: 6
      }
    ];

    const mockIngredients: BaseIngredient[] = [
      {
        id: 'cust-milanesa',
        name: 'Milanesa casera',
        source: 'custom',
        lang: 'es',
        calories_100g: 215,
        protein_100g: 15,
        carbs_100g: 18,
        fats_100g: 10
      }
    ];

    const mockCatalogProvider: ICatalogProvider = {
      searchIngredients: vi.fn().mockImplementation(async (query: string) => {
        const q = query.toLowerCase();
        const catalogDb = [
          {
            id: 'sys-milanesa-carne',
            name: 'Milanesa de carne',
            source: 'system' as const,
            lang: 'es',
            calories_100g: 220,
            protein_100g: 16,
            carbs_100g: 17,
            fats_100g: 11
          },
          {
            id: 'sys-pure-papas',
            name: 'Puré de papas',
            source: 'system' as const,
            lang: 'es',
            calories_100g: 85,
            protein_100g: 2,
            carbs_100g: 15,
            fats_100g: 1.5
          },
          {
            id: 'sys-papa-hervida',
            name: 'Papa hervida',
            source: 'system' as const,
            lang: 'es',
            calories_100g: 77,
            protein_100g: 2,
            carbs_100g: 17,
            fats_100g: 0.1
          }
        ];
        return catalogDb.filter(i => i.name.toLowerCase().includes(q));
      }),
      getPortionsForIngredient: vi.fn().mockResolvedValue([])
    };

    it('extracts candidates by stripping meal verbs, time markers, and quantities', async () => {
      const candidates = await manager.retrieveRagCandidates(
        'cené una milanesa con puré de papas ayer',
        mockIngredients,
        mockCatalogProvider,
        mockRecipes,
        10
      );

      expect(candidates.length).toBeGreaterThan(0);
      const names = candidates.map(c => c.name.toLowerCase());
      expect(names.some(n => n.includes('milanesa'))).toBe(true);
      expect(names.some(n => n.includes('pure') || n.includes('puré'))).toBe(true);
    });

    it('prioritizes custom recipes and ingredients before catalog items and deduplicates by id', async () => {
      const candidates = await manager.retrieveRagCandidates(
        'milanesa',
        mockIngredients,
        mockCatalogProvider,
        mockRecipes,
        10
      );

      // Recipe should be first, custom ingredient second, catalog third
      expect(candidates[0].id).toBe('rec-milanesa-pure');
      expect(candidates[0].kind).toBe('recipe');
      expect(candidates[1].id).toBe('cust-milanesa');
      expect(candidates[1].kind).toBe('ingredient');

      // Deduplication check: unique IDs
      const ids = candidates.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('singularizes plurals to find candidate records (e.g. papas -> papa)', async () => {
      const candidates = await manager.retrieveRagCandidates(
        'dos papas',
        [],
        mockCatalogProvider,
        [],
        5
      );

      expect(candidates.some(c => c.id === 'sys-papa-hervida')).toBe(true);
    });

    it('handles empty or verb-only input gracefully', async () => {
      const emptyResult = await manager.retrieveRagCandidates('', [], mockCatalogProvider, []);
      expect(emptyResult).toEqual([]);

      const verbOnlyResult = await manager.retrieveRagCandidates('cené hoy ayer', [], mockCatalogProvider, []);
      expect(verbOnlyResult).toEqual([]);
    });

    it('respects maxCandidates limit', async () => {
      const candidates = await manager.retrieveRagCandidates(
        'milanesa con pure de papas',
        mockIngredients,
        mockCatalogProvider,
        mockRecipes,
        2
      );
      expect(candidates.length).toBeLessThanOrEqual(2);
    });

    it('Fix 3: round-robin interleaves candidates across multiple query results', async () => {
      // 4 queries: queso, pan, hamburguesa, mora
      // each returns 10 results
      const mockInterleavingProvider: ICatalogProvider = {
        searchIngredients: vi.fn().mockImplementation(async (query: string) => {
          const q = query.toLowerCase();
          return Array.from({ length: 10 }, (_, i) => ({
            id: `sys-${q}-${i}`,
            name: `${q} Item ${i}`,
            source: 'system' as const,
            lang: 'es',
            calories_100g: 100 + i,
            protein_100g: 5,
            carbs_100g: 10,
            fats_100g: 2
          }));
        }),
        getPortionsForIngredient: vi.fn().mockResolvedValue([])
      };

      const candidates = await manager.retrieveRagCandidates(
        'queso, pan, hamburguesa y mora',
        [],
        mockInterleavingProvider,
        [],
        12
      );

      // Verify candidates include items from all 4 food queries in the first round
      const names = candidates.map(c => c.name.toLowerCase());
      expect(names.some(n => n.includes('queso'))).toBe(true);
      expect(names.some(n => n.includes('pan'))).toBe(true);
      expect(names.some(n => n.includes('hamburguesa'))).toBe(true);
      expect(names.some(n => n.includes('mora'))).toBe(true);
    });

    it('Fix 2 (RAG): retries with 5-character prefix stem when token length >= 6 and 0 results', async () => {
      const mockTypoProvider: ICatalogProvider = {
        searchIngredients: vi.fn().mockImplementation(async (query: string) => {
          if (query === 'hamburquesa') return [];
          if (query === 'hambu') {
            return [{
              id: 'sys-burger-1',
              name: 'Hamburguesa casera',
              source: 'system' as const,
              lang: 'es',
              calories_100g: 250,
              protein_100g: 18,
              carbs_100g: 2,
              fats_100g: 15
            }];
          }
          return [];
        }),
        getPortionsForIngredient: vi.fn().mockResolvedValue([])
      };

      const candidates = await manager.retrieveRagCandidates(
        'hamburquesa',
        [],
        mockTypoProvider,
        [],
        10
      );

      expect(candidates.some(c => c.id === 'sys-burger-1')).toBe(true);
    });
  });

  describe('Fix 1 & Fix 2: resolveAiMatch sanitization and typo fallback', () => {
    const mockCatalogItems: BaseIngredient[] = [
      {
        id: 'sys-queso',
        name: 'Queso Pategrás',
        source: 'system',
        lang: 'es',
        calories_100g: 350,
        protein_100g: 25,
        carbs_100g: 2,
        fats_100g: 28
      },
      {
        id: 'sys-hamburguesa',
        name: 'Hamburguesa de carne',
        source: 'system',
        lang: 'es',
        calories_100g: 240,
        protein_100g: 18,
        carbs_100g: 0,
        fats_100g: 16
      },
      {
        id: 'sys-pizza',
        name: 'Pizza de muzzarella',
        source: 'system',
        lang: 'es',
        calories_100g: 270,
        protein_100g: 12,
        carbs_100g: 33,
        fats_100g: 10
      }
    ];

    const mockProvider: ICatalogProvider = {
      searchIngredients: vi.fn().mockImplementation(async (query: string) => {
        const q = query.toLowerCase();
        if (q === 'hamburquesa') return []; // simulate typo returning 0
        if (q === 'hambu' || q.includes('hambur')) {
          return [mockCatalogItems[1]];
        }
        return mockCatalogItems.filter(i => i.name.toLowerCase().includes(q));
      }),
      getPortionsForIngredient: vi.fn().mockResolvedValue([])
    };

    it('Fix 1: strips conversational meal verbs and time phrases', async () => {
      const match = await manager.resolveAiMatch('cené queso', [], mockProvider);
      expect(match).not.toBeNull();
      expect(match?.id).toBe('sys-queso');
    });

    it('Fix 1: strips leading quantities and units (e.g. una hamburguesa)', async () => {
      const match = await manager.resolveAiMatch('una hamburguesa', [], mockProvider);
      expect(match).not.toBeNull();
      expect(match?.id).toBe('sys-hamburguesa');
    });

    it('Fix 1: strips leading quantity + unit + de (e.g. 2 porciones de pizza)', async () => {
      const match = await manager.resolveAiMatch('2 porciones de pizza', [], mockProvider);
      expect(match).not.toBeNull();
      expect(match?.id).toBe('sys-pizza');
    });

    it('Fix 2: resolves typos using 5-character prefix stem fallback (e.g. hamburquesa -> Hamburguesa)', async () => {
      const match = await manager.resolveAiMatch('hamburquesa', [], mockProvider);
      expect(match).not.toBeNull();
      expect(match?.id).toBe('sys-hamburguesa');
    });

    it('Multilingual (EN): strips English meal verbs, time phrases, and quantities in resolveAiMatch and buildRagQueries', async () => {
      const enCatalogItems: BaseIngredient[] = [
        {
          id: 'sys-en-cheese',
          name: 'Cheddar Cheese',
          source: 'system',
          lang: 'en',
          calories_100g: 400,
          protein_100g: 25,
          carbs_100g: 1.3,
          fats_100g: 33
        },
        {
          id: 'sys-en-pizza',
          name: 'Mozzarella Pizza',
          source: 'system',
          lang: 'en',
          calories_100g: 270,
          protein_100g: 12,
          carbs_100g: 33,
          fats_100g: 10
        },
        {
          id: 'sys-en-blackberry',
          name: 'Frozen Blackberry',
          source: 'system',
          lang: 'en',
          calories_100g: 43,
          protein_100g: 1.4,
          carbs_100g: 9.6,
          fats_100g: 0.5
        }
      ];

      const enProvider: ICatalogProvider = {
        searchIngredients: vi.fn().mockImplementation(async (query: string) => {
          const q = query.toLowerCase();
          return enCatalogItems.filter(i => i.name.toLowerCase().includes(q));
        }),
        getPortionsForIngredient: vi.fn().mockResolvedValue([])
      };

      const matchCheese = await manager.resolveAiMatch('I ate cheese for dinner', [], enProvider);
      expect(matchCheese?.id).toBe('sys-en-cheese');

      const matchPizza = await manager.resolveAiMatch('2 slices of pizza', [], enProvider);
      expect(matchPizza?.id).toBe('sys-en-pizza');

      const matchBlackberries = await manager.resolveAiMatch('I had frozen blackberries for lunch', [], enProvider);
      expect(matchBlackberries?.id).toBe('sys-en-blackberry');

      const ragQueries = manager.buildRagQueries('I ate 2 slices of pizza and frozen blackberries for dinner yesterday');
      expect(ragQueries.some(q => q.toLowerCase() === 'pizza')).toBe(true);
      expect(ragQueries.some(q => q.toLowerCase() === 'blackberry')).toBe(true);
      expect(ragQueries.some(q => /^slices?$/i.test(q))).toBe(false);
    });

    it('rejects false-positive prefix match when candidate score is below minimum threshold (e.g. canelones de verdura -> Salvado canela)', async () => {
      const mockFalsePositiveProvider: ICatalogProvider = {
        searchIngredients: vi.fn().mockImplementation(async (query: string) => {
          const q = query.toLowerCase();
          // "canelones de verdura" returns empty, but prefix "canel" returns "Salvado canela"
          if (q.includes('canelones')) return [];
          if (q === 'canel') {
            return [{
              id: 'sys-salvado-canela',
              name: 'Salvado canela',
              source: 'system' as const,
              lang: 'es',
              calories_100g: 220,
              protein_100g: 10,
              carbs_100g: 40,
              fats_100g: 4
            }];
          }
          return [];
        }),
        getPortionsForIngredient: vi.fn().mockResolvedValue([])
      };

      const match = await manager.resolveAiMatch('canelones de verdura', [], mockFalsePositiveProvider);
      // It MUST return null because Salvado canela has no genuine semantic match to canelones de verdura
      expect(match).toBeNull();
    });

    it('rejects candidates when candidate name shares only an incidental 5-char prefix with zero token overlap', async () => {
      const mockIncidentalProvider: ICatalogProvider = {
        searchIngredients: vi.fn().mockImplementation(async (query: string) => {
          if (query === 'manzan') {
            return [{
              id: 'sys-manzanilla',
              name: 'Té de Manzanilla',
              source: 'system' as const,
              lang: 'es',
              calories_100g: 1,
              protein_100g: 0,
              carbs_100g: 0.2,
              fats_100g: 0
            }];
          }
          return [];
        }),
        getPortionsForIngredient: vi.fn().mockResolvedValue([])
      };

      const match = await manager.resolveAiMatch('manzanas asadas con canela', [], mockIncidentalProvider);
      expect(match).toBeNull();
    });
  });
});



