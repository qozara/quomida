/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CatalogManager } from '../src/components/CatalogManager.js';
import * as AppContext from '../src/context/AppContext.js';
import { CatalogSearchManager } from '@quomida/domain-core';

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
    render(<CatalogManager />);

    // Click "New" button to open the form
    const addBtn = screen.getByText('New');
    fireEvent.click(addBtn);

    // Verify slide-over dialog is open
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByTestId('btn-back-ingredient-builder')).toBeDefined();

    // Fill macro fields
    fireEvent.change(screen.getByPlaceholderText('e.g. Milanesa de soya casera'), { target: { value: 'My Chicken' } });
    fireEvent.change(screen.getByPlaceholderText('kcal'), { target: { value: '165' } });
    const numberInputs = document.querySelectorAll('input[type="number"]');
    // 0: calories, 1: protein, 2: carbs, 3: fats, 4: portionWeight
    fireEvent.change(numberInputs[1], { target: { value: '31' } }); // protein
    fireEvent.change(numberInputs[2], { target: { value: '0' } }); // carbs
    fireEvent.change(numberInputs[3], { target: { value: '3.6' } }); // fats

    // Add a custom portion
    fireEvent.change(screen.getByPlaceholderText('E.g., Slice, Cup, Tbsp'), { target: { value: 'Breast' } });
    fireEvent.change(screen.getByPlaceholderText('Grams'), { target: { value: '200' } });
    
    // Find Add Portion Button
    const buttons = document.querySelectorAll('button');
    const addPortionBtn = Array.from(buttons).find(b => b.innerHTML.includes('lucide-circle-plus') || b.getAttribute('aria-label') === 'Add custom portion');
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
    render(<CatalogManager />);

    const addBtn = screen.getByText('New');
    fireEvent.click(addBtn);

    fireEvent.change(screen.getByPlaceholderText('e.g. Milanesa de soya casera'), { target: { value: 'Beef Steak' } });
    fireEvent.change(screen.getByPlaceholderText('kcal'), { target: { value: '250' } });
    const numberInputs = document.querySelectorAll('input[type="number"]');
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

  it('closes IngredientBuilder when back button is clicked in the header', async () => {
    render(<CatalogManager />);

    const addBtn = screen.getByText('New');
    fireEvent.click(addBtn);

    const backBtn = screen.getByTestId('btn-back-ingredient-builder');
    expect(backBtn).toBeDefined();

    fireEvent.click(backBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('btn-back-ingredient-builder')).toBeNull();
    });
  });

  it('opens IngredientBuilder prefilled when edit option in context menu of custom ingredient is clicked', async () => {
    const sampleIngredient: any = {
      id: 'custom_tofu',
      name: 'Organic Tofu',
      kind: 'ingredient',
      source: 'custom',
      calories_100g: 80,
      protein_100g: 8.5,
      carbs_100g: 1.5,
      fats_100g: 4.5,
      portions: [{ name: 'Half block', equivalent_weight_g: 150 }]
    };

    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      isCatalogOpen: true,
      ingredients: [sampleIngredient],
      recipeFoods: [],
      recipes: [],
      addCustomIngredient: addCustomIngredientMock,
      removeCustomIngredient: vi.fn(),
      setIsCatalogOpen: vi.fn(),
      db: {}
    } as any);

    render(<CatalogManager />);

    // Open context menu for the ingredient
    const optionsBtn = screen.getByLabelText('Item options');
    fireEvent.click(optionsBtn);

    const editBtn = screen.getByLabelText('Edit custom ingredient');
    fireEvent.click(editBtn);

    // Verify IngredientBuilder is open prefilled
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByTestId('btn-back-ingredient-builder')).toBeDefined();
    expect(screen.getByDisplayValue('Organic Tofu')).toBeDefined();
    expect(screen.getByDisplayValue('80')).toBeDefined();
    expect(screen.getByDisplayValue('8.5')).toBeDefined();
    expect(screen.getByText('Half block')).toBeDefined();
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
    // Redundant total nutrition details at bottom are omitted
    expect(screen.queryByText('Nutrition per 100g:')).toBeNull();
  });

  it('calls removeRecipe when delete option in context menu is clicked and confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CatalogManager />);

    // Open context menu
    const optionsBtn = screen.getByLabelText('Item options');
    fireEvent.click(optionsBtn);

    const deleteBtn = screen.getByLabelText('Delete recipe');
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalled();
    expect(removeRecipeMock).toHaveBeenCalledWith('recipe_lentil_stew');
  });

  it('triggers onSelectFood when plus button is clicked on an item card', () => {
    const onSelectFoodMock = vi.fn();
    render(<CatalogManager onSelectFood={onSelectFoodMock} />);

    const addBtn = screen.getByLabelText('Add recipe to log');
    fireEvent.click(addBtn);

    expect(onSelectFoodMock).toHaveBeenCalledWith(sampleRecipeFood);
  });

  it('opens RecipeBuilder prefilled when edit option in context menu is clicked', () => {
    render(<CatalogManager />);

    const optionsBtn = screen.getByLabelText('Item options');
    fireEvent.click(optionsBtn);

    const editBtn = screen.getByLabelText('Edit recipe');
    fireEvent.click(editBtn);

    expect(screen.getByText('Combine Foods (Recipe)')).toBeDefined();
    expect(screen.getByDisplayValue('Lentil Stew')).toBeDefined();
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

  it('only shows plus button and does not display context menu (3-dots) for system catalog search results', async () => {
    const onSelectFoodMock = vi.fn();
    const systemFood: any = {
      id: 'sys_apple',
      name: 'System Apple',
      kind: 'ingredient',
      source: 'system',
      calories_100g: 52,
      protein_100g: 0.3,
      carbs_100g: 14,
      fats_100g: 0.2
    };

    vi.spyOn(CatalogSearchManager.prototype, 'search').mockResolvedValue({
      items: [systemFood],
      total: 1
    } as any);

    render(<CatalogManager onSelectFood={onSelectFoodMock} />);

    // Type in search box
    const searchInput = screen.getByPlaceholderText('Search catalog...');
    fireEvent.change(searchInput, { target: { value: 'Apple' } });

    await waitFor(() => {
      expect(screen.getByText('System Apple')).toBeDefined();
    });

    // Verify context menu (3-dots) is NOT rendered for system item
    expect(screen.queryByLabelText('Item options')).toBeNull();

    // Verify plus button IS rendered and clickable
    const plusBtn = screen.getByLabelText('Add food to log');
    expect(plusBtn).toBeDefined();
    fireEvent.click(plusBtn);

    expect(onSelectFoodMock).toHaveBeenCalledWith(systemFood);
  });

  it('renders AI compose card when typing a search query, and clicking it opens BatchAiMealReviewModal in catalog mode without meal selector and saves recipe without logging to daily', async () => {
    const { MealService } = await import('@quomida/domain-core');
    const logBatchFoodItemsMock = vi.fn();

    const sampleResolvedMeal: any = {
      rawInput: 'Tofu stir fry with veggies',
      detectedMealType: 'meal_lunch',
      compositeDishName: 'Tofu stir fry with veggies',
      items: [
        {
          id: 'item-1',
          rawQuery: 'tofu',
          food: { id: 'tofu', name: 'Firm Tofu', calories_100g: 80, protein_100g: 10, carbs_100g: 2, fats_100g: 4 },
          quantity: 1,
          selectedPortionName: 'g',
          availablePortions: [],
          calculatedWeightGrams: 150,
          macros: { calories: 120, protein: 15, carbs: 3, fats: 6 },
          unmatched: false,
          mealType: 'meal_lunch'
        },
        {
          id: 'item-2',
          rawQuery: 'broccoli',
          food: { id: 'broccoli', name: 'Broccoli', calories_100g: 34, protein_100g: 2.8, carbs_100g: 7, fats_100g: 0.4 },
          quantity: 1,
          selectedPortionName: 'g',
          availablePortions: [],
          calculatedWeightGrams: 100,
          macros: { calories: 34, protein: 2.8, carbs: 7, fats: 0.4 },
          unmatched: false,
          mealType: 'meal_lunch'
        }
      ],
      totalMacros: { calories: 154, protein: 17.8, carbs: 10, fats: 6.4 }
    };

    vi.spyOn(MealService.prototype, 'processMeal').mockResolvedValue(sampleResolvedMeal);

    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      isCatalogOpen: true,
      ingredients: [],
      recipes: [],
      recipeFoods: [],
      addCustomIngredient: vi.fn(),
      removeCustomIngredient: vi.fn(),
      addRecipe: addRecipeMock,
      removeRecipe: removeRecipeMock,
      logBatchFoodItems: logBatchFoodItemsMock,
      setIsCatalogOpen: vi.fn(),
      db: {}
    } as any);

    render(<CatalogManager />);

    // Type query in search input
    const searchInput = screen.getByPlaceholderText('Search catalog...');
    fireEvent.change(searchInput, { target: { value: 'Tofu stir fry' } });

    // Verify AI Compose card appears
    const composeBtn = await screen.findByTestId('btn-catalog-compose-ai');
    expect(composeBtn).toBeDefined();
    expect(composeBtn.textContent).toContain('Tofu stir fry');

    // Click AI Compose card
    fireEvent.click(composeBtn);

    // Modal opens in catalog mode
    const reviewDialog = await screen.findByRole('dialog', { name: /tofu stir fry with veggies/i });
    expect(reviewDialog).toBeDefined();

    // Meal Time selector should NOT be present in catalog mode
    expect(screen.queryByText('Meal Time')).toBeNull();
    expect(screen.queryByText('Momento del día')).toBeNull();

    // Primary save button should say Save Recipe to Catalog
    const saveCatalogBtn = screen.getByTestId('btn-save-catalog-ai');
    expect(saveCatalogBtn).toBeDefined();
    expect(saveCatalogBtn.textContent).toMatch(/save recipe to catalog/i);

    // Click Save Recipe to Catalog
    fireEvent.click(saveCatalogBtn);

    // Verify addRecipe was called to save in catalog
    await waitFor(() => {
      expect(addRecipeMock).toHaveBeenCalled();
    });

    // Verify logBatchFoodItems was NOT called (does NOT log to daily diary)
    expect(logBatchFoodItemsMock).not.toHaveBeenCalled();

    // Verify modal is closed
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /tofu stir fry with veggies/i })).toBeNull();
    });
  });
});

