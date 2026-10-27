/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DateSelector } from '../src/components/DateSelector.js';
import { PortionBottomSheet } from '../src/components/PortionBottomSheet.js';
import { WeightQuickLogModal } from '../src/components/WeightQuickLogModal.js';
import { UserProfileGoalsScreen } from '../src/components/profile/UserProfileGoalsScreen.js';
import { IngredientBuilder } from '../src/components/IngredientBuilder.js';
import { RecipeBuilder } from '../src/components/recipes/RecipeBuilder.js';
import { AddFoodModal } from '../src/components/AddFoodModal.js';
import * as AppContext from '../src/context/AppContext.js';
import { en } from '@quomida/i18n-locales';
import type { BaseIngredient, IngredientFoodItem, DailyLog, WeightLog, UserSettings } from '@quomida/domain-core';

describe('Past Date Logging Guards & Today Pill UX', () => {
  const mockSetSelectedDate = vi.fn();
  const mockLogWeight = vi.fn().mockResolvedValue(undefined);
  const mockLogFoodItem = vi.fn().mockResolvedValue(undefined);
  const mockUpdateUserSettings = vi.fn().mockResolvedValue(undefined);
  const mockSetIsWeightModalOpen = vi.fn();

  const mockToday = new Date().toISOString().slice(0, 10);
  const mockYesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const mockTomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const mockPastDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  })();

  const mockIngredient: IngredientFoodItem = {
    id: 'ing_chicken',
    name: 'Grilled Chicken Breast',
    kind: 'ingredient',
    calories_100g: 165,
    protein_100g: 31,
    carbs_100g: 0,
    fats_100g: 3.6,
    source: 'custom',
    lang: 'en'
  };

  const defaultMockSettings: UserSettings = {
    id: 'global_settings',
    locale: 'en',
    theme: 'dark',
    daily_calorie_target: 2000,
    custom_macros: { protein: 150, carbs: 200, fats: 65 },
    target_mode: 'adaptive',
    biometrics: {
      sex: 'male',
      birth_date: '1990-01-01',
      height_cm: 180,
      activity_multiplier: 1.55
    },
    goal_config: {
      goal_type: 'lose',
      weekly_rate_pct: -0.5,
      protein_g_per_kg: 2.2,
      fat_calorie_pct: 0.25
    }
  };

  const setupMockContext = (overrides: Partial<any> = {}) => {
    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      locale: 'en',
      t: en,
      selectedDate: mockPastDate,
      setSelectedDate: mockSetSelectedDate,
      dailyLogs: [],
      weightLogs: [],
      ingredients: [],
      recipes: [],
      recipeFoods: [],
      logFoodItem: mockLogFoodItem,
      logWeight: mockLogWeight,
      deleteWeightLog: vi.fn(),
      userSettings: defaultMockSettings,
      updateUserSettings: mockUpdateUserSettings,
      isWeightModalOpen: true,
      setIsWeightModalOpen: mockSetIsWeightModalOpen,
      ...overrides
    } as any);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('1. DateSelector Relative Labels & Back Action', () => {
    it('renders Today in the center and no Back button when viewing current date (today)', () => {
      setupMockContext({ selectedDate: mockToday });
      render(<DateSelector />);

      expect(screen.getByText(en.date.today)).toBeDefined();
      expect(screen.queryByTestId('btn-date-today')).toBeNull();
    });

    it('renders Yesterday in the center and Back button when viewing yesterday', () => {
      setupMockContext({ selectedDate: mockYesterday });
      render(<DateSelector />);

      expect(screen.getByText(en.date.yesterday)).toBeDefined();
      const backBtn = screen.getByTestId('btn-date-today');
      expect(backBtn).toBeDefined();
      expect(backBtn.textContent).toBe(en.date.back);
    });

    it('renders Tomorrow in the center and Back button when viewing tomorrow', () => {
      setupMockContext({ selectedDate: mockTomorrow });
      render(<DateSelector />);

      expect(screen.getByText(en.date.tomorrow)).toBeDefined();
      const backBtn = screen.getByTestId('btn-date-today');
      expect(backBtn).toBeDefined();
      expect(backBtn.textContent).toBe(en.date.back);
    });

    it('renders clickable Back button when viewing a past date, and clicking it jumps to today', () => {
      setupMockContext({ selectedDate: mockPastDate });
      render(<DateSelector />);

      const backBtn = screen.getByTestId('btn-date-today');
      expect(backBtn).toBeDefined();
      expect(backBtn.textContent).toBe(en.date.back);

      fireEvent.click(backBtn);
      expect(mockSetSelectedDate).toHaveBeenCalledWith(mockToday);
    });

    it('calls custom onChange callback with today if provided', () => {
      const mockOnChange = vi.fn();
      setupMockContext({ selectedDate: mockPastDate });
      render(<DateSelector value={mockPastDate} onChange={mockOnChange} />);

      const backBtn = screen.getByTestId('btn-date-today');
      fireEvent.click(backBtn);
      expect(mockOnChange).toHaveBeenCalledWith(mockToday);
    });

    it('maintains the same fixed oval width across today, past, and future dates and places Back button outside', () => {
      // 1. On Today: oval has fixed width, Back button is not in the DOM
      setupMockContext({ selectedDate: mockToday });
      const { container: todayContainer } = render(<DateSelector />);
      const todayOval = todayContainer.querySelector('[data-testid="date-selector-oval"]') as HTMLElement;
      expect(todayOval.className).toContain('w-[156px]');
      expect(screen.queryByTestId('btn-date-today')).toBeNull();

      cleanup();

      // 2. On Past Date: oval keeps same width, Back button is rendered outside the oval
      setupMockContext({ selectedDate: mockPastDate });
      const { container: pastContainer } = render(<DateSelector />);
      const pastOval = pastContainer.querySelector('[data-testid="date-selector-oval"]') as HTMLElement;
      expect(pastOval.className).toContain('w-[156px]');
      const backBtn = screen.getByTestId('btn-date-today');
      expect(backBtn).toBeDefined();
      expect(pastOval.contains(backBtn)).toBe(false);

      cleanup();

      // 3. On Tomorrow: oval keeps same width, Back button is rendered outside the oval
      setupMockContext({ selectedDate: mockTomorrow });
      const { container: tomorrowContainer } = render(<DateSelector />);
      const tomorrowOval = tomorrowContainer.querySelector('[data-testid="date-selector-oval"]') as HTMLElement;
      expect(tomorrowOval.className).toContain('w-[156px]');
      const tomorrowBackBtn = screen.getByTestId('btn-date-today');
      expect(tomorrowBackBtn).toBeDefined();
      expect(tomorrowOval.contains(tomorrowBackBtn)).toBe(false);
    });
  });

  describe('2. UserProfileGoalsScreen Weight Logging Guard', () => {
    it('always logs weight to current day (today) even if user was viewing a past date', async () => {
      setupMockContext({
        selectedDate: mockPastDate,
        weightLogs: [{ id: `weight_${mockPastDate}`, date: mockPastDate, timestamp: '', weight_kg: 80.0, trend_weight_kg: 80.0, updatedAt: 0 }]
      });

      render(<UserProfileGoalsScreen />);

      const weightInput = screen.getByTestId('input-biometrics-weight') as HTMLInputElement;
      fireEvent.change(weightInput, { target: { value: '78.5' } });

      const saveBtn = screen.getByTestId('btn-save-nutritional-targets');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        // Assert it logged to mockToday, NOT mockPastDate
        expect(mockLogWeight).toHaveBeenCalledWith(mockToday, 78.5);
        expect(mockSetSelectedDate).toHaveBeenCalledWith(mockToday);
      });
    });
  });

  describe('3. PortionBottomSheet Approach A Past Date Warning & Switch to Today', () => {
    it('shows past date warning banner with food count when date is in the past and has existing foods', () => {
      const samplePastDailyLogs: DailyLog[] = [
        {
          id: 'log_1',
          date: mockPastDate,
          timestamp: '',
          meal_type: 'meal_lunch',
          food_reference_id: 'ing_1',
          food_name: 'Rice',
          quantity: 200,
          portion_name: 'g',
          macros: { calories: 260, protein: 5, carbs: 56, fats: 1 }
        },
        {
          id: 'log_2',
          date: mockPastDate,
          timestamp: '',
          meal_type: 'meal_lunch',
          food_reference_id: 'ing_2',
          food_name: 'Beans',
          quantity: 150,
          portion_name: 'g',
          macros: { calories: 180, protein: 12, carbs: 30, fats: 1 }
        }
      ];

      setupMockContext({
        selectedDate: mockPastDate,
        dailyLogs: samplePastDailyLogs
      });

      render(
        <PortionBottomSheet
          ingredient={mockIngredient}
          defaultMealType="meal_dinner"
          onClose={vi.fn()}
        />
      );

      const banner = screen.getByTestId('banner-past-date-warning');
      expect(banner).toBeDefined();
      expect(banner.textContent).toContain('2 foods already logged');
      expect(banner.textContent).toContain(mockPastDate);

      // Button says "Log to 2026-10-20"
      const submitBtn = screen.getByTestId('btn-log-item');
      expect(submitBtn.textContent).toContain(mockPastDate);
    });

    it('clicking Switch to Today in PortionBottomSheet resets date to today and updates button', async () => {
      setupMockContext({
        selectedDate: mockPastDate,
        dailyLogs: []
      });

      render(
        <PortionBottomSheet
          ingredient={mockIngredient}
          defaultMealType="meal_dinner"
          onClose={vi.fn()}
        />
      );

      expect(screen.getByTestId('banner-past-date-warning')).toBeDefined();

      const switchBtn = screen.getByTestId('btn-switch-to-today');
      fireEvent.click(switchBtn);

      // Warning disappears, date selector jumps to today
      expect(screen.queryByTestId('banner-past-date-warning')).toBeNull();
      const submitBtn = screen.getByTestId('btn-log-item');
      expect(submitBtn.textContent).toBe(en.portionModal.logAction);
      expect(mockSetSelectedDate).toHaveBeenCalledWith(mockToday);
    });
  });

  describe('4. WeightQuickLogModal Overwrite & Past Date Warning', () => {
    it('shows overwrite warning when a weight log already exists for the past date', () => {
      const existingWeightLog: WeightLog = {
        id: `weight_${mockPastDate}`,
        date: mockPastDate,
        timestamp: '',
        weight_kg: 81.2,
        trend_weight_kg: 81.0,
        updatedAt: 0
      };

      setupMockContext({
        selectedDate: mockPastDate,
        weightLogs: [existingWeightLog]
      });

      render(<WeightQuickLogModal />);

      const banner = screen.getByTestId('banner-past-weight-warning');
      expect(banner).toBeDefined();
      expect(banner.textContent).toContain('81.2 kg is already logged');
      expect(banner.textContent).toContain(mockPastDate);

      // Submit button reflects update for past date
      const submitBtn = screen.getByTestId('btn-save-weight');
      expect(submitBtn.textContent).toContain(mockPastDate);
    });

    it('clicking Log to Today instead switches weight modal date to today and clears warning', () => {
      setupMockContext({
        selectedDate: mockPastDate,
        weightLogs: []
      });

      render(<WeightQuickLogModal />);

      expect(screen.getByTestId('banner-past-weight-warning')).toBeDefined();

      const switchBtn = screen.getByTestId('btn-switch-weight-today');
      fireEvent.click(switchBtn);

      expect(screen.queryByTestId('banner-past-weight-warning')).toBeNull();
      const submitBtn = screen.getByTestId('btn-save-weight');
      expect(submitBtn.textContent).toBe(en.weight.saveWeight);
      expect(mockSetSelectedDate).toHaveBeenCalledWith(mockToday);
    });
  });

  describe('5. IngredientBuilder & RecipeBuilder Date Selectors & Guards in Diary Mode', () => {
    it('shows DateSelector and past date warning in IngredientBuilder, and passes date on save', async () => {
      const mockSaveAndLog = vi.fn().mockResolvedValue(undefined);
      setupMockContext({
        selectedDate: mockPastDate,
        dailyLogs: [{ id: '1', date: mockPastDate, meal_type: 'meal_lunch', food_reference_id: 'f1', food_name: 'Apple', quantity: 100, portion_name: 'g', macros: { calories: 50, protein: 0, carbs: 12, fats: 0 } }]
      });

      render(
        <IngredientBuilder
          mode="diary"
          initialDate={mockPastDate}
          initialIngredient={mockIngredient}
          onClose={vi.fn()}
          onSave={vi.fn()}
          onSaveAndLog={mockSaveAndLog}
        />
      );

      // Warning banner present
      const banner = screen.getByTestId('banner-past-date-warning');
      expect(banner).toBeDefined();
      expect(banner.textContent).toContain(mockPastDate);
      expect(banner.textContent).toContain('1 foods already logged');

      // Click switch to today
      const switchBtn = screen.getByTestId('btn-switch-to-today');
      fireEvent.click(switchBtn);

      expect(screen.queryByTestId('banner-past-date-warning')).toBeNull();

      const saveAndLogBtn = screen.getByTestId('btn-save-and-log-ingredient');
      fireEvent.click(saveAndLogBtn);

      await waitFor(() => {
        expect(mockSaveAndLog).toHaveBeenCalled();
        // The 4th argument should be mockToday (since user clicked switch to today)
        expect(mockSaveAndLog.mock.calls[0][3]).toBe(mockToday);
      });
    });

    it('shows DateSelector and past date warning in RecipeBuilder, and passes date on save', async () => {
      const mockSaveAndLog = vi.fn().mockResolvedValue(undefined);
      setupMockContext({
        selectedDate: mockPastDate,
        dailyLogs: []
      });

      const initialRecipeWithComps = {
        name: 'Protein Bowl',
        cooked_weight_g: 300,
        raw_weight_g: 300,
        ingredients: [
          {
            food_id: mockIngredient.id,
            name: mockIngredient.name,
            weight_g: 200,
            quantity: 200,
            portion_name: 'g',
            calories_100g: mockIngredient.calories_100g,
            protein_100g: mockIngredient.protein_100g,
            carbs_100g: mockIngredient.carbs_100g,
            fats_100g: mockIngredient.fats_100g
          }
        ]
      };

      render(
        <RecipeBuilder
          mode="diary"
          initialRecipe={initialRecipeWithComps}
          initialDate={mockPastDate}
          onClose={vi.fn()}
          onSave={vi.fn()}
          onSaveAndLog={mockSaveAndLog}
        />
      );

      const banner = screen.getByTestId('banner-past-date-warning');
      expect(banner).toBeDefined();
      expect(banner.textContent).toContain(mockPastDate);

      const saveAndLogBtn = screen.getByTestId('btn-save-and-log-recipe');
      fireEvent.click(saveAndLogBtn);

      await waitFor(() => {
        expect(mockSaveAndLog).toHaveBeenCalled();
        expect(mockSaveAndLog.mock.calls[0][3]).toBe(mockPastDate);
      });
    });
  });

  describe('6. AddFoodModal DateSelector Integration', () => {
    it('renders DateSelector at top of modal when open', () => {
      setupMockContext({ selectedDate: mockToday });

      render(
        <AddFoodModal
          isOpen={true}
          targetMealType="meal_lunch"
          onClose={vi.fn()}
          onSelectIngredient={vi.fn()}
        />
      );

      expect(screen.getByTestId('date-selector')).toBeDefined();
      expect(screen.getByText(en.date.today)).toBeDefined();
    });
  });
});
