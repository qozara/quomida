/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, act, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppProvider, useApp } from '../src/context/AppContext.js';
import { clearLocalDatabase, destroyDatabase, LocalDBService } from '../src/db/rxdb.js';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { MacroRings } from '../src/components/MacroRings.js';
import * as CatalogDownloadHook from '../src/hooks/useCatalogDownload.js';
import { addDaysToDate, type BaseIngredient, type Portion } from '@quomida/domain-core';

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

describe('Past Food & Weight Logs Edition: Tendency & Adaptive Target Recalculation', () => {
  beforeEach(async () => {
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
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
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 } as any);
    await clearLocalDatabase();
  });

  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    await destroyDatabase();
  });

  const sampleFood: BaseIngredient = {
    id: 'food_test_custom',
    name: 'Hearty Oatmeal',
    source: 'custom',
    lang: 'en',
    calories_100g: 500, // 200g = 1000 kcal
    protein_100g: 20,
    carbs_100g: 70,
    fats_100g: 10,
    updatedAt: Date.now()
  };

  const samplePortion: Portion = {
    id: 'portion_test_custom',
    base_food_id: 'food_test_custom',
    name: 'Big Bowl',
    equivalent_weight_g: 200,
    updatedAt: Date.now()
  };

  it('Test 1: Editing/Adding past food logs after calibration immediately updates adaptive targets without waiting 7 days', async () => {
    const dbService = new LocalDBService();
    await dbService.init();

    const today = '2026-10-20';

    // Configure Adaptive user settings
    await dbService.saveSettings({
      target_mode: 'adaptive',
      biometrics: {
        sex: 'male',
        birth_date: '1995-05-15',
        height_cm: 180,
        activity_multiplier: 1.55
      },
      goal_config: {
        goal_type: 'lose',
        weekly_rate_pct: -0.5,
        protein_g_per_kg: 2.0,
        fat_calorie_pct: 0.25
      },
      adaptive_state: {
        estimated_tdee: 2500,
        prior_tdee: 2500,
        calibration_status: 'ready',
        last_calibrated_date: '2026-10-10' // due for calibration
      }
    });

    await dbService.saveCustomFood(sampleFood, [samplePortion]);

    // 14 days of weights at 80.0 kg flat
    for (let i = 0; i < 14; i++) {
      const d = addDaysToDate('2026-10-07', i);
      await dbService.saveWeightLog({ date: d, weight_kg: 80.0 });
    }

    // 14 days of food at 1600 kcal/day (low intake with flat weight implies lower TDEE)
    for (let i = 0; i < 14; i++) {
      const d = addDaysToDate('2026-10-07', i);
      await dbService.logFood({
        date: d,
        meal_type: 'meal_lunch',
        food_reference_id: 'food_test_custom',
        food_name: 'Hearty Oatmeal',
        quantity: 1.6,
        portion_name: 'Big Bowl',
        macros: { calories: 1600, protein: 64, carbs: 224, fats: 32 }
      });
    }

    // Run initial calibration on 2026-10-20
    const calibrated = await dbService.runAdaptiveCalibrationIfNeeded(today);
    expect(calibrated.adaptive_state?.calibration_status).toBe('ready');
    expect(calibrated.adaptive_state?.last_calibrated_date).toBe(today);
    expect(calibrated.adaptive_state?.estimated_tdee).toBe(2350);
    const initialCalTarget = calibrated.daily_calorie_target;

    const TestConsumer = () => {
      const {
        userSettings,
        logFoodItem,
        dbService: ctxDbService
      } = useApp();

      return (
        <div>
          <span data-testid="calorie-target">{userSettings.daily_calorie_target}</span>
          <span data-testid="estimated-tdee">{userSettings.adaptive_state?.estimated_tdee}</span>
          <span data-testid="prior-tdee">{userSettings.adaptive_state?.prior_tdee}</span>
          <span data-testid="cal-status">{userSettings.adaptive_state?.calibration_status}</span>
          <MacroRings />
          <button
            data-testid="btn-add-past-food"
            onClick={async () => {
              // Backfill forgotten food logs for 10 past dates (2026-10-10 to 2026-10-19)
              for (let i = 3; i < 13; i++) {
                const pastDate = addDaysToDate('2026-10-07', i);
                await ctxDbService.logFood({
                  date: pastDate,
                  meal_type: 'meal_dinner',
                  food_reference_id: 'food_test_custom',
                  food_name: 'Hearty Oatmeal',
                  quantity: 1,
                  portion_name: 'Big Bowl',
                  macros: { calories: 1000, protein: 40, carbs: 140, fats: 20 }
                });
              }
              // Trigger logFoodItem through AppContext which runs adaptive recalculation
              await logFoodItem(sampleFood, 'meal_dinner', 1, 'Big Bowl', [samplePortion]);
            }}
          >
            Add Past Meals
          </button>
        </div>
      );
    };

    render(
      <GoogleOAuthProvider clientId="test-client-id">
        <AppProvider>
          <TestConsumer />
        </AppProvider>
      </GoogleOAuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('calorie-target').textContent).toBe(String(initialCalTarget));
      expect(screen.getByTestId('estimated-tdee').textContent).toBe('2350');
    });

    // User adds missing past food
    await act(async () => {
      screen.getByTestId('btn-add-past-food').click();
    });

    // Verification: userSettings and MacroRings immediately update with higher TDEE and higher calorie target!
    await waitFor(() => {
      const updatedTdee = Number(screen.getByTestId('estimated-tdee').textContent);
      const updatedTarget = Number(screen.getByTestId('calorie-target').textContent);
      expect(updatedTdee).toBeGreaterThan(2350);
      expect(updatedTarget).toBeGreaterThan(initialCalTarget);
    });

    // Verify anchor prior_tdee remained stable (2500) without compounding distortion
    expect(screen.getByTestId('prior-tdee').textContent).toBe('2500');
  });

  it('Test 2: Editing past weight logs chronologically updates EWMA tendency and adaptive targets', async () => {
    const dbService = new LocalDBService();
    await dbService.init();

    const today = '2026-10-20';

    await dbService.saveSettings({
      target_mode: 'adaptive',
      biometrics: {
        sex: 'male',
        birth_date: '1995-05-15',
        height_cm: 180,
        activity_multiplier: 1.55
      },
      goal_config: {
        goal_type: 'lose',
        weekly_rate_pct: -0.5,
        protein_g_per_kg: 2.0,
        fat_calorie_pct: 0.25
      },
      adaptive_state: {
        estimated_tdee: 2500,
        prior_tdee: 2500,
        calibration_status: 'ready',
        last_calibrated_date: '2026-10-10'
      }
    });

    // 14 days of food at 2200 kcal/day
    for (let i = 0; i < 14; i++) {
      const d = addDaysToDate('2026-10-07', i);
      await dbService.logFood({
        date: d,
        meal_type: 'meal_lunch',
        food_reference_id: 'food_test_custom',
        food_name: 'Food',
        quantity: 1,
        portion_name: 'Portion',
        macros: { calories: 2200, protein: 120, carbs: 250, fats: 60 }
      });
    }

    // 14 days of weights where Day 14 was mistakenly logged as 82.0 kg (apparent weight gain from 80.0 kg)
    for (let i = 0; i < 13; i++) {
      const d = addDaysToDate('2026-10-07', i);
      await dbService.saveWeightLog({ date: d, weight_kg: 80.0 });
    }
    await dbService.saveWeightLog({ date: '2026-10-20', weight_kg: 82.0 });

    const initialCalibrated = await dbService.runAdaptiveCalibrationIfNeeded(today);
    const initialTdee = initialCalibrated.adaptive_state!.estimated_tdee;

    const TestConsumer = () => {
      const {
        userSettings,
        weightLogs,
        logWeight
      } = useApp();

      const latestLog = weightLogs.find((w) => w.date === '2026-10-20');

      return (
        <div>
          <span data-testid="trend-weight">{latestLog?.trend_weight_kg}</span>
          <span data-testid="tdee">{userSettings.adaptive_state?.estimated_tdee}</span>
          <span data-testid="target">{userSettings.daily_calorie_target}</span>
          <span data-testid="protein">{userSettings.custom_macros?.protein}</span>
          <button
            data-testid="btn-correct-weight"
            onClick={async () => {
              // Correct weight from 82.0 kg down to 78.0 kg (so weight trend is loss, not gain)
              await logWeight('2026-10-20', 78.0);
            }}
          >
            Correct Weight
          </button>
        </div>
      );
    };

    render(
      <GoogleOAuthProvider clientId="test-client-id">
        <AppProvider>
          <TestConsumer />
        </AppProvider>
      </GoogleOAuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('tdee').textContent).toBe(String(initialTdee));
    });

    // Correct the erroneous weight log
    await act(async () => {
      screen.getByTestId('btn-correct-weight').click();
    });

    // Verify EWMA trend weight and adaptive targets both update!
    await waitFor(() => {
      const updatedTrendWeight = Number(screen.getByTestId('trend-weight').textContent);
      const updatedTdee = Number(screen.getByTestId('tdee').textContent);
      const updatedProtein = Number(screen.getByTestId('protein').textContent);

      // Trend weight decreased below 80 kg
      expect(updatedTrendWeight).toBeLessThan(80.0);
      // Since weight trend is now weight loss rather than weight gain, observed TDEE is higher!
      expect(updatedTdee).toBeGreaterThan(initialTdee);
      expect(updatedProtein).toBe(Math.round(updatedTrendWeight * 2));
    });
  });

  it('Test 3: Deleting past food or weight logs updates tendency, status, and targets without compounding', async () => {
    const dbService = new LocalDBService();
    await dbService.init();

    const today = '2026-10-20';

    await dbService.saveSettings({
      target_mode: 'adaptive',
      biometrics: {
        sex: 'male',
        birth_date: '1995-05-15',
        height_cm: 180,
        activity_multiplier: 1.55
      },
      goal_config: {
        goal_type: 'lose',
        weekly_rate_pct: -0.5,
        protein_g_per_kg: 2.0,
        fat_calorie_pct: 0.25
      },
      adaptive_state: {
        estimated_tdee: 2500,
        prior_tdee: 2500,
        calibration_status: 'ready',
        last_calibrated_date: '2026-10-10'
      }
    });

    for (let i = 0; i < 14; i++) {
      const d = addDaysToDate('2026-10-07', i);
      await dbService.saveWeightLog({ date: d, weight_kg: 80.0 });
    }

    // 10 qualifying days with exactly 2000 kcal, plus an accidental 5000 kcal spike log on 2026-10-15
    const foodLogIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const d = addDaysToDate('2026-10-07', i);
      const logId = await dbService.logFood({
        date: d,
        meal_type: 'meal_lunch',
        food_reference_id: 'food_1',
        food_name: 'Standard Meal',
        quantity: 1,
        portion_name: 'Plate',
        macros: { calories: 2000, protein: 120, carbs: 200, fats: 60 }
      });
      foodLogIds.push(logId);
    }

    // The accidental spike
    const spikeLogId = await dbService.logFood({
      date: '2026-10-15',
      meal_type: 'meal_dinner',
      food_reference_id: 'food_spike',
      food_name: 'Accidental 5000 kcal Entry',
      quantity: 1,
      portion_name: 'Bucket',
      macros: { calories: 5000, protein: 100, carbs: 500, fats: 200 }
    });

    const calibratedWithSpike = await dbService.runAdaptiveCalibrationIfNeeded(today);
    const spikeTdee = calibratedWithSpike.adaptive_state!.estimated_tdee;

    const TestConsumer = () => {
      const {
        userSettings,
        deleteLogItem
      } = useApp();

      return (
        <div>
          <span data-testid="status">{userSettings.adaptive_state?.calibration_status}</span>
          <span data-testid="tdee">{userSettings.adaptive_state?.estimated_tdee}</span>
          <span data-testid="calorie-target">{userSettings.daily_calorie_target}</span>
          <button
            data-testid="btn-delete-spike"
            onClick={async () => {
              await deleteLogItem(spikeLogId);
            }}
          >
            Delete Spike
          </button>
          <button
            data-testid="btn-delete-under-gate"
            onClick={async () => {
              // Delete 3 logs so qualifying days drop from 10 to 7 (below Gate 2 requirement of 10 days)
              await deleteLogItem(foodLogIds[0]);
              await deleteLogItem(foodLogIds[1]);
              await deleteLogItem(foodLogIds[2]);
            }}
          >
            Drop Below Gate
          </button>
        </div>
      );
    };

    render(
      <GoogleOAuthProvider clientId="test-client-id">
        <AppProvider>
          <TestConsumer />
        </AppProvider>
      </GoogleOAuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('tdee').textContent).toBe(String(spikeTdee));
      expect(screen.getByTestId('status').textContent).toBe('ready');
    });

    // 1. Delete spike: TDEE immediately drops to reflect realistic intake
    await act(async () => {
      screen.getByTestId('btn-delete-spike').click();
    });

    await waitFor(() => {
      const tdeeAfterSpikeDeleted = Number(screen.getByTestId('tdee').textContent);
      expect(tdeeAfterSpikeDeleted).toBeLessThan(spikeTdee);
    });

    // 2. Delete logs so qualifying days drop below gate
    await act(async () => {
      screen.getByTestId('btn-delete-under-gate').click();
    });

    // Calibration status must transition to 'insufficient_logs' (or 'collecting_data') and targets revert cleanly to anchor baseline
    await waitFor(() => {
      expect(['insufficient_logs', 'collecting_data']).toContain(screen.getByTestId('status').textContent);
      expect(Number(screen.getByTestId('tdee').textContent)).toBe(2500); // Reverted to anchor 2500
    });
  });
});
