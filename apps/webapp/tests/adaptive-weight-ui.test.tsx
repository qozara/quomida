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
  });
});
