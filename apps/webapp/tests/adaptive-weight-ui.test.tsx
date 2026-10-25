/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WeightTrendChart, type WeightChartDataPoint } from '../src/components/analytics/WeightTrendChart.js';
import { DashboardWeightPill } from '../src/components/DashboardWeightPill.js';
import { WeightQuickLogModal } from '../src/components/WeightQuickLogModal.js';
import { AnalyticsModal } from '../src/components/analytics/AnalyticsModal.js';
import { Header } from '../src/components/Header.js';
import { SettingsModal } from '../src/components/SettingsModal.js';
import * as AppContext from '../src/context/AppContext.js';
import { en } from '@quomida/i18n-locales';
import type { WeightLog, UserSettings } from '@quomida/domain-core';

describe('Wave 5: Adaptive Expenditure & Weight Tracking UI Components', () => {
  const mockLogWeight = vi.fn().mockResolvedValue(undefined);
  const mockDeleteWeightLog = vi.fn().mockResolvedValue(undefined);
  const mockSetIsWeightModalOpen = vi.fn();
  const mockSetIsAnalyticsOpen = vi.fn();
  const mockSetIsSettingsOpen = vi.fn();
  const mockSetIsCatalogOpen = vi.fn();
  const mockUpdateUserSettings = vi.fn().mockResolvedValue(undefined);
  const mockGetDailyLogsInRange = vi.fn().mockResolvedValue([]);

  const defaultMockUserSettings: UserSettings = {
    id: 'global_settings',
    locale: 'en-US',
    theme: 'dark',
    daily_calorie_target: 2200,
    custom_macros: { protein: 160, carbs: 240, fats: 65 },
    target_mode: 'manual'
  };

  const sampleWeightLogs: WeightLog[] = [
    {
      id: 'weight_2026-10-18',
      date: '2026-10-18',
      timestamp: '2026-10-18T08:00:00Z',
      weight_kg: 80.5,
      trend_weight_kg: 80.5,
      updatedAt: 1000
    },
    {
      id: 'weight_2026-10-19',
      date: '2026-10-19',
      timestamp: '2026-10-19T08:00:00Z',
      weight_kg: 80.2,
      trend_weight_kg: 80.46,
      updatedAt: 2000
    },
    {
      id: 'weight_2026-10-20',
      date: '2026-10-20',
      timestamp: '2026-10-20T08:00:00Z',
      weight_kg: 80.0,
      trend_weight_kg: 80.41,
      note: 'Morning weigh-in',
      updatedAt: 3000
    }
  ];

  const setupMockContext = (overrides: Partial<any> = {}) => {
    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      selectedDate: '2026-10-20',
      setSelectedDate: vi.fn(),
      locale: 'en',
      setLocale: vi.fn(),
      theme: 'dark',
      setTheme: vi.fn(),
      t: en,
      userSettings: defaultMockUserSettings,
      updateUserSettings: mockUpdateUserSettings,
      weightLogs: sampleWeightLogs,
      logWeight: mockLogWeight,
      deleteWeightLog: mockDeleteWeightLog,
      isWeightModalOpen: false,
      setIsWeightModalOpen: mockSetIsWeightModalOpen,
      isAnalyticsOpen: false,
      setIsAnalyticsOpen: mockSetIsAnalyticsOpen,
      isSettingsOpen: false,
      setIsSettingsOpen: mockSetIsSettingsOpen,
      isCatalogOpen: false,
      setIsCatalogOpen: mockSetIsCatalogOpen,
      dbService: {
        getDailyLogsInRange: mockGetDailyLogsInRange,
        runAdaptiveCalibrationIfNeeded: vi.fn().mockResolvedValue(null)
      },
      syncStatus: 'idle',
      uxSyncState: 'local',
      activeProvider: null,
      isOnline: true,
      lastSyncedTime: null,
      itemCounts: { logs: 5, customFoods: 0 },
      dailyLogs: [],
      ...overrides
    } as any);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupMockContext();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('1. WeightTrendChart (Pluggable SVG Component)', () => {
    it('renders empty state message when no data is provided', () => {
      render(
        <WeightTrendChart
          data={[]}
          rangeDays={30}
          onRangeChange={vi.fn()}
          emptyStateMessage="No data available"
        />
      );

      expect(screen.getByText('No data available')).toBeDefined();
    });

    it('renders SVG chart with trend line and scatter dots when data exists', () => {
      const data: WeightChartDataPoint[] = [
        { date: '2026-10-18', rawWeightKg: 80.5, trendWeightKg: 80.5 },
        { date: '2026-10-19', rawWeightKg: 80.2, trendWeightKg: 80.46 },
        { date: '2026-10-20', rawWeightKg: 80.0, trendWeightKg: 80.41, note: 'Morning' }
      ];

      const { container } = render(
        <WeightTrendChart
          data={data}
          rangeDays={30}
          onRangeChange={vi.fn()}
          rawLegendLabel="Raw Weight"
          trendLegendLabel="Trend Weight"
        />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeDefined();
      expect(svg?.getAttribute('viewBox')).toBe('0 0 400 200');

      // Check legend
      expect(screen.getByText('Raw Weight')).toBeDefined();
      expect(screen.getByText('Trend Weight')).toBeDefined();

      // Check circles for raw weight scatter dots
      const circles = container.querySelectorAll('circle');
      expect(circles.length).toBe(3);

      // Check range toggle buttons meet minimum touch target 44x44
      const rangeButtons = screen.getAllByRole('button');
      expect(rangeButtons.length).toBeGreaterThanOrEqual(3);
      for (const btn of rangeButtons) {
        expect(btn.className).toMatch(/min-w-\[44px\]/);
        expect(btn.className).toMatch(/min-h-\[44px\]/);
      }
    });

    it('invokes onRangeChange callback when range button clicked', () => {
      const onRangeChange = vi.fn();
      render(
        <WeightTrendChart
          data={[{ date: '2026-10-20', rawWeightKg: 80.0, trendWeightKg: 80.0 }]}
          rangeDays={30}
          onRangeChange={onRangeChange}
        />
      );

      const btn14 = screen.getByRole('button', { name: /14d/i });
      fireEvent.click(btn14);
      expect(onRangeChange).toHaveBeenCalledWith(14);
    });
  });

  describe('2. DashboardWeightPill', () => {
    it('displays logged weight and trend when a log exists for selectedDate', () => {
      setupMockContext();
      render(<DashboardWeightPill />);

      const quickLogBtn = screen.getByTestId('btn-quick-log-weight');
      expect(quickLogBtn).toBeDefined();
      expect(quickLogBtn.textContent).toContain('80');
      expect(quickLogBtn.textContent).toContain('80.41');

      // Clicking pill opens quick log modal
      fireEvent.click(quickLogBtn);
      expect(mockSetIsWeightModalOpen).toHaveBeenCalledWith(true);

      // Analytics button opens analytics modal
      const analyticsBtn = screen.getByTestId('btn-pill-open-analytics');
      expect(analyticsBtn.className).toMatch(/min-w-\[44px\]/);
      expect(analyticsBtn.className).toMatch(/min-h-\[44px\]/);
      fireEvent.click(analyticsBtn);
      expect(mockSetIsAnalyticsOpen).toHaveBeenCalledWith(true);
    });

    it('displays CTA when no weight log exists for selectedDate', () => {
      setupMockContext({
        selectedDate: '2026-10-21', // No log on 21st
        weightLogs: sampleWeightLogs
      });
      render(<DashboardWeightPill />);

      const quickLogBtn = screen.getByTestId('btn-quick-log-weight');
      expect(quickLogBtn.textContent).toContain(en.weight.logWeightCta);

      fireEvent.click(quickLogBtn);
      expect(mockSetIsWeightModalOpen).toHaveBeenCalledWith(true);
    });
  });

  describe('3. WeightQuickLogModal', () => {
    it('does not render when isWeightModalOpen is false', () => {
      setupMockContext({ isWeightModalOpen: false });
      const { container } = render(<WeightQuickLogModal />);
      expect(container.firstChild).toBeNull();
    });

    it('renders with accessibility attributes and pre-fills existing log for selectedDate', () => {
      setupMockContext({ isWeightModalOpen: true });
      render(<WeightQuickLogModal />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeDefined();
      expect(dialog.getAttribute('aria-modal')).toBe('true');

      // Pre-fills 80 for 2026-10-20
      const weightInput = screen.getByTestId('input-quick-weight') as HTMLInputElement;
      expect(weightInput.value).toBe('80');

      // Pre-fills note
      const noteInput = screen.getByTestId('input-quick-weight-note') as HTMLInputElement;
      expect(noteInput.value).toBe('Morning weigh-in');

      // Steppers are at least 44x44
      const stepDownBtn = screen.getByTestId('btn-step-weight-down');
      const stepUpBtn = screen.getByTestId('btn-step-weight-up');
      expect(stepDownBtn.className).toMatch(/min-w-\[44px\]/);
      expect(stepUpBtn.className).toMatch(/min-h-\[44px\]/);
      expect(stepUpBtn.className).toMatch(/min-w-\[44px\]/);

      // Click step down -> 79.9
      fireEvent.click(stepDownBtn);
      expect(weightInput.value).toBe('79.9');
    });

    it('saves new weight log and closes modal on submit', async () => {
      setupMockContext({ isWeightModalOpen: true });
      render(<WeightQuickLogModal />);

      const saveBtn = screen.getByTestId('btn-save-weight');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(mockLogWeight).toHaveBeenCalledWith('2026-10-20', 80, 'Morning weigh-in');
        expect(mockSetIsWeightModalOpen).toHaveBeenCalledWith(false);
      });
    });

    it('deletes log entry and closes modal when delete is clicked', async () => {
      setupMockContext({ isWeightModalOpen: true });
      render(<WeightQuickLogModal />);

      const deleteBtn = screen.getByTestId('btn-delete-weight');
      fireEvent.click(deleteBtn);

      await waitFor(() => {
        expect(mockDeleteWeightLog).toHaveBeenCalledWith('2026-10-20');
        expect(mockSetIsWeightModalOpen).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('4. AnalyticsModal', () => {
    it('does not render when isAnalyticsOpen is false', () => {
      setupMockContext({ isAnalyticsOpen: false });
      const { container } = render(<AnalyticsModal />);
      expect(container.firstChild).toBeNull();
    });

    it('renders metabolic status banner, compliance indicators, chart, and recent logs', async () => {
      setupMockContext({
        isAnalyticsOpen: true,
        userSettings: {
          ...defaultMockUserSettings,
          target_mode: 'adaptive',
          adaptive_state: {
            estimated_tdee: 2450,
            calibration_status: 'ready'
          }
        }
      });

      render(<AnalyticsModal />);

      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByText(en.analytics.title)).toBeDefined();

      // Check estimated TDEE display
      expect(screen.getByText('2450')).toBeDefined();

      // Check compliance indicators exist
      expect(screen.getByText(/Weigh-ins \(last 7d\)/i)).toBeDefined();

      // Check recent logs are listed
      expect(screen.getByText('Morning weigh-in')).toBeDefined();

      // Close button meets touch target
      const closeBtn = screen.getByTestId('btn-close-analytics');
      expect(closeBtn.className).toMatch(/min-w-\[44px\]/);
      expect(closeBtn.className).toMatch(/min-h-\[44px\]/);
      fireEvent.click(closeBtn);
      expect(mockSetIsAnalyticsOpen).toHaveBeenCalledWith(false);
    });

    it('switches between Weight Trend and Energy Trend tabs with contextual chart and bottom list', async () => {
      const mockDailyLogs = [
        {
          id: 'log_1',
          date: '2026-10-19',
          timestamp: '2026-10-19T12:00:00Z',
          meal_type: 'meal_lunch',
          food_reference_id: 'f1',
          food_name: 'Oats',
          quantity: 1,
          portion_name: 'bowl',
          macros: { calories: 450, protein: 20, carbs: 70, fats: 10 },
          updatedAt: 1000
        },
        {
          id: 'log_2',
          date: '2026-10-20',
          timestamp: '2026-10-20T12:00:00Z',
          meal_type: 'meal_lunch',
          food_reference_id: 'f2',
          food_name: 'Chicken & Rice',
          quantity: 1,
          portion_name: 'plate',
          macros: { calories: 2150, protein: 165, carbs: 230, fats: 62 },
          updatedAt: 2000
        }
      ];

      mockGetDailyLogsInRange.mockResolvedValueOnce(mockDailyLogs);

      setupMockContext({
        isAnalyticsOpen: true,
        dailyLogs: mockDailyLogs,
        userSettings: {
          ...defaultMockUserSettings,
          target_mode: 'adaptive',
          biometrics: {
            sex: 'male',
            birth_date: '1995-05-10',
            height_cm: 180,
            activity_multiplier: 1.5
          },
          goal_config: {
            goal_type: 'lose',
            weekly_rate_pct: -0.5,
            protein_g_per_kg: 2.0,
            fat_calorie_pct: 0.25
          },
          adaptive_state: {
            estimated_tdee: 2450,
            calibration_status: 'ready'
          }
        }
      });

      render(<AnalyticsModal />);

      // Verify both tab buttons exist and meet 44x44 touch target requirements
      const weightTab = screen.getByTestId('tab-analytics-weight');
      const energyTab = screen.getByTestId('tab-analytics-energy');

      expect(weightTab.getAttribute('aria-selected')).toBe('true');
      expect(energyTab.getAttribute('aria-selected')).toBe('false');
      expect(weightTab.className).toMatch(/min-h-\[44px\]/);
      expect(energyTab.className).toMatch(/min-h-\[44px\]/);

      // Default tab is Weight Trend: shows Recent Weigh-Ins list
      expect(screen.getByText(en.analytics.recentEntries)).toBeDefined();
      expect(screen.getByText('Morning weigh-in')).toBeDefined();

      // Switch to Energy Trend tab
      fireEvent.click(energyTab);

      await waitFor(() => {
        expect(energyTab.getAttribute('aria-selected')).toBe('true');
        expect(weightTab.getAttribute('aria-selected')).toBe('false');
      });

      // Verify Energy Trend chart legends appear
      expect(screen.getByText(en.analytics.energyExpenditureLegend)).toBeDefined();
      expect(screen.getByText(en.analytics.energyIntakeLegend)).toBeDefined();
      expect(screen.getByText(en.analytics.energyIntakeTrendLegend)).toBeDefined();

      // Verify contextual bottom list switched to Recent Daily Energy Logs
      expect(screen.getByText(en.analytics.recentEnergyEntries)).toBeDefined();
      expect(screen.getAllByText(/2150 kcal/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(en.analytics.partialDayBadge)).toBeDefined();
    });
  });

  describe('5. Header Analytics Button', () => {
    it('renders #btn-open-analytics and meets touch target requirements', () => {
      setupMockContext();
      render(<Header />);

      const analyticsBtn = screen.getByTestId('btn-open-analytics');
      expect(analyticsBtn).toBeDefined();
      expect(analyticsBtn.className).toMatch(/min-w-\[44px\]/);
      expect(analyticsBtn.className).toMatch(/min-h-\[44px\]/);

      fireEvent.click(analyticsBtn);
      expect(mockSetIsAnalyticsOpen).toHaveBeenCalledWith(true);
    });
  });

  describe('6. SettingsModal Target Mode Selector (Manual vs Smart/Adaptive)', () => {
    it('renders mode switcher and switches between manual and smart/adaptive', async () => {
      setupMockContext({
        isSettingsOpen: true,
        userSettings: defaultMockUserSettings
      });

      render(<SettingsModal />);

      const manualTab = screen.getByTestId('btn-target-mode-manual');
      const smartTab = screen.getByTestId('btn-target-mode-smart');

      expect(manualTab).toBeDefined();
      expect(smartTab).toBeDefined();

      // Switch to Smart / Adaptive
      fireEvent.click(smartTab);

      // Verify biometrics inputs appear
      expect(screen.getByTestId('select-biometrics-sex')).toBeDefined();
      expect(screen.getByTestId('input-biometrics-height')).toBeDefined();
      expect(screen.getByTestId('input-biometrics-weight')).toBeDefined();

      // Verify goal buttons appear
      expect(screen.getByTestId('btn-goal-lose')).toBeDefined();
      expect(screen.getByTestId('btn-goal-maintain')).toBeDefined();
      expect(screen.getByTestId('btn-goal-gain')).toBeDefined();

      // Verify calculated preview card appears
      expect(screen.getByTestId('preview-seed-tdee')).toBeDefined();
    });

    it('saves biometrics, goal config, and logs initial weight when saving smart targets', async () => {
      setupMockContext({
        isSettingsOpen: true,
        weightLogs: [], // No prior logs
        userSettings: defaultMockUserSettings
      });

      render(<SettingsModal />);

      // Switch to smart
      fireEvent.click(screen.getByTestId('btn-target-mode-smart'));

      // Click save
      const saveBtn = screen.getByTestId('btn-save-nutritional-targets');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        // Initial weight log logged
        expect(mockLogWeight).toHaveBeenCalled();
        // userSettings updated
        expect(mockUpdateUserSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            target_mode: expect.stringMatching(/adaptive|deterministic_seed/),
            biometrics: expect.any(Object),
            goal_config: expect.any(Object),
            daily_calorie_target: expect.any(Number)
          })
        );
      });
    });

    it('reactively updates form fields when userSettings and weightLogs update after mount (e.g. after cloud sync)', async () => {
      // 1. Mount with initial factory default settings
      setupMockContext({
        isSettingsOpen: false,
        weightLogs: [],
        userSettings: {
          id: 'global_settings',
          locale: 'en-US',
          theme: 'dark',
          daily_calorie_target: 2000,
          custom_macros: { protein: 150, carbs: 200, fats: 65 },
          target_mode: 'manual',
          updatedAt: 0
        }
      });

      const { rerender } = render(<SettingsModal />);

      // 2. Simulate cloud sync completing and user opening SettingsModal
      setupMockContext({
        isSettingsOpen: true,
        weightLogs: [
          {
            id: 'weight_2026-10-20',
            date: '2026-10-20',
            timestamp: '2026-10-20T08:00:00Z',
            weight_kg: 63.4,
            trend_weight_kg: 63.4,
            updatedAt: 5000
          }
        ],
        userSettings: {
          id: 'global_settings',
          locale: 'en-US',
          theme: 'dark',
          daily_calorie_target: 2150,
          custom_macros: { protein: 120, carbs: 240, fats: 72 },
          target_mode: 'adaptive',
          biometrics: {
            sex: 'female',
            birth_date: '1993-08-22',
            height_cm: 166,
            activity_multiplier: 1.55
          },
          goal_config: {
            goal_type: 'maintain',
            weekly_rate_pct: 0,
            protein_g_per_kg: 1.9,
            fat_calorie_pct: 0.3
          },
          updatedAt: 5000
        }
      });

      rerender(<SettingsModal />);

      await waitFor(() => {
        const sexSelect = screen.getByTestId('select-biometrics-sex') as HTMLSelectElement;
        const heightInput = screen.getByTestId('input-biometrics-height') as HTMLInputElement;
        const weightInput = screen.getByTestId('input-biometrics-weight') as HTMLInputElement;
        expect(sexSelect.value).toBe('female');
        expect(heightInput.value).toBe('166');
        expect(weightInput.value).toBe('63.4');
      });
    });

    it('updates weight log on selectedDate when weight input is modified, and avoids spurious weight log when weight is unchanged', async () => {
      // Case A: log already exists on selectedDate (80.0 kg), user edits weight to 78.5 kg in SettingsModal
      setupMockContext({
        isSettingsOpen: true,
        selectedDate: '2026-10-20',
        weightLogs: sampleWeightLogs, // has 80.0 on 2026-10-20
        userSettings: {
          ...defaultMockUserSettings,
          target_mode: 'adaptive',
          biometrics: {
            sex: 'male',
            birth_date: '1990-01-01',
            height_cm: 178,
            activity_multiplier: 1.375
          },
          goal_config: {
            goal_type: 'lose',
            weekly_rate_pct: -0.5,
            protein_g_per_kg: 2.2,
            fat_calorie_pct: 0.25
          }
        }
      });

      const { unmount } = render(<SettingsModal />);

      const weightInput = screen.getByTestId('input-biometrics-weight') as HTMLInputElement;
      fireEvent.change(weightInput, { target: { value: '78.5' } });
      fireEvent.click(screen.getByTestId('btn-save-nutritional-targets'));

      await waitFor(() => {
        expect(mockLogWeight).toHaveBeenCalledWith('2026-10-20', 78.5);
      });

      unmount();
      vi.clearAllMocks();

      // Case B: log exists on earlier date (2026-10-19, 80.2 kg), no log on selectedDate (2026-10-21), user does NOT change weight
      setupMockContext({
        isSettingsOpen: true,
        selectedDate: '2026-10-21',
        weightLogs: sampleWeightLogs.slice(0, 2), // latest is 2026-10-19 (80.2 kg)
        userSettings: {
          ...defaultMockUserSettings,
          target_mode: 'adaptive',
          biometrics: {
            sex: 'male',
            birth_date: '1990-01-01',
            height_cm: 178,
            activity_multiplier: 1.375
          },
          goal_config: {
            goal_type: 'lose',
            weekly_rate_pct: -0.5,
            protein_g_per_kg: 2.2,
            fat_calorie_pct: 0.25
          }
        }
      });

      render(<SettingsModal />);
      fireEvent.click(screen.getByTestId('btn-save-nutritional-targets'));

      await waitFor(() => {
        expect(mockUpdateUserSettings).toHaveBeenCalled();
      });
      expect(mockLogWeight).not.toHaveBeenCalled();
    });
  });
});
