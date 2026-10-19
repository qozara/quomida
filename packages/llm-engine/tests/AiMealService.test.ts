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
});
