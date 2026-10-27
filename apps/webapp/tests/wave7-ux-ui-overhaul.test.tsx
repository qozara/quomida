/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BottomNav, type NavTab } from '../src/components/navigation/BottomNav.js';
import { AddFoodModal } from '../src/components/AddFoodModal.js';
import { SettingsModal } from '../src/components/SettingsModal.js';
import { MealSection } from '../src/components/MealSection.js';
import * as AppContext from '../src/context/AppContext.js';
import { en } from '@quomida/i18n-locales';

describe('Wave 7 UI/UX Overhaul Specifications', () => {
  const mockSetIsSettingsOpen = vi.fn();
  const mockSetIsCatalogOpen = vi.fn();
  const mockSetIsAnalyticsOpen = vi.fn();
  const mockUpdateUserSettings = vi.fn().mockResolvedValue(undefined);

  const baseContext = {
    locale: 'en',
    setLocale: vi.fn(),
    theme: 'dark',
    setTheme: vi.fn(),
    t: en,
    selectedDate: '2026-10-20',
    setSelectedDate: vi.fn(),
    userSettings: {
      daily_calorie_target: 2000,
      custom_macros: { protein: 150, carbs: 200, fats: 65 },
      target_mode: 'manual',
      active_cloud_provider: {
        id: 'google-drive-sheets',
        credentials: {
          userName: 'Alex Dev',
          userEmail: 'alex@example.com'
        }
      }
    },
    updateUserSettings: mockUpdateUserSettings,
    activeProvider: {
      id: 'google-drive-sheets',
      name: 'Google Drive / Sheets (BYOS)',
      getConnectedAccount: () => 'Alex Dev (alex@example.com)',
      isInitialized: () => true,
      getStatus: () => 'idle',
      getLastSyncedTime: () => 'Just now'
    },
    dailyLogs: [],
    weightLogs: [],
    ingredients: [],
    recipes: [],
    recipeFoods: [],
    isSettingsOpen: false,
    setIsSettingsOpen: mockSetIsSettingsOpen,
    isCatalogOpen: false,
    setIsCatalogOpen: mockSetIsCatalogOpen,
    isAnalyticsOpen: false,
    setIsAnalyticsOpen: mockSetIsAnalyticsOpen,
    isStorageSettingsOpen: false,
    setIsStorageSettingsOpen: vi.fn(),
    isWeightModalOpen: false,
    setIsWeightModalOpen: vi.fn(),
    syncStatus: 'idle',
    uxSyncState: 'idle',
    isOnline: true,
    lastSyncedTime: 'Just now',
    itemCounts: { logs: 12, customFoods: 3 },
    clearLocalDatabase: vi.fn(),
    dbVersion: 1
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AppContext, 'useApp').mockReturnValue(baseContext as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('1. 4-Tab Bottom Navigation Bar (BottomNav.tsx)', () => {
    it('renders 4 thumb-friendly tabs with touch targets >= 44x44px and consistent icon + label layout', () => {
      const onSelectTab = vi.fn();
      render(<BottomNav activeTab="diary" onSelectTab={onSelectTab} />);

      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(4);

      for (const tab of tabs) {
        expect(tab.className).toMatch(/min-h-\[44px\]/);
      }

      // Check tab names
      expect(screen.getByText(en.nav.dashboard)).toBeDefined();
      expect(screen.getByText(en.nav.analytics)).toBeDefined();
      expect(screen.getByText(en.nav.catalog)).toBeDefined();
      expect(screen.getByText(en.nav.profileGoals || en.nav.settings)).toBeDefined();

      // Check IDs for backward-compatible test hooks
      expect(screen.getByTestId('btn-open-analytics')).toBeDefined();
      expect(screen.getByTestId('btn-open-catalog')).toBeDefined();
      expect(screen.getByTestId('btn-open-settings')).toBeDefined();
    });

    it('switches tabs on click', () => {
      const onSelectTab = vi.fn();
      render(<BottomNav activeTab="diary" onSelectTab={onSelectTab} />);

      fireEvent.click(screen.getByTestId('btn-open-analytics'));
      expect(onSelectTab).toHaveBeenCalledWith('analytics');

      fireEvent.click(screen.getByTestId('btn-open-catalog'));
      expect(onSelectTab).toHaveBeenCalledWith('catalog');

      fireEvent.click(screen.getByTestId('btn-open-settings'));
      expect(onSelectTab).toHaveBeenCalledWith('settings');
    });
  });

  describe('2. Dedicated AddFoodModal with Contextual Pre-filtered Meal Types', () => {
    it('renders modal with target meal pre-selected and allows switching meal chips', () => {
      const onClose = vi.fn();
      const onSelectIngredient = vi.fn();

      render(
        <AddFoodModal
          isOpen={true}
          targetMealType="meal_dinner"
          onClose={onClose}
          onSelectIngredient={onSelectIngredient}
        />
      );

      // Verify header reflects meal title
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByRole('heading', { name: new RegExp(en.dashboard.meals.dinner, 'i') })).toBeDefined();

      // Verify meal chip selector has 4 meals
      expect(screen.getByRole('button', { name: new RegExp(en.dashboard.meals.breakfast, 'i') })).toBeDefined();
      expect(screen.getByRole('button', { name: new RegExp(en.dashboard.meals.lunch, 'i') })).toBeDefined();
      expect(screen.getByRole('button', { name: new RegExp(en.dashboard.meals.dinner, 'i') })).toBeDefined();
      expect(screen.getByRole('button', { name: new RegExp(en.dashboard.meals.snack, 'i') })).toBeDefined();
    });

    it('meal section renders [+] add button that triggers contextual modal', () => {
      const onOpenAddModal = vi.fn();
      render(
        <MealSection
          mealType="meal_breakfast"
          title={en.dashboard.meals.breakfast}
          onOpenPortionModal={vi.fn()}
          onOpenAddModal={onOpenAddModal}
        />
      );

      const addBtn = screen.getByRole('button', { name: new RegExp(`add food to ${en.dashboard.meals.breakfast}`, 'i') });
      expect(addBtn).toBeDefined();
      expect(addBtn.className).toMatch(/min-w-\[44px\]/);
      expect(addBtn.className).toMatch(/min-h-\[44px\]/);

      fireEvent.click(addBtn);
      expect(onOpenAddModal).toHaveBeenCalledWith('meal_breakfast');
    });
  });

  describe('3. SettingsModal Accordion Architecture (Profile & Goals moved to dedicated top-level page)', () => {
    it('renders 4 distinct accordion headers with subtitles (profile-goals moved to main page)', () => {
      vi.spyOn(AppContext, 'useApp').mockReturnValue({
        ...baseContext,
        isSettingsOpen: true
      } as any);

      render(<SettingsModal />);

      // Accordion headers
      expect(screen.getByTestId('accordion-header-app-settings')).toBeDefined();
      expect(screen.queryByTestId('accordion-header-profile-goals')).toBeNull();
      expect(screen.getByTestId('accordion-header-ai')).toBeDefined();
      expect(screen.getByTestId('accordion-header-data-sync')).toBeDefined();
      expect(screen.getByTestId('accordion-header-about-legal')).toBeDefined();
    });

    it('Segment 1 displays user info name and email from active account', () => {
      vi.spyOn(AppContext, 'useApp').mockReturnValue({
        ...baseContext,
        isSettingsOpen: true
      } as any);

      render(<SettingsModal />);

      // Open segment 1
      fireEvent.click(screen.getByTestId('accordion-header-app-settings'));

      expect(screen.getByText('Alex Dev')).toBeDefined();
      expect(screen.getByText('alex@example.com')).toBeDefined();
    });

    it('Segment 4 includes Check for Catalog Updates button and local database reset', () => {
      vi.spyOn(AppContext, 'useApp').mockReturnValue({
        ...baseContext,
        isSettingsOpen: true
      } as any);

      render(<SettingsModal />);

      fireEvent.click(screen.getByTestId('accordion-header-data-sync'));

      // Check Catalog Updates button now visible
      expect(screen.getByRole('button', { name: new RegExp(en.settings.checkCatalogUpdates, 'i') })).toBeDefined();
      // Offline DB section present
      expect(screen.getByText(en.settings.offlineDbTitle)).toBeDefined();
    });
  });
});
