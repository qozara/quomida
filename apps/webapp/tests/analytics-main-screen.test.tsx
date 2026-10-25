/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnalyticsScreen } from '../src/components/analytics/AnalyticsScreen.js';
import { DashboardContent } from '../src/App.js';
import * as AppContextModule from '../src/context/AppContext.js';
import { en } from '@quomida/i18n-locales';

describe('Analytics Main Screen UI/UX Specification', () => {
  const mockSetIsAnalyticsOpen = vi.fn();
  const mockSetIsSettingsOpen = vi.fn();
  const mockSetIsCatalogOpen = vi.fn();
  const mockSetIsWeightModalOpen = vi.fn();
  const mockDeleteWeightLog = vi.fn().mockResolvedValue(undefined);

  const baseMockContext: any = {
    locale: 'en',
    setLocale: vi.fn(),
    theme: 'dark',
    setTheme: vi.fn(),
    t: en,
    selectedDate: '2026-10-25',
    setSelectedDate: vi.fn(),
    userSettings: {
      daily_calorie_target: 2000,
      custom_macros: { protein: 150, carbs: 200, fats: 65 },
      target_mode: 'adaptive',
      adaptive_state: {
        estimated_tdee: 2450,
        calibration_status: 'ready',
        last_calibrated_date: '2026-10-25'
      }
    },
    updateUserSettings: vi.fn(),
    activeProvider: null,
    uxSyncState: 'local',
    itemCounts: { logs: 5, catalog: 100 },
    dailyLogs: [],
    weightLogs: [
      {
        id: 'w1',
        date: '2026-10-25',
        timestamp: '2026-10-25T08:00:00Z',
        weight_kg: 75.5,
        trend_weight_kg: 75.8,
        note: 'Morning weigh-in',
        updatedAt: 1000
      }
    ],
    ingredients: [],
    recipes: [],
    recipeFoods: [],
    isSettingsOpen: false,
    setIsSettingsOpen: mockSetIsSettingsOpen,
    isCatalogOpen: false,
    setIsCatalogOpen: mockSetIsCatalogOpen,
    isAnalyticsOpen: true,
    setIsAnalyticsOpen: mockSetIsAnalyticsOpen,
    isStorageSettingsOpen: false,
    setIsStorageSettingsOpen: vi.fn(),
    isWeightModalOpen: false,
    setIsWeightModalOpen: mockSetIsWeightModalOpen,
    deleteWeightLog: mockDeleteWeightLog,
    dbService: {
      getDailyLogsInRange: vi.fn().mockResolvedValue([]),
      getLatestDailyLogDate: vi.fn().mockResolvedValue('2026-10-25')
    },
    lastSyncedTime: 'Just now',
    dbInitError: null,
    dbVersion: 6
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders AnalyticsScreen as a primary landmark region with accessible heading and title', () => {
    vi.spyOn(AppContextModule, 'useApp').mockReturnValue(baseMockContext);
    render(<AnalyticsScreen />);

    const screenRegion = screen.getByTestId('analytics-screen');
    expect(screenRegion).toBeDefined();
    expect(screenRegion.getAttribute('role')).toBe('region');
    expect(screen.getByText(en.analytics.title)).toBeDefined();
    expect(screen.getByText(en.analytics.subtitle)).toBeDefined();
    expect(screen.getByText('2450')).toBeDefined();
  });

  it('does not render a close action button on this new analytics main screen (navigates via bottom bar)', () => {
    vi.spyOn(AppContextModule, 'useApp').mockReturnValue(baseMockContext);
    render(<AnalyticsScreen />);

    expect(screen.queryByTestId('btn-close-analytics')).toBeNull();
  });

  it('renders at the same layout level as the home screen inside main when activeTab is analytics in App', () => {
    vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
      ...baseMockContext,
      isAnalyticsOpen: true
    });

    const { container } = render(<DashboardContent />);

    // Main landmark container contains AnalyticsScreen
    const mainEl = container.querySelector('main');
    expect(mainEl).not.toBeNull();
    expect(screen.getByTestId('analytics-screen')).toBeDefined();

    // Floating sync badge is accessible in upper right
    expect(screen.getByTestId('sync-status-badge')).toBeDefined();

    // Date selector is NOT displayed on analytics screen
    expect(screen.queryByTestId('dashboard-date-bar')).toBeNull();

    // FAB add food button is NOT displayed on analytics screen
    expect(screen.queryByTestId('fab-add-food')).toBeNull();
  });

  it('renders the diary widgets, date selector, and FAB button when on diary tab', () => {
    vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
      ...baseMockContext,
      isAnalyticsOpen: false
    });

    const { container } = render(<DashboardContent />);

    // AnalyticsScreen is NOT rendered
    expect(screen.queryByTestId('analytics-screen')).toBeNull();

    // Date selector IS displayed on diary screen
    expect(screen.getByTestId('dashboard-date-bar')).toBeDefined();

    // Floating sync badge is also present on diary screen
    expect(screen.getByTestId('sync-status-badge')).toBeDefined();

    // FAB add food button IS displayed on diary screen
    expect(screen.getByLabelText('Add Food Log')).toBeDefined();

    // Meal sections are displayed on diary screen
    expect(screen.getByText(en.dashboard.meals.breakfast)).toBeDefined();
    expect(screen.getByText(en.dashboard.meals.lunch)).toBeDefined();
  });
});
