/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { BatchAiMealReviewModal } from '../src/components/BatchAiMealReviewModal.js';
import { SettingsModal } from '../src/components/SettingsModal.js';
import * as AppContext from '../src/context/AppContext.js';
import { dictionaries } from '@quomida/i18n-locales';
import type { ResolvedBatchMeal } from '@quomida/domain-core';

describe('AI Recipe Decomposition & Master Toggle UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders AI recipe decomposition banner in BatchAiMealReviewModal when isAiDecomposed is true', () => {
    const mockBatchMeal: ResolvedBatchMeal = {
      rawInput: 'cené 1 plato de locro',
      detectedMealType: 'meal_dinner',
      isAiDecomposed: true,
      sourceDishName: 'locro',
      compositeDishName: 'Locro criollo',
      defaultLoggingMode: 'recipe',
      items: [
        {
          id: 'item-1',
          rawQuery: 'maíz blanco',
          food: {
            kind: 'ingredient',
            id: 'ing-corn',
            name: 'Maíz blanco',
            source: 'system',
            lang: 'es',
            calories_100g: 110,
            protein_100g: 3,
            carbs_100g: 22,
            fats_100g: 1.5,
          },
          quantity: 100,
          selectedPortionName: 'g',
          availablePortions: [],
          calculatedWeightGrams: 100,
          macros: { calories: 110, protein: 3, carbs: 22, fats: 1.5 },
          unmatched: false,
          mealType: 'meal_dinner',
          isAiDecomposed: true,
        },
        {
          id: 'item-2',
          rawQuery: 'carne vacuna',
          food: {
            kind: 'ingredient',
            id: 'ing-beef',
            name: 'Carne vacuna',
            source: 'system',
            lang: 'es',
            calories_100g: 250,
            protein_100g: 26,
            carbs_100g: 0,
            fats_100g: 17,
          },
          quantity: 150,
          selectedPortionName: 'g',
          availablePortions: [],
          calculatedWeightGrams: 150,
          macros: { calories: 375, protein: 39, carbs: 0, fats: 25.5 },
          unmatched: false,
          mealType: 'meal_dinner',
          isAiDecomposed: true,
        },
      ],
      totalMacros: { calories: 485, protein: 42, carbs: 22, fats: 27 },
      synthesizedRecipe: {
        recipe: {
          id: 'rec-locro',
          name: 'Locro criollo',
          ingredients: [],
          yield_factor: 1,
        },
        foodItem: {
          id: 'rec-locro',
          name: 'Locro criollo',
          kind: 'recipe',
          source: 'custom',
          raw_weight_g: 250,
          cooked_weight_g: 250,
          yield_factor: 1,
          total_macros: { calories: 485, protein: 42, carbs: 22, fats: 27 },
          calories_100g: 194,
          protein_100g: 16.8,
          carbs_100g: 8.8,
          fats_100g: 10.8,
          recipe: {
            id: 'rec-locro',
            name: 'Locro criollo',
            ingredients: [],
            yield_factor: 1,
          },
        },
        isExistingDuplicate: false,
      },
    };

    const mockUseApp = {
      t: dictionaries.es,
      locale: 'es',
      recipes: [],
      recipeFoods: [],
      ingredients: [],
      userSettings: {
        id: 'global_settings',
        locale: 'es',
        theme: 'dark',
        daily_calorie_target: 2000,
        custom_macros: { protein: 150, carbs: 200, fats: 65 },
        ai_settings: { enabled: true, provider: 'qozara-intelligence' },
      },
      logBatchFoodItems: vi.fn(),
      addRecipe: vi.fn(),
    };

    vi.spyOn(AppContext, 'useApp').mockReturnValue(mockUseApp as any);

    render(
      <BatchAiMealReviewModal
        isOpen={true}
        batchMeal={mockBatchMeal}
        onClose={vi.fn()}
        onLoggedSuccess={vi.fn()}
      />
    );

    // AI suggestion banner should be visible
    expect(screen.getByText(dictionaries.es.ai.decomposedRecipeBadge)).toBeDefined();
    expect(screen.getByText('locro')).toBeDefined();
    expect(screen.getByText(dictionaries.es.ai.decomposedRecipeNotice)).toBeDefined();

    // Decomposed items should be present
    expect(screen.getByText('Maíz blanco')).toBeDefined();
    expect(screen.getByText('Carne vacuna')).toBeDefined();
  });

  it('renders master AI toggle in SettingsModal and calls updateUserSettings', async () => {
    const updateUserSettingsMock = vi.fn().mockResolvedValue(true);
    const mockUseApp = {
      isSettingsOpen: true,
      setIsSettingsOpen: vi.fn(),
      t: dictionaries.es,
      locale: 'es',
      userSettings: {
        id: 'global_settings',
        locale: 'es',
        theme: 'dark',
        daily_calorie_target: 2000,
        custom_macros: { protein: 150, carbs: 200, fats: 65 },
        ai_settings: { enabled: true, provider: 'qozara-intelligence' },
      },
      updateUserSettings: updateUserSettingsMock,
      activeProvider: null,
      syncState: {},
    };

    vi.spyOn(AppContext, 'useApp').mockReturnValue(mockUseApp as any);

    render(<SettingsModal />);

    // Open AI accordion
    const aiAccordionHeader = screen.getByTestId('accordion-header-ai');
    fireEvent.click(aiAccordionHeader);

    // Toggle switch should be present and checked
    const toggle = screen.getByTestId('toggle-ai-enabled');
    expect(toggle).toBeDefined();
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    // Click toggle to turn off AI
    fireEvent.click(toggle);

    expect(updateUserSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ai_settings: expect.objectContaining({
          enabled: false,
        }),
      })
    );
  });

  describe('Force AI Decomposition Action in BatchAiMealReviewModal', () => {
    const singleMatchedBatchMeal: ResolvedBatchMeal = {
      rawInput: 'canelones de verdura',
      detectedMealType: 'meal_lunch',
      isAiDecomposed: false,
      items: [
        {
          id: 'item-canelones',
          rawQuery: 'canelones de verdura',
          food: {
            kind: 'ingredient',
            id: 'ing-salvado-canela',
            name: 'Salvado canela',
            source: 'system',
            lang: 'es',
            calories_100g: 220,
            protein_100g: 10,
            carbs_100g: 40,
            fats_100g: 4
          },
          quantity: 1,
          selectedPortionName: '1 unidad',
          availablePortions: [
            { id: 'p1', base_food_id: 'ing-salvado-canela', name: '1 unidad', equivalent_weight_g: 100, source: 'system', tag: 'Generic' }
          ],
          calculatedWeightGrams: 100,
          macros: { calories: 220, protein: 10, carbs: 40, fats: 4 },
          unmatched: false,
          mealType: 'meal_lunch'
        }
      ],
      totalMacros: { calories: 220, protein: 10, carbs: 40, fats: 4 }
    };

    it('renders Force AI button on item row and drawer when AI is enabled and online', () => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

      const mockUseApp = {
        t: dictionaries.es,
        locale: 'es',
        recipes: [],
        recipeFoods: [],
        ingredients: [],
        userSettings: {
          ai_settings: { enabled: true, provider: 'qozara-intelligence' }
        },
        logBatchFoodItems: vi.fn(),
        addRecipe: vi.fn()
      };
      vi.spyOn(AppContext, 'useApp').mockReturnValue(mockUseApp as any);

      render(
        <BatchAiMealReviewModal
          isOpen={true}
          batchMeal={singleMatchedBatchMeal}
          onClose={vi.fn()}
        />
      );

      // Force AI button on item row should be present
      const forceBtn = screen.getByTestId('btn-force-decompose-item-canelones');
      expect(forceBtn).toBeDefined();

      // Open substitute drawer
      const searchBtn = screen.getByLabelText(dictionaries.es.ai.changeItem);
      fireEvent.click(searchBtn);

      // Drawer Force AI button should be present
      expect(screen.getByTestId('btn-drawer-force-decompose-item-canelones')).toBeDefined();
      expect(screen.getByText(dictionaries.es.ai.forceDecomposeHint)).toBeDefined();
    });

    it('does NOT render Force AI button when AI is disabled in userSettings', () => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

      const mockUseApp = {
        t: dictionaries.es,
        locale: 'es',
        recipes: [],
        recipeFoods: [],
        ingredients: [],
        userSettings: {
          ai_settings: { enabled: false }
        },
        logBatchFoodItems: vi.fn(),
        addRecipe: vi.fn()
      };
      vi.spyOn(AppContext, 'useApp').mockReturnValue(mockUseApp as any);

      render(
        <BatchAiMealReviewModal
          isOpen={true}
          batchMeal={singleMatchedBatchMeal}
          onClose={vi.fn()}
        />
      );

      expect(screen.queryByTestId('btn-force-decompose-item-canelones')).toBeNull();
    });

    it('does NOT render Force AI button when browser is offline (navigator.onLine = false)', () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      const mockUseApp = {
        t: dictionaries.es,
        locale: 'es',
        recipes: [],
        recipeFoods: [],
        ingredients: [],
        userSettings: {
          ai_settings: { enabled: true }
        },
        logBatchFoodItems: vi.fn(),
        addRecipe: vi.fn()
      };
      vi.spyOn(AppContext, 'useApp').mockReturnValue(mockUseApp as any);

      render(
        <BatchAiMealReviewModal
          isOpen={true}
          batchMeal={singleMatchedBatchMeal}
          onClose={vi.fn()}
        />
      );

      expect(screen.queryByTestId('btn-force-decompose-item-canelones')).toBeNull();
    });

    it('calls decomposer.decomposeDish and replaces the item with decomposed ingredients on click', async () => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

      const mockDecomposer = {
        decomposeDish: vi.fn().mockResolvedValue({
          dishName: 'Canelones de Verdura',
          ingredients: [
            { food_name: 'Espinaca', quantity: 150, unit: 'g' },
            { food_name: 'Ricotta', quantity: 100, unit: 'g' }
          ]
        })
      };

      const mockUseApp = {
        t: dictionaries.es,
        locale: 'es',
        recipes: [],
        recipeFoods: [],
        ingredients: [
          {
            id: 'ing-espinaca',
            name: 'Espinaca',
            calories_100g: 23,
            protein_100g: 2.9,
            carbs_100g: 3.6,
            fats_100g: 0.4
          },
          {
            id: 'ing-ricotta',
            name: 'Ricotta',
            calories_100g: 174,
            protein_100g: 11,
            carbs_100g: 3,
            fats_100g: 13
          }
        ],
        userSettings: {
          ai_settings: { enabled: true }
        },
        logBatchFoodItems: vi.fn(),
        addRecipe: vi.fn()
      };
      vi.spyOn(AppContext, 'useApp').mockReturnValue(mockUseApp as any);

      render(
        <BatchAiMealReviewModal
          isOpen={true}
          batchMeal={singleMatchedBatchMeal}
          onClose={vi.fn()}
          decomposer={mockDecomposer as any}
        />
      );

      const forceBtn = screen.getByTestId('btn-force-decompose-item-canelones');
      fireEvent.click(forceBtn);

      expect(mockDecomposer.decomposeDish).toHaveBeenCalledWith('canelones de verdura', '1 1 unidad', 'es');

      // The original item should be replaced with Espinaca and Ricotta
      expect(await screen.findByText('Espinaca')).toBeDefined();
      expect(await screen.findByText('Ricotta')).toBeDefined();
      expect(screen.queryByText('Salvado canela')).toBeNull();
    });
  });
});
