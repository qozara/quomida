// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { UserProfileGoalsScreen } from '../src/components/profile/UserProfileGoalsScreen.js';
import * as AppContextModule from '../src/context/AppContext.js';
import en from '../../../packages/i18n-locales/locales/en.json';
import type { UserSettings } from '@quomida/domain-core';

describe('UserProfileGoalsScreen & GoalsEditModal Component Suite', () => {
  const mockUpdateUserSettings = vi.fn().mockResolvedValue(undefined);
  const mockLogWeight = vi.fn().mockResolvedValue(undefined);

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
      calibration_status: 'collecting_data',
      last_calibrated_date: '2026-10-20'
    },
    updatedAt: 1000
  };

  const setupMockContext = (overrides: Partial<any> = {}) => {
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
      weightLogs: [
        {
          id: 'w1',
          date: '2026-10-20',
          timestamp: '2026-10-20T08:00:00Z',
          weight_kg: 82.5,
          trend_weight_kg: 82.5,
          updatedAt: 1000
        }
      ],
      logWeight: mockLogWeight,
      deleteWeightLog: vi.fn(),
      isSettingsOpen: false,
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
      refreshCatalog: vi.fn(),
      ...overrides
    } as any);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders read-only pan cards with current calorie and macro targets in manual mode', () => {
    setupMockContext();
    render(<UserProfileGoalsScreen />);

    // Screen container
    expect(screen.getByTestId('user-profile-goals-screen')).toBeDefined();

    // Summary Card
    expect(screen.getByTestId('goals-summary-card')).toBeDefined();
    expect(screen.getByTestId('summary-calories-value').textContent).toContain('2,000');

    // Edit button exists
    expect(screen.getByTestId('btn-edit-goals')).toBeDefined();

    // Edit inputs are not visible initially (since modal is closed)
    expect(screen.queryByTestId('btn-back-goals-editor')).toBeNull();
    expect(screen.queryByTestId('select-biometrics-sex')).toBeNull();
  });

  it('triggers confirmation dialog when user clicks Smart / Adaptive switch from manual mode', () => {
    setupMockContext();
    render(<UserProfileGoalsScreen />);

    const smartBtn = screen.getByTestId('btn-target-mode-smart');
    fireEvent.click(smartBtn);

    // Confirm dialog should be open
    expect(screen.getByTestId('confirm-mode-switch-modal')).toBeDefined();
    expect(screen.getByTestId('btn-cancel-mode-switch')).toBeDefined();
    expect(screen.getByTestId('btn-confirm-mode-switch')).toBeDefined();

    // Canceling closes dialog without calling updateUserSettings
    fireEvent.click(screen.getByTestId('btn-cancel-mode-switch'));
    expect(screen.queryByTestId('confirm-mode-switch-modal')).toBeNull();
    expect(mockUpdateUserSettings).not.toHaveBeenCalled();
  });

  it('switches to Smart / Adaptive mode upon confirmation in confirm dialog', async () => {
    setupMockContext();
    render(<UserProfileGoalsScreen />);

    fireEvent.click(screen.getByTestId('btn-target-mode-smart'));
    fireEvent.click(screen.getByTestId('btn-confirm-mode-switch'));

    await waitFor(() => {
      expect(mockUpdateUserSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          target_mode: 'adaptive'
        })
      );
    });

    expect(screen.queryByTestId('confirm-mode-switch-modal')).toBeNull();
  });

  it('opens GoalsEditModal on Edit Goals button click and closes on back arrow', () => {
    setupMockContext();
    render(<UserProfileGoalsScreen />);

    expect(screen.queryByRole('dialog')).toBeNull();

    // Click edit goals
    fireEvent.click(screen.getByTestId('btn-edit-goals'));

    // Modal dialog is open
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByTestId('btn-back-goals-editor')).toBeDefined();
    expect(screen.getByTestId('btn-save-nutritional-targets')).toBeDefined();

    // Click back button closes modal
    fireEvent.click(screen.getByTestId('btn-back-goals-editor'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('edits manual targets inside GoalsEditModal and submits successfully', async () => {
    setupMockContext();
    render(<UserProfileGoalsScreen />);

    fireEvent.click(screen.getByTestId('btn-edit-goals'));

    // Calorie input inside modal
    const calInput = screen.getByDisplayValue('2000');
    fireEvent.change(calInput, { target: { value: '2350' } });

    // Save
    fireEvent.click(screen.getByTestId('btn-save-nutritional-targets'));

    await waitFor(() => {
      expect(mockUpdateUserSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          target_mode: 'manual',
          daily_calorie_target: 2350
        })
      );
    });
  });

  it('renders biometrics and strategy summary cards when in smart/adaptive mode', () => {
    setupMockContext({
      userSettings: {
        ...baseUserSettings,
        target_mode: 'adaptive'
      }
    });
    render(<UserProfileGoalsScreen />);

    expect(screen.getByTestId('biometrics-summary-card')).toBeDefined();
    expect(screen.getByTestId('strategy-summary-card')).toBeDefined();
    expect(screen.getByTestId('adaptive-status-badge')).toBeDefined();
  });
});
