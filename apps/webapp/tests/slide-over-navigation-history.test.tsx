/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { DashboardContent } from '../src/App.js';
import * as AppContextModule from '../src/context/AppContext.js';
import { dictionaries } from '@quomida/i18n-locales';

describe('Slide-Over Navigation History & Contextual Back Button', () => {
  const en = dictionaries.en;
  let mockContext: any;
  let logFoodItemMock: any;
  let setIsSettingsOpenMock: any;
  let setIsCatalogOpenMock: any;
  let setIsAnalyticsOpenMock: any;
  let setIsStorageSettingsOpenMock: any;
  let setIsProfileOpenMock: any;

  beforeEach(() => {
    logFoodItemMock = vi.fn().mockResolvedValue(undefined);
    setIsSettingsOpenMock = vi.fn();
    setIsCatalogOpenMock = vi.fn();
    setIsAnalyticsOpenMock = vi.fn();
    setIsStorageSettingsOpenMock = vi.fn();
    setIsProfileOpenMock = vi.fn();

    mockContext = {
      t: en,
      locale: 'en',
      selectedDate: '2026-10-25',
      dailyLogs: [],
      weightLogs: [],
      ingredients: [
        {
          id: 'apple_1',
          name: 'Fresh Red Apple',
          source: 'custom',
          lang: 'en',
          calories_100g: 52,
          protein_100g: 0.3,
          carbs_100g: 14,
          fats_100g: 0.2
        }
      ],
      recipes: [],
      recipeFoods: [],
      userSettings: {
        target_mode: 'manual',
        daily_calorie_target: 2000,
        custom_macros: { protein: 150, carbs: 200, fats: 65 }
      },
      itemCounts: { logs: 1, customFoods: 1 },
      uxSyncState: 'synced',
      activeProvider: null,
      isSettingsOpen: false,
      setIsSettingsOpen: setIsSettingsOpenMock,
      isCatalogOpen: false,
      setIsCatalogOpen: setIsCatalogOpenMock,
      isAnalyticsOpen: false,
      setIsAnalyticsOpen: setIsAnalyticsOpenMock,
      isProfileOpen: false,
      setIsProfileOpen: setIsProfileOpenMock,
      isStorageSettingsOpen: false,
      setIsStorageSettingsOpen: setIsStorageSettingsOpenMock,
      isWeightModalOpen: false,
      setIsWeightModalOpen: vi.fn(),
      db: {
        portions: {
          find: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue([])
          })
        }
      },
      logFoodItem: logFoodItemMock,
      addCustomIngredient: vi.fn(),
      removeCustomIngredient: vi.fn(),
      addRecipe: vi.fn(),
      removeRecipe: vi.fn(),
      clearLocalDatabase: vi.fn(),
      disconnectProvider: vi.fn(),
      dbVersion: 6
    };

    vi.spyOn(AppContextModule, 'useApp').mockImplementation(() => mockContext);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <GoogleOAuthProvider clientId="dummy_id">
        {ui}
      </GoogleOAuthProvider>
    );
  };

  it('Journey 1: opens PortionModal from AddFoodModal, and Back button returns to AddFoodModal', async () => {
    renderWithProviders(<DashboardContent />);

    // 1. Open AddFoodModal by clicking Add food in lunch section
    const addLunchBtn = screen.getByLabelText(en.dashboard.meals.addFoodToMealAria.replace('{{meal}}', en.dashboard.meals.lunch));
    fireEvent.click(addLunchBtn);

    // Verify AddFoodModal is open
    expect(screen.getByRole('dialog', { name: new RegExp(en.dashboard.meals.lunch, 'i') })).toBeDefined();

    // 2. Type search query in AddFoodModal search input
    const searchInput = screen.getByPlaceholderText(en.search.unifiedPlaceholder);
    fireEvent.change(searchInput, { target: { value: 'Apple' } });

    // 3. Select a food item in AddFoodModal
    const foodItem = await screen.findByText('Fresh Red Apple');
    fireEvent.click(foodItem);

    // 4. PortionModal (Portion & Quantity) opens
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: en.portionModal.title })).toBeDefined();
    });

    // 5. Click Back button in PortionModal
    const backBtn = screen.getByTestId('btn-close-portion');
    fireEvent.click(backBtn);

    // 6. PortionModal closes, but AddFoodModal is still displayed
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: en.portionModal.title })).toBeNull();
      expect(screen.getByRole('dialog', { name: new RegExp(en.dashboard.meals.lunch, 'i') })).toBeDefined();
    });

    // 7. Click Back button in AddFoodModal -> AddFoodModal closes back to Dashboard
    const closeAddFoodBtn = screen.getByTestId('btn-close-add-food');
    fireEvent.click(closeAddFoodBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: new RegExp(en.dashboard.meals.lunch, 'i') })).toBeNull();
    });
  });

  it('Journey 2: opens PortionModal from AddFoodModal and confirming log closes both dialogs', async () => {
    renderWithProviders(<DashboardContent />);

    // Open AddFoodModal
    const addLunchBtn = screen.getByLabelText(en.dashboard.meals.addFoodToMealAria.replace('{{meal}}', en.dashboard.meals.lunch));
    fireEvent.click(addLunchBtn);

    // Type search query
    const searchInput = screen.getByPlaceholderText(en.search.unifiedPlaceholder);
    fireEvent.change(searchInput, { target: { value: 'Apple' } });

    // Select food item
    const foodItem = await screen.findByText('Fresh Red Apple');
    fireEvent.click(foodItem);

    // PortionModal opens
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: en.portionModal.title })).toBeDefined();
    });

    // Click confirm / log action button
    const logBtn = screen.getByRole('button', { name: en.portionModal.logAction });
    fireEvent.click(logBtn);

    // Both PortionModal and AddFoodModal close to dashboard
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: en.portionModal.title })).toBeNull();
      expect(screen.queryByRole('dialog', { name: new RegExp(en.dashboard.meals.lunch, 'i') })).toBeNull();
    });
  });

  it('Journey 3: opens PortionModal from Catalog screen, and Back button returns to Catalog', async () => {
    mockContext.isCatalogOpen = true;
    renderWithProviders(<DashboardContent />);

    // Catalog screen is active
    expect(screen.getByTestId('catalog-screen')).toBeDefined();

    // Click plus button on an item card in catalog
    const addBtn = screen.getByLabelText('Add food to log');
    fireEvent.click(addBtn);

    // PortionModal opens
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: en.portionModal.title })).toBeDefined();
    });

    // Click Back button in PortionModal
    const backBtn = screen.getByTestId('btn-close-portion');
    fireEvent.click(backBtn);

    // PortionModal closes, user returns to Catalog screen
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: en.portionModal.title })).toBeNull();
      expect(screen.getByTestId('catalog-screen')).toBeDefined();
    });
  });

  it('Journey 4: navigates to Profile & Goals tab from Analytics, opens Settings, and Back button returns to Profile & Goals', async () => {
    // Start on Analytics
    mockContext.isAnalyticsOpen = true;
    const { rerender } = renderWithProviders(<DashboardContent />);

    // User taps Profile & Goals in BottomNav
    const settingsNavBtn = screen.getByTestId('btn-open-settings');
    fireEvent.click(settingsNavBtn);

    // App state updates: isProfileOpen becomes true, isAnalyticsOpen becomes false
    expect(setIsProfileOpenMock).toHaveBeenCalledWith(true);
    expect(setIsAnalyticsOpenMock).toHaveBeenCalledWith(false);

    // Rerender with profile open
    mockContext.isProfileOpen = true;
    mockContext.isAnalyticsOpen = false;
    rerender(
      <GoogleOAuthProvider clientId="dummy_id">
        <DashboardContent />
      </GoogleOAuthProvider>
    );

    // Profile & Goals main screen is displayed with settings launcher button
    const openSettingsBtn = screen.getByTestId('btn-profile-open-settings');
    expect(openSettingsBtn).toBeDefined();

    // User clicks Settings launcher
    fireEvent.click(openSettingsBtn);
    expect(setIsSettingsOpenMock).toHaveBeenCalledWith(true);

    // Rerender with settings modal open
    mockContext.isSettingsOpen = true;
    rerender(
      <GoogleOAuthProvider clientId="dummy_id">
        <DashboardContent />
      </GoogleOAuthProvider>
    );

    // SettingsModal is displayed
    const settingsDialog = screen.getByRole('dialog', { name: en.settings.title });
    expect(settingsDialog).toBeDefined();

    // Click Back button in SettingsModal
    const backBtn = screen.getByTestId('btn-back-settings');
    fireEvent.click(backBtn);

    // Settings closes and Profile & Goals screen is restored!
    expect(setIsSettingsOpenMock).toHaveBeenCalledWith(false);
    expect(setIsProfileOpenMock).toHaveBeenCalledWith(true);
  });

  it('Journey 5: navigates to Profile & Goals tab from Catalog, opens Settings, and Back button returns to Profile & Goals', async () => {
    // Start on Catalog
    mockContext.isCatalogOpen = true;
    const { rerender } = renderWithProviders(<DashboardContent />);

    // User taps Profile & Goals in BottomNav
    const settingsNavBtn = screen.getByTestId('btn-open-settings');
    fireEvent.click(settingsNavBtn);

    // App state updates: isProfileOpen becomes true, isCatalogOpen becomes false
    expect(setIsProfileOpenMock).toHaveBeenCalledWith(true);
    expect(setIsCatalogOpenMock).toHaveBeenCalledWith(false);

    // Rerender with profile open
    mockContext.isProfileOpen = true;
    mockContext.isCatalogOpen = false;
    rerender(
      <GoogleOAuthProvider clientId="dummy_id">
        <DashboardContent />
      </GoogleOAuthProvider>
    );

    // Profile & Goals main screen is displayed with settings launcher button
    const openSettingsBtn = screen.getByTestId('btn-profile-open-settings');
    expect(openSettingsBtn).toBeDefined();

    // User clicks Settings launcher
    fireEvent.click(openSettingsBtn);
    expect(setIsSettingsOpenMock).toHaveBeenCalledWith(true);

    // Rerender with settings open
    mockContext.isSettingsOpen = true;
    rerender(
      <GoogleOAuthProvider clientId="dummy_id">
        <DashboardContent />
      </GoogleOAuthProvider>
    );

    // SettingsModal is displayed
    const settingsDialog = screen.getByRole('dialog', { name: en.settings.title });
    expect(settingsDialog).toBeDefined();

    // Click Back button in SettingsModal
    const backBtn = screen.getByTestId('btn-back-settings');
    fireEvent.click(backBtn);

    // Settings closes and Profile & Goals is restored!
    expect(setIsSettingsOpenMock).toHaveBeenCalledWith(false);
    expect(setIsProfileOpenMock).toHaveBeenCalledWith(true);
  });

  it('Journey 6: opens StorageSettingsPanel from Settings, and Back returns to Settings', async () => {
    mockContext.isSettingsOpen = true;
    mockContext.isStorageSettingsOpen = true;
    renderWithProviders(<DashboardContent />);

    // Both are open, StorageSettingsPanel is top-most
    const storageDialog = screen.getByRole('dialog', { name: /Storage & Sync/i });
    expect(storageDialog).toBeDefined();

    // Click Back in StorageSettingsPanel
    const backBtn = within(storageDialog).getByRole('button', { name: en.sync?.panel?.back || 'Back' });
    fireEvent.click(backBtn);

    expect(setIsStorageSettingsOpenMock).toHaveBeenCalledWith(false);
  });

  it('Journey 7: opens RecipeBuilder as slide-over with Back button and returns to Catalog', async () => {
    mockContext.isCatalogOpen = true;
    renderWithProviders(<DashboardContent />);

    // In Catalog, click Recipe button to build recipe
    const recipeBtn = screen.getAllByText('Recipe').find(el => el.tagName === 'SPAN' && el.parentElement?.tagName === 'BUTTON');
    expect(recipeBtn).toBeDefined();
    fireEvent.click(recipeBtn!);

    // RecipeBuilder slide-over modal opens
    const recipeDialog = screen.getByRole('dialog', { name: en.recipes.newRecipe });
    expect(recipeDialog).toBeDefined();
    expect(recipeDialog.className).toContain('slide-in-from-right');

    // Back button exists with >=44x44 touch target
    const backBtn = screen.getByTestId('btn-back-recipe-builder');
    expect(backBtn).toBeDefined();
    expect(backBtn.className).toContain('min-w-[44px]');
    expect(backBtn.className).toContain('min-h-[44px]');

    // Click Back button
    fireEvent.click(backBtn);

    // RecipeBuilder is closed and user is back on Catalog screen
    expect(screen.queryByRole('dialog', { name: en.recipes.newRecipe })).toBeNull();
    expect(screen.getByTestId('catalog-screen')).toBeDefined();
  });

  it('Journey 8: renders BatchAiMealReviewModal as slide-over with Back button and onClose/onBack dismisses review pane', async () => {
    const onBackMock = vi.fn();
    const onCloseMock = vi.fn();
    const sampleBatchMeal: any = {
      rawInput: '2 eggs and toast',
      detectedMealType: 'meal_breakfast',
      items: [
        {
          id: 'item-1',
          rawQuery: '2 eggs',
          food: { id: 'egg', name: 'Egg', calories_100g: 155, protein_100g: 13, carbs_100g: 1.1, fats_100g: 11 },
          quantity: 2,
          selectedPortionName: 'g',
          availablePortions: [],
          calculatedWeightGrams: 100,
          macros: { calories: 155, protein: 13, carbs: 1.1, fats: 11 },
          unmatched: false,
          mealType: 'meal_breakfast'
        }
      ],
      totalMacros: { calories: 155, protein: 13, carbs: 1.1, fats: 11 }
    };

    const { BatchAiMealReviewModal } = await import('../src/components/BatchAiMealReviewModal.js');
    renderWithProviders(
      <BatchAiMealReviewModal
        isOpen={true}
        batchMeal={sampleBatchMeal}
        onBack={onBackMock}
        onClose={onCloseMock}
      />
    );

    // Dialog exists and has slide-over animation class
    const reviewDialog = screen.getByRole('dialog', { name: '2 eggs and toast' });
    expect(reviewDialog).toBeDefined();
    expect(reviewDialog.className).toContain('slide-in-from-right');

    // Back button exists with >=44x44 touch target
    const backBtn = screen.getByTestId('btn-back-batch-review');
    expect(backBtn).toBeDefined();
    expect(backBtn.getAttribute('aria-label')).toBe('Back');
    expect(backBtn.className).toContain('min-w-[44px]');
    expect(backBtn.className).toContain('min-h-[44px]');

    // Click Back
    fireEvent.click(backBtn);
    expect(onBackMock).toHaveBeenCalledTimes(1);
  });

  it('Journey 9: opening AI meal review from within AddFoodModal results in two stacked slide-over panes, where Back button in AI review pane closes it and restores AddFoodModal', async () => {
    const { MealService } = await import('@quomida/domain-core');
    const sampleBatchMeal: any = {
      rawInput: 'Apple pie with ice cream',
      detectedMealType: 'meal_lunch',
      items: [
        {
          id: 'item-pie',
          rawQuery: 'apple pie',
          food: { id: 'apple-pie', name: 'Apple Pie', calories_100g: 237, protein_100g: 1.9, carbs_100g: 34, fats_100g: 11 },
          quantity: 1,
          selectedPortionName: 'g',
          availablePortions: [],
          calculatedWeightGrams: 100,
          macros: { calories: 237, protein: 1.9, carbs: 34, fats: 11 },
          unmatched: false,
          mealType: 'meal_lunch'
        }
      ],
      totalMacros: { calories: 237, protein: 1.9, carbs: 34, fats: 11 }
    };

    vi.spyOn(MealService.prototype, 'processMeal').mockResolvedValue(sampleBatchMeal);

    renderWithProviders(<DashboardContent />);

    // 1. Open AddFoodModal by clicking Add food in lunch section
    const addLunchBtn = screen.getByLabelText(en.dashboard.meals.addFoodToMealAria.replace('{{meal}}', en.dashboard.meals.lunch));
    fireEvent.click(addLunchBtn);

    const addFoodDialog = screen.getByRole('dialog', { name: new RegExp(en.dashboard.meals.lunch, 'i') });
    expect(addFoodDialog).toBeDefined();

    // 2. Type query in search input
    const searchInput = screen.getByPlaceholderText(en.search.unifiedPlaceholder);
    fireEvent.change(searchInput, { target: { value: 'Apple pie' } });

    // 3. Find more button appears in dropdown
    const findMoreBtn = await screen.findByRole('button', { name: /find more or compose dish/i });
    expect(findMoreBtn).toBeDefined();

    // 4. Click Find More to trigger AI review
    fireEvent.click(findMoreBtn);

    // 5. Verify BatchAiMealReviewModal is open as a top-level slide-over on top of AddFoodModal
    const aiReviewDialog = await screen.findByRole('dialog', { name: 'Apple pie with ice cream' });
    expect(aiReviewDialog).toBeDefined();
    expect(aiReviewDialog.className).toContain('z-[60]');
    expect(aiReviewDialog.parentElement).toBe(document.body);

    // Both slide-overs are simultaneously open in the DOM
    expect(screen.getByRole('dialog', { name: new RegExp(en.dashboard.meals.lunch, 'i') })).toBeDefined();
    expect(screen.getByRole('dialog', { name: 'Apple pie with ice cream' })).toBeDefined();

    // 6. Click Back in BatchAiMealReviewModal
    const aiBackBtn = screen.getByTestId('btn-back-batch-review');
    fireEvent.click(aiBackBtn);

    // AI Review dialog unmounts, while AddFoodModal is still open!
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Apple pie with ice cream' })).toBeNull();
    });
    expect(screen.getByRole('dialog', { name: new RegExp(en.dashboard.meals.lunch, 'i') })).toBeDefined();

    // 7. Click Back in AddFoodModal
    const addFoodBackBtn = screen.getByTestId('btn-close-add-food');
    fireEvent.click(addFoodBackBtn);

    // AddFoodModal closes and user is back on dashboard
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: new RegExp(en.dashboard.meals.lunch, 'i') })).toBeNull();
    });
  });
});
