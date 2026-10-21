import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiMealService } from '../src/AiMealService.js';
import { AiMealError } from '../src/errors.js';
import type { LLMProvider } from '../src/types.js';
import type { BaseIngredient, ICatalogProvider, Recipe } from '@quomida/domain-core';

describe('AiMealService - Headless Natural Language Meal Orchestrator', () => {
  const mockEgg: BaseIngredient = {
    id: 'egg-1',
    name: 'Huevo frito',
    source: 'system',
    lang: 'es',
    calories_100g: 196,
    protein_100g: 13.6,
    carbs_100g: 0.8,
    fats_100g: 15.3,
  };

  const mockToast: BaseIngredient = {
    id: 'toast-1',
    name: 'Tostada de pan blanco',
    source: 'system',
    lang: 'es',
    calories_100g: 265,
    protein_100g: 9,
    carbs_100g: 49,
    fats_100g: 3.2,
  };

  const mockCatalogProvider: ICatalogProvider = {
    searchIngredients: vi.fn().mockImplementation(async (query: string) => {
      const q = query.toLowerCase();
      if (q.includes('huevo')) return [mockEgg];
      if (q.includes('tostada') || q.includes('pan')) return [mockToast];
      return [];
    }),
    getPortionsForIngredient: vi.fn().mockResolvedValue([]),
  };

  it('parses natural language and returns structured items with meal type', async () => {
    const mockProvider: LLMProvider = {
      parse: vi.fn().mockResolvedValue({
        rawInput: 'Desayuné dos huevos fritos y una tostada',
        items: [
          { foodQuery: 'huevo frito', quantity: 2, unit: 'unit' },
          { foodQuery: 'tostada', quantity: 1, unit: 'unit' },
        ],
        detectedMealType: 'breakfast',
      }),
    };

    const service = new AiMealService({ provider: mockProvider });
    const result = await service.parseNaturalLanguage('Desayuné dos huevos fritos y una tostada');

    expect(result.items).toHaveLength(2);
    expect(result.detectedMealType).toBe('breakfast');
    expect(result.items[0].foodQuery).toBe('huevo frito');
  });

  it('throws NO_ITEMS_PARSED when LLM returns an empty item list', async () => {
    const mockProvider: LLMProvider = {
      parse: vi.fn().mockResolvedValue({
        rawInput: 'Hola que tal',
        items: [],
      }),
    };

    const service = new AiMealService({ provider: mockProvider });

    await expect(service.parseNaturalLanguage('Hola que tal')).rejects.toThrowError(
      expect.objectContaining({
        code: 'NO_ITEMS_PARSED',
      })
    );
  });

  it('classifies RATE_LIMIT_EXCEEDED error properly', async () => {
    const mockProvider: LLMProvider = {
      parse: vi.fn().mockRejectedValue(new Error('AI Provider returned error: RATE_LIMIT_EXCEEDED')),
    };

    const service = new AiMealService({ provider: mockProvider });

    try {
      await service.parseNaturalLanguage('desayuné dos empanadas');
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AiMealError);
      expect((err as AiMealError).code).toBe('RATE_LIMIT_EXCEEDED');
    }
  });

  it('classifies AI_DISABLED error properly', async () => {
    const mockProvider: LLMProvider = {
      parse: vi.fn().mockRejectedValue(new Error('AI is disabled')),
    };

    const service = new AiMealService({ provider: mockProvider });

    try {
      await service.parseNaturalLanguage('desayuné dos empanadas');
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AiMealError);
      expect((err as AiMealError).code).toBe('AI_DISABLED');
    }
  });

  it('classifies NETWORK_ERROR properly', async () => {
    const mockProvider: LLMProvider = {
      parse: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    };

    const service = new AiMealService({ provider: mockProvider });

    try {
      await service.parseNaturalLanguage('desayuné dos empanadas');
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AiMealError);
      expect((err as AiMealError).code).toBe('NETWORK_ERROR');
    }
  });

  it('executes end-to-end processMeal: parses, matches catalog, and calculates portions and macros', async () => {
    const mockProvider: LLMProvider = {
      parse: vi.fn().mockResolvedValue({
        rawInput: 'Desayuné dos huevos fritos y una tostada',
        items: [
          { foodQuery: 'huevo frito', quantity: 2, unit: 'unit' },
          { foodQuery: 'tostada', quantity: 1, unit: 'unit' },
        ],
        detectedMealType: 'breakfast',
      }),
    };

    const service = new AiMealService({ provider: mockProvider });

    const resolved = await service.processMeal({
      input: 'Desayuné dos huevos fritos y una tostada',
      catalogProvider: mockCatalogProvider,
    });

    expect(resolved.detectedMealType).toBe('meal_breakfast');
    expect(resolved.items).toHaveLength(2);

    const eggItem = resolved.items[0];
    expect(eggItem.food?.name).toBe('Huevo frito');
    expect(eggItem.quantity).toBe(2);
    expect(eggItem.calculatedWeightGrams).toBe(200); // 2 * 100g unit
    expect(eggItem.macros.calories).toBe(392); // 200g * 1.96

    const toastItem = resolved.items[1];
    expect(toastItem.food?.name).toBe('Tostada de pan blanco');
    expect(toastItem.quantity).toBe(1);
    expect(toastItem.calculatedWeightGrams).toBe(100);
    expect(toastItem.macros.calories).toBe(265);

    // Check cumulative total macros
    expect(resolved.totalMacros.calories).toBe(657); // 392 + 265
  });

  it('passes context to provider.parse when provided in parseNaturalLanguage', async () => {
    const mockProvider: LLMProvider = {
      parse: vi.fn().mockResolvedValue({
        rawInput: 'dos huevos fritos',
        items: [{ foodQuery: 'huevo frito', quantity: 2, unit: 'unit' }],
      }),
    };

    const service = new AiMealService({ provider: mockProvider });
    const context = {
      candidates: [
        {
          id: 'egg-1',
          name: 'Huevo frito',
          kind: 'ingredient' as const,
          calories_100g: 196,
          protein_100g: 13.6,
          carbs_100g: 0.8,
          fats_100g: 15.3,
        }
      ]
    };

    await service.parseNaturalLanguage('dos huevos fritos', context);
    expect(mockProvider.parse).toHaveBeenCalledWith('dos huevos fritos', context);
  });

  it('retrieves RAG candidates and grounds LLM parsing during processMeal', async () => {
    const mockProvider: LLMProvider = {
      parse: vi.fn().mockResolvedValue({
        rawInput: 'dos huevos fritos',
        items: [
          { foodQuery: 'huevo frito', quantity: 2, unit: 'unit', candidateId: 'egg-1' }
        ],
        detectedMealType: 'breakfast',
      }),
    };

    const mockSearchManager = {
      retrieveRagCandidates: vi.fn().mockResolvedValue([
        {
          id: 'egg-1',
          name: 'Huevo frito',
          kind: 'ingredient',
          calories_100g: 196,
          protein_100g: 13.6,
          carbs_100g: 0.8,
          fats_100g: 15.3,
        }
      ]),
      search: vi.fn().mockResolvedValue({ items: [mockEgg], recipeCount: 0, customCount: 0, catalogCount: 1 }),
      findSingleFoodMatch: vi.fn().mockResolvedValue(mockEgg),
    };

    const mockBatchResolver = {
      resolveBatch: vi.fn().mockResolvedValue({
        rawInput: 'dos huevos fritos',
        detectedMealType: 'meal_breakfast',
        items: [],
        totalMacros: { calories: 392, protein: 27.2, carbs: 1.6, fats: 30.6 },
      }),
    };

    const service = new AiMealService({
      provider: mockProvider,
      searchManager: mockSearchManager as any,
      batchResolver: mockBatchResolver as any,
    });

    await service.processMeal({
      input: 'dos huevos fritos',
      catalogProvider: mockCatalogProvider,
    });

    expect(mockSearchManager.retrieveRagCandidates).toHaveBeenCalledWith(
      'dos huevos fritos',
      [],
      mockCatalogProvider,
      []
    );
    expect(mockProvider.parse).toHaveBeenCalledWith('dos huevos fritos', {
      candidates: [
        expect.objectContaining({ id: 'egg-1', name: 'Huevo frito' }),
      ],
    });
    expect(mockBatchResolver.resolveBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        rawInput: 'dos huevos fritos',
        rawItems: expect.arrayContaining([
          expect.objectContaining({ foodQuery: 'huevo frito', candidateId: 'egg-1' })
        ]),
      })
    );
  });

  it('handles candidate retrieval errors gracefully and falls back to ungrounded parse', async () => {
    const mockProvider: LLMProvider = {
      parse: vi.fn().mockResolvedValue({
        rawInput: 'una manzana',
        items: [{ foodQuery: 'manzana', quantity: 1, unit: 'unit' }],
      }),
    };

    const mockSearchManager = {
      retrieveRagCandidates: vi.fn().mockRejectedValue(new Error('Search catalog down')),
      findSingleFoodMatch: vi.fn().mockResolvedValue(null),
    };

    const mockBatchResolver = {
      resolveBatch: vi.fn().mockResolvedValue({
        rawInput: 'una manzana',
        detectedMealType: 'meal_snack',
        items: [],
        totalMacros: { calories: 52, protein: 0.3, carbs: 14, fats: 0.2 },
      }),
    };

    const service = new AiMealService({
      provider: mockProvider,
      searchManager: mockSearchManager as any,
      batchResolver: mockBatchResolver as any,
    });

    const resolved = await service.processMeal({ input: 'una manzana' });
    expect(resolved).toBeDefined();
    expect(mockProvider.parse).toHaveBeenCalledWith('una manzana', undefined);
  });

  it('forwards compositeDishName and existingRecipes to batchResolver.resolveBatch', async () => {
    const mockProvider: LLMProvider = {
      parse: vi.fn().mockResolvedValue({
        rawInput: 'milanesa con puré de papas',
        compositeDishName: 'Milanesa con puré de papas',
        items: [
          { foodQuery: 'milanesa', quantity: 1, unit: 'unit' },
          { foodQuery: 'puré de papas', quantity: 1, unit: 'portion' },
        ],
      }),
    };

    const mockBatchResolver = {
      resolveBatch: vi.fn().mockResolvedValue({
        rawInput: 'milanesa con puré de papas',
        detectedMealType: 'meal_dinner',
        compositeDishName: 'Milanesa con puré de papas',
        items: [],
        totalMacros: { calories: 600, protein: 35, carbs: 50, fats: 25 },
      }),
    };

    const existingRecipes: Recipe[] = [
      {
        id: 'recipe-milanesa-pure',
        name: 'Milanesa con puré',
        yield_factor: 1,
        ingredients: [],
      }
    ];

    const service = new AiMealService({
      provider: mockProvider,
      batchResolver: mockBatchResolver as any,
    });

    await service.processMeal({
      input: 'milanesa con puré de papas',
      existingRecipes,
    });

    expect(mockBatchResolver.resolveBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        compositeDishName: 'Milanesa con puré de papas',
        existingRecipes,
      })
    );
  });

  describe('Comprehensive End-to-End Scenarios (Issues 1-4)', () => {
    const mockDbIngredients: BaseIngredient[] = [
      {
        id: 'ing-pure',
        name: 'Puré de papas',
        source: 'system',
        lang: 'es',
        calories_100g: 85,
        protein_100g: 2,
        carbs_100g: 15,
        fats_100g: 1.5,
      },
      {
        id: 'ing-burger',
        name: 'Hamburguesa',
        source: 'system',
        lang: 'es',
        calories_100g: 240,
        protein_100g: 18,
        carbs_100g: 0,
        fats_100g: 16,
      },
      {
        id: 'ing-mora',
        name: 'Mora congelada',
        source: 'system',
        lang: 'es',
        calories_100g: 45,
        protein_100g: 1,
        carbs_100g: 10,
        fats_100g: 0.5,
      },
      {
        id: 'ing-queso',
        name: 'Queso',
        source: 'system',
        lang: 'es',
        calories_100g: 350,
        protein_100g: 25,
        carbs_100g: 2,
        fats_100g: 28,
      },
      {
        id: 'ing-pan',
        name: 'Pan',
        source: 'system',
        lang: 'es',
        calories_100g: 260,
        protein_100g: 9,
        carbs_100g: 50,
        fats_100g: 3,
      },
      {
        id: 'ing-pizza',
        name: 'Pizza',
        source: 'system',
        lang: 'es',
        calories_100g: 270,
        protein_100g: 12,
        carbs_100g: 33,
        fats_100g: 10,
      },
      {
        id: 'ing-caracolitos',
        name: 'Caracolitos sabor asado',
        source: 'system',
        lang: 'es',
        calories_100g: 350,
        protein_100g: 11,
        carbs_100g: 72,
        fats_100g: 2,
      },
    ];

    const scenarioCatalogProvider: ICatalogProvider = {
      searchIngredients: vi.fn().mockImplementation(async (query: string) => {
        const q = query.toLowerCase();
        if (q === 'hamburquesa') return []; // simulate typo returning 0
        if (q === 'hambu' || q.includes('hambur')) {
          return [mockDbIngredients.find(i => i.id === 'ing-burger')!];
        }
        return mockDbIngredients.filter(i => i.name.toLowerCase().includes(q));
      }),
      getPortionsForIngredient: vi.fn().mockImplementation(async (baseFoodId: string) => {
        if (baseFoodId === 'ing-pizza') {
          return [
            {
              id: 'p-pizza-porcion',
              base_food_id: 'ing-pizza',
              name: '1 porción',
              equivalent_weight_g: 120,
              source: 'system',
              tag: 'Standard',
            }
          ];
        }
        return [];
      }),
    };

    it('Scenario 1: "comi un puré de papas con una hamburguesa" -> 2 items, defaultLoggingMode: recipe, synthesizedRecipe defined', async () => {
      const mockProvider: LLMProvider = {
        parse: vi.fn().mockResolvedValue({
          rawInput: 'comi un puré de papas con una hamburguesa',
          items: [
            { foodQuery: 'puré de papas', quantity: 1, unit: 'portion' },
            { foodQuery: 'hamburguesa', quantity: 1, unit: 'unit' },
          ],
          compositeDishName: 'Puré de papas con hamburguesa',
          isCompositeDish: true,
        }),
      };

      const service = new AiMealService({ provider: mockProvider });
      const result = await service.processMeal({
        input: 'comi un puré de papas con una hamburguesa',
        catalogProvider: scenarioCatalogProvider,
      });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].food?.id).toBe('ing-pure');
      expect(result.items[1].food?.id).toBe('ing-burger');
      expect(result.isMultiMeal).toBe(false);
      expect(result.defaultLoggingMode).toBe('recipe');
      expect(result.synthesizedRecipe).toBeDefined();
    });

    it('Scenario 2: "almorcé mora congelada y cené queso" -> 2 items with distinct mealTypes, isMultiMeal: true, defaultLoggingMode: batch, synthesizedRecipe: undefined', async () => {
      const mockProvider: LLMProvider = {
        parse: vi.fn().mockResolvedValue({
          rawInput: 'almorcé mora congelada y cené queso',
          items: [
            { foodQuery: 'mora congelada', quantity: 1, unit: 'unit', mealType: 'lunch' },
            { foodQuery: 'queso', quantity: 1, unit: 'unit', mealType: 'dinner' },
          ],
          isCompositeDish: false,
        }),
      };

      const service = new AiMealService({ provider: mockProvider });
      const result = await service.processMeal({
        input: 'almorcé mora congelada y cené queso',
        catalogProvider: scenarioCatalogProvider,
      });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].food?.id).toBe('ing-mora');
      expect(result.items[0].mealType).toBe('meal_lunch');
      expect(result.items[1].food?.id).toBe('ing-queso');
      expect(result.items[1].mealType).toBe('meal_dinner');
      expect(result.isMultiMeal).toBe(true);
      expect(result.defaultLoggingMode).toBe('batch');
      expect(result.synthesizedRecipe).toBeUndefined();
    });

    it('Scenario 3: "comí queso, pan, hamburquesa y mora congelada en la cena" -> 4 items with typo tolerance, all dinner, defaultLoggingMode: batch', async () => {
      const mockProvider: LLMProvider = {
        parse: vi.fn().mockResolvedValue({
          rawInput: 'comí queso, pan, hamburquesa y mora congelada en la cena',
          items: [
            { foodQuery: 'queso', quantity: 1, unit: 'unit', mealType: 'dinner' },
            { foodQuery: 'pan', quantity: 1, unit: 'unit', mealType: 'dinner' },
            { foodQuery: 'hamburquesa', quantity: 1, unit: 'unit', mealType: 'dinner' }, // Typo!
            { foodQuery: 'mora congelada', quantity: 1, unit: 'unit', mealType: 'dinner' },
          ],
          detectedMealType: 'dinner',
          isCompositeDish: false,
        }),
      };

      const service = new AiMealService({ provider: mockProvider });
      const result = await service.processMeal({
        input: 'comí queso, pan, hamburquesa y mora congelada en la cena',
        catalogProvider: scenarioCatalogProvider,
      });

      expect(result.items).toHaveLength(4);
      expect(result.items[0].food?.id).toBe('ing-queso');
      expect(result.items[1].food?.id).toBe('ing-pan');
      // Hamburger matched through prefix stem fallback for typo "hamburquesa"
      expect(result.items[2].food?.id).toBe('ing-burger');
      expect(result.items[3].food?.id).toBe('ing-mora');
      for (const item of result.items) {
        expect(item.mealType).toBe('meal_dinner');
      }
      expect(result.isMultiMeal).toBe(false);
      expect(result.defaultLoggingMode).toBe('batch');
    });

    it('Scenario 4: "caracolitos sabor asado y 2 porciones de pizza" -> 2 items with quantities and portion matching, defaultLoggingMode: batch', async () => {
      const mockProvider: LLMProvider = {
        parse: vi.fn().mockResolvedValue({
          rawInput: 'caracolitos sabor asado y 2 porciones de pizza',
          items: [
            { foodQuery: 'caracolitos sabor asado', quantity: 1, unit: 'unit' },
            { foodQuery: 'pizza', quantity: 2, unit: 'portion' },
          ],
          isCompositeDish: false,
        }),
      };

      const service = new AiMealService({ provider: mockProvider });
      const result = await service.processMeal({
        input: 'caracolitos sabor asado y 2 porciones de pizza',
        catalogProvider: scenarioCatalogProvider,
      });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].food?.id).toBe('ing-caracolitos');
      expect(result.items[0].quantity).toBe(1);

      expect(result.items[1].food?.id).toBe('ing-pizza');
      expect(result.items[1].quantity).toBe(2);
      expect(result.items[1].selectedPortionName).toBe('1 porción');
      expect(result.items[1].calculatedWeightGrams).toBe(240); // 2 * 120g
      expect(result.isMultiMeal).toBe(false);
      expect(result.defaultLoggingMode).toBe('batch');
    });
  });

  describe('Hybrid Offline Parsing & JIT Culinary Recipe Decomposition', () => {
    const mockBeef: BaseIngredient = {
      id: 'ing-carne',
      name: 'Carne vacuna',
      source: 'system',
      lang: 'es',
      calories_100g: 250,
      protein_100g: 26,
      carbs_100g: 0,
      fats_100g: 17,
    };

    const mockCorn: BaseIngredient = {
      id: 'ing-maiz',
      name: 'Maíz blanco',
      source: 'system',
      lang: 'es',
      calories_100g: 110,
      protein_100g: 3,
      carbs_100g: 22,
      fats_100g: 1.5,
    };

    const mockSquash: BaseIngredient = {
      id: 'ing-zapallo',
      name: 'Zapallo',
      source: 'system',
      lang: 'es',
      calories_100g: 30,
      protein_100g: 1,
      carbs_100g: 7,
      fats_100g: 0.2,
    };

    const mockCatalogProvider: ICatalogProvider = {
      searchIngredients: vi.fn().mockImplementation(async (query: string) => {
        const q = query.toLowerCase();
        if (q.includes('carne') || q.includes('beef')) return [mockBeef];
        if (q.includes('maiz') || q.includes('maíz') || q.includes('corn')) return [mockCorn];
        if (q.includes('zapallo') || q.includes('pumpkin')) return [mockSquash];
        return [];
      }),
      getPortionsForIngredient: vi.fn().mockResolvedValue([]),
    };

    it('Scenario A: Standard single query parses locally with zero LLM calls', async () => {
      const service = new AiMealService(); // No LLM provider configured!
      const result = await service.processMeal({
        input: '100g de carne vacuna',
        catalogProvider: mockCatalogProvider,
        locale: 'es',
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].food?.id).toBe('ing-carne');
      expect(result.items[0].quantity).toBe(100);
      expect(result.items[0].unmatched).toBe(false);
      expect(result.totalMacros.calories).toBeGreaterThan(0);
    });

    it('Scenario B: Multi-food query synthesizes composite recipe 100% locally with AI disabled', async () => {
      const service = new AiMealService();
      const result = await service.processMeal({
        input: 'carne vacuna con zapallo para cenar',
        catalogProvider: mockCatalogProvider,
        locale: 'es',
        aiEnabled: false, // AI disabled in settings!
      });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].food?.id).toBe('ing-carne');
      expect(result.items[1].food?.id).toBe('ing-zapallo');
      expect(result.detectedMealType).toBe('meal_dinner');
      expect(result.defaultLoggingMode).toBe('recipe');
      expect(result.synthesizedRecipe).toBeDefined();
    });

    it('Scenario C: Unknown dish triggers JIT LlmRecipeDecomposer to synthesize virtual recipe', async () => {
      const mockDecomposer = {
        decomposeDish: vi.fn().mockResolvedValue({
          dishName: 'Locro criollo',
          rationale: 'Traditional stew',
          estimatedTotalWeightGrams: 350,
          ingredients: [
            { food_name: 'maíz blanco', quantity: 100, unit: 'g' },
            { food_name: 'carne vacuna', quantity: 150, unit: 'g' },
            { food_name: 'zapallo', quantity: 100, unit: 'g' },
          ],
        }),
      };

      const service = new AiMealService({ decomposer: mockDecomposer as any });
      const result = await service.processMeal({
        input: 'cené 1 plato de locro',
        catalogProvider: mockCatalogProvider,
        locale: 'es',
        aiEnabled: true,
      });

      expect(mockDecomposer.decomposeDish).toHaveBeenCalledWith('locro', '1 plato', 'es');
      expect(result.isAiDecomposed).toBe(true);
      expect(result.sourceDishName).toBe('locro');
      expect(result.compositeDishName).toBe('Locro criollo');
      expect(result.defaultLoggingMode).toBe('recipe');
      expect(result.synthesizedRecipe).toBeDefined();
      expect(result.items).toHaveLength(3);
      expect(result.items.every(it => it.isAiDecomposed)).toBe(true);
      expect(result.totalMacros.calories).toBeGreaterThan(0);
    });

    it('Scenario D: Unknown dish gracefully returns unmatched when AI is disabled or offline', async () => {
      const mockDecomposer = {
        decomposeDish: vi.fn(),
      };

      const service = new AiMealService({ decomposer: mockDecomposer as any });
      const result = await service.processMeal({
        input: 'cené 1 plato de locro',
        catalogProvider: mockCatalogProvider,
        locale: 'es',
        aiEnabled: false, // AI is disabled!
      });

      expect(mockDecomposer.decomposeDish).not.toHaveBeenCalled();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].unmatched).toBe(true);
      expect(result.items[0].rawQuery).toBe('locro');
      expect(result.isAiDecomposed).toBeUndefined();
    });
  });
});
