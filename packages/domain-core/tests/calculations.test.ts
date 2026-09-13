import { describe, it, expect } from 'vitest';
import {
  calculateItemMacros,
  calculateRecipeMacros,
  convertPortionToGrams,
  createMacroSnapshot,
  validateMacroAlignment,
  type BaseIngredient,
  type Recipe
} from '@quomida/domain-core';

describe('Domain Calculations & Macro Utilities', () => {
  const sampleIngredient: BaseIngredient = {
    id: 'ing-1',
    name: 'Peceto crudo',
    source: 'system',
    lang: 'es',
    calories_100g: 120,
    protein_100g: 22,
    carbs_100g: 0,
    fats_100g: 3.5
  };

  it('calculates macros for a given weight in grams correctly', () => {
    const macros = calculateItemMacros(sampleIngredient, 200); // 200 grams
    expect(macros.calories).toBe(240);
    expect(macros.protein).toBe(44);
    expect(macros.carbs).toBe(0);
    expect(macros.fats).toBe(7);
  });

  it('converts domestic portion to absolute grams', () => {
    const portions = [
      { id: 'p1', base_food_id: 'ing-1', name: '1 slice (rebanada)', equivalent_weight_g: 150 },
      { id: 'p2', base_food_id: 'ing-1', name: '1 medium piece', equivalent_weight_g: 200 }
    ];

    const weightGrams = convertPortionToGrams(2, '1 slice (rebanada)', portions);
    expect(weightGrams).toBe(300); // 2 * 150g

    // Fallback if portion is 'grams' or 'g'
    expect(convertPortionToGrams(150, 'g', portions)).toBe(150);
  });

  it('calculates compound recipe macros with yield factor loss/gain', () => {
    const sampleOil: BaseIngredient = {
      id: 'ing-2',
      name: 'Aceite de oliva',
      source: 'system',
      lang: 'es',
      calories_100g: 884,
      protein_100g: 0,
      carbs_100g: 0,
      fats_100g: 100
    };

    const recipe: Recipe = {
      id: 'rec-1',
      name: 'Peceto al horno',
      ingredients: [
        { ingredient_id: 'ing-1', raw_weight_g: 500 }, // Peceto
        { ingredient_id: 'ing-2', raw_weight_g: 20 }   // Oil
      ],
      yield_factor: 0.85 // 15% moisture loss during baking
    };

    const ingredientsMap = new Map([
      ['ing-1', sampleIngredient],
      ['ing-2', sampleOil]
    ]);

    const recipeResult = calculateRecipeMacros(recipe, ingredientsMap);

    // Total raw weight: 520g. Cooked weight = 520 * 0.85 = 442g.
    expect(recipeResult.cooked_weight_g).toBe(442);
    // Total raw calories: 5*120 + 0.2*884 = 600 + 176.8 = 776.8
    expect(recipeResult.total_macros.calories).toBeCloseTo(776.8, 1);
    // Total raw protein: 5*22 = 110g
    expect(recipeResult.total_macros.protein).toBe(110);
  });

  it('creates immutable macro snapshots for daily log entries', () => {
    const snapshot = createMacroSnapshot({
      calories: 240.456,
      protein: 44.123,
      carbs: 0,
      fats: 7.89
    });

    expect(snapshot).toEqual({
      calories: 240.5,
      protein: 44.1,
      carbs: 0,
      fats: 7.9
    });
  });

  it('validates macro alignment for custom ingredients', () => {
    // Valid macro alignment
    expect(validateMacroAlignment(250, 20, 10, 15).valid).toBe(true);

    // Negative values invalid
    expect(validateMacroAlignment(-100, 20, 10, 15).valid).toBe(false);

    // Total macro weight > 100g per 100g base invalid
    expect(validateMacroAlignment(500, 60, 50, 20).valid).toBe(false);

    // Wildly impossible calorie vs macro calculation invalid
    expect(validateMacroAlignment(1500, 5, 5, 2).valid).toBe(false);
  });
});
