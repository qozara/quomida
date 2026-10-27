/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PortionBottomSheet } from '../src/components/PortionBottomSheet.js';
import * as AppContext from '../src/context/AppContext.js';
import { dictionaries } from '@quomida/i18n-locales';

describe('PortionBottomSheet - Custom Portion Resolution & Selection', () => {
  let logFoodItemMock: any;
  let onCloseMock: any;

  beforeEach(() => {
    logFoodItemMock = vi.fn().mockResolvedValue(undefined);
    onCloseMock = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('automatically selects the custom portion and sets quantity to 1 when ingredient has portions', async () => {
    const mockDb = {
      portions: {
        find: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([
            {
              id: 'port-custom_1-0',
              base_food_id: 'custom_chicken',
              name: 'Pechuga entera',
              equivalent_weight_g: 200,
              source: 'custom',
              updatedAt: 1000,
              toJSON: () => ({
                id: 'port-custom_1-0',
                base_food_id: 'custom_chicken',
                name: 'Pechuga entera',
                equivalent_weight_g: 200,
                source: 'custom',
                updatedAt: 1000
              })
            }
          ])
        })
      }
    };

    const setSelectedDateMock = vi.fn();
    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      db: mockDb as any,
      logFoodItem: logFoodItemMock,
      selectedDate: '2026-10-20',
      setSelectedDate: setSelectedDateMock,
      locale: 'es',
      t: dictionaries.es
    } as any);

    const testIngredient = {
      id: 'custom_chicken',
      name: 'Pollo Casero',
      source: 'custom' as const,
      lang: 'es',
      calories_100g: 165,
      protein_100g: 31,
      carbs_100g: 0,
      fats_100g: 3.6
    };

    render(
      <PortionBottomSheet
        ingredient={testIngredient}
        defaultMealType="meal_lunch"
        onClose={onCloseMock}
      />
    );

    // Verify DateSelector is rendered at the top of the modal
    const dateSelector = screen.getByTestId('date-selector');
    expect(dateSelector).toBeDefined();

    // Wait for the portion to be resolved and selected
    await waitFor(() => {
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('Pechuga entera');
    });

    // Check quantity input is 1
    const qtyInput = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(qtyInput.value).toBe('1');

    // Click "Registrar en Diario" button
    const logButton = screen.getByText(dictionaries.es.portionModal.logAction);
    fireEvent.click(logButton);

    expect(logFoodItemMock).toHaveBeenCalledWith(
      testIngredient,
      'meal_lunch',
      1,
      'Pechuga entera',
      expect.arrayContaining([
        expect.objectContaining({ name: 'Pechuga entera', equivalent_weight_g: 200 })
      ]),
      '2026-10-20'
    );
    await waitFor(() => {
      expect(onCloseMock).toHaveBeenCalled();
    });
  });

  it('falls back to custom grams (100g) when ingredient has no custom or catalog portions', async () => {
    const mockDb = {
      portions: {
        find: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([])
        })
      }
    };

    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      db: mockDb as any,
      logFoodItem: logFoodItemMock,
      t: dictionaries.es
    } as any);

    const testIngredient = {
      id: 'custom_plain',
      name: 'Aceite de Oliva',
      source: 'custom' as const,
      lang: 'es',
      calories_100g: 884,
      protein_100g: 0,
      carbs_100g: 0,
      fats_100g: 100
    };

    render(
      <PortionBottomSheet
        ingredient={testIngredient}
        defaultMealType="meal_dinner"
        onClose={onCloseMock}
      />
    );

    await waitFor(() => {
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      const qtyInput = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(select.value).toBe('g');
      expect(qtyInput.value).toBe('100');
    });
  });

  it('renders recipe breakdown collapsible and supports logging recipe with Whole recipe portion', async () => {
    const mockDb = {
      portions: {
        find: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([])
        })
      }
    };

    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      db: mockDb as any,
      logFoodItem: logFoodItemMock,
      t: dictionaries.es
    } as any);

    const testRecipe: any = {
      id: 'recipe_chicken_rice',
      name: 'Pollo con Arroz',
      kind: 'recipe',
      source: 'custom',
      calories_100g: 150,
      protein_100g: 18,
      carbs_100g: 12,
      fats_100g: 3,
      raw_weight_g: 380,
      cooked_weight_g: 400,
      yield_factor: 1.05,
      total_macros: {
        calories: 600,
        protein: 72,
        carbs: 48,
        fats: 12
      },
      recipe: {
        id: 'recipe_chicken_rice',
        name: 'Pollo con Arroz',
        yield_factor: 1.05,
        ingredients: [
          {
            food_id: 'ing_chicken',
            name: 'Pechuga de Pollo',
            weight_g: 200,
            calories_100g: 110,
            protein_100g: 20,
            carbs_100g: 0,
            fats_100g: 2.5
          },
          {
            food_id: 'ing_rice',
            name: 'Arroz Integral',
            weight_g: 180,
            calories_100g: 111,
            protein_100g: 2.2,
            carbs_100g: 23.3,
            fats_100g: 0.8
          }
        ]
      }
    };

    render(
      <PortionBottomSheet
        ingredient={testRecipe}
        defaultMealType="meal_lunch"
        onClose={onCloseMock}
      />
    );

    // Verify recipe badge appears
    expect(screen.getByText('Receta')).toBeDefined();

    // Toggle breakdown
    const breakdownBtn = screen.getByText('Desglose de Ingredientes de la Receta');
    fireEvent.click(breakdownBtn);

    expect(screen.getByText('Pechuga de Pollo')).toBeDefined();
    expect(screen.getByText('Arroz Integral')).toBeDefined();

    // Verify "Whole recipe" (Receta entera) portion is selected by default
    await waitFor(() => {
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('Whole recipe');
    });

    // Click Log
    const logBtn = screen.getByRole('button', { name: /Registrar en Diario/i });
    fireEvent.click(logBtn);

    await waitFor(() => {
      expect(logFoodItemMock).toHaveBeenCalled();
    });

    const callArgs = logFoodItemMock.mock.calls[0];
    expect(callArgs[0]).toMatchObject({
      id: 'recipe_chicken_rice',
      name: 'Pollo con Arroz',
      kind: 'recipe'
    });
    expect(callArgs[1]).toBe('meal_lunch');
    expect(callArgs[3]).toBe('Whole recipe');
    await waitFor(() => {
      expect(onCloseMock).toHaveBeenCalled();
    });
  });

  it('renders as a modern full-screen slide-over modal with accessible back button', async () => {
    const mockDb = {
      portions: {
        find: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([])
        })
      }
    };

    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      db: mockDb as any,
      logFoodItem: logFoodItemMock,
      t: dictionaries.es
    } as any);

    const testIngredient = {
      id: 'custom_apple',
      name: 'Manzana Fuji',
      source: 'custom' as const,
      lang: 'es',
      calories_100g: 52,
      protein_100g: 0.3,
      carbs_100g: 14,
      fats_100g: 0.2
    };

    render(
      <PortionBottomSheet
        ingredient={testIngredient}
        defaultMealType="meal_snack"
        onClose={onCloseMock}
      />
    );

    // Dialog container
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(dialog.className).toContain('fixed inset-0');
    expect(dialog.className).toContain('animate-slide-in-right');

    // Title
    expect(screen.getByText(dictionaries.es.portionModal.title)).toBeDefined();

    // Back button
    const backBtn = screen.getByRole('button', { name: 'Back' });
    expect(backBtn).toBeDefined();
    expect(backBtn.className).toContain('min-w-[44px]');
    expect(backBtn.className).toContain('min-h-[44px]');

    fireEvent.click(backBtn);
    await waitFor(() => {
      expect(onCloseMock).toHaveBeenCalled();
    });
  });

  it('allows changing date via DateSelector and logs food item to the newly selected date', async () => {
    const mockDb = {
      portions: {
        find: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([])
        })
      }
    };

    const logFoodItemMock = vi.fn().mockResolvedValue(undefined);
    const onCloseMock = vi.fn();
    const setSelectedDateMock = vi.fn();

    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      db: mockDb as any,
      logFoodItem: logFoodItemMock,
      selectedDate: '2026-10-20',
      setSelectedDate: setSelectedDateMock,
      locale: 'es',
      t: dictionaries.es
    } as any);

    const testIngredient = {
      id: 'custom_banana',
      name: 'Banana',
      source: 'custom' as const,
      lang: 'es',
      calories_100g: 89,
      protein_100g: 1.1,
      carbs_100g: 22.8,
      fats_100g: 0.3
    };

    render(
      <PortionBottomSheet
        ingredient={testIngredient}
        defaultMealType="meal_breakfast"
        onClose={onCloseMock}
      />
    );

    // Verify initial date selector is present
    expect(screen.getByTestId('date-selector')).toBeDefined();

    // Click Previous Day button
    const prevDayBtn = screen.getByTestId('btn-date-prev');
    fireEvent.click(prevDayBtn);

    // Verify setSelectedDate was called with previous day (2026-10-19)
    expect(setSelectedDateMock).toHaveBeenCalledWith('2026-10-19');

    // Click "Registrar en Diario"
    const logButton = screen.getByText(dictionaries.es.portionModal.logAction);
    fireEvent.click(logButton);

    expect(logFoodItemMock).toHaveBeenCalledWith(
      testIngredient,
      'meal_breakfast',
      1,
      'g',
      [],
      '2026-10-19'
    );
    await waitFor(() => {
      expect(onCloseMock).toHaveBeenCalled();
    });
  });
});

