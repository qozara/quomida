import { describe, it, expect } from 'vitest';
import { DailyLogManager } from '../src/logging/DailyLogManager.js';
import type { BaseIngredient, Portion, DailyLog } from '../src/types.js';

describe('DailyLogManager', () => {
  const manager = new DailyLogManager();

  const mockIngredient: BaseIngredient = {
    id: 'ing-mora',
    name: 'Mora',
    source: 'system',
    lang: 'es',
    calories_100g: 80,
    protein_100g: 1.4,
    carbs_100g: 12,
    fats_100g: 0.5
  };

  const mockPortion: Portion = {
    id: 'port-1',
    base_food_id: 'ing-mora',
    name: '1 taza (150 g)',
    equivalent_weight_g: 150
  };

  it('creates an immutable DailyLog with hardcoded macro snapshot (ADR 0003)', () => {
    const log = manager.createLogEntry({
      id: 'log-123',
      food: mockIngredient,
      portion: mockPortion,
      quantity: 2, // 2 tazas = 300g
      mealType: 'meal_breakfast',
      date: '2026-10-03',
      timestamp: '2026-10-03T10:00:00Z'
    });

    expect(log.id).toBe('log-123');
    expect(log.food_reference_id).toBe('ing-mora');
    expect(log.food_name).toBe('Mora');
    expect(log.portion_name).toBe('1 taza (150 g)');
    expect(log.quantity).toBe(2);
    expect(log.meal_type).toBe('meal_breakfast');
    expect(log.date).toBe('2026-10-03');
    
    // 300g = 3 * 100g macros:
    // calories: 80 * 3 = 240
    // protein: 1.4 * 3 = 4.2
    // carbs: 12 * 3 = 36
    // fats: 0.5 * 3 = 1.5
    expect(log.macros).toEqual({
      calories: 240,
      protein: 4.2,
      carbs: 36,
      fats: 1.5
    });
  });

  it('updates quantity and recalculates macro snapshot immutably', () => {
    const originalLog = manager.createLogEntry({
      id: 'log-123',
      food: mockIngredient,
      portion: mockPortion,
      quantity: 1, // 150g -> calories: 120, protein: 2.1, carbs: 18, fats: 0.8
      mealType: 'meal_breakfast',
      date: '2026-10-03'
    });

    const updatedLog = manager.updateLogQuantity(originalLog, 3, mockIngredient, mockPortion);

    expect(updatedLog.quantity).toBe(3);
    expect(updatedLog.macros.calories).toBe(360);
    expect(updatedLog.macros.protein).toBe(6.3);
    expect(updatedLog.macros.carbs).toBe(54);
    expect(updatedLog.macros.fats).toBe(2.3);
    expect(originalLog.quantity).toBe(1); // Original unchanged
  });

  it('removes a log entry by id from a list', () => {
    const logs: DailyLog[] = [
      { id: '1', date: '2026-10-03', meal_type: 'meal_lunch', food_reference_id: 'a', quantity: 1, portion_name: 'p', macros: { calories: 100, protein: 1, carbs: 1, fats: 1 }, timestamp: 't' },
      { id: '2', date: '2026-10-03', meal_type: 'meal_lunch', food_reference_id: 'b', quantity: 1, portion_name: 'p', macros: { calories: 200, protein: 2, carbs: 2, fats: 2 }, timestamp: 't' }
    ];

    const remaining = manager.removeLogEntry('1', logs);
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe('2');
  });

  it('creates a DailyLog with exact same structure and keys when logging a recipe (polymorphic invariant)', () => {
    const mockRecipeFood: any = {
      kind: 'recipe',
      id: 'rec-pancake',
      name: 'Fluffy Pancake',
      source: 'custom',
      cooked_weight_g: 270,
      calories_100g: 322.6,
      protein_100g: 12.1,
      carbs_100g: 56.6,
      fats_100g: 4.3
    };

    const recipePortion: Portion = {
      id: 'port-rec-serving',
      base_food_id: 'rec-pancake',
      name: '1 serving (90g)',
      equivalent_weight_g: 90
    };

    const ingredientLog = manager.createLogEntry({
      id: 'log-ing',
      food: mockIngredient,
      portion: mockPortion,
      quantity: 1,
      mealType: 'meal_breakfast',
      date: '2026-10-11'
    });

    const recipeLog = manager.createLogEntry({
      id: 'log-rec',
      food: mockRecipeFood,
      portion: recipePortion,
      quantity: 1,
      mealType: 'meal_breakfast',
      date: '2026-10-11'
    });

    // Keys must be 100% identical
    const ingredientKeys = Object.keys(ingredientLog).sort();
    const recipeKeys = Object.keys(recipeLog).sort();
    expect(recipeKeys).toEqual(ingredientKeys);

    // Food reference ID links to recipe
    expect(recipeLog.food_reference_id).toBe('rec-pancake');
    expect(recipeLog.food_name).toBe('Fluffy Pancake');
    expect(recipeLog.portion_name).toBe('1 serving (90g)');
    
    // 90g @ 322.6 kcal/100g = 290.3 kcal
    expect(recipeLog.macros.calories).toBeCloseTo(290.3, 1);
  });
});
