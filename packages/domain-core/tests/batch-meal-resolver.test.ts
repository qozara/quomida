import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectMealTypeFromText,
  normalizeMealType,
  matchPortionUnit,
  BatchMealResolver,
  type RawParsedMealItem
} from '../src/catalog/BatchMealResolver.js';
import type { BaseIngredient, Portion, RecipeFoodItem } from '../src/types.js';
import type { ICatalogProvider } from '../src/catalog/CatalogSearchManager.js';

describe('BatchMealResolver & Portion Matching', () => {
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

  describe('BatchMealResolver.resolveBatch', () => {
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

    let resolver: BatchMealResolver;

    beforeEach(() => {
      resolver = new BatchMealResolver();
    });

    it('resolves multiple meal items concurrently and computes accurate macro totals', async () => {
      const rawItems: RawParsedMealItem[] = [
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
      const rawItems: RawParsedMealItem[] = [
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

    it('resolves "cené una milanesa con puré de papas." into dinner, Milanesa and pure de papas', async () => {
      const catalogMock: ICatalogProvider = {
        searchIngredients: vi.fn().mockImplementation(async (q: string) => {
          const norm = q.toLowerCase();
          if (norm.includes('milanesa')) {
            return [
              {
                id: 'ing-off-7798372240096',
                name: 'Milanesa',
                source: 'system',
                lang: 'es',
                calories_100g: 215,
                protein_100g: 15,
                carbs_100g: 18,
                fats_100g: 10,
                contentHash: 'hash-milanesa'
              }
            ];
          }
          if (norm.includes('pure') || norm.includes('puré') || norm.includes('papa')) {
            return [
              {
                id: 'ing-off-7730306001779',
                name: 'pure de papas',
                source: 'system',
                lang: 'es',
                calories_100g: 85,
                protein_100g: 2,
                carbs_100g: 15,
                fats_100g: 1.5,
                contentHash: 'hash-pure'
              }
            ];
          }
          return [];
        }),
        getPortionsForIngredient: vi.fn().mockResolvedValue([]),
      };

      const result = await resolver.resolveBatch({
        rawInput: 'cené una milanesa con puré de papas.',
        rawItems: [
          { foodQuery: 'milanesa', quantity: 1, unit: 'unit' },
          { foodQuery: 'puré de papas', quantity: 1, unit: 'portion' }
        ],
        customIngredients: [],
        catalogProvider: catalogMock,
      });

      expect(result.detectedMealType).toBe('meal_dinner');
      expect(result.items).toHaveLength(2);

      const milanesa = result.items[0];
      expect(milanesa.food?.name).toBe('Milanesa');
      expect(milanesa.quantity).toBe(1);
      expect(milanesa.selectedPortionName).toBe('1 unidad');
      expect(milanesa.calculatedWeightGrams).toBe(100);

      const pure = result.items[1];
      expect(pure.food?.name).toBe('pure de papas');
      expect(pure.quantity).toBe(1);
      expect(pure.selectedPortionName).toBe('1 porción');
      expect(pure.calculatedWeightGrams).toBe(150);
    });

    it('normalizes meal types from explicit string or detects from verbs', () => {
      expect(normalizeMealType('breakfast')).toBe('meal_breakfast');
      expect(normalizeMealType('desayuno')).toBe('meal_breakfast');
      expect(normalizeMealType('lunch')).toBe('meal_lunch');
      expect(normalizeMealType('dinner')).toBe('meal_dinner');
      expect(normalizeMealType('snack')).toBe('meal_snack');

      expect(detectMealTypeFromText('desayuné dos empanadas')).toBe('meal_breakfast');
      expect(detectMealTypeFromText('merendé un café con tostadas')).toBe('meal_snack');
      expect(detectMealTypeFromText('cené una milanesa con puré de papas.')).toBe('meal_dinner');
    });

    describe('Candidate ID Grounding & Auto-Recipe Synthesis (ADR 0022)', () => {
      const mockMilanesaIng: BaseIngredient = {
        id: 'ing-milanesa-123',
        name: 'Milanesa de Ternera',
        source: 'system',
        lang: 'es',
        calories_100g: 220,
        protein_100g: 18,
        carbs_100g: 15,
        fats_100g: 10
      };

      const mockPureIng: BaseIngredient = {
        id: 'ing-pure-456',
        name: 'Puré de Papas Casero',
        source: 'system',
        lang: 'es',
        calories_100g: 90,
        protein_100g: 2,
        carbs_100g: 16,
        fats_100g: 2
      };

      const groundedCatalogProvider: ICatalogProvider = {
        searchIngredients: vi.fn().mockImplementation(async (query: string) => {
          const q = query.toLowerCase();
          const list = [mockMilanesaIng, mockPureIng];
          return list.filter(i => i.name.toLowerCase().includes(q) || i.id === query);
        }),
        getPortionsForIngredient: vi.fn().mockResolvedValue([])
      };

      it('resolves items directly using candidateId when matched in custom ingredients', async () => {
        const rawItems: RawParsedMealItem[] = [
          {
            foodQuery: 'huevo revuelto',
            quantity: 1,
            unit: 'unit',
            candidateId: 'cust-egg' // Matches mockCustomIngredients
          }
        ];

        const result = await resolver.resolveBatch({
          rawInput: 'Desayuno',
          rawItems,
          customIngredients: mockCustomIngredients,
          customRecipes: mockRecipes
        });

        expect(result.items[0].food?.id).toBe('cust-egg');
        expect(result.items[0].unmatched).toBe(false);
      });

      it('resolves items directly using candidateId when matched via catalog provider search', async () => {
        const rawItems: RawParsedMealItem[] = [
          {
            foodQuery: 'milanesa',
            quantity: 1,
            unit: 'unit',
            candidateId: 'ing-milanesa-123'
          }
        ];

        const result = await resolver.resolveBatch({
          rawInput: 'Almuerzo',
          rawItems,
          customIngredients: [],
          catalogProvider: groundedCatalogProvider
        });

        expect(result.items[0].food?.id).toBe('ing-milanesa-123');
        expect(result.items[0].food?.name).toBe('Milanesa de Ternera');
      });

      it('synthesizes a new Recipe when >= 2 items are resolved with automatic joined name', async () => {
        const rawItems: RawParsedMealItem[] = [
          { foodQuery: 'Milanesa de Ternera', quantity: 1, unit: 'unit', candidateId: 'ing-milanesa-123' },
          { foodQuery: 'Puré de Papas Casero', quantity: 1, unit: 'portion', candidateId: 'ing-pure-456' }
        ];

        const result = await resolver.resolveBatch({
          rawInput: 'milanesa con puré',
          rawItems,
          customIngredients: [mockMilanesaIng, mockPureIng]
        });

        expect(result.synthesizedRecipe).toBeDefined();
        expect(result.synthesizedRecipe?.isExistingDuplicate).toBe(false);
        expect(result.synthesizedRecipe?.recipe.name).toBe('Milanesa de Ternera con Puré de Papas Casero');
        expect(result.synthesizedRecipe?.recipe.ingredients).toHaveLength(2);
        expect(result.synthesizedRecipe?.foodItem.kind).toBe('recipe');
        expect(result.synthesizedRecipe?.foodItem.calories_100g).toBeGreaterThan(0);
      });

      it('uses explicit compositeDishName when provided for synthesized recipe', async () => {
        const rawItems: RawParsedMealItem[] = [
          { foodQuery: 'Milanesa de Ternera', quantity: 1, unit: 'unit', candidateId: 'ing-milanesa-123' },
          { foodQuery: 'Puré de Papas Casero', quantity: 1, unit: 'portion', candidateId: 'ing-pure-456' }
        ];

        const result = await resolver.resolveBatch({
          rawInput: 'milanesa con puré',
          rawItems,
          customIngredients: [mockMilanesaIng, mockPureIng],
          compositeDishName: 'milanesa con puré clásica'
        });

        expect(result.synthesizedRecipe).toBeDefined();
        expect(result.synthesizedRecipe?.recipe.name).toBe('Milanesa con puré clásica');
      });

      it('detects existing duplicate recipe and marks isExistingDuplicate: true', async () => {
        const rawItems: RawParsedMealItem[] = [
          { foodQuery: 'Milanesa de Ternera', quantity: 1, unit: 'unit', candidateId: 'ing-milanesa-123' },
          { foodQuery: 'Puré de Papas Casero', quantity: 1, unit: 'portion', candidateId: 'ing-pure-456' }
        ];

        // Existing recipe with exact same tokens: "Milanesa de ternera con puré de papas casero"
        const existingRecipe: any = {
          id: 'rec-milanesa-existing',
          name: 'Milanesa de ternera con puré de papas casero',
          ingredients: [
            {
              food_id: 'ing-milanesa-123',
              name: 'Milanesa de Ternera',
              weight_g: 100,
              calories_100g: 220,
              protein_100g: 18,
              carbs_100g: 15,
              fats_100g: 10
            },
            {
              food_id: 'ing-pure-456',
              name: 'Puré de Papas Casero',
              weight_g: 150,
              calories_100g: 90,
              protein_100g: 2,
              carbs_100g: 16,
              fats_100g: 2
            }
          ],
          yield_factor: 1.0
        };

        const result = await resolver.resolveBatch({
          rawInput: 'milanesa con puré',
          rawItems,
          customIngredients: [mockMilanesaIng, mockPureIng],
          existingRecipes: [existingRecipe]
        });

        expect(result.synthesizedRecipe).toBeDefined();
        expect(result.synthesizedRecipe?.isExistingDuplicate).toBe(true);
        expect(result.synthesizedRecipe?.recipe.id).toBe('rec-milanesa-existing');
      });

      it('does NOT synthesize a recipe when only 1 item is resolved', async () => {
        const rawItems: RawParsedMealItem[] = [
          { foodQuery: 'Milanesa de Ternera', quantity: 1, unit: 'unit', candidateId: 'ing-milanesa-123' }
        ];

        const result = await resolver.resolveBatch({
          rawInput: 'solo milanesa',
          rawItems,
          customIngredients: [mockMilanesaIng]
        });

        expect(result.synthesizedRecipe).toBeUndefined();
      });

      it('recalculates item quantity and updates synthesized recipe', async () => {
        const rawItems: RawParsedMealItem[] = [
          { foodQuery: 'Milanesa de Ternera', quantity: 1, unit: 'unit', candidateId: 'ing-milanesa-123' },
          { foodQuery: 'Puré de Papas Casero', quantity: 1, unit: 'portion', candidateId: 'ing-pure-456' }
        ];

        const initial = await resolver.resolveBatch({
          rawInput: 'milanesa con puré',
          rawItems,
          customIngredients: [mockMilanesaIng, mockPureIng]
        });

        const updated = resolver.recalculateItem(
          initial,
          initial.items[0].id,
          { quantity: 2, portionName: '1 unidad' }
        );

        expect(updated.items[0].quantity).toBe(2);
        expect(updated.items[0].calculatedWeightGrams).toBe(200);
        expect(updated.items[0].macros.calories).toBe(440);
        expect(updated.synthesizedRecipe?.recipe.ingredients[0].weight_g).toBe(200);
      });

      it('swaps item food and recomputes synthesized recipe', async () => {
        const rawItems: RawParsedMealItem[] = [
          { foodQuery: 'Milanesa de Ternera', quantity: 1, unit: 'unit', candidateId: 'ing-milanesa-123' },
          { foodQuery: 'Puré de Papas Casero', quantity: 1, unit: 'portion', candidateId: 'ing-pure-456' }
        ];

        const initial = await resolver.resolveBatch({
          rawInput: 'milanesa con puré',
          rawItems,
          customIngredients: [mockMilanesaIng, mockPureIng]
        });

        const newFood: BaseIngredient = {
          id: 'ing-arroz-999',
          name: 'Arroz Blanco',
          source: 'system',
          lang: 'es',
          calories_100g: 130,
          protein_100g: 2.5,
          carbs_100g: 28,
          fats_100g: 0.3
        };

        const updated = resolver.swapItemFood(
          initial,
          initial.items[1].id,
          newFood,
          [{ id: 'p-arroz', base_food_id: newFood.id, name: '1 porción', equivalent_weight_g: 150, tag: 'Standard' }]
        );

        expect(updated.items[1].food?.id).toBe('ing-arroz-999');
        expect(updated.items[1].food?.name).toBe('Arroz Blanco');
        expect(updated.synthesizedRecipe?.recipe.ingredients[1].food_id).toBe('ing-arroz-999');
        expect(updated.synthesizedRecipe?.recipe.name).toBe('Milanesa de Ternera con Arroz Blanco');
      });
    });

    describe('Multi-Meal, Composite Dish & Default Logging Mode', () => {
      const mockPureIng: BaseIngredient = {
        id: 'ing-pure-1',
        name: 'Puré de papas',
        source: 'system',
        lang: 'es',
        calories_100g: 85,
        protein_100g: 2,
        carbs_100g: 15,
        fats_100g: 1.5
      };

      const mockBurgerIng: BaseIngredient = {
        id: 'ing-burger-1',
        name: 'Hamburguesa',
        source: 'system',
        lang: 'es',
        calories_100g: 240,
        protein_100g: 18,
        carbs_100g: 0,
        fats_100g: 16
      };

      const mockMoraIng: BaseIngredient = {
        id: 'ing-mora-1',
        name: 'Mora congelada',
        source: 'system',
        lang: 'es',
        calories_100g: 45,
        protein_100g: 1,
        carbs_100g: 10,
        fats_100g: 0.5
      };

      const mockQuesoIng: BaseIngredient = {
        id: 'ing-queso-1',
        name: 'Queso',
        source: 'system',
        lang: 'es',
        calories_100g: 350,
        protein_100g: 25,
        carbs_100g: 2,
        fats_100g: 28
      };

      const mockPanIng: BaseIngredient = {
        id: 'ing-pan-1',
        name: 'Pan',
        source: 'system',
        lang: 'es',
        calories_100g: 260,
        protein_100g: 9,
        carbs_100g: 50,
        fats_100g: 3
      };

      const mockPizzaIng: BaseIngredient = {
        id: 'ing-pizza-1',
        name: 'Pizza',
        source: 'system',
        lang: 'es',
        calories_100g: 270,
        protein_100g: 12,
        carbs_100g: 33,
        fats_100g: 10
      };

      const mockCaracolitosIng: BaseIngredient = {
        id: 'ing-pasta-1',
        name: 'Caracolitos sabor asado',
        source: 'system',
        lang: 'es',
        calories_100g: 350,
        protein_100g: 11,
        carbs_100g: 72,
        fats_100g: 2
      };

      it('Issue 1: defaults to recipe mode when input describes composite dish with "con" and no list separators', async () => {
        const result = await resolver.resolveBatch({
          rawInput: 'comi un puré de papas con una hamburguesa',
          rawItems: [
            { foodQuery: 'puré de papas', quantity: 1, unit: 'unit' },
            { foodQuery: 'hamburguesa', quantity: 1, unit: 'unit' }
          ],
          customIngredients: [mockPureIng, mockBurgerIng]
        });

        expect(result.items).toHaveLength(2);
        expect(result.isMultiMeal).toBe(false);
        expect(result.defaultLoggingMode).toBe('recipe');
        expect(result.synthesizedRecipe).toBeDefined();
        expect(result.synthesizedRecipe?.recipe.name).toBe('Puré de papas con Hamburguesa');
      });

      it('Issue 2: detects multi-meal when items have distinct meal types, disables recipe synthesis', async () => {
        const result = await resolver.resolveBatch({
          rawInput: 'almorcé mora congelada y cené queso',
          rawItems: [
            { foodQuery: 'mora congelada', quantity: 1, unit: 'unit', mealType: 'lunch' },
            { foodQuery: 'queso', quantity: 1, unit: 'unit', mealType: 'dinner' }
          ],
          customIngredients: [mockMoraIng, mockQuesoIng]
        });

        expect(result.items).toHaveLength(2);
        expect(result.items[0].mealType).toBe('meal_lunch');
        expect(result.items[1].mealType).toBe('meal_dinner');
        expect(result.isMultiMeal).toBe(true);
        expect(result.defaultLoggingMode).toBe('batch');
        expect(result.synthesizedRecipe).toBeUndefined();
      });

      it('Issue 3: defaults to batch mode when input lists separate items separated by commas and "y"', async () => {
        const result = await resolver.resolveBatch({
          rawInput: 'comí queso, pan, hamburguesa y mora congelada en la cena',
          rawItems: [
            { foodQuery: 'queso', quantity: 1, unit: 'unit', mealType: 'dinner' },
            { foodQuery: 'pan', quantity: 1, unit: 'unit', mealType: 'dinner' },
            { foodQuery: 'hamburguesa', quantity: 1, unit: 'unit', mealType: 'dinner' },
            { foodQuery: 'mora congelada', quantity: 1, unit: 'unit', mealType: 'dinner' }
          ],
          customIngredients: [mockQuesoIng, mockPanIng, mockBurgerIng, mockMoraIng]
        });

        expect(result.items).toHaveLength(4);
        expect(result.isMultiMeal).toBe(false);
        expect(result.defaultLoggingMode).toBe('batch');
        // Synthesized recipe is computed for optional toggle, but defaultLoggingMode is batch
        expect(result.synthesizedRecipe).toBeDefined();
      });

      it('Issue 4: defaults to batch mode when items separated by "y", associating correct quantities and portions', async () => {
        const result = await resolver.resolveBatch({
          rawInput: 'caracolitos sabor asado y 2 porciones de pizza',
          rawItems: [
            { foodQuery: 'caracolitos sabor asado', quantity: 1, unit: 'unit' },
            { foodQuery: 'pizza', quantity: 2, unit: 'portion' }
          ],
          customIngredients: [mockCaracolitosIng, mockPizzaIng]
        });

        expect(result.items).toHaveLength(2);
        expect(result.items[0].quantity).toBe(1);
        expect(result.items[1].quantity).toBe(2);
        expect(result.isMultiMeal).toBe(false);
        expect(result.defaultLoggingMode).toBe('batch');
        expect(result.synthesizedRecipe).toBeDefined();
      });

      it('respects options.isCompositeDish override if provided', async () => {
        const result = await resolver.resolveBatch({
          rawInput: 'dos alimentos',
          rawItems: [
            { foodQuery: 'hamburguesa', quantity: 1, unit: 'unit' },
            { foodQuery: 'queso', quantity: 1, unit: 'unit' }
          ],
          customIngredients: [mockBurgerIng, mockQuesoIng],
          isCompositeDish: true
        });

        expect(result.defaultLoggingMode).toBe('recipe');
        expect(result.synthesizedRecipe).toBeDefined();
      });

      it('Multilingual (EN): synthesizes English recipe title using "with" / "and" when locale is "en" or input is English', async () => {
        const mockMashedPotatoEn: BaseIngredient = {
          id: 'ing-en-potato',
          name: 'Mashed potatoes',
          source: 'system',
          lang: 'en',
          calories_100g: 85,
          protein_100g: 2,
          carbs_100g: 15,
          fats_100g: 1.5
        };
        const mockBurgerEn: BaseIngredient = {
          id: 'ing-en-burger',
          name: 'Beef burger',
          source: 'system',
          lang: 'en',
          calories_100g: 240,
          protein_100g: 18,
          carbs_100g: 0,
          fats_100g: 16
        };

        const result = await resolver.resolveBatch({
          rawInput: 'I ate mashed potatoes with a beef burger',
          rawItems: [
            { foodQuery: 'mashed potatoes', quantity: 1, unit: 'portion' },
            { foodQuery: 'beef burger', quantity: 1, unit: 'unit' }
          ],
          customIngredients: [mockMashedPotatoEn, mockBurgerEn],
          locale: 'en'
        });

        expect(result.defaultLoggingMode).toBe('recipe');
        expect(result.synthesizedRecipe).toBeDefined();
        expect(result.synthesizedRecipe?.recipe.name).toBe('Mashed potatoes with Beef burger');
      });
    });
  });
});

