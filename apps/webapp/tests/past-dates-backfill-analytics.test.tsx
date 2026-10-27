/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppProvider, useApp } from '../src/context/AppContext.js';
import { SettingsModal } from '../src/components/SettingsModal.js';
import { UserProfileGoalsScreen } from '../src/components/profile/UserProfileGoalsScreen.js';
import { AnalyticsModal } from '../src/components/analytics/AnalyticsModal.js';
import { WeightQuickLogModal } from '../src/components/WeightQuickLogModal.js';
import { destroyDatabase, clearLocalDatabase } from '../src/db/rxdb.js';
import * as CatalogDownloadHook from '../src/hooks/useCatalogDownload.js';
import { en } from '@quomida/i18n-locales';

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

describe('SDET Breaker Test: Past Dates Backfill & Recalibration Requirements Pane', () => {
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
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 } as any);
    await clearLocalDatabase();
  });

  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    await clearLocalDatabase();
  });

  const TestBackfillHarness = () => {
    const {
      selectedDate,
      setSelectedDate,
      userSettings,
      weightLogs,
      logFoodItem,
      logWeight,
      dbService,
      isAnalyticsOpen,
      setIsAnalyticsOpen,
      isSettingsOpen,
      setIsSettingsOpen,
      setLocale
    } = useApp();

    React.useEffect(() => {
      setLocale('en');
    }, [setLocale]);

    return (
      <div data-testid="backfill-harness">
        <span data-testid="selected-date-val">{selectedDate}</span>
        <span data-testid="weight-logs-count">{weightLogs.length}</span>
        <span data-testid="adaptive-status">{userSettings.adaptive_state?.calibration_status || 'none'}</span>

        <UserProfileGoalsScreen />
        <SettingsModal />
        <AnalyticsModal />

        <button data-testid="btn-open-settings" onClick={() => setIsSettingsOpen(true)}>
          Open Settings
        </button>
        <button data-testid="btn-close-settings" onClick={() => setIsSettingsOpen(false)}>
          Close Settings
        </button>
        <button data-testid="btn-open-analytics" onClick={() => setIsAnalyticsOpen(true)}>
          Open Analytics
        </button>
        <button data-testid="btn-close-analytics" onClick={() => setIsAnalyticsOpen(false)}>
          Close Analytics
        </button>
        <button
          data-testid="btn-set-date"
          onClick={(e) => {
            const d = (e.target as any).getAttribute('data-date');
            if (d) setSelectedDate(d);
          }}
        >
          Set Date
        </button>
        <button
          data-testid="btn-log-food-entry"
          onClick={async (e) => {
            const dateToLog = (e.target as any).getAttribute('data-log-date') || selectedDate;
            await dbService.logFood({
              date: dateToLog,
              meal_type: 'meal_lunch',
              food_reference_id: 'food_seed',
              food_name: 'Backfill Meal',
              quantity: 500,
              portion_name: 'g',
              macros: { calories: 1800, protein: 120, carbs: 180, fats: 50 }
            });
          }}
        >
          Log Food
        </button>
        <button
          data-testid="btn-log-weight-entry"
          onClick={async (e) => {
            const dateToLog = (e.target as any).getAttribute('data-log-date') || selectedDate;
            const weightVal = parseFloat((e.target as any).getAttribute('data-weight') || '80');
            await logWeight(dateToLog, weightVal);
          }}
        >
          Log Weight
        </button>
      </div>
    );
  };

  it('verifies that when user backfills 14 days of logs on past dates and views Analytics while on a past date, compliance pane takes all days into account', async () => {
    render(
      <AppProvider>
        <TestBackfillHarness />
      </AppProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('backfill-harness')).toBeDefined();
    });

    const setDateBtn = screen.getByTestId('btn-set-date');
    const logFoodBtn = screen.getByTestId('btn-log-food-entry');
    const logWeightBtn = screen.getByTestId('btn-log-weight-entry');

    // Step 1: User is on today (2026-10-20)
    act(() => {
      setDateBtn.setAttribute('data-date', '2026-10-20');
      setDateBtn.click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('selected-date-val').textContent).toBe('2026-10-20');
    });

    // Step 2: User sets up Smart/Adaptive targets today
    fireEvent.click(screen.getByTestId('btn-open-settings'));
    await waitFor(() => {
      expect(screen.getByTestId('btn-target-mode-smart')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('btn-target-mode-smart'));
    fireEvent.change(screen.getByTestId('select-biometrics-sex'), { target: { value: 'male' } });
    fireEvent.change(screen.getByTestId('input-biometrics-height'), { target: { value: '180' } });
    fireEvent.change(screen.getByTestId('input-biometrics-weight'), { target: { value: '80' } });
    fireEvent.change(screen.getByTestId('select-biometrics-activity'), { target: { value: '1.55' } });
    const adaptiveCheckbox = screen.getByTestId('checkbox-adaptive-toggle') as HTMLInputElement;
    if (!adaptiveCheckbox.checked) {
      fireEvent.click(adaptiveCheckbox);
    }
    fireEvent.click(screen.getByTestId('btn-save-nutritional-targets'));

    // Close settings modal if still open
    const closeSettingsBtn = screen.getByTestId('btn-close-settings');
    if (closeSettingsBtn) {
      fireEvent.click(closeSettingsBtn);
    }

    await waitFor(() => {
      expect(screen.getByTestId('weight-logs-count').textContent).toBe('1');
    });

    // Log today's food
    await act(async () => {
      logFoodBtn.setAttribute('data-log-date', '2026-10-20');
      logFoodBtn.click();
    });

    // Step 3: User navigates back to past dates (2026-10-07 through 2026-10-19)
    // and backfills food (1800 kcal each) and weights (80.0 down to 78.5)
    const pastDays = [
      '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10',
      '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14',
      '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19'
    ];

    for (let i = 0; i < pastDays.length; i++) {
      const day = pastDays[i];
      // Navigate to past day
      act(() => {
        setDateBtn.setAttribute('data-date', day);
        setDateBtn.click();
      });

      // Log food and weight on that past day
      await act(async () => {
        logFoodBtn.setAttribute('data-log-date', day);
        logFoodBtn.click();
        logWeightBtn.setAttribute('data-log-date', day);
        logWeightBtn.setAttribute('data-weight', String(79.0 + (i * 0.1)));
        logWeightBtn.click();
      });
    }

    await waitFor(() => {
      // 1 initial + 13 backfilled = 14 weight logs
      expect(screen.getByTestId('weight-logs-count').textContent).toBe('14');
    });

    // Currently selected date is still the last backfilled date: '2026-10-19' (or say user navigated to 2026-10-07)
    act(() => {
      setDateBtn.setAttribute('data-date', '2026-10-07');
      setDateBtn.click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('selected-date-val').textContent).toBe('2026-10-07');
    });

    // Step 4: User opens Analytics Modal while viewing past date 2026-10-07!
    fireEvent.click(screen.getByTestId('btn-open-analytics'));

    // The user has 14 full days of food and weights logged up to today (2026-10-20)!
    // Therefore, the recalibration requirements pane should take into account all 14 days of data,
    // recognize calibration is ready (or reflect the user's active baseline),
    // and NOT say 1/4 weigh-ins and 1/10 food days (collecting data)!
    await waitFor(() => {
      expect(screen.getByRole('region', { name: new RegExp(en.analytics.title, 'i') })).toBeDefined();
    });

    // Check what the compliance pane shows:
    // If the bug exists:
    // It only sees 2026-10-07 (window ending on 2026-10-07).
    // So Food logged is 1/10 and Weigh-ins (last 7d) is 1/4, and status is "Collecting Baseline Data".
    // This assertion will FAIL if the bug is present!
    // While on past date 2026-10-07:
    // The compliance pane MUST take into account all 14 days of data up to today (2026-10-20)!
    await waitFor(() => {
      expect(screen.getByText(/14\/10/i)).toBeDefined();
      expect(screen.getByText(en.analytics.statusReady)).toBeDefined();
    });

    // If user navigates back to 2026-10-20 (today):
    act(() => {
      setDateBtn.setAttribute('data-date', '2026-10-20');
      setDateBtn.click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('selected-date-val').textContent).toBe('2026-10-20');
    });

    const complianceWhenOnToday = screen.getByText(en.analytics.complianceTitle).parentElement;
    console.log('COMPLIANCE WHEN ON TODAY:', complianceWhenOnToday?.textContent);

    expect(screen.getByText(/14\/10/i)).toBeDefined();
    expect(screen.getByText(en.analytics.statusReady)).toBeDefined();
  });

  it('correctly re-evaluates compliance when user is on a past date and adds more qualifying food days', async () => {
    render(
      <AppProvider>
        <TestBackfillHarness />
      </AppProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('backfill-harness')).toBeDefined();
    });

    const setDateBtn = screen.getByTestId('btn-set-date');
    const logFoodBtn = screen.getByTestId('btn-log-food-entry');
    const logWeightBtn = screen.getByTestId('btn-log-weight-entry');

    // User is on 2026-10-20
    act(() => {
      setDateBtn.setAttribute('data-date', '2026-10-20');
      setDateBtn.click();
    });

    // Configure Smart targets
    fireEvent.click(screen.getByTestId('btn-open-settings'));
    await waitFor(() => {
      expect(screen.getByTestId('btn-target-mode-smart')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('btn-target-mode-smart'));
    fireEvent.change(screen.getByTestId('select-biometrics-sex'), { target: { value: 'female' } });
    fireEvent.change(screen.getByTestId('input-biometrics-height'), { target: { value: '165' } });
    fireEvent.change(screen.getByTestId('input-biometrics-weight'), { target: { value: '65' } });
    fireEvent.click(screen.getByTestId('btn-save-nutritional-targets'));

    const closeSettingsBtn = screen.getByTestId('btn-close-settings');
    if (closeSettingsBtn) {
      fireEvent.click(closeSettingsBtn);
    }

    // Log 9 days of food in past dates (2026-10-12 to 2026-10-20)
    // 9 days < 10 days requirement => should show 9/10 (collecting_data)
    for (let i = 12; i <= 20; i++) {
      const day = `2026-10-${i}`;
      await act(async () => {
        logFoodBtn.setAttribute('data-log-date', day);
        logFoodBtn.click();
        logWeightBtn.setAttribute('data-log-date', day);
        logWeightBtn.setAttribute('data-weight', '65.0');
        logWeightBtn.click();
      });
    }

    // User navigates back to past date 2026-10-12
    act(() => {
      setDateBtn.setAttribute('data-date', '2026-10-12');
      setDateBtn.click();
    });

    // Open AnalyticsModal while on past date 2026-10-12
    fireEvent.click(screen.getByTestId('btn-open-analytics'));

    // Should show 9/10 food days (not 1/10!)
    await waitFor(() => {
      expect(screen.getByText(/9\/10/i)).toBeDefined();
      expect(screen.getByText(en.analytics.statusCollecting)).toBeDefined();
    });

    // Close Analytics
    fireEvent.click(screen.getByTestId('btn-close-analytics'));

    // Now log the 10th qualifying day on 2026-10-11
    act(() => {
      setDateBtn.setAttribute('data-date', '2026-10-11');
      setDateBtn.click();
    });
    await act(async () => {
      logFoodBtn.setAttribute('data-log-date', '2026-10-11');
      logFoodBtn.click();
      logWeightBtn.setAttribute('data-log-date', '2026-10-11');
      logWeightBtn.setAttribute('data-weight', '65.2');
      logWeightBtn.click();
    });

    // Re-open AnalyticsModal while on 2026-10-11
    fireEvent.click(screen.getByTestId('btn-open-analytics'));

    // Now food days should update to 10/10 and status should become ready!
    await waitFor(() => {
      expect(screen.getByText(/10\/10/i)).toBeDefined();
      expect(screen.getByText(en.analytics.statusReady)).toBeDefined();
    });
  });

  it('verifies that deleting a past weight log while viewing a past date updates compliance and recent entries', async () => {
    render(
      <AppProvider>
        <TestBackfillHarness />
      </AppProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('backfill-harness')).toBeDefined();
    });

    const setDateBtn = screen.getByTestId('btn-set-date');
    const logWeightBtn = screen.getByTestId('btn-log-weight-entry');

    // User sets up initial weight on 2026-10-20
    act(() => {
      setDateBtn.setAttribute('data-date', '2026-10-20');
      setDateBtn.click();
    });

    // Log 5 weigh-ins: 2026-10-16 to 2026-10-20 (5 weigh-ins >= 4 in last 7 days)
    for (let i = 16; i <= 20; i++) {
      const day = `2026-10-${i}`;
      await act(async () => {
        logWeightBtn.setAttribute('data-log-date', day);
        logWeightBtn.setAttribute('data-weight', '75.0');
        logWeightBtn.click();
      });
    }

    // Also log 1 in prior week: 2026-10-10
    await act(async () => {
      logWeightBtn.setAttribute('data-log-date', '2026-10-10');
      logWeightBtn.setAttribute('data-weight', '75.5');
      logWeightBtn.click();
    });

    // User navigates to past date 2026-10-10
    act(() => {
      setDateBtn.setAttribute('data-date', '2026-10-10');
      setDateBtn.click();
    });

    // Open AnalyticsModal while on past date 2026-10-10
    fireEvent.click(screen.getByTestId('btn-open-analytics'));

    // Verify recent weigh-ins count is 5/4 and prior is 1/1
    await waitFor(() => {
      expect(screen.getByText(/5\/4/i)).toBeDefined();
      expect(screen.getByText(/1\/1/i)).toBeDefined();
    });

    // Delete one of the recent weigh-ins (2026-10-20)
    const deleteBtn = screen.getByTestId('btn-delete-entry-2026-10-20');
    fireEvent.click(deleteBtn);

    // After deleting 2026-10-20, recent count drops to 4/4
    await waitFor(() => {
      expect(screen.getByText(/4\/4/i)).toBeDefined();
    });

    // Delete another recent weigh-in (2026-10-19)
    const deleteBtn2 = screen.getByTestId('btn-delete-entry-2026-10-19');
    fireEvent.click(deleteBtn2);

    // After deleting 2026-10-19, recent count drops to 3/4
    await waitFor(() => {
      expect(screen.getByText(/3\/4/i)).toBeDefined();
    });
  });
});
