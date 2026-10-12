/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FoodLogger } from '../src/components/FoodLogger.js';
import * as AppContext from '../src/context/AppContext.js';
import { dictionaries } from '@quomida/i18n-locales';
import type { RecipeFoodItem } from '@quomida/domain-core';

describe('FoodLogger - Unified Food & Recipe Search', () => {
  let onSelectMock: any;

  const sampleRecipe: RecipeFoodItem = {
    id: 'recipe_lentil_stew',
    name: 'Guiso de Lentejas Casero',
    kind: 'recipe',
    source: 'custom',
    calories_100g: 135,
    protein_100g: 9.5,
    carbs_100g: 18.2,
    fats_100g: 2.1,
    raw_weight_g: 550,
    cooked_weight_g: 600,
    yield_factor: 1.09,
    total_macros: {
      calories: 810,
      protein: 57,
      carbs: 109.2,
      fats: 12.6
    },
    recipe: {
      id: 'recipe_lentil_stew',
      name: 'Guiso de Lentejas Casero',
      yield_factor: 1.09,
      ingredients: [
        {
          food_id: 'ing_1',
          name: 'Lentejas secas',
          weight_g: 250,
          calories_100g: 116,
          protein_100g: 8.8,
          carbs_100g: 20,
          fats_100g: 0.8
        }
      ]
    }
  };

  beforeEach(() => {
    onSelectMock = vi.fn();
    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      ingredients: [],
      recipes: [],
      recipeFoods: [sampleRecipe],
      t: dictionaries.en,
      setIsSettingsOpen: vi.fn()
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('displays recipes with Recipe badge in autocomplete search results and selects recipe on click', async () => {
    render(<FoodLogger onSelectIngredient={onSelectMock} />);

    // Type in search query matching recipe
    const input = screen.getByPlaceholderText(dictionaries.en.search.placeholder);
    fireEvent.change(input, { target: { value: 'Guiso' } });

    // Wait for search result debounce
    await waitFor(() => {
      expect(screen.getByText('Guiso de Lentejas Casero')).toBeDefined();
    });

    // Verify Recipe badge is displayed
    expect(screen.getByText('Recipe')).toBeDefined();
    expect(screen.getByText(/135 kcal\/100g/)).toBeDefined();

    // Click recipe to select it
    fireEvent.click(screen.getByText('Guiso de Lentejas Casero'));

    expect(onSelectMock).toHaveBeenCalledWith(sampleRecipe, 'meal_lunch');
  });
});
