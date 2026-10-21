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
});
