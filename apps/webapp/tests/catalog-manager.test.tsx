/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CatalogManager } from '../src/components/CatalogManager.js';
import * as AppContext from '../src/context/AppContext.js';

describe('CatalogManager - Custom Portions UI', () => {
  let addCustomIngredientMock: any;

  beforeEach(() => {
    addCustomIngredientMock = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      isCatalogOpen: true,
      ingredients: [],
      addCustomIngredient: addCustomIngredientMock,
      removeCustomIngredient: vi.fn(),
      setIsCatalogOpen: vi.fn(),
      db: {}
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('allows user to define custom portions via Plus button and passes them to addCustomIngredient', async () => {
    const { container } = render(<CatalogManager />);

    // Click "New" button to open the form
    const addBtn = screen.getByText('New');
    fireEvent.click(addBtn);

    // Fill macro fields
    fireEvent.change(screen.getByPlaceholderText('e.g. Milanesa de soya casera'), { target: { value: 'My Chicken' } });
    fireEvent.change(screen.getByPlaceholderText('kcal'), { target: { value: '165' } });
    const numberInputs = container.querySelectorAll('input[type="number"]');
    // 0: calories, 1: protein, 2: carbs, 3: fats, 4: portionWeight
    fireEvent.change(numberInputs[1], { target: { value: '31' } }); // protein
    fireEvent.change(numberInputs[2], { target: { value: '0' } }); // carbs
    fireEvent.change(numberInputs[3], { target: { value: '3.6' } }); // fats

    // Add a custom portion
    fireEvent.change(screen.getByPlaceholderText('E.g., Slice, Cup, Tbsp'), { target: { value: 'Breast' } });
    fireEvent.change(screen.getByPlaceholderText('Grams'), { target: { value: '200' } });
    
    // Find Add Portion Button
    const buttons = container.querySelectorAll('button');
    const addPortionBtn = Array.from(buttons).find(b => b.innerHTML.includes('lucide-circle-plus'));
    if (addPortionBtn) fireEvent.click(addPortionBtn);

    // Check if it was added to the list visually
    expect(screen.getByText('Breast')).toBeDefined();
    expect(screen.getByText('200g')).toBeDefined();

    // Click Save
    const saveBtn = screen.getByText('Save');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(addCustomIngredientMock).toHaveBeenCalled();
    });

    const callArgs = addCustomIngredientMock.mock.calls[0];
    expect(callArgs[0]).toMatchObject({
      name: 'My Chicken',
      calories_100g: 165,
      protein_100g: 31,
      carbs_100g: 0,
      fats_100g: 3.6
    });
    
    expect(callArgs[1]).toEqual([
      { name: 'Breast', equivalent_weight_g: 200 }
    ]);
  });

  it('automatically includes pending typed portion if user clicks Save without clicking Plus button', async () => {
    const { container } = render(<CatalogManager />);

    const addBtn = screen.getByText('New');
    fireEvent.click(addBtn);

    fireEvent.change(screen.getByPlaceholderText('e.g. Milanesa de soya casera'), { target: { value: 'Beef Steak' } });
    fireEvent.change(screen.getByPlaceholderText('kcal'), { target: { value: '250' } });
    const numberInputs = container.querySelectorAll('input[type="number"]');
    fireEvent.change(numberInputs[1], { target: { value: '26' } }); // protein
    fireEvent.change(numberInputs[2], { target: { value: '0' } }); // carbs
    fireEvent.change(numberInputs[3], { target: { value: '15' } }); // fats

    // Type portion directly into fields WITHOUT clicking plus button
    fireEvent.change(screen.getByPlaceholderText('E.g., Slice, Cup, Tbsp'), { target: { value: '1 bife' } });
    fireEvent.change(screen.getByPlaceholderText('Grams'), { target: { value: '180' } });

    // Click Save directly
    const saveBtn = screen.getByText('Save');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(addCustomIngredientMock).toHaveBeenCalled();
    });

    const callArgs = addCustomIngredientMock.mock.calls[0];
    expect(callArgs[0]).toMatchObject({
      name: 'Beef Steak',
      calories_100g: 250,
      protein_100g: 26,
      carbs_100g: 0,
      fats_100g: 15
    });
    
    // Verifies pending portion was auto-included
    expect(callArgs[1]).toEqual([
      { name: '1 bife', equivalent_weight_g: 180 }
    ]);
  });
});

describe('CatalogManager - Recipes Integration', () => {
  let removeRecipeMock: any;
  let addRecipeMock: any;

  const sampleRecipeFood: any = {
    id: 'recipe_lentil_stew',
    name: 'Lentil Stew',
    kind: 'recipe',
    source: 'custom',
    calories_100g: 120,
    protein_100g: 8,
    carbs_100g: 16,
    fats_100g: 2,
    raw_weight_g: 450,
    cooked_weight_g: 500,
    yield_factor: 1.11,
    total_macros: {
      calories: 600,
      protein: 40,
      carbs: 80,
      fats: 10
    },
    recipe: {
      id: 'recipe_lentil_stew',
      name: 'Lentil Stew',
      yield_factor: 1.11,
      ingredients: [
        {
          food_id: 'ing_lentils',
          name: 'Dry Lentils',
          weight_g: 200,
          calories_100g: 116,
          protein_100g: 9,
          carbs_100g: 20,
          fats_100g: 0.8
        },
        {
          food_id: 'ing_carrots',
          name: 'Carrots',
          weight_g: 250,
          calories_100g: 41,
          protein_100g: 0.9,
          carbs_100g: 9.6,
          fats_100g: 0.2
        }
      ]
    }
  };

  beforeEach(() => {
    removeRecipeMock = vi.fn().mockResolvedValue(undefined);
    addRecipeMock = vi.fn().mockResolvedValue('new_recipe_id');
    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      isCatalogOpen: true,
      ingredients: [],
      recipes: [],
      recipeFoods: [sampleRecipeFood],
      addCustomIngredient: vi.fn(),
      removeCustomIngredient: vi.fn(),
      addRecipe: addRecipeMock,
      removeRecipe: removeRecipeMock,
      setIsCatalogOpen: vi.fn(),
      db: {}
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders custom recipes with badge and expands ingredients breakdown on chevron click', () => {
    render(<CatalogManager />);

    expect(screen.getByText('Lentil Stew')).toBeDefined();
    expect(screen.getAllByText('Recipe').length).toBeGreaterThan(0);
    expect(screen.getByText(/500g cooked/)).toBeDefined();

    // Initially breakdown is collapsed
    expect(screen.queryByText('Dry Lentils')).toBeNull();

    // Click expand chevron
    const expandBtn = screen.getByLabelText('Expand recipe ingredients');
    fireEvent.click(expandBtn);

    // Breakdown is now visible
    expect(screen.getByText('Dry Lentils')).toBeDefined();
    expect(screen.getByText('Carrots')).toBeDefined();
  });

  it('calls removeRecipe when delete recipe button is clicked and confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CatalogManager />);

    const deleteBtn = screen.getByLabelText('Delete recipe');
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalled();
    expect(removeRecipeMock).toHaveBeenCalledWith('recipe_lentil_stew');
  });

  it('opens RecipeBuilder when Recipe button is clicked', () => {
    render(<CatalogManager />);

    const recipeBtn = screen.getAllByText('Recipe').find(el => el.tagName === 'SPAN' && el.parentElement?.tagName === 'BUTTON');
    if (recipeBtn) {
      fireEvent.click(recipeBtn);
    }

    // RecipeBuilder header should now appear
    expect(screen.getByText('Combine Foods (Recipe)')).toBeDefined();
  });
});

