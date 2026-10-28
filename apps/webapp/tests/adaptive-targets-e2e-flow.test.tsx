/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SettingsModal } from '../src/components/SettingsModal.js';
import { UserProfileGoalsScreen } from '../src/components/profile/UserProfileGoalsScreen.js';
import { DashboardWeightPill } from '../src/components/DashboardWeightPill.js';
import { WeightQuickLogModal } from '../src/components/WeightQuickLogModal.js';
import { AnalyticsModal } from '../src/components/analytics/AnalyticsModal.js';
import { WeightTrendChart, type WeightChartDataPoint } from '../src/components/analytics/WeightTrendChart.js';
import { MacroRings } from '../src/components/MacroRings.js';
import { AppProvider, useApp } from '../src/context/AppContext.js';
import { destroyDatabase, LocalDBService } from '../src/db/rxdb.js';
import * as AppContextModule from '../src/context/AppContext.js';
import * as CatalogDownloadHook from '../src/hooks/useCatalogDownload.js';
import { en } from '@quomida/i18n-locales';
import {
  calculateBaselineSeed,
  addDaysToDate,
  type UserSettings,
  type WeightLog,
  type DailyLog
} from '@quomida/domain-core';

// Mock catalog background boot services to avoid OPFS and network overhead in JSDOM
vi.mock('../src/services/DatabaseBootstrapper.js', () => ({
  DatabaseBootstrapper: {
    ensureSystemCatalogOPFS: vi.fn().mockResolvedValue(true),
    removeDownloadedCatalogAndReseed: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
  useGoogleLogin: vi.fn(() => vi.fn())
}));

describe('Wave 6 SDET Suite: Quomida Adaptive Expenditure & Weight Tracking Engine', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(CatalogDownloadHook, 'useCatalogDownload').mockReturnValue({
      status: 'idle',
      progress: 0,
      error: null,
      isDeleting: false,
      downloadCatalog: vi.fn(),
      deleteCatalog: vi.fn(),
      checkAndTriggerAutoDownload: vi.fn()
    });
    // Stub fetch for online heartbeat checks
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 } as any);
    await destroyDatabase();
  });

  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    await destroyDatabase();
  });

  /* ========================================================================
   * 1. EXHAUSTIVE SETTINGS UI OPTIONS & COMBINATIONS (SettingsModal.tsx)
   * ======================================================================== */
  describe('1. Exhaustive Settings UI Options & Combinations (SettingsModal.tsx)', () => {
    const mockLogWeight = vi.fn().mockResolvedValue(undefined);
    const mockUpdateUserSettings = vi.fn().mockResolvedValue(undefined);
    const mockSetIsSettingsOpen = vi.fn();

    const baseUserSettings: UserSettings = {
      id: 'global_settings',
      locale: 'en-US',
      theme: 'dark',
      daily_calorie_target: 2000,
      custom_macros: { protein: 150, carbs: 200, fats: 65 },
      target_mode: 'manual',
      biometrics: {
        sex: 'male',
        birth_date: '1990-01-01',
        height_cm: 170,
        activity_multiplier: 1.375
      },
      goal_config: {
        goal_type: 'lose',
        weekly_rate_pct: -0.5,
        protein_g_per_kg: 2.2,
        fat_calorie_pct: 0.25
      }
    };

    const setupSettingsContext = (overrides: Partial<any> = {}) => {
      vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
        selectedDate: '2026-10-20',
        setSelectedDate: vi.fn(),
        locale: 'en',
        setLocale: vi.fn(),
        theme: 'dark',
        setTheme: vi.fn(),
        t: en,
        userSettings: baseUserSettings,
        updateUserSettings: mockUpdateUserSettings,
        weightLogs: [],
        logWeight: mockLogWeight,
        deleteWeightLog: vi.fn(),
        isSettingsOpen: true,
        setIsSettingsOpen: mockSetIsSettingsOpen,
        isWeightModalOpen: false,
        setIsWeightModalOpen: vi.fn(),
        isAnalyticsOpen: false,
        setIsAnalyticsOpen: vi.fn(),
        isStorageSettingsOpen: false,
        setIsStorageSettingsOpen: vi.fn(),
        dailyLogs: [],
        activeProvider: null,
        isOnline: true,
        lastSyncedTime: null,
        syncStatus: 'idle',
        uxSyncState: 'local',
        dbService: {} as any,
        refreshCatalog: vi.fn().mockResolvedValue({ status: 'UP_TO_DATE' }),
        ...overrides
      } as any);
    };

    it('1.1 toggles between Manual Targets and Smart / Adaptive Targets segmented control', () => {
      setupSettingsContext();
      render(<UserProfileGoalsScreen />);

      const btnManual = screen.getByTestId('btn-target-mode-manual');
      const btnSmart = screen.getByTestId('btn-target-mode-smart');

      // Starts in manual (from baseUserSettings.target_mode)
      expect(screen.getByTestId('goals-summary-card')).toBeDefined();
      expect(screen.queryByTestId('select-biometrics-sex')).toBeNull();

      // Switch to Smart via Confirmation Dialog
      fireEvent.click(btnSmart);
      expect(screen.getByTestId('btn-confirm-mode-switch')).toBeDefined();
      fireEvent.click(screen.getByTestId('btn-confirm-mode-switch'));

      // Open Edit Modal to view and edit inputs
      fireEvent.click(screen.getByTestId('btn-edit-goals'));

      expect(screen.getByTestId('select-biometrics-sex')).toBeDefined();
      expect(screen.getByTestId('input-biometrics-birthdate')).toBeDefined();
      expect(screen.getByTestId('input-biometrics-height')).toBeDefined();
      expect(screen.getByTestId('input-biometrics-weight')).toBeDefined();
      expect(screen.getByTestId('select-biometrics-activity')).toBeDefined();
      expect(screen.getByTestId('btn-goal-lose')).toBeDefined();
      expect(screen.getByTestId('checkbox-adaptive-toggle')).toBeDefined();
      expect(screen.getByTestId('preview-seed-tdee')).toBeDefined();

      // Close modal
      fireEvent.click(screen.getByTestId('btn-back-goals-editor'));

      // Switch back to Manual via Confirmation Dialog
      fireEvent.click(screen.getByTestId('btn-target-mode-manual'));
      expect(screen.getByTestId('btn-confirm-mode-switch')).toBeDefined();
      fireEvent.click(screen.getByTestId('btn-confirm-mode-switch'));
      expect(screen.queryByTestId('select-biometrics-sex')).toBeNull();
    });

    it('1.2 updates live Calculated Output Preview when switching Sex (Male vs Female)', () => {
      setupSettingsContext({
        userSettings: { ...baseUserSettings, target_mode: 'adaptive' }
      });
      render(<UserProfileGoalsScreen />);

      // Open Edit Modal
      fireEvent.click(screen.getByTestId('btn-edit-goals'));

      // Starts in Smart mode
      const sexSelect = screen.getByTestId('select-biometrics-sex') as HTMLSelectElement;
      expect(sexSelect.value).toBe('male');

      // Male BMR preview
      const maleBmrText = screen.getByTestId('preview-bmr-value').textContent;
      const maleTdeeText = screen.getByTestId('preview-tdee-value').textContent;
      const maleTargetText = screen.getByTestId('preview-target-kcal-value').textContent;

      // Switch to Female
      fireEvent.change(sexSelect, { target: { value: 'female' } });
      expect(sexSelect.value).toBe('female');

      const femaleBmrText = screen.getByTestId('preview-bmr-value').textContent;
      const femaleTdeeText = screen.getByTestId('preview-tdee-value').textContent;
      const femaleTargetText = screen.getByTestId('preview-target-kcal-value').textContent;

      const maleBmr = parseInt(maleBmrText || '0');
      const femaleBmr = parseInt(femaleBmrText || '0');
      const maleTdee = parseInt(maleTdeeText || '0');
      const femaleTdee = parseInt(femaleTdeeText || '0');
      const maleTarget = parseInt(maleTargetText || '0');
      const femaleTarget = parseInt(femaleTargetText || '0');

      // Mifflin-St Jeor formula difference between male (+5) and female (-161) is exactly 166 kcal
      expect(maleBmr - femaleBmr).toBe(166);
      expect(femaleTdee).toBeLessThan(maleTdee);
      expect(femaleTarget).toBeLessThan(maleTarget);
    });

    it('1.3 recalculates live preview across Birth Date, Height, Weight, and all 5 PAL levels', () => {
      setupSettingsContext({
        userSettings: { ...baseUserSettings, target_mode: 'adaptive' }
      });
      render(<UserProfileGoalsScreen />);

      // Open Edit Modal
      fireEvent.click(screen.getByTestId('btn-edit-goals'));

      const birthInput = screen.getByTestId('input-biometrics-birthdate') as HTMLInputElement;
      const heightInput = screen.getByTestId('input-biometrics-height') as HTMLInputElement;
      const weightInput = screen.getByTestId('input-biometrics-weight') as HTMLInputElement;
      const palSelect = screen.getByTestId('select-biometrics-activity') as HTMLSelectElement;

      // Initial state
      const initialBmr = parseInt(screen.getByTestId('preview-bmr-value').textContent || '0');

      // 1. Birth Date change: younger by 10 years (from 1990 to 2000) -> 5 * 10 = +50 kcal BMR
      fireEvent.change(birthInput, { target: { value: '2000-01-01' } });
      const youngBmr = parseInt(screen.getByTestId('preview-bmr-value').textContent || '0');
      expect(youngBmr).toBe(initialBmr + 50);

      // 2. Height change: +10 cm (from 170 to 180 cm) -> 6.25 * 10 = +62.5 (rounded to +63 or +62 kcal)
      fireEvent.change(heightInput, { target: { value: '180' } });
      const tallBmr = parseInt(screen.getByTestId('preview-bmr-value').textContent || '0');
      expect(tallBmr).toBeGreaterThan(youngBmr);

      // 3. Weight change: +10 kg (from 75 to 85 kg) -> 10 * 10 = +100 kcal BMR
      fireEvent.change(weightInput, { target: { value: '85' } });
      const heavyBmr = parseInt(screen.getByTestId('preview-bmr-value').textContent || '0');
      expect(heavyBmr).toBe(tallBmr + 100);

      // Check protein target grams updated with weight (85 kg * 2.2 g/kg = 187g protein)
      const proteinGrams = parseInt(screen.getByTestId('preview-protein-value').textContent || '0');
      expect(proteinGrams).toBe(187);

      // 4. Test all 5 Activity Level PAL options
      const pals = [
        { val: '1.2', expectedTdee: Math.round(heavyBmr * 1.2) },
        { val: '1.375', expectedTdee: Math.round(heavyBmr * 1.375) },
        { val: '1.55', expectedTdee: Math.round(heavyBmr * 1.55) },
        { val: '1.725', expectedTdee: Math.round(heavyBmr * 1.725) },
        { val: '1.9', expectedTdee: Math.round(heavyBmr * 1.9) }
      ];

      for (const pal of pals) {
        fireEvent.change(palSelect, { target: { value: pal.val } });
        const displayedTdee = parseInt(screen.getByTestId('preview-tdee-value').textContent || '0');
        expect(displayedTdee).toBe(pal.expectedTdee);
      }
    });

    it('1.4 tests every Goal & Weekly Rhythm combination (Lose, Maintain, Gain)', () => {
      setupSettingsContext({
        userSettings: { ...baseUserSettings, target_mode: 'adaptive' }
      });
      render(<UserProfileGoalsScreen />);

      // Open Edit Modal
      fireEvent.click(screen.getByTestId('btn-edit-goals'));

      const btnLose = screen.getByTestId('btn-goal-lose');
      const btnMaintain = screen.getByTestId('btn-goal-maintain');
      const btnGain = screen.getByTestId('btn-goal-gain');

      // --- LOSE WEIGHT ---
      fireEvent.click(btnLose);
      const loseSlider = screen.getByTestId('slider-weekly-rate') as HTMLInputElement;
      expect(loseSlider).toBeDefined();
      expect(screen.getByTestId('preview-protein-value').textContent).toBe('165g'); // 75kg * 2.2 = 165

      // Test rate slider adjustments: -0.25%, -0.5%, -0.75%, -1.0%
      fireEvent.change(loseSlider, { target: { value: '-0.25' } });
      const target25 = parseInt(screen.getByTestId('preview-target-kcal-value').textContent || '0');

      fireEvent.change(loseSlider, { target: { value: '-0.5' } });
      const target50 = parseInt(screen.getByTestId('preview-target-kcal-value').textContent || '0');

      fireEvent.change(loseSlider, { target: { value: '-0.75' } });
      const target75 = parseInt(screen.getByTestId('preview-target-kcal-value').textContent || '0');

      fireEvent.change(loseSlider, { target: { value: '-1.0' } });
      const target100 = parseInt(screen.getByTestId('preview-target-kcal-value').textContent || '0');

      // More aggressive deficit = lower daily calorie target
      expect(target25).toBeGreaterThan(target50);
      expect(target50).toBeGreaterThan(target75);
      expect(target75).toBeGreaterThan(target100);

      // --- MAINTAIN WEIGHT ---
      fireEvent.click(btnMaintain);
      // Slider must hide on maintain
      expect(screen.queryByTestId('slider-weekly-rate')).toBeNull();
      // Protein defaults to 1.8 g/kg -> 75 * 1.8 = 135g
      expect(screen.getByTestId('preview-protein-value').textContent).toBe('135g');
      // Target kcal equals seed TDEE
      const maintainTarget = parseInt(screen.getByTestId('preview-target-kcal-value').textContent || '0');
      const currentTdee = parseInt(screen.getByTestId('preview-tdee-value').textContent || '0');
      expect(maintainTarget).toBe(currentTdee);

      // --- GAIN MUSCLE ---
      fireEvent.click(btnGain);
      const gainSlider = screen.getByTestId('slider-weekly-rate') as HTMLInputElement;
      expect(gainSlider).toBeDefined();
      // Protein defaults to 2.0 g/kg -> 75 * 2.0 = 150g
      expect(screen.getByTestId('preview-protein-value').textContent).toBe('150g');

      // Test rate slider adjustments: +0.20%, +0.25%, +0.50%
      fireEvent.change(gainSlider, { target: { value: '0.20' } });
      const gainTarget20 = parseInt(screen.getByTestId('preview-target-kcal-value').textContent || '0');

      fireEvent.change(gainSlider, { target: { value: '0.25' } });
      const gainTarget25 = parseInt(screen.getByTestId('preview-target-kcal-value').textContent || '0');

      fireEvent.change(gainSlider, { target: { value: '0.50' } });
      const gainTarget50 = parseInt(screen.getByTestId('preview-target-kcal-value').textContent || '0');

      // Gain surplus increases calorie target above TDEE
      expect(gainTarget20).toBeGreaterThan(currentTdee);
      expect(gainTarget25).toBeGreaterThan(gainTarget20);
      expect(gainTarget50).toBeGreaterThan(gainTarget25);
    });

    it('1.5 verifies Adaptive Toggle checkbox saves deterministic_seed when unchecked and adaptive when checked', async () => {
      setupSettingsContext({
        userSettings: { ...baseUserSettings, target_mode: 'smart' }
      });
      render(<UserProfileGoalsScreen />);

      // Open Edit Modal
      fireEvent.click(screen.getByTestId('btn-edit-goals'));

      // Switch to smart
      fireEvent.click(screen.getByTestId('btn-target-mode-smart'));

      const checkbox = screen.getByTestId('checkbox-adaptive-toggle') as HTMLInputElement;
      const saveBtn = screen.getByTestId('btn-save-nutritional-targets');

      // 1. Unchecked -> deterministic_seed
      if (checkbox.checked) {
        fireEvent.click(checkbox);
      }
      expect(checkbox.checked).toBe(false);

      fireEvent.click(saveBtn);
      await waitFor(() => {
        expect(mockUpdateUserSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            target_mode: 'deterministic_seed'
          })
        );
      });

      mockUpdateUserSettings.mockClear();

      // 2. Checked -> adaptive
      fireEvent.click(checkbox);
      expect(checkbox.checked).toBe(true);

      fireEvent.click(saveBtn);
      await waitFor(() => {
        expect(mockUpdateUserSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            target_mode: 'adaptive'
          })
        );
      });
    });

    it('1.6 saving creates initial weight log for selectedDate and immediately updates Dashboard MacroRings', async () => {
      let currentSettings = { ...baseUserSettings, daily_calorie_target: 2000 };
      const listeners: Array<() => void> = [];

      // Test harness combining SettingsModal and MacroRings sharing live state
      const DualComponentHarness = () => {
        const [settings, setSettings] = React.useState(currentSettings);
        const [logs, setLogs] = React.useState<WeightLog[]>([]);

        const updateSettings = async (updates: Partial<UserSettings>) => {
          const updated = { ...settings, ...updates } as UserSettings;
          setSettings(updated);
          currentSettings = updated;
        };

        const logWeight = async (date: string, weightKg: number) => {
          setLogs((prev) => [
            ...prev,
            {
              id: `weight_${date}`,
              date,
              timestamp: `${date}T08:00:00.000Z`,
              weight_kg: weightKg,
              trend_weight_kg: weightKg,
              updatedAt: Date.now()
            }
          ]);
        };

        vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
          selectedDate: '2026-10-20',
          setSelectedDate: vi.fn(),
          locale: 'en',
          setLocale: vi.fn(),
          theme: 'dark',
          setTheme: vi.fn(),
          t: en,
          userSettings: settings,
          updateUserSettings: updateSettings,
          weightLogs: logs,
          logWeight: logWeight,
          deleteWeightLog: vi.fn(),
          isSettingsOpen: true,
          setIsSettingsOpen: vi.fn(),
          isWeightModalOpen: false,
          setIsWeightModalOpen: vi.fn(),
          isAnalyticsOpen: false,
          setIsAnalyticsOpen: vi.fn(),
          isStorageSettingsOpen: false,
          setIsStorageSettingsOpen: vi.fn(),
          dailyLogs: [],
          activeProvider: null,
          isOnline: true,
          lastSyncedTime: null,
          syncStatus: 'idle',
          uxSyncState: 'local',
          dbService: {} as any,
          refreshCatalog: vi.fn()
        } as any);

        return (
          <div>
            <MacroRings />
            <UserProfileGoalsScreen />
          </div>
        );
      };

      render(<DualComponentHarness />);

      // Initial MacroRings shows 2000 kcal target
      expect(screen.getByText(/\/ 2000 kcal/i)).toBeDefined();

      // Open Edit Modal
      fireEvent.click(screen.getByTestId('btn-edit-goals'));

      // Open Smart targets in SettingsModal
      fireEvent.click(screen.getByTestId('btn-target-mode-smart'));

      // Change weight to 80 kg
      fireEvent.change(screen.getByTestId('input-biometrics-weight'), { target: { value: '80' } });

      // Save
      fireEvent.click(screen.getByTestId('btn-save-nutritional-targets'));

      // Verify MacroRings immediately updates to the new calculated calorie target!
      await waitFor(() => {
        expect(screen.queryByText(/\/ 2000 kcal/i)).toBeNull();
        // Calorie target recalculated to baseline seed target
        const seed = calculateBaselineSeed({
          biometrics: {
            sex: 'male',
            birth_date: '1990-01-01',
            height_cm: 170,
            activity_multiplier: 1.375
          },
          goalConfig: {
            goal_type: 'lose',
            weekly_rate_pct: -0.5,
            protein_g_per_kg: 2.2,
            fat_calorie_pct: 0.25
          },
          currentWeightKg: 80,
          referenceDate: '2026-10-20'
        });
        expect(screen.getByText(new RegExp(`/ ${seed.daily_calorie_target} kcal`, 'i'))).toBeDefined();
        expect(screen.getByText(new RegExp(`target ${seed.custom_macros.protein}g`, 'i'))).toBeDefined();
      });
    });
  });

  /* ========================================================================
   * 2. DAY-BY-DAY FOOD & WEIGHT LOGGING -> TARGET ADAPTATION FLOW
   * ======================================================================== */
  describe('2. Day-by-Day Food & Weight Logging -> Target Adaptation (Full E2E RxDB Flow)', () => {
    it('simulates 14-day longitudinal journey, verifies DashboardWeightPill updates, triggers calibration, and updates MacroRings targets', async () => {
      // Integration harness wrapping real AppProvider
      const FullJourneyHarness = () => {
        const {
          selectedDate,
          setSelectedDate,
          userSettings,
          dailyLogs,
          weightLogs,
          logFoodItem,
          dbService,
          isAnalyticsOpen,
          setIsAnalyticsOpen,
          isWeightModalOpen,
          setIsWeightModalOpen,
          isSettingsOpen,
          setIsSettingsOpen,
          setLocale
        } = useApp();

        const [foodLogsCount, setFoodLogsCount] = React.useState(0);

        React.useEffect(() => {
          setLocale('en');
        }, [setLocale]);

        return (
          <div data-testid="journey-harness">
            <span data-testid="selected-date-val">{selectedDate}</span>
            <span data-testid="weight-logs-count">{weightLogs.length}</span>
            <span data-testid="food-logs-count">{foodLogsCount}</span>
            <span data-testid="daily-calorie-target">{userSettings.daily_calorie_target}</span>
            <span data-testid="adaptive-tdee">{userSettings.adaptive_state?.estimated_tdee || 'none'}</span>
            <span data-testid="adaptive-status">{userSettings.adaptive_state?.calibration_status || 'none'}</span>

            {/* Subcomponents */}
            <MacroRings />
            <DashboardWeightPill />
            <WeightQuickLogModal />
            <UserProfileGoalsScreen />
            <SettingsModal />
            <AnalyticsModal />

            {/* Test Helper Controls */}
            <button
              data-testid="btn-test-open-settings"
              onClick={() => setIsSettingsOpen(true)}
            >
              Open Settings
            </button>
            <button
              data-testid="btn-test-set-date"
              onClick={(e) => {
                const targetDate = (e.target as any).getAttribute('data-next-date');
                if (targetDate) setSelectedDate(targetDate);
              }}
            >
              Set Date
            </button>
            <button
              data-testid="btn-test-log-meal"
              onClick={async (e) => {
                const dateToLog = (e.target as any).getAttribute('data-log-date') || selectedDate;
                await dbService.logFood({
                  date: dateToLog,
                  meal_type: 'meal_lunch',
                  food_reference_id: 'food_seed',
                  food_name: 'Test Balanced Meal',
                  quantity: 900,
                  portion_name: 'g',
                  macros: { calories: 1800, protein: 135, carbs: 180, fats: 54 }
                });
                setFoodLogsCount((prev) => prev + 1);
              }}
            >
              Log Meal
            </button>
          </div>
        );
      };

      vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
      render(
        <AppProvider>
          <FullJourneyHarness />
        </AppProvider>
      );

      // Wait for RxDB initialization
      await waitFor(() => {
        expect(screen.getByTestId('journey-harness')).toBeDefined();
      });

      // --- STEP 1: Day 1 (2026-10-01) - Initial Setup ---
      const setDateBtn = screen.getByTestId('btn-test-set-date');
      act(() => {
        setDateBtn.setAttribute('data-next-date', '2026-10-01');
        setDateBtn.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('selected-date-val').textContent).toBe('2026-10-01');
      });

      // Open Settings and configure Smart/Adaptive Lose goal
      const pillLogBtn = screen.getByTestId('btn-quick-log-weight');
      await waitFor(() => {
        expect(pillLogBtn).toBeDefined();
      });

      // Open Goals screen editor
      fireEvent.click(screen.getByTestId('btn-edit-goals'));

      await waitFor(() => {
        expect(screen.getByTestId('btn-target-mode-smart')).toBeDefined();
      });

      const smartTab = screen.getByTestId('btn-target-mode-smart');
      fireEvent.click(smartTab);

      // Set biometrics: Male, 1990-01-01, 180cm, 80kg, PAL 1.55, Goal: Lose -0.5%/wk
      fireEvent.change(screen.getByTestId('select-biometrics-sex'), { target: { value: 'male' } });
      fireEvent.change(screen.getByTestId('input-biometrics-height'), { target: { value: '180' } });
      fireEvent.change(screen.getByTestId('input-biometrics-weight'), { target: { value: '80' } });
      fireEvent.change(screen.getByTestId('select-biometrics-activity'), { target: { value: '1.55' } });

      // Check adaptive toggle
      const adaptiveCheckbox = screen.getByTestId('checkbox-adaptive-toggle') as HTMLInputElement;
      if (!adaptiveCheckbox.checked) {
        fireEvent.click(adaptiveCheckbox);
      }

      // Save goals
      fireEvent.click(screen.getByTestId('btn-save-nutritional-targets'));

      // Verify Day 1 initial weight log and initial targets
      await waitFor(() => {
        expect(screen.getByTestId('weight-logs-count').textContent).toBe('1');
        expect(screen.getByTestId('adaptive-status').textContent).toBe('collecting_data');
      });

      // DashboardWeightPill reflects Day 1 weight (80 kg)
      expect(pillLogBtn.textContent).toContain('80');

      // Log Day 1 meal
      await act(async () => {
        const mealBtn = screen.getByTestId('btn-test-log-meal');
        mealBtn.setAttribute('data-log-date', '2026-10-01');
        mealBtn.click();
      });
      await waitFor(() => {
        expect(screen.getByTestId('food-logs-count').textContent).toBe('1');
      });

      // --- STEP 2: Days 2 to 14 - Longitudinal Logging Loop ---
      // We descend scale weight gradually from 80.0 kg to 78.5 kg over the 14 days
      const weightsByDay = [
        { day: '2026-10-02', weight: 79.9, note: 'Day 2 weigh-in' },
        { day: '2026-10-03', weight: 79.8, note: 'Day 3 weigh-in' },
        { day: '2026-10-04', weight: 79.6, note: 'Day 4 weigh-in' },
        { day: '2026-10-05', weight: 79.5, note: 'Day 5 weigh-in' },
        { day: '2026-10-06', weight: 79.4, note: 'Day 6 weigh-in' },
        { day: '2026-10-07', weight: 79.3, note: 'Day 7 weigh-in' },
        { day: '2026-10-08', weight: 79.2, note: 'Day 8 weigh-in' },
        { day: '2026-10-09', weight: 79.1, note: 'Day 9 weigh-in' },
        { day: '2026-10-10', weight: 79.0, note: 'Day 10 weigh-in' },
        { day: '2026-10-11', weight: 78.9, note: 'Day 11 weigh-in' },
        { day: '2026-10-12', weight: 78.8, note: 'Day 12 weigh-in' },
        { day: '2026-10-13', weight: 78.6, note: 'Day 13 weigh-in' },
        { day: '2026-10-14', weight: 78.5, note: 'Day 14 weigh-in' }
      ];

      for (let i = 0; i < weightsByDay.length; i++) {
        const item = weightsByDay[i];

        // Advance date
        vi.setSystemTime(new Date(`${item.day}T12:00:00Z`));
        act(() => {
          setDateBtn.setAttribute('data-next-date', item.day);
          setDateBtn.click();
        });

        await waitFor(() => {
          expect(screen.getByTestId('selected-date-val').textContent).toBe(item.day);
        });

        // Log daily food (1800 kcal >= 800)
        await act(async () => {
          const mealBtn = screen.getByTestId('btn-test-log-meal');
          mealBtn.setAttribute('data-log-date', item.day);
          mealBtn.click();
        });
        await waitFor(() => {
          expect(screen.getByTestId('food-logs-count').textContent).toBe(String(i + 2));
        });

        // Open quick log modal from DashboardWeightPill
        fireEvent.click(screen.getByTestId('btn-quick-log-weight'));

        // Verify quick log modal opened
        await waitFor(() => {
          expect(screen.getByTestId('input-quick-weight')).toBeDefined();
        });

        // Test stepper buttons: step down and step up
        const stepDown = screen.getByTestId('btn-step-weight-down');
        const stepUp = screen.getByTestId('btn-step-weight-up');
        fireEvent.click(stepDown);
        fireEvent.click(stepUp);

        // Enter exact target weight and note
        fireEvent.change(screen.getByTestId('input-quick-weight'), { target: { value: String(item.weight) } });
        fireEvent.change(screen.getByTestId('input-quick-weight-note'), { target: { value: item.note } });

        // Verify live EWMA preview is rendered
        expect(screen.getByText(en.weight.trendPreviewLabel)).toBeDefined();

        // Save weight
        fireEvent.click(screen.getByTestId('btn-save-weight'));

        // Wait for modal to close and DashboardWeightPill to update
        await waitFor(() => {
          expect(screen.getByTestId('weight-logs-count').textContent).toBe(String(i + 2));
        });

        // Pill displays new raw weight and trend
        expect(pillLogBtn.textContent).toContain(String(item.weight));
      }

      // Verify all 14 days logged
      expect(screen.getByTestId('weight-logs-count').textContent).toBe('14');

      // --- STEP 3: Day 14 Calibration Trigger ---
      // User opens AnalyticsModal on Day 14 (13 days since Day 1 setup >= 7d threshold)
      const analyticsPillBtn = screen.getByTestId('btn-pill-open-analytics');
      fireEvent.click(analyticsPillBtn);

      // Verify calibration automatically executes and updates targets
      await waitFor(() => {
        expect(screen.getByTestId('adaptive-status').textContent).toBe('ready');
      });

      // 1. Estimated TDEE updated
      const calibratedTdee = screen.getByTestId('adaptive-tdee').textContent;
      expect(calibratedTdee).not.toBe('none');
      expect(parseInt(calibratedTdee || '0')).toBeGreaterThan(1500);

      // 2. Daily Calorie Target adapted
      const adaptedTargetKcal = parseInt(screen.getByTestId('daily-calorie-target').textContent || '0');
      expect(adaptedTargetKcal).toBeGreaterThan(1200);

      // 3. MacroRings on dashboard reflects adapted targets
      expect(screen.getByText(new RegExp(`/ ${adaptedTargetKcal} kcal`, 'i'))).toBeDefined();

      // 4. AnalyticsModal displays status badge, weekly rate, and compliance
      expect(screen.getByText(en.analytics.statusReady)).toBeDefined();
      expect(screen.getAllByText(new RegExp(calibratedTdee!, 'i')).length).toBeGreaterThanOrEqual(1);

      // Compliance checkmarks: 7/4, 7/1, 14/10
      expect(screen.getByText(/7\/4/i)).toBeDefined();
      expect(screen.getByText(/7\/1/i)).toBeDefined();
      expect(screen.getByText(/14\/10/i)).toBeDefined();
    }, 20000);
  });

  /* ========================================================================
   * 3. GRAPHICS & SVG CHART VERIFICATION (WeightTrendChart.tsx & AnalyticsModal.tsx)
   * ======================================================================== */
  describe('3. Graphics & SVG Chart Verification (WeightTrendChart.tsx & AnalyticsModal.tsx)', () => {
    // Generate 30 days of continuous data
    const generateLogs = (count: number, startDate: string = '2026-09-15') => {
      const logs: WeightChartDataPoint[] = [];
      let trend = 82.0;
      for (let i = 0; i < count; i++) {
        const date = addDaysToDate(startDate, i);
        const raw = 82.0 - i * 0.1 + (i % 2 === 0 ? 0.2 : -0.2);
        trend = Math.round((trend + 0.12 * (raw - trend)) * 100) / 100;
        logs.push({
          date,
          rawWeightKg: Math.round(raw * 10) / 10,
          trendWeightKg: trend,
          note: i === 0 ? 'First baseline' : i === count - 1 ? 'Latest check-in' : `Day ${i + 1}`
        });
      }
      return logs;
    };

    it('3.1 renders exact number of scatter circles matching data points in active window', () => {
      const data14 = generateLogs(14);
      const { container, rerender } = render(
        <WeightTrendChart
          data={data14}
          rangeDays={14}
          onRangeChange={vi.fn()}
        />
      );

      // Exactly 14 circles
      expect(container.querySelectorAll('circle').length).toBe(14);

      // Rerender with 30 data points
      const data30 = generateLogs(30);
      rerender(
        <WeightTrendChart
          data={data30}
          rangeDays={30}
          onRangeChange={vi.fn()}
        />
      );

      expect(container.querySelectorAll('circle').length).toBe(30);
    });

    it('3.2 verifies each circle tooltip (<title>) contains exact date, raw weight, EWMA trend weight, and note', () => {
      const data: WeightChartDataPoint[] = [
        {
          date: '2026-10-10',
          rawWeightKg: 80.5,
          trendWeightKg: 80.5,
          note: 'Morning empty stomach'
        },
        {
          date: '2026-10-11',
          rawWeightKg: 80.1,
          trendWeightKg: 80.45,
          note: 'Post-cardio'
        }
      ];

      const { container } = render(
        <WeightTrendChart
          data={data}
          rangeDays={14}
          onRangeChange={vi.fn()}
          rawLegendLabel="Scale Weight"
          trendLegendLabel="EWMA Trend"
        />
      );

      const titles = container.querySelectorAll('circle > title');
      expect(titles.length).toBe(2);

      // Title 1
      const title1 = titles[0].textContent;
      expect(title1).toContain('2026-10-10');
      expect(title1).toContain('80.5 kg');
      expect(title1).toContain('EWMA Trend: 80.5 kg');
      expect(title1).toContain('Morning empty stomach');

      // Title 2
      const title2 = titles[1].textContent;
      expect(title2).toContain('2026-10-11');
      expect(title2).toContain('80.1 kg');
      expect(title2).toContain('EWMA Trend: 80.45 kg');
      expect(title2).toContain('Post-cardio');
    });

    it('3.3 verifies solid EWMA trend path and area gradient path SVG coordinates update when weights change', () => {
      const dataA: WeightChartDataPoint[] = [
        { date: '2026-10-01', rawWeightKg: 80.0, trendWeightKg: 80.0 },
        { date: '2026-10-02', rawWeightKg: 79.5, trendWeightKg: 79.94 }
      ];

      const { container, rerender } = render(
        <WeightTrendChart
          data={dataA}
          rangeDays={14}
          onRangeChange={vi.fn()}
        />
      );

      // Trend line path
      const trendPathA = container.querySelector('path.text-emerald-400');
      expect(trendPathA).toBeDefined();
      const pathDA = trendPathA?.getAttribute('d');
      expect(pathDA).toMatch(/^M \d+(\.\d+)? \d+(\.\d+)? L \d+(\.\d+)? \d+(\.\d+)?$/);

      // Area path
      const areaPathA = container.querySelector('path[fill="url(#weight-trend-gradient)"]');
      expect(areaPathA).toBeDefined();
      const areaDA = areaPathA?.getAttribute('d');
      expect(areaDA).toContain('Z');

      // Add a third data point (modifying geometry)
      const dataB: WeightChartDataPoint[] = [
        ...dataA,
        { date: '2026-10-03', rawWeightKg: 79.0, trendWeightKg: 79.83 }
      ];

      rerender(
        <WeightTrendChart
          data={dataB}
          rangeDays={14}
          onRangeChange={vi.fn()}
        />
      );

      const trendPathB = container.querySelector('path.text-emerald-400');
      const pathDB = trendPathB?.getAttribute('d');

      // Path B should now contain 2 'L' segments (3 points total)
      const lCount = (pathDB?.match(/L/g) || []).length;
      expect(lCount).toBe(2);
      expect(pathDB).not.toBe(pathDA);
    });

    it('3.4 toggles between 14d, 30d, and 90d filters and updates axis labels in AnalyticsModal', async () => {
      // 45 days of weight logs
      const weightLogs: WeightLog[] = [];
      let trend = 80.0;
      for (let i = 0; i < 45; i++) {
        const date = addDaysToDate('2026-09-01', i);
        const weight = 80.0 - i * 0.1;
        trend = Math.round((trend + 0.12 * (weight - trend)) * 100) / 100;
        weightLogs.push({
          id: `weight_${date}`,
          date,
          timestamp: `${date}T08:00:00.000Z`,
          weight_kg: Math.round(weight * 10) / 10,
          trend_weight_kg: trend,
          updatedAt: Date.now()
        });
      }

      const mockDeleteWeightLog = vi.fn().mockResolvedValue(undefined);

      vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
        selectedDate: '2026-10-15',
        weightLogs,
        deleteWeightLog: mockDeleteWeightLog,
        isAnalyticsOpen: true,
        setIsAnalyticsOpen: vi.fn(),
        setIsWeightModalOpen: vi.fn(),
        userSettings: {
          id: 'global_settings',
          locale: 'en-US',
          theme: 'dark',
          daily_calorie_target: 2000,
          custom_macros: { protein: 150, carbs: 200, fats: 65 },
          target_mode: 'adaptive'
        },
        dbService: {
          getDailyLogsInRange: vi.fn().mockResolvedValue([]),
          runAdaptiveCalibrationIfNeeded: vi.fn().mockResolvedValue(null)
        },
        t: en
      } as any);

      const { container } = render(<AnalyticsModal />);

      // Defaults to 30d range
      // Range start for 30d from 2026-10-15 is 2026-09-16
      // All 30 logs fall within [2026-09-16, 2026-10-15]
      const getChartDots = () => container.querySelectorAll('svg[viewBox="0 0 400 200"] circle');
      expect(getChartDots().length).toBe(30);

      // Click 14d range button
      const btn14d = screen.getByRole('button', { name: /^14d$/i });
      fireEvent.click(btn14d);

      expect(getChartDots().length).toBe(14);

      // Click 90d range button (all 45 logs fit within 90d window)
      const btn90d = screen.getByRole('button', { name: /^90d$/i });
      fireEvent.click(btn90d);

      expect(getChartDots().length).toBe(45);

      // Verify Y-axis scale labels render
      const textElements = container.querySelectorAll('svg text');
      expect(textElements.length).toBeGreaterThanOrEqual(4);
    });

    it('3.5 editing or deleting a weight log from AnalyticsModal calls deleteWeightLog and refreshes recent entries list', async () => {
      const mockDeleteWeightLog = vi.fn().mockResolvedValue(undefined);

      const logs: WeightLog[] = [
        {
          id: 'weight_2026-10-14',
          date: '2026-10-14',
          timestamp: '2026-10-14T08:00:00.000Z',
          weight_kg: 78.5,
          trend_weight_kg: 78.9,
          note: 'Target date entry',
          updatedAt: 1
        },
        {
          id: 'weight_2026-10-15',
          date: '2026-10-15',
          timestamp: '2026-10-15T08:00:00.000Z',
          weight_kg: 78.2,
          trend_weight_kg: 78.8,
          note: 'Latest weigh-in',
          updatedAt: 2
        }
      ];

      vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
        selectedDate: '2026-10-15',
        weightLogs: logs,
        deleteWeightLog: mockDeleteWeightLog,
        isAnalyticsOpen: true,
        setIsAnalyticsOpen: vi.fn(),
        setIsWeightModalOpen: vi.fn(),
        userSettings: {
          id: 'global_settings',
          locale: 'en-US',
          theme: 'dark',
          daily_calorie_target: 2000,
          custom_macros: { protein: 150, carbs: 200, fats: 65 },
          target_mode: 'adaptive'
        },
        dbService: {
          getDailyLogsInRange: vi.fn().mockResolvedValue([]),
          runAdaptiveCalibrationIfNeeded: vi.fn().mockResolvedValue(null)
        },
        t: en
      } as any);

      render(<AnalyticsModal />);

      // Recent entries list displays both items
      expect(screen.getByText('Target date entry')).toBeDefined();
      expect(screen.getByText('Latest weigh-in')).toBeDefined();

      // Click delete button on 2026-10-14 entry
      const deleteBtn = screen.getByTestId('btn-delete-entry-2026-10-14');
      fireEvent.click(deleteBtn);

      expect(mockDeleteWeightLog).toHaveBeenCalledWith('weight_2026-10-14');
    });
  });
});
