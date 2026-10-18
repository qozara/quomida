import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiMealService } from '../src/AiMealService.js';
import { AiMealError } from '../src/errors.js';
import type { LLMProvider } from '../src/types.js';
import type { BaseIngredient, ICatalogProvider } from '@quomida/domain-core';

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
});
