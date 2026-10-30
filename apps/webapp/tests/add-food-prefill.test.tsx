/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AddFoodModal } from '../src/components/AddFoodModal.js';
import * as AppContext from '../src/context/AppContext.js';
import { dictionaries } from '@quomida/i18n-locales';
import type { DailyLog, BaseIngredient, RecipeFoodItem } from '@quomida/domain-core';

describe('AddFoodModal - Pre-filled Recently Used Foods by Meal Type', () => {
  const onSelectIngredientMock = vi.fn();
  const onCloseMock = vi.fn();

  const breakfastRecipe: RecipeFoodItem = {
    id: 'food_pancakes',
    name: 'Protein Oatmeal Pancakes',
    kind: 'recipe',
    source: 'custom',
    calories_100g: 180,
    protein_100g: 14,
    carbs_100g: 22,
    fats_100g: 4,
    raw_weight_g: 200,
    cooked_weight_g: 180,
    yield_factor: 0.9,
    total_macros: { calories: 324, protein: 25.2, carbs: 39.6, fats: 7.2 },
    recipe: {
      id: 'food_pancakes',
      name: 'Protein Oatmeal Pancakes',
      yield_factor: 0.9,
      ingredients: []
    }
  };

  const lunchIngredient: BaseIngredient = {
    lang: 'en',
    id: 'food_turkey',
    name: 'Roasted Turkey Breast',
    source: 'custom',
    calories_100g: 135,
    protein_100g: 30,
    carbs_100g: 0,
    fats_100g: 1.5
  };

  const breakfastLog: DailyLog = {
    id: 'log_b1',
    timestamp: '2026-10-29T08:00:00Z',
    date: '2026-10-29',
    meal_type: 'meal_breakfast',
    food_reference_id: 'food_pancakes',
    food_name: 'Protein Oatmeal Pancakes',
    quantity: 1,
    portion_name: '1 serving',
    macros: { calories: 324, protein: 25.2, carbs: 39.6, fats: 7.2 },
    updatedAt: 1000
  };

  const lunchLog: DailyLog = {
    id: 'log_l1',
    timestamp: '2026-10-29T12:30:00Z',
    date: '2026-10-29',
    meal_type: 'meal_lunch',
    food_reference_id: 'food_turkey',
    food_name: 'Roasted Turkey Breast',
    quantity: 1,
    portion_name: '150g',
    macros: { calories: 202.5, protein: 45, carbs: 0, fats: 2.25 },
    updatedAt: 2000
  };

  beforeEach(() => {
    onSelectIngredientMock.mockReset();
    onCloseMock.mockReset();

    const mockFind = vi.fn((query: any) => ({
      $: {
        subscribe: (cb: any) => {
          const selector = query?.selector || {};
          let allDocs = [breakfastLog, lunchLog];
          if (selector.meal_type) {
            allDocs = allDocs.filter(d => d.meal_type === selector.meal_type);
          }
          cb(allDocs);
          return { unsubscribe: vi.fn() };
        }
      }
    }));

    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      t: dictionaries.en,
      selectedDate: '2026-10-29',
      setSelectedDate: vi.fn(),
      db: {
        daily_logs: {
          find: mockFind
        }
      },
      ingredients: [lunchIngredient],
      recipes: [breakfastRecipe.recipe],
      recipeFoods: [breakfastRecipe],
      setIsSettingsOpen: vi.fn()
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('pre-fills the search results pane with recently used breakfast foods when opened with targetMealType=meal_breakfast', () => {
    render(
      <AddFoodModal
        isOpen={true}
        targetMealType="meal_breakfast"
        onClose={onCloseMock}
        onSelectIngredient={onSelectIngredientMock}
      />
    );

    // Header says Add Food to Breakfast
    expect(screen.getByText(/Add Food to Breakfast/i)).toBeDefined();

    // The pane shows "Recently used"
    expect(screen.getByText('Recently used')).toBeDefined();

    // Breakfast food is displayed
    expect(screen.getByText('Protein Oatmeal Pancakes')).toBeDefined();
    // Lunch food is NOT displayed in breakfast
    expect(screen.queryByText('Roasted Turkey Breast')).toBeNull();
  });

  it('updates pre-filled items when user switches meal type pill from Breakfast to Lunch', () => {
    render(
      <AddFoodModal
        isOpen={true}
        targetMealType="meal_breakfast"
        onClose={onCloseMock}
        onSelectIngredient={onSelectIngredientMock}
      />
    );

    expect(screen.getByText('Protein Oatmeal Pancakes')).toBeDefined();
    expect(screen.queryByText('Roasted Turkey Breast')).toBeNull();

    // Click Lunch pill
    const lunchPill = screen.getByRole('button', { name: /lunch/i });
    fireEvent.click(lunchPill);

    // Now lunch food is displayed, breakfast food is hidden
    expect(screen.getByText('Roasted Turkey Breast')).toBeDefined();
    expect(screen.queryByText('Protein Oatmeal Pancakes')).toBeNull();
  });

  it('invokes onSelectIngredient with the chosen food and current meal type when clicking a pre-filled item', () => {
    render(
      <AddFoodModal
        isOpen={true}
        targetMealType="meal_breakfast"
        onClose={onCloseMock}
        onSelectIngredient={onSelectIngredientMock}
      />
    );

    const pancakeItem = screen.getByText('Protein Oatmeal Pancakes');
    fireEvent.click(pancakeItem);

    expect(onSelectIngredientMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'food_pancakes' }),
      'meal_breakfast'
    );
  });

  it('switches to active search results when user types 2+ characters, and returns to pre-filled recent foods when cleared', async () => {
    render(
      <AddFoodModal
        isOpen={true}
        targetMealType="meal_lunch"
        onClose={onCloseMock}
        onSelectIngredient={onSelectIngredientMock}
      />
    );

    // Initially lunch recent foods are visible
    expect(screen.getByText('Roasted Turkey Breast')).toBeDefined();

    // Type in search query
    const input = screen.getByPlaceholderText(dictionaries.en.search.unifiedPlaceholder || dictionaries.en.search.placeholder);
    fireEvent.change(input, { target: { value: 'Pancake' } });

    // Once typing >= 2 chars, it transitions to search results
    await waitFor(() => {
      // Pancake from recipeFoods is returned by catalog search
      expect(screen.getByText('Protein Oatmeal Pancakes')).toBeDefined();
    });

    // Clear input
    fireEvent.change(input, { target: { value: '' } });

    // Pre-filled recent foods for lunch return
    expect(screen.getByText('Roasted Turkey Breast')).toBeDefined();
    expect(screen.queryByText('Protein Oatmeal Pancakes')).toBeNull();
  });

  it('shows no recent foods notice when selected meal type has no recent logs', () => {
    render(
      <AddFoodModal
        isOpen={true}
        targetMealType="meal_snack"
        onClose={onCloseMock}
        onSelectIngredient={onSelectIngredientMock}
      />
    );

    expect(screen.getByText(dictionaries.en.catalog.noRecentFoods)).toBeDefined();
  });

  it('renders the "Show all recently used" toggle below meal pills, unchecked by default', () => {
    render(
      <AddFoodModal
        isOpen={true}
        targetMealType="meal_breakfast"
        onClose={onCloseMock}
        onSelectIngredient={onSelectIngredientMock}
      />
    );

    const toggle = screen.getByRole('switch', { name: 'Show all recently used' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('ignores the meal type filter when the toggle is enabled and restores it when disabled', () => {
    render(
      <AddFoodModal
        isOpen={true}
        targetMealType="meal_breakfast"
        onClose={onCloseMock}
        onSelectIngredient={onSelectIngredientMock}
      />
    );

    expect(screen.queryByText('Roasted Turkey Breast')).toBeNull();

    const toggle = screen.getByRole('switch', { name: 'Show all recently used' });
    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Roasted Turkey Breast')).toBeDefined();
    expect(screen.getByText('Protein Oatmeal Pancakes')).toBeDefined();

    fireEvent.click(toggle);
    expect(screen.queryByText('Roasted Turkey Breast')).toBeNull();
    expect(screen.getByText('Protein Oatmeal Pancakes')).toBeDefined();
  });
});
