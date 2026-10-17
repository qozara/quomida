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
import type { BaseIngredient, RecipeFoodItem } from '@quomida/domain-core';

describe('FoodLogger - AI Multi-Ingredient Natural Log & Batch Review', () => {
  let logBatchFoodItemsMock: any;
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
    onSelectMock = vi.fn();

    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      ingredients: [mockCustomEgg, mockApple],
      recipes: [],
      recipeFoods: [],
      t: dictionaries.en,
      setIsSettingsOpen: vi.fn(),
      userSettings: {
        ai_settings: { provider: 'qozara-intelligence' }
      },
      logBatchFoodItems: logBatchFoodItemsMock,
      db: null
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('switches to AI tab, parses multiple foods with AI, and opens batch review modal', async () => {
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

    // Switch to AI Natural Log tab
    const aiTabButton = screen.getByRole('button', { name: new RegExp(dictionaries.en.search.tabAi, 'i') });
    fireEvent.click(aiTabButton);

    const textarea = screen.getByPlaceholderText(dictionaries.en.search.aiPlaceholder);
    fireEvent.change(textarea, { target: { value: 'Desayuné 2 huevos revueltos y una manzana roja' } });

    // Submit AI form
    const parseButton = screen.getByRole('button', { name: new RegExp(dictionaries.en.search.parseButton, 'i') });
    fireEvent.click(parseButton);

    // Wait for the Batch Review Modal to open
    await waitFor(() => {
      expect(screen.getByText('Review Parsed Meal')).toBeDefined();
    });

    // Check detected meal text in modal heading
    expect(screen.getByRole('heading', { name: 'Desayuné 2 huevos revueltos y una manzana roja' })).toBeDefined();

    // Verify both ingredients appear in the review list
    expect(screen.getByText('Huevo Revuelto')).toBeDefined();
    expect(screen.getByText('Manzana Roja')).toBeDefined();

    // Verify Log All button displays 2 items
    const logAllButton = screen.getByRole('button', { name: /Log 2 Items to Diary/i });
    expect(logAllButton).toBeDefined();

    // Click Log All button
    fireEvent.click(logAllButton);

    await waitFor(() => {
      expect(logBatchFoodItemsMock).toHaveBeenCalledTimes(1);
    });

    // Verify call arguments
    const [loggedItems, loggedMealType] = logBatchFoodItemsMock.mock.calls[0];
    expect(loggedMealType).toBe('meal_breakfast');
    expect(loggedItems).toHaveLength(2);
    expect(loggedItems[0].food.name).toBe('Huevo Revuelto');
    expect(loggedItems[0].quantity).toBe(2);
    expect(loggedItems[1].food.name).toBe('Manzana Roja');
    expect(loggedItems[1].quantity).toBe(1);
  });

  it('allows removing an item from the batch and updating quantity before logging', async () => {
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

    // Switch to AI tab and submit
    fireEvent.click(screen.getByRole('button', { name: new RegExp(dictionaries.en.search.tabAi, 'i') }));
    fireEvent.change(screen.getByPlaceholderText(dictionaries.en.search.aiPlaceholder), {
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

    fireEvent.click(logButton);

    await waitFor(() => {
      expect(logBatchFoodItemsMock).toHaveBeenCalledTimes(1);
    });

    const [loggedItems, loggedMealType] = logBatchFoodItemsMock.mock.calls[0];
    expect(loggedMealType).toBe('meal_dinner');
    expect(loggedItems).toHaveLength(1);
    expect(loggedItems[0].food.name).toBe('Huevo Revuelto');
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

    fireEvent.click(screen.getByRole('button', { name: new RegExp(dictionaries.en.search.tabAi, 'i') }));
    fireEvent.change(screen.getByPlaceholderText(dictionaries.en.search.aiPlaceholder), {
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
});
