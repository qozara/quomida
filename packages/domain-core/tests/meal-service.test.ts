import { describe, it, expect, vi } from 'vitest';
import { MealService } from '../src/services/MealService.js';
import type { BaseIngredient, IRecipeDecomposer } from '../src/index.js';

describe('MealService (domain-core)', () => {
  const mockEgg: BaseIngredient = {
    id: 'cust-egg',
    name: 'Huevo Revuelto',
    source: 'custom',
    lang: 'es',
    calories_100g: 150,
    protein_100g: 12,
    carbs_100g: 1,
    fats_100g: 11
  };

  const mockToast: BaseIngredient = {
    id: 'cust-toast',
    name: 'Tostada',
    source: 'custom',
    lang: 'es',
    calories_100g: 260,
    protein_100g: 9,
    carbs_100g: 49,
    fats_100g: 3
  };

  it('parses and resolves a single food item deterministically without AI', async () => {
    const service = new MealService();
    const result = await service.processMeal({
      input: 'desayuné 2 huevos revueltos',
      customIngredients: [mockEgg],
      locale: 'es'
    });

    expect(result.detectedMealType).toBe('meal_breakfast');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].unmatched).toBe(false);
    expect(result.items[0].food?.id).toBe('cust-egg');
    expect(result.items[0].quantity).toBe(2);
    expect(result.isAiDecomposed).toBeFalsy();
  });

  it('parses multiple foods and synthesizes a composite recipe proposal without AI', async () => {
    const service = new MealService();
    const result = await service.processMeal({
      input: '2 huevos revueltos con una tostada',
      customIngredients: [mockEgg, mockToast],
      locale: 'es'
    });

    expect(result.items).toHaveLength(2);
    expect(result.synthesizedRecipe).toBeDefined();
    expect(result.synthesizedRecipe?.recipe.name).toBe('Huevo Revuelto con Tostada');
    expect(result.defaultLoggingMode).toBe('recipe');
    expect(result.isAiDecomposed).toBeFalsy();
  });

  it('escalates uncataloged items to injected IRecipeDecomposer when AI is enabled', async () => {
    const mockDecomposer: IRecipeDecomposer = {
      decomposeDish: vi.fn().mockResolvedValue({
        dishName: 'Locro Criollo',
        ingredients: [
          { food_name: 'Huevo Revuelto', quantity: 100, unit: 'g' },
          { food_name: 'Tostada', quantity: 50, unit: 'g' }
        ]
      })
    };

    const service = new MealService({ decomposer: mockDecomposer });
    const result = await service.processMeal({
      input: 'cené 1 plato de locro',
      customIngredients: [mockEgg, mockToast],
      locale: 'es',
      aiEnabled: true
    });

    expect(mockDecomposer.decomposeDish).toHaveBeenCalledWith('locro', '1 plato', 'es');
    expect(result.isAiDecomposed).toBe(true);
    expect(result.compositeDishName).toBe('Locro Criollo');
    expect(result.items).toHaveLength(2);
    expect(result.items.every(it => it.isAiDecomposed)).toBe(true);
  });

  it('keeps unmatched item and does not call decomposer when aiEnabled is false', async () => {
    const mockDecomposer: IRecipeDecomposer = {
      decomposeDish: vi.fn()
    };

    const service = new MealService({ decomposer: mockDecomposer });
    const result = await service.processMeal({
      input: 'cené 1 plato de locro',
      customIngredients: [mockEgg, mockToast],
      locale: 'es',
      aiEnabled: false
    });

    expect(mockDecomposer.decomposeDish).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].unmatched).toBe(true);
    expect(result.isAiDecomposed).toBeFalsy();
  });

  it('rejects low-confidence prefix false-positives and escalates to decomposer (e.g. canelones de verdura vs Salvado canela)', async () => {
    const mockDecomposer: IRecipeDecomposer = {
      decomposeDish: vi.fn().mockResolvedValue({
        dishName: 'Canelones de Verdura',
        ingredients: [
          { food_name: 'Huevo Revuelto', quantity: 100, unit: 'g' },
          { food_name: 'Tostada', quantity: 50, unit: 'g' }
        ]
      })
    };

    const mockCatalogWithPrefixHit = {
      searchIngredients: vi.fn().mockImplementation(async (query: string) => {
        const q = query.toLowerCase();
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

    const service = new MealService({ decomposer: mockDecomposer });
    const result = await service.processMeal({
      input: 'canelones de verdura',
      customIngredients: [mockEgg, mockToast],
      catalogProvider: mockCatalogWithPrefixHit,
      locale: 'es',
      aiEnabled: true
    });

    expect(mockDecomposer.decomposeDish).toHaveBeenCalledWith('canelones de verdura', '1 unit', 'es');
    expect(result.isAiDecomposed).toBe(true);
    expect(result.compositeDishName).toBe('Canelones de Verdura');
    expect(result.items).toHaveLength(2);
  });

  it('infers a single uncataloged base ingredient (e.g. "rúcula") with AI macros and portions without treating it as a recipe', async () => {
    const sorrentinosRucula: BaseIngredient = {
      id: 'ing-off-2513873000018',
      name: 'Sorrentinos Jamon Crudo Y Rucula - Coto',
      source: 'system',
      lang: 'es-AR',
      calories_100g: 243,
      protein_100g: 14,
      carbs_100g: 30,
      fats_100g: 7.2
    };

    const catalogProvider = {
      searchIngredients: vi.fn().mockImplementation(async (query: string) => {
        const q = query.toLowerCase();
        if (!q.includes('ú') && q.includes('rucul')) {
          return [sorrentinosRucula];
        }
        return [];
      }),
      getPortionsForIngredient: vi.fn().mockResolvedValue([])
    };

    const mockDecomposer: IRecipeDecomposer = {
      decomposeDish: vi.fn().mockResolvedValue({
        dishName: 'Rúcula',
        kind: 'ingredient',
        ingredients: [
          {
            food_name: 'Rúcula',
            quantity: 100,
            unit: 'g',
            calories_100g: 25,
            protein_100g: 2.6,
            carbs_100g: 3.7,
            fats_100g: 0.7,
            portions: [
              { name: '1 taza', equivalent_weight_g: 20 },
              { name: '1 porción', equivalent_weight_g: 50 }
            ]
          }
        ]
      })
    };

    const service = new MealService({ decomposer: mockDecomposer });
    const result = await service.processMeal({
      input: 'rúcula',
      customIngredients: [],
      catalogProvider,
      locale: 'es',
      aiEnabled: true
    });

    expect(mockDecomposer.decomposeDish).toHaveBeenCalledWith('rúcula', '1 unit', 'es');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].unmatched).toBe(false);
    expect(result.items[0].food?.kind).toBe('ingredient');
    expect(result.items[0].food?.source).toBe('ai');
    expect(result.items[0].food?.name).toBe('Rúcula');
    expect(result.items[0].food?.calories_100g).toBe(25);
    expect(result.items[0].food?.protein_100g).toBe(2.6);
    expect(result.items[0].food?.carbs_100g).toBe(3.7);
    expect(result.items[0].food?.fats_100g).toBe(0.7);
    expect((result.items[0].food as any)?.portions).toEqual([
      { name: '1 taza', equivalent_weight_g: 20 },
      { name: '1 porción', equivalent_weight_g: 50 }
    ]);
    expect(result.compositeDishName).toBeUndefined();
    expect(result.synthesizedRecipe).toBeUndefined();
    expect(result.defaultLoggingMode).toBe('batch');
  });

  it('uses LLM fallback per-100g macros for uncataloged sub-ingredients inside a composite recipe', async () => {
    const mockDecomposer: IRecipeDecomposer = {
      decomposeDish: vi.fn().mockResolvedValue({
        dishName: 'Ensalada de Rúcula y Huevo',
        kind: 'recipe',
        ingredients: [
          {
            food_name: 'Rúcula',
            quantity: 50,
            unit: 'g',
            calories_100g: 25,
            protein_100g: 2.6,
            carbs_100g: 3.7,
            fats_100g: 0.7
          },
          {
            food_name: 'Huevo Revuelto',
            quantity: 100,
            unit: 'g',
            calories_100g: 150,
            protein_100g: 12,
            carbs_100g: 1,
            fats_100g: 11
          }
        ]
      })
    };

    const service = new MealService({ decomposer: mockDecomposer });
    const result = await service.processMeal({
      input: 'tarta de rucula',
      customIngredients: [mockEgg],
      locale: 'es',
      aiEnabled: true
    });

    expect(result.isAiDecomposed).toBe(true);
    expect(result.compositeDishName).toBe('Ensalada de Rúcula y Huevo');
    expect(result.synthesizedRecipe).toBeDefined();
    expect(result.items).toHaveLength(2);
    expect(result.items[0].unmatched).toBe(false);
    expect(result.items[0].food?.name).toBe('Rúcula');
    expect(result.items[0].food?.source).toBe('ai');
    expect(result.items[0].calculatedWeightGrams).toBe(50);
    expect(result.items[0].macros.calories).toBe(12.5);
    expect(result.items[1].food?.id).toBe('cust-egg');
  });

  it('escalates single-item query to AI when forceAiEscalation is true even if a local match exists, and falls back to local match if AI returns null', async () => {
    const mockDecomposer: IRecipeDecomposer = {
      decomposeDish: vi
        .fn()
        .mockResolvedValueOnce({
          dishName: 'Hamburguesa Completa',
          kind: 'recipe',
          ingredients: [
            { food_name: 'Huevo Revuelto', quantity: 50, unit: 'g' },
            { food_name: 'Tostada', quantity: 60, unit: 'g' }
          ]
        })
        .mockResolvedValueOnce(null)
    };

    const service = new MealService({ decomposer: mockDecomposer });

    // 1. Even though 'huevo revuelto' matches mockEgg locally, forceAiEscalation invokes decomposer
    const escalated = await service.processMeal({
      input: 'huevo revuelto',
      customIngredients: [mockEgg, mockToast],
      locale: 'es',
      aiEnabled: true,
      forceAiEscalation: true
    });

    expect(mockDecomposer.decomposeDish).toHaveBeenCalledTimes(1);
    expect(escalated.isAiDecomposed).toBe(true);
    expect(escalated.compositeDishName).toBe('Hamburguesa Completa');
    expect(escalated.items).toHaveLength(2);

    // 2. When decomposer returns null, preserves the original local match
    const fallback = await service.processMeal({
      input: 'huevo revuelto',
      customIngredients: [mockEgg, mockToast],
      locale: 'es',
      aiEnabled: true,
      forceAiEscalation: true
    });

    expect(mockDecomposer.decomposeDish).toHaveBeenCalledTimes(2);
    expect(fallback.items).toHaveLength(1);
    expect(fallback.items[0].unmatched).toBe(false);
    expect(fallback.items[0].food?.id).toBe('cust-egg');
  });
});
