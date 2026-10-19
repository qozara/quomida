/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FoodLogger } from '../src/components/FoodLogger.js';
import * as AppContext from '../src/context/AppContext.js';
import { dictionaries } from '@quomida/i18n-locales';
import { AiProviderFactory } from '@qozara/ai-client';
import type { BaseIngredient, Recipe } from '@quomida/domain-core';

describe('FoodLogger - AI Multi-Ingredient Natural Log & Batch Review', () => {
  let logBatchFoodItemsMock: any;
  let addRecipeMock: any;
  let onSelectMock: any;
  const mockChat = vi.fn();

  const mockCustomEgg: BaseIngredient = {
    id: 'cust-egg',
    name: 'Huevo Revuelto',
    source: 'custom',
    lang: 'es',
    calories_100g: 150,
    protein_100g: 12,
    carbs_100g: 1,
    fats_100g: 11
  };

  const mockApple: BaseIngredient = {
    id: 'sys-apple',
    name: 'Manzana Roja',
    source: 'system',
    lang: 'es',
    calories_100g: 52,
    protein_100g: 0.3,
    carbs_100g: 14,
    fats_100g: 0.2
  };

  const mockEmpanada: BaseIngredient = {
    id: 'cust-empanada',
    name: 'Empanada de Carne',
    source: 'custom',
    lang: 'es',
    calories_100g: 250,
    protein_100g: 8,
    carbs_100g: 30,
    fats_100g: 10
  };

  const mockBurger: BaseIngredient = {
    id: 'sys-burger',
    name: 'Hamburguesa',
    source: 'system',
    lang: 'es',
    calories_100g: 191,
    protein_100g: 14.5,
    carbs_100g: 0.4,
    fats_100g: 14.6
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(AiProviderFactory, 'createProvider').mockResolvedValue({
      id: 'mock-provider',
      mode: 'cloud',
      chat: mockChat,
      checkAvailability: vi.fn().mockResolvedValue(true),
      getSetupMessage: vi.fn().mockReturnValue(null)
    } as any);

    logBatchFoodItemsMock = vi.fn().mockResolvedValue(undefined);
    addRecipeMock = vi.fn().mockResolvedValue('rec-saved-123');
    onSelectMock = vi.fn();

    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      ingredients: [mockCustomEgg, mockApple, mockEmpanada, mockBurger],
      recipes: [],
      recipeFoods: [],
      t: dictionaries.en,
      setIsSettingsOpen: vi.fn(),
      userSettings: {
        ai_settings: { provider: 'qozara-intelligence' }
      },
      logBatchFoodItems: logBatchFoodItemsMock,
      addRecipe: addRecipeMock,
      db: null
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('parses multiple foods with AI, displays composite recipe proposal, saves recipe and logs single composite entry', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'log_meal',
      arguments: {
        items: [
          { foodQuery: 'huevo revuelto', quantity: 2, unit: 'unit' },
          { foodQuery: 'manzana roja', quantity: 1, unit: 'unit' }
        ]
      }
    });

    render(<FoodLogger onSelectIngredient={onSelectMock} />);

    // Type into unified search bar
    const searchInput = screen.getByPlaceholderText(dictionaries.en.search.unifiedPlaceholder);
    fireEvent.change(searchInput, { target: { value: 'Desayuné 2 huevos revueltos y una manzana roja' } });

    // Submit via inline Spark submit button (#btn-smart-resolve)
    const smartResolveButton = screen.getByRole('button', { name: new RegExp(dictionaries.en.search.parseButton, 'i') });
    fireEvent.click(smartResolveButton);

    // Wait for the Batch Review Modal to open
    await waitFor(() => {
      expect(screen.getByText('Review Parsed Meal')).toBeDefined();
    });

    // Check detected meal text in modal heading
    expect(screen.getByRole('heading', { name: 'Desayuné 2 huevos revueltos y una manzana roja' })).toBeDefined();

    // Verify both ingredients appear in the review list
    expect(screen.getByText('Huevo Revuelto')).toBeDefined();
    expect(screen.getByText('Manzana Roja')).toBeDefined();

    // Verify composite recipe proposal banner is shown
    expect(screen.getByText(dictionaries.en.ai.autoSavedRecipeBadge)).toBeDefined();

    // Verify Log All button displays 2 items
    const logAllButton = screen.getByRole('button', { name: /Log 2 Items to Diary/i });
    expect(logAllButton).toBeDefined();

    // Click Log All button
    fireEvent.click(logAllButton);

    await waitFor(() => {
      expect(addRecipeMock).toHaveBeenCalledTimes(1);
      expect(logBatchFoodItemsMock).toHaveBeenCalledTimes(1);
    });

    // Verify recipe was saved to library
    const savedRecipe = addRecipeMock.mock.calls[0][0];
    expect(savedRecipe.name).toBe('Huevo Revuelto con Manzana Roja');

    // Verify call arguments: single entry referencing composite recipe
    const [loggedItems, loggedMealType] = logBatchFoodItemsMock.mock.calls[0];
    expect(loggedMealType).toBe('meal_breakfast');
    expect(loggedItems).toHaveLength(1);
    expect(loggedItems[0].food.name).toBe('Huevo Revuelto con Manzana Roja');
    expect(loggedItems[0].food.id).toBe(savedRecipe.id);
    expect(loggedItems[0].portionName).toBe('Whole recipe');
    expect(loggedItems[0].quantity).toBe(1);
  });

  it('allows removing an item from the batch so it logs as a single atomic food without creating a recipe', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'log_meal',
      arguments: {
        items: [
          { foodQuery: 'huevo revuelto', quantity: 2, unit: 'unit' },
          { foodQuery: 'manzana roja', quantity: 1, unit: 'unit' }
        ]
      }
    });

    render(<FoodLogger onSelectIngredient={onSelectMock} />);

    const searchInput = screen.getByPlaceholderText(dictionaries.en.search.unifiedPlaceholder);
    fireEvent.change(searchInput, {
      target: { value: 'Cené 2 huevos y una manzana' }
    });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(dictionaries.en.search.parseButton, 'i') }));

    await waitFor(() => {
      expect(screen.getByText('Review Parsed Meal')).toBeDefined();
    });

    // Remove the apple
    const deleteButtons = screen.getAllByLabelText('Remove item from meal');
    expect(deleteButtons).toHaveLength(2);
    fireEvent.click(deleteButtons[1]); // remove apple

    // Manzana Roja should be removed from view
    await waitFor(() => {
      expect(screen.queryByText('Manzana Roja')).toBeNull();
    });

    // Button should now say "Log to Diary" (single item)
    const logButton = screen.getByRole('button', { name: /Log to Diary/i });
    expect(logButton).toBeDefined();

    // Composite recipe banner should NOT be present when only 1 item remains
    expect(screen.queryByText(dictionaries.en.ai.autoSavedRecipeBadge)).toBeNull();

    fireEvent.click(logButton);

    await waitFor(() => {
      expect(logBatchFoodItemsMock).toHaveBeenCalledTimes(1);
    });

    // Should NOT save a recipe for single item
    expect(addRecipeMock).not.toHaveBeenCalled();

    const [loggedItems, loggedMealType] = logBatchFoodItemsMock.mock.calls[0];
    expect(loggedMealType).toBe('meal_dinner');
    expect(loggedItems).toHaveLength(1);
    expect(loggedItems[0].food.name).toBe('Huevo Revuelto');
    expect(loggedItems[0].quantity).toBe(2);
  });

  it('displays unmatched badge and search helper when item is not in catalog', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'log_meal',
      arguments: {
        items: [
          { foodQuery: 'comida extraterrestre xyz', quantity: 1, unit: 'unit' }
        ]
      }
    });

    render(<FoodLogger onSelectIngredient={onSelectMock} />);

    fireEvent.change(screen.getByPlaceholderText(dictionaries.en.search.unifiedPlaceholder), {
      target: { value: 'comida extraterrestre xyz' }
    });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(dictionaries.en.search.parseButton, 'i') }));

    await waitFor(() => {
      expect(screen.getByText('Review Parsed Meal')).toBeDefined();
    });

    // Should indicate unmatched status
    expect(screen.getByText('Unmatched')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'comida extraterrestre xyz' })).toBeDefined();
    expect(screen.getByText('Food not found in catalog')).toBeDefined();
  });

  it('successfully processes "desayuné dos empanadas" with proxy food_items and food_name format', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'log_meal',
      arguments: {
        meal_type: 'breakfast',
        food_items: [
          { food_name: 'empanada', quantity: 2, unit: 'unit' }
        ]
      }
    });

    render(<FoodLogger onSelectIngredient={onSelectMock} />);

    fireEvent.change(screen.getByPlaceholderText(dictionaries.en.search.unifiedPlaceholder), {
      target: { value: 'desayuné dos empanadas' }
    });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(dictionaries.en.search.parseButton, 'i') }));

    // Wait for the Batch Review Modal to open
    await waitFor(() => {
      expect(screen.getByText('Review Parsed Meal')).toBeDefined();
    });

    // Check that heading shows the raw input
    expect(screen.getByRole('heading', { name: 'desayuné dos empanadas' })).toBeDefined();

    // Verify quantity input is 2
    const quantityInput = screen.getByLabelText('Quantity') as HTMLInputElement;
    expect(quantityInput.value).toBe('2');

    // Verify change food match button exists
    const changeBtn = screen.getByLabelText('Change food match');
    expect(changeBtn).toBeDefined();
  });

  it('processes "comí dos hamburguesas de carne en la cena" with meal_dinner and 2 units', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'log_meal',
      arguments: {
        meal_type: 'dinner',
        food_items: [
          { food_name: 'hamburguesa', quantity: 2, unit: 'unit' }
        ]
      }
    });

    render(<FoodLogger onSelectIngredient={onSelectMock} />);

    fireEvent.change(screen.getByPlaceholderText(dictionaries.en.search.unifiedPlaceholder), {
      target: { value: 'comí dos hamburguesas de carne en la cena' }
    });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(dictionaries.en.search.parseButton, 'i') }));

    // Wait for the Batch Review Modal to open
    await waitFor(() => {
      expect(screen.getByText('Review Parsed Meal')).toBeDefined();
    });

    // Check raw query heading
    expect(screen.getByRole('heading', { name: 'comí dos hamburguesas de carne en la cena' })).toBeDefined();

    // Verify quantity input is 2
    const quantityInput = screen.getByLabelText('Quantity') as HTMLInputElement;
    expect(quantityInput.value).toBe('2');

    // Click Log button
    const logButton = screen.getByRole('button', { name: /Log to Diary/i });
    fireEvent.click(logButton);

    await waitFor(() => {
      expect(logBatchFoodItemsMock).toHaveBeenCalledTimes(1);
    });

    const [loggedItems, loggedMealType] = logBatchFoodItemsMock.mock.calls[0];
    expect(loggedMealType).toBe('meal_dinner');
    expect(loggedItems[0].food.name).toBe('Hamburguesa');
    expect(loggedItems[0].quantity).toBe(2);
  });

  it('displays quota notice with settings link when proxy returns RATE_LIMIT_EXCEEDED error', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'text',
      error: 'RATE_LIMIT_EXCEEDED'
    });

    const setIsSettingsOpenMock = vi.fn();
    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      ingredients: [mockCustomEgg, mockApple, mockEmpanada, mockBurger],
      recipes: [],
      recipeFoods: [],
      t: dictionaries.en,
      setIsSettingsOpen: setIsSettingsOpenMock,
      userSettings: {
        ai_settings: { provider: 'qozara-intelligence' }
      },
      logBatchFoodItems: logBatchFoodItemsMock,
      addRecipe: addRecipeMock,
      db: null
    } as any);

    render(<FoodLogger onSelectIngredient={onSelectMock} />);

    fireEvent.change(screen.getByPlaceholderText(dictionaries.en.search.unifiedPlaceholder), {
      target: { value: 'comí dos hamburguesas de carne en la cena' }
    });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(dictionaries.en.search.parseButton, 'i') }));

    await waitFor(() => {
      expect(screen.getByText(dictionaries.en.ai.quotaNotice)).toBeDefined();
    });

    // Verify button to open settings exists and triggers setIsSettingsOpen
    const settingsBtn = screen.getByRole('button', { name: new RegExp(dictionaries.en.ai.openSettingsBtn, 'i') });
    expect(settingsBtn).toBeDefined();
    fireEvent.click(settingsBtn);
    expect(setIsSettingsOpenMock).toHaveBeenCalledWith(true);
  });

  it('displays ai disabled notice with settings link when AI provider returns AI is disabled error', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'text',
      error: 'AI is disabled'
    });

    const setIsSettingsOpenMock = vi.fn();
    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      ingredients: [mockCustomEgg, mockApple, mockEmpanada, mockBurger],
      recipes: [],
      recipeFoods: [],
      t: dictionaries.en,
      setIsSettingsOpen: setIsSettingsOpenMock,
      userSettings: {
        ai_settings: { provider: 'disabled' }
      },
      logBatchFoodItems: logBatchFoodItemsMock,
      addRecipe: addRecipeMock,
      db: null
    } as any);

    render(<FoodLogger onSelectIngredient={onSelectMock} />);

    fireEvent.change(screen.getByPlaceholderText(dictionaries.en.search.unifiedPlaceholder), {
      target: { value: 'comí dos hamburguesas' }
    });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(dictionaries.en.search.parseButton, 'i') }));

    await waitFor(() => {
      expect(screen.getByText(dictionaries.en.ai.aiDisabled)).toBeDefined();
    });

    const settingsBtn = screen.getByRole('button', { name: new RegExp(dictionaries.en.ai.openSettingsBtn, 'i') });
    expect(settingsBtn).toBeDefined();
    fireEvent.click(settingsBtn);
    expect(setIsSettingsOpenMock).toHaveBeenCalledWith(true);
  });

  it('correctly passes Google OAuth accessToken from active_cloud_provider credentials to AI provider', async () => {
    let capturedGetAuthToken: any = null;
    vi.spyOn(AiProviderFactory, 'createProvider').mockImplementation(async (_config: any, getAuthToken: any) => {
      capturedGetAuthToken = getAuthToken;
      return {
        id: 'mock-provider',
        mode: 'cloud',
        chat: mockChat.mockResolvedValueOnce({
          type: 'tool_call',
          tool: 'log_meal',
          arguments: {
            items: [{ foodQuery: 'huevo revuelto', quantity: 1, unit: 'unit' }]
          }
        }),
        checkAvailability: vi.fn().mockResolvedValue(true),
        getSetupMessage: vi.fn().mockReturnValue(null)
      } as any;
    });

    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      ingredients: [mockCustomEgg],
      recipes: [],
      recipeFoods: [],
      t: dictionaries.en,
      setIsSettingsOpen: vi.fn(),
      userSettings: {
        active_cloud_provider: {
          id: 'google-drive-sheets',
          credentials: {
            accessToken: 'ya29.google-test-oauth-token',
            expiresAt: Date.now() + 3600000
          }
        },
        ai_settings: { provider: 'qozara-intelligence' }
      },
      logBatchFoodItems: logBatchFoodItemsMock,
      addRecipe: addRecipeMock,
      db: null
    } as any);

    render(<FoodLogger onSelectIngredient={onSelectMock} />);

    fireEvent.change(screen.getByPlaceholderText(dictionaries.en.search.unifiedPlaceholder), {
      target: { value: '1 huevo' }
    });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(dictionaries.en.search.parseButton, 'i') }));

    await waitFor(() => {
      expect(capturedGetAuthToken).not.toBeNull();
    });

    const token = await capturedGetAuthToken();
    expect(token).toBe('ya29.google-test-oauth-token');
  });

  it('displays token expired notice with settings link when Google token is expired or unauthorized', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'text',
      error: 'Invalid or expired Google token'
    });

    const setIsSettingsOpenMock = vi.fn();
    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      ingredients: [mockCustomEgg],
      recipes: [],
      recipeFoods: [],
      t: dictionaries.en,
      setIsSettingsOpen: setIsSettingsOpenMock,
      userSettings: {
        active_cloud_provider: {
          id: 'google-drive-sheets',
          credentials: { accessToken: 'expired-token' }
        },
        ai_settings: { provider: 'qozara-intelligence' }
      },
      logBatchFoodItems: logBatchFoodItemsMock,
      addRecipe: addRecipeMock,
      db: null
    } as any);

    render(<FoodLogger onSelectIngredient={onSelectMock} />);

    fireEvent.change(screen.getByPlaceholderText(dictionaries.en.search.unifiedPlaceholder), {
      target: { value: '1 huevo' }
    });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(dictionaries.en.search.parseButton, 'i') }));

    await waitFor(() => {
      expect(screen.getByText(dictionaries.en.ai.tokenExpiredNotice)).toBeDefined();
    });

    const settingsBtn = screen.getByRole('button', { name: new RegExp(dictionaries.en.ai.openSettingsBtn, 'i') });
    expect(settingsBtn).toBeDefined();
    fireEvent.click(settingsBtn);
    expect(setIsSettingsOpenMock).toHaveBeenCalledWith(true);
  });

  // --- NEW TESTS FOR PHASE 4 ---

  it('typing in unified search displays matching local items and Find more footer button without logging immediately, and clicking Find more triggers AI resolution', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'log_meal',
      arguments: {
        items: [
          { foodQuery: 'huevo revuelto', quantity: 1, unit: 'unit' }
        ]
      }
    });

    render(<FoodLogger onSelectIngredient={onSelectMock} />);

    const searchInput = screen.getByPlaceholderText(dictionaries.en.search.unifiedPlaceholder);
    fireEvent.change(searchInput, { target: { value: 'huevo' } });

    // Wait for debounced search to populate matching items
    await waitFor(() => {
      expect(screen.getByText('Huevo Revuelto')).toBeDefined();
    });

    // Find more footer button should be rendered at the bottom with title containing query
    const findMoreBtn = document.getElementById('btn-find-more-ai');
    expect(findMoreBtn).not.toBeNull();
    expect(screen.getByText(dictionaries.en.search.findMoreSubtitle)).toBeDefined();

    // Verify onSelectIngredient has NOT been called automatically (no premature logging)
    expect(onSelectMock).not.toHaveBeenCalled();

    // Clicking "Find more" triggers AI resolution
    fireEvent.click(findMoreBtn!);

    await waitFor(() => {
      expect(screen.getByText('Review Parsed Meal')).toBeDefined();
    });

    expect(screen.getByRole('heading', { name: 'huevo' })).toBeDefined();
  });

  it('confirming a multi-item composite dish when not a duplicate calls addRecipe once and logs a single composite entry', async () => {
    const mockMilanesa: BaseIngredient = {
      id: 'cust-milanesa',
      name: 'Milanesa',
      source: 'custom',
      lang: 'es',
      calories_100g: 215,
      protein_100g: 20,
      carbs_100g: 10,
      fats_100g: 11
    };

    const mockPure: BaseIngredient = {
      id: 'cust-pure',
      name: 'Pure de Papas',
      source: 'custom',
      lang: 'es',
      calories_100g: 85,
      protein_100g: 2,
      carbs_100g: 15,
      fats_100g: 2
    };

    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      ingredients: [mockMilanesa, mockPure],
      recipes: [],
      recipeFoods: [],
      t: dictionaries.en,
      setIsSettingsOpen: vi.fn(),
      userSettings: {
        ai_settings: { provider: 'qozara-intelligence' }
      },
      logBatchFoodItems: logBatchFoodItemsMock,
      addRecipe: addRecipeMock,
      db: null
    } as any);

    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'log_meal',
      arguments: {
        composite_dish_name: 'Milanesa con puré de papas',
        food_items: [
          { food_name: 'milanesa', quantity: 1, unit: 'unit' },
          { food_name: 'pure de papas', quantity: 1, unit: 'portion' }
        ]
      }
    });

    render(<FoodLogger onSelectIngredient={onSelectMock} />);

    const searchInput = screen.getByPlaceholderText(dictionaries.en.search.unifiedPlaceholder);
    fireEvent.change(searchInput, { target: { value: 'milanesa con pure de papas' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(dictionaries.en.search.parseButton, 'i') }));

    await waitFor(() => {
      expect(screen.getByText('Review Parsed Meal')).toBeDefined();
    });

    // Check recipe name and badge
    expect(screen.getByText('Milanesa con puré de papas')).toBeDefined();
    expect(screen.getByText(dictionaries.en.ai.autoSavedRecipeBadge)).toBeDefined();

    // Confirm log
    const logButton = screen.getByRole('button', { name: /Log 2 Items to Diary/i });
    fireEvent.click(logButton);

    await waitFor(() => {
      expect(addRecipeMock).toHaveBeenCalledTimes(1);
      expect(logBatchFoodItemsMock).toHaveBeenCalledTimes(1);
    });

    const savedRecipe = addRecipeMock.mock.calls[0][0];
    expect(savedRecipe.name).toBe('Milanesa con puré de papas');
    expect(savedRecipe.ingredients).toHaveLength(2);

    const [loggedItems] = logBatchFoodItemsMock.mock.calls[0];
    expect(loggedItems).toHaveLength(1);
    expect(loggedItems[0].food.id).toBe(savedRecipe.id);
    expect(loggedItems[0].portionName).toBe('Whole recipe');
    expect(loggedItems[0].quantity).toBe(1);
  });

  it('confirming an already-existing equivalent composite dish does NOT call addRecipe and logs a single entry referencing the existing recipe id', async () => {
    const mockMilanesa: BaseIngredient = {
      id: 'cust-milanesa',
      name: 'Milanesa',
      source: 'custom',
      lang: 'es',
      calories_100g: 215,
      protein_100g: 20,
      carbs_100g: 10,
      fats_100g: 11
    };

    const mockPure: BaseIngredient = {
      id: 'cust-pure',
      name: 'Pure de Papas',
      source: 'custom',
      lang: 'es',
      calories_100g: 85,
      protein_100g: 2,
      carbs_100g: 15,
      fats_100g: 2
    };

    const existingRecipe: Recipe = {
      id: 'rec-existing-milanesa-pure',
      name: 'Milanesa con puré de papas',
      ingredients: [
        {
          food_id: 'cust-milanesa',
          name: 'Milanesa',
          weight_g: 100,
          quantity: 1,
          portion_name: '1 unidad',
          calories_100g: 215,
          protein_100g: 20,
          carbs_100g: 10,
          fats_100g: 11
        },
        {
          food_id: 'cust-pure',
          name: 'Pure de Papas',
          weight_g: 150,
          quantity: 1,
          portion_name: '1 porción',
          calories_100g: 85,
          protein_100g: 2,
          carbs_100g: 15,
          fats_100g: 2
        }
      ],
      yield_factor: 1.0,
      updatedAt: Date.now()
    };

    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      ingredients: [mockMilanesa, mockPure],
      recipes: [existingRecipe],
      recipeFoods: [],
      t: dictionaries.en,
      setIsSettingsOpen: vi.fn(),
      userSettings: {
        ai_settings: { provider: 'qozara-intelligence' }
      },
      logBatchFoodItems: logBatchFoodItemsMock,
      addRecipe: addRecipeMock,
      db: null
    } as any);

    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'log_meal',
      arguments: {
        composite_dish_name: 'Milanesa con puré de papas',
        food_items: [
          { food_name: 'milanesa', quantity: 1, unit: 'unit' },
          { food_name: 'pure de papas', quantity: 1, unit: 'portion' }
        ]
      }
    });

    render(<FoodLogger onSelectIngredient={onSelectMock} />);

    const searchInput = screen.getByPlaceholderText(dictionaries.en.search.unifiedPlaceholder);
    fireEvent.change(searchInput, { target: { value: 'milanesa con pure de papas' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(dictionaries.en.search.parseButton, 'i') }));

    await waitFor(() => {
      expect(screen.getByText('Review Parsed Meal')).toBeDefined();
    });

    // Check that existing recipe matched badge is displayed
    expect(screen.getByText(dictionaries.en.ai.existingRecipeMatchedBadge)).toBeDefined();

    // Confirm log
    const logButton = screen.getByRole('button', { name: /Log 2 Items to Diary/i });
    fireEvent.click(logButton);

    await waitFor(() => {
      expect(logBatchFoodItemsMock).toHaveBeenCalledTimes(1);
    });

    // addRecipe MUST NOT be called because it's an existing duplicate
    expect(addRecipeMock).not.toHaveBeenCalled();

    // Logged item references the existing recipe's id
    const [loggedItems] = logBatchFoodItemsMock.mock.calls[0];
    expect(loggedItems).toHaveLength(1);
    expect(loggedItems[0].food.id).toBe('rec-existing-milanesa-pure');
    expect(loggedItems[0].portionName).toBe('Whole recipe');
    expect(loggedItems[0].quantity).toBe(1);
  });
});
