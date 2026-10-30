/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRecentFoods } from '../src/hooks/useRecentFoods.js';
import * as AppContext from '../src/context/AppContext.js';
import type { DailyLog, BaseIngredient, RecipeFoodItem } from '@quomida/domain-core';

describe('useRecentFoods hook', () => {
  const sampleBreakfastLog: DailyLog = {
    id: 'log_b1',
    timestamp: '2026-10-29T08:00:00Z',
    date: '2026-10-29',
    meal_type: 'meal_breakfast',
    food_reference_id: 'food_oats',
    food_name: 'Rolled Oats',
    quantity: 1,
    portion_name: '1 bowl',
    macros: { calories: 150, protein: 5, carbs: 27, fats: 3 },
    updatedAt: 1000
  };

  const sampleLunchLog: DailyLog = {
    id: 'log_l1',
    timestamp: '2026-10-29T13:00:00Z',
    date: '2026-10-29',
    meal_type: 'meal_lunch',
    food_reference_id: 'food_chicken',
    food_name: 'Grilled Chicken Breast',
    quantity: 1,
    portion_name: '100g',
    macros: { calories: 165, protein: 31, carbs: 0, fats: 3.6 },
    updatedAt: 2000
  };

  const sampleRecipeFood: RecipeFoodItem = {
    id: 'food_oats',
    name: 'Rolled Oats',
    kind: 'recipe',
    source: 'custom',
    calories_100g: 150,
    protein_100g: 5,
    carbs_100g: 27,
    fats_100g: 3,
    raw_weight_g: 50,
    cooked_weight_g: 150,
    yield_factor: 3,
    total_macros: { calories: 150, protein: 5, carbs: 27, fats: 3 },
    recipe: {
      id: 'food_oats',
      name: 'Rolled Oats',
      yield_factor: 3,
      ingredients: []
    }
  };

  const sampleIngredient: BaseIngredient = {
    lang: 'en',
    id: 'food_chicken',
    name: 'Grilled Chicken Breast',
    source: 'custom',
    calories_100g: 165,
    protein_100g: 31,
    carbs_100g: 0,
    fats_100g: 3.6
  };

  let mockFind: any;
  let mockSubscribe: any;

  beforeEach(() => {
    mockSubscribe = vi.fn((cb: (docs: any[]) => void) => {
      // Return docs based on selector
      return { unsubscribe: vi.fn() };
    });

    mockFind = vi.fn((query: any) => ({
      $: {
        subscribe: (cb: any) => {
          const selector = query?.selector || {};
          let allDocs = [sampleBreakfastLog, sampleLunchLog];
          if (selector.meal_type) {
            allDocs = allDocs.filter(d => d.meal_type === selector.meal_type);
          }
          cb(allDocs);
          return { unsubscribe: vi.fn() };
        }
      }
    }));

    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      db: {
        daily_logs: {
          find: mockFind
        }
      },
      ingredients: [sampleIngredient],
      recipes: [sampleRecipeFood.recipe],
      recipeFoods: [sampleRecipeFood]
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribes without meal_type when no targetMealType is passed and returns all recent items', () => {
    const { result } = renderHook(() => useRecentFoods());

    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        selector: expect.not.objectContaining({ meal_type: expect.anything() })
      })
    );
    expect(result.current.recentItems.length).toBe(2);
    // Chicken has higher updatedAt (2000 vs 1000), so it should be first
    expect(result.current.recentItems[0].id).toBe('food_chicken');
    expect(result.current.recentItems[1].id).toBe('food_oats');
  });

  it('filters by targetMealType when targetMealType is provided', () => {
    const { result } = renderHook(() => useRecentFoods('meal_breakfast'));

    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        selector: expect.objectContaining({ meal_type: 'meal_breakfast' })
      })
    );
    expect(result.current.recentItems.length).toBe(1);
    expect(result.current.recentItems[0].id).toBe('food_oats');
    expect(result.current.recentItems[0].kind).toBe('recipe');
  });

  it('reactively updates recentItems when targetMealType changes from breakfast to lunch', () => {
    let mealType: any = 'meal_breakfast';
    const { result, rerender } = renderHook(() => useRecentFoods(mealType));

    expect(result.current.recentItems.length).toBe(1);
    expect(result.current.recentItems[0].id).toBe('food_oats');

    mealType = 'meal_lunch';
    rerender();

    expect(result.current.recentItems.length).toBe(1);
    expect(result.current.recentItems[0].id).toBe('food_chicken');
    expect(result.current.recentItems[0].kind).toBe('ingredient');
  });

  it('creates resilient fallback food items from daily log snapshots when not in custom ingredients or recipes', () => {
    const unknownLog: DailyLog = {
      id: 'log_u1',
      timestamp: '2026-10-29T19:00:00Z',
      date: '2026-10-29',
      meal_type: 'meal_dinner',
      food_reference_id: 'sys_salmon_fillet',
      food_name: 'Wild Salmon Fillet',
      quantity: 1,
      portion_name: '150g',
      macros: { calories: 208, protein: 22, carbs: 0, fats: 13 },
      updatedAt: 3000
    };

    mockFind = vi.fn(() => ({
      $: {
        subscribe: (cb: any) => {
          cb([unknownLog]);
          return { unsubscribe: vi.fn() };
        }
      }
    }));

    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      db: { daily_logs: { find: mockFind } },
      ingredients: [],
      recipes: [],
      recipeFoods: []
    } as any);

    const { result } = renderHook(() => useRecentFoods('meal_dinner'));

    expect(result.current.recentItems.length).toBe(1);
    expect(result.current.recentItems[0].id).toBe('sys_salmon_fillet');
    expect(result.current.recentItems[0].name).toBe('Wild Salmon Fillet');
    expect(result.current.recentItems[0].calories_100g).toBe(208);
  });
});
