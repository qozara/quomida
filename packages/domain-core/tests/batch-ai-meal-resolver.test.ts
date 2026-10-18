import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectMealTypeFromText,
  normalizeMealType,
  matchPortionUnit,
  BatchAiMealResolver,
  type RawParsedAiItem
} from '../src/catalog/BatchAiMealResolver.js';
import type { BaseIngredient, Portion, RecipeFoodItem } from '../src/types.js';
import type { ICatalogProvider } from '../src/catalog/CatalogSearchManager.js';

describe('BatchAiMealResolver & Portion Matching', () => {
  describe('detectMealTypeFromText', () => {
    it('detects breakfast from keywords in Spanish and English', () => {
      expect(detectMealTypeFromText('Desayuné dos huevos y café')).toBe('meal_breakfast');
      expect(detectMealTypeFromText('For breakfast I had oatmeal')).toBe('meal_breakfast');
    });

    it('detects lunch from keywords in Spanish and English', () => {
      expect(detectMealTypeFromText('Almorcé un bife con ensalada')).toBe('meal_lunch');
      expect(detectMealTypeFromText('Healthy lunch today')).toBe('meal_lunch');
    });

    it('detects snack/merienda from keywords', () => {
      expect(detectMealTypeFromText('Merienda: 1 manzana y yogur')).toBe('meal_snack');
      expect(detectMealTypeFromText('Afternoon snack')).toBe('meal_snack');
      expect(detectMealTypeFromText('Una colación rápida')).toBe('meal_snack');
    });

    it('detects dinner from keywords', () => {
      expect(detectMealTypeFromText('Cené sopa de verduras')).toBe('meal_dinner');
      expect(detectMealTypeFromText('Dinner with family')).toBe('meal_dinner');
    });

    it('falls back to current hour when no keyword is provided', () => {
      expect(detectMealTypeFromText('2 empanadas de carne', 8)).toBe('meal_breakfast');
      expect(detectMealTypeFromText('2 empanadas de carne', 13)).toBe('meal_lunch');
      expect(detectMealTypeFromText('2 empanadas de carne', 18)).toBe('meal_snack');
      expect(detectMealTypeFromText('2 empanadas de carne', 22)).toBe('meal_dinner');
    });
  });

  describe('matchPortionUnit', () => {
    const mockPortions: any[] = [
      { id: 'p1', name: '1 unidad', equivalent_weight_g: 50, tag: 'Standard' },
      { id: 'p2', name: '1 rebanada', equivalent_weight_g: 30, tag: 'Standard' },
      { id: 'p3', name: '1 taza', equivalent_weight_g: 240, tag: 'Standard' },
      { id: 'p4', name: '1 porción mediana', equivalent_weight_g: 150, tag: 'Standard' },
    ];

    it('matches unit/unidad to unit portion', () => {
      expect(matchPortionUnit('unit', mockPortions)).toBe('1 unidad');
      expect(matchPortionUnit('unidad', mockPortions)).toBe('1 unidad');
    });

    it('matches slice/rebanada to slice portion', () => {
      expect(matchPortionUnit('slice', mockPortions)).toBe('1 rebanada');
      expect(matchPortionUnit('rebanada', mockPortions)).toBe('1 rebanada');
    });

    it('matches cup/taza to cup portion', () => {
      expect(matchPortionUnit('cup', mockPortions)).toBe('1 taza');
      expect(matchPortionUnit('taza', mockPortions)).toBe('1 taza');
    });

    it('matches g/grams to g directly', () => {
      expect(matchPortionUnit('g', mockPortions)).toBe('g');
      expect(matchPortionUnit('grams', mockPortions)).toBe('g');
      expect(matchPortionUnit('gramos', mockPortions)).toBe('g');
    });

    it('falls back to first portion or g if not found', () => {
      expect(matchPortionUnit('unknown_unit', mockPortions)).toBe('1 unidad');
      expect(matchPortionUnit('unknown_unit', [])).toBe('g');
    });
  });

  describe('BatchAiMealResolver.resolveBatch', () => {
    const mockCustomIngredients: BaseIngredient[] = [
      {
        id: 'cust-egg',
        name: 'Huevo Revuelto',
        source: 'custom',
        lang: 'es',
        calories_100g: 150,
        protein_100g: 12,
        carbs_100g: 1,
        fats_100g: 11,
      },
    ];

    const mockRecipes: RecipeFoodItem[] = [
      {
        id: 'rec-pancakes',
        name: 'Panqueques de Avena',
        kind: 'recipe',
        source: 'custom',
        calories_100g: 200,
        protein_100g: 10,
        carbs_100g: 30,
        fats_100g: 5,
        raw_weight_g: 300,
        cooked_weight_g: 300,
        yield_factor: 1,
        total_macros: { calories: 600, protein: 30, carbs: 90, fats: 15 },
        recipe: {
          id: 'rec-pancakes',
          name: 'Panqueques de Avena',
          ingredients: [],
        },
      },
    ];

    const mockCatalogIngredients: BaseIngredient[] = [
      {
        id: 'sys-apple',
        name: 'Manzana Roja',
        source: 'system',
        lang: 'es',
        calories_100g: 52,
        protein_100g: 0.3,
        carbs_100g: 14,
        fats_100g: 0.2,
      },
    ];

    const mockCustomPortions: Portion[] = [
      {
        id: 'port-egg-unit',
        base_food_id: 'cust-egg',
        name: '1 huevo (unidad)',
        equivalent_weight_g: 60,
        source: 'custom',
      },
      {
        id: 'port-apple-unit',
        base_food_id: 'sys-apple',
        name: '1 manzana mediana',
        equivalent_weight_g: 150,
        source: 'custom',
      },
    ];

    const mockProvider: ICatalogProvider = {
      searchIngredients: vi.fn().mockImplementation(async (query: string) => {
        const q = query.toLowerCase();
        return mockCatalogIngredients.filter((i) => i.name.toLowerCase().includes(q));
      }),
      getPortionsForIngredient: vi.fn().mockResolvedValue([]),
    };

    let resolver: BatchAiMealResolver;

    beforeEach(() => {
      resolver = new BatchAiMealResolver();
    });

    it('resolves multiple meal items concurrently and computes accurate macro totals', async () => {
      const rawItems: RawParsedAiItem[] = [
        { foodQuery: 'huevo revuelto', quantity: 2, unit: 'unit' },
        { foodQuery: 'panqueques de avena', quantity: 150, unit: 'g' },
        { foodQuery: 'manzana roja', quantity: 1, unit: 'unit' },
      ];

      const result = await resolver.resolveBatch({
        rawInput: 'Desayuné 2 huevos revueltos, 150g de panqueques y una manzana',
        rawItems,
        customIngredients: mockCustomIngredients,
        customRecipes: mockRecipes,
        customPortions: mockCustomPortions,
        catalogProvider: mockProvider,
      });

      expect(result.rawInput).toBe('Desayuné 2 huevos revueltos, 150g de panqueques y una manzana');
      expect(result.detectedMealType).toBe('meal_breakfast');
      expect(result.items).toHaveLength(3);

      // Item 0: Huevo Revuelto (2 * 60g = 120g @ 150 kcal/100g = 180 kcal)
      const eggItem = result.items[0];
      expect(eggItem.unmatched).toBe(false);
      expect(eggItem.food?.name).toBe('Huevo Revuelto');
      expect(eggItem.quantity).toBe(2);
      expect(eggItem.selectedPortionName).toBe('1 huevo (unidad)');
      expect(eggItem.calculatedWeightGrams).toBe(120);
      expect(eggItem.macros.calories).toBe(180);

      // Item 1: Panqueques (150g @ 200 kcal/100g = 300 kcal)
      const pancakeItem = result.items[1];
      expect(pancakeItem.unmatched).toBe(false);
      expect(pancakeItem.food?.name).toBe('Panqueques de Avena');
      expect(pancakeItem.quantity).toBe(150);
      expect(pancakeItem.selectedPortionName).toBe('g');
      expect(pancakeItem.calculatedWeightGrams).toBe(150);
      expect(pancakeItem.macros.calories).toBe(300);

      // Item 2: Manzana Roja (1 * 150g = 150g @ 52 kcal/100g = 78 kcal)
      const appleItem = result.items[2];
      expect(appleItem.unmatched).toBe(false);
      expect(appleItem.food?.name).toBe('Manzana Roja');
      expect(appleItem.quantity).toBe(1);
      expect(appleItem.selectedPortionName).toBe('1 manzana mediana');
      expect(appleItem.calculatedWeightGrams).toBe(150);
      expect(appleItem.macros.calories).toBe(78);

      // Total Cumulative Macros (180 + 300 + 78 = 558 kcal)
      expect(result.totalMacros.calories).toBe(558);
      expect(result.totalMacros.protein).toBeCloseTo(14.4 + 15 + 0.5, 1);
    });

    it('marks unmatched items gracefully without failing the entire batch', async () => {
      const rawItems: RawParsedAiItem[] = [
        { foodQuery: 'huevo revuelto', quantity: 1, unit: 'unit' },
        { foodQuery: 'alien space food xyz', quantity: 200, unit: 'g' },
      ];

      const result = await resolver.resolveBatch({
        rawInput: 'Cena rara',
        rawItems,
        customIngredients: mockCustomIngredients,
        customRecipes: mockRecipes,
        customPortions: mockCustomPortions,
        catalogProvider: mockProvider,
      });

      expect(result.detectedMealType).toBe('meal_dinner');
      expect(result.items).toHaveLength(2);

      expect(result.items[0].unmatched).toBe(false);
      expect(result.items[0].macros.calories).toBeGreaterThan(0);

      expect(result.items[1].unmatched).toBe(true);
      expect(result.items[1].food).toBeNull();
      expect(result.items[1].rawQuery).toBe('alien space food xyz');
      expect(result.items[1].macros.calories).toBe(0);

      // Total calories only accounts for matched items
      expect(result.totalMacros.calories).toBe(result.items[0].macros.calories);
    });

    it('resolves "desayuné dos empanadas" to breakfast, unit portions and 200g weight', async () => {
      const empanadaProvider: ICatalogProvider = {
        searchIngredients: vi.fn().mockImplementation(async (q: string) => {
          return [
            {
              id: 'ing-tapa-empanada',
              name: 'Tapa Empanada',
              source: 'system',
              lang: 'es',
              calories_100g: 300,
              protein_100g: 7,
              carbs_100g: 43,
              fats_100g: 11,
              contentHash: 'h1',
            },
            {
              id: 'ing-empanadas-pollo',
              name: 'Empanadas De Pollo',
              source: 'system',
              lang: 'es',
              calories_100g: 192,
              protein_100g: 9.9,
              carbs_100g: 20.2,
              fats_100g: 8.0,
              contentHash: 'h2',
            },
          ];
        }),
        getPortionsForIngredient: vi.fn().mockResolvedValue([]),
      };

      const result = await resolver.resolveBatch({
        rawInput: 'desayuné dos empanadas',
        rawItems: [{ foodQuery: 'empanada', quantity: 2, unit: 'unit' }],
        customIngredients: [],
        catalogProvider: empanadaProvider,
      });

      // Meal type detected as breakfast
      expect(result.detectedMealType).toBe('meal_breakfast');
      expect(result.items).toHaveLength(1);

      const item = result.items[0];
      // Intelligently ranked Empanadas De Pollo above Tapa Empanada
      expect(item.food?.name).toBe('Empanadas De Pollo');
      expect(item.quantity).toBe(2);
      expect(item.selectedPortionName).toBe('1 unidad');
      expect(item.calculatedWeightGrams).toBe(200); // 2 * 100g
      expect(item.macros.calories).toBe(384); // 200g * 1.92
      expect(item.macros.protein).toBeCloseTo(19.8, 1);
    });

    it('resolves "comí dos hamburguesas de carne en la cena" to dinner, unit portions and 200g weight', async () => {
      const burgerProvider: ICatalogProvider = {
        searchIngredients: vi.fn().mockImplementation(async (q: string) => {
          if (q.includes('carne') && q.includes('hamburguesa')) {
            return [
              {
                id: 'ing-hamburguesa',
                name: 'Hamburguesa',
                source: 'system',
                lang: 'es',
                calories_100g: 191,
                protein_100g: 14.5,
                carbs_100g: 0.4,
                fats_100g: 14.6,
                contentHash: 'h-burg-1',
              },
              {
                id: 'ing-hamburguesa-vacuna',
                name: 'Hamburguesas vacunas',
                source: 'system',
                lang: 'es',
                calories_100g: 226,
                protein_100g: 16.0,
                carbs_100g: 1.0,
                fats_100g: 17.0,
                contentHash: 'h-burg-2',
              },
            ];
          }
          if (q.includes('hamburguesa')) {
            return [
              {
                id: 'ing-hamburguesa',
                name: 'Hamburguesa',
                source: 'system',
                lang: 'es',
                calories_100g: 191,
                protein_100g: 14.5,
                carbs_100g: 0.4,
                fats_100g: 14.6,
                contentHash: 'h-burg-1',
              },
            ];
          }
          return [];
        }),
        getPortionsForIngredient: vi.fn().mockResolvedValue([]),
      };

      const result = await resolver.resolveBatch({
        rawInput: 'comí dos hamburguesas de carne en la cena',
        rawItems: [{ foodQuery: 'hamburguesa de carne', quantity: 2, unit: 'unit' }],
        customIngredients: [],
        catalogProvider: burgerProvider,
      });

      // Meal type detected as dinner from "en la cena"
      expect(result.detectedMealType).toBe('meal_dinner');
      expect(result.items).toHaveLength(1);

      const item = result.items[0];
      expect(item.food?.name).toBe('Hamburguesa');
      expect(item.quantity).toBe(2);
      expect(item.selectedPortionName).toBe('1 unidad');
      expect(item.calculatedWeightGrams).toBe(200); // 2 * 100g
      expect(item.macros.calories).toBe(382); // 200g * 1.91
      expect(item.macros.protein).toBeCloseTo(29.0, 1);
    });

    it('normalizes meal types from explicit string or detects from verbs', () => {
      expect(normalizeMealType('breakfast')).toBe('meal_breakfast');
      expect(normalizeMealType('desayuno')).toBe('meal_breakfast');
      expect(normalizeMealType('lunch')).toBe('meal_lunch');
      expect(normalizeMealType('dinner')).toBe('meal_dinner');
      expect(normalizeMealType('snack')).toBe('meal_snack');

      expect(detectMealTypeFromText('desayuné dos empanadas')).toBe('meal_breakfast');
      expect(detectMealTypeFromText('merendé un café con tostadas')).toBe('meal_snack');
    });
  });
});
