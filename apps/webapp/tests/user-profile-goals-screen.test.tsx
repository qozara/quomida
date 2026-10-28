// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { UserProfileGoalsScreen } from '../src/components/profile/UserProfileGoalsScreen.js';
import * as AppContextModule from '../src/context/AppContext.js';
import en from '../../../packages/i18n-locales/locales/en.json';
import type { UserSettings } from '@quomida/domain-core';

describe('UserProfileGoalsScreen & Focused Modals Component Suite', () => {
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

  it('1. renders Goal Strategy card below mode switcher with unified Target icon & title', () => {
    setupMockContext();
    const { container } = render(<UserProfileGoalsScreen />);

    // Screen container
    expect(screen.getByTestId('user-profile-goals-screen')).toBeDefined();

    // Goal Strategy card exists
    const strategyCard = screen.getByTestId('strategy-summary-card');
    expect(strategyCard).toBeDefined();
    expect(strategyCard.textContent).toContain('Goal Strategy');
    expect(strategyCard.textContent).toContain('Manual Targets');

    // Daily Target card exists below it
    const targetCard = screen.getByTestId('goals-summary-card');
    expect(targetCard).toBeDefined();

    // Verify ordering in DOM: strategyCard comes before targetCard
    const positionCompare = strategyCard.compareDocumentPosition(targetCard);
    expect(positionCompare & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('2. triggers confirmation dialog when user clicks Smart / Adaptive switch from manual mode', () => {
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

  it('3. switches to Smart / Adaptive mode upon confirmation in confirm dialog', async () => {
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

  it('4. opens ManualGoalsEditModal when Edit Goals is clicked in manual mode', () => {
    setupMockContext();
    render(<UserProfileGoalsScreen />);

    expect(screen.queryByTestId('manual-goals-edit-modal')).toBeNull();

    // Click edit goals
    fireEvent.click(screen.getByTestId('btn-edit-goals'));

    // Manual editor is open
    expect(screen.getByTestId('manual-goals-edit-modal')).toBeDefined();
    expect(screen.getByTestId('btn-back-manual-goals')).toBeDefined();
    expect(screen.getByTestId('input-calorie-target')).toBeDefined();
    expect(screen.getByTestId('input-protein-target')).toBeDefined();
    expect(screen.getByTestId('btn-save-nutritional-targets')).toBeDefined();

    // Biometrics inputs must NOT be inside this modal
    expect(screen.queryByTestId('select-biometrics-sex')).toBeNull();
    expect(screen.queryByTestId('btn-goal-lose')).toBeNull();

    // Click back button closes modal
    fireEvent.click(screen.getByTestId('btn-back-manual-goals'));
    expect(screen.queryByTestId('manual-goals-edit-modal')).toBeNull();
  });

  it('5. edits manual targets inside ManualGoalsEditModal and submits successfully', async () => {
    setupMockContext();
    render(<UserProfileGoalsScreen />);

    fireEvent.click(screen.getByTestId('btn-edit-goals'));

    const calInput = screen.getByTestId('input-calorie-target') as HTMLInputElement;
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

  it('6. opens AdaptiveGoalsEditModal when Edit Goals is clicked in smart mode and shows Activity level in Daily Target card', () => {
    setupMockContext({
      userSettings: {
        ...baseUserSettings,
        target_mode: 'adaptive'
      }
    });
    render(<UserProfileGoalsScreen />);

    // Activity level badge is rendered within the Daily Target card in smart mode
    expect(screen.getByTestId('target-activity-badge')).toBeDefined();
    expect(screen.getByTestId('target-activity-badge').textContent).toContain('Moderately Active');

    // Click edit goals opens AdaptiveGoalsEditModal
    fireEvent.click(screen.getByTestId('btn-edit-goals'));
    expect(screen.getByTestId('adaptive-goals-edit-modal')).toBeDefined();
    expect(screen.getByTestId('btn-back-adaptive-goals')).toBeDefined();
    expect(screen.getByTestId('select-biometrics-activity')).toBeDefined();
    expect(screen.getByTestId('btn-goal-lose')).toBeDefined();
    expect(screen.getByTestId('slider-weekly-rate')).toBeDefined();
    expect(screen.getByTestId('checkbox-adaptive-toggle')).toBeDefined();
    expect(screen.getByTestId('preview-seed-tdee')).toBeDefined();

    // Biometrics physical inputs must NOT be inside this modal
    expect(screen.queryByTestId('select-biometrics-sex')).toBeNull();
    expect(screen.queryByTestId('input-biometrics-height')).toBeNull();
  });

  it('7. opens BiometricsEditModal from Biometrics card and saves updated measurements', async () => {
    setupMockContext();
    render(<UserProfileGoalsScreen />);

    // Biometrics card exists and has its own edit button
    expect(screen.getByTestId('biometrics-summary-card')).toBeDefined();
    const editBioBtn = screen.getByTestId('btn-edit-biometrics');
    expect(editBioBtn).toBeDefined();

    // Click Edit Biometrics
    fireEvent.click(editBioBtn);

    expect(screen.getByTestId('biometrics-edit-modal')).toBeDefined();
    expect(screen.getByTestId('btn-back-biometrics')).toBeDefined();
    expect(screen.getByTestId('select-biometrics-sex')).toBeDefined();
    expect(screen.getByTestId('input-biometrics-birthdate')).toBeDefined();
    expect(screen.getByTestId('input-biometrics-height')).toBeDefined();
    expect(screen.getByTestId('input-biometrics-weight')).toBeDefined();

    // Change height and weight
    fireEvent.change(screen.getByTestId('input-biometrics-height'), { target: { value: '185' } });
    fireEvent.change(screen.getByTestId('input-biometrics-weight'), { target: { value: '84.0' } });

    // Save Biometrics
    fireEvent.click(screen.getByTestId('btn-save-biometrics'));

    await waitFor(() => {
      expect(mockLogWeight).toHaveBeenCalledWith(expect.any(String), 84.0);
      expect(mockUpdateUserSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          biometrics: expect.objectContaining({
            height_cm: 185
          })
        })
      );
    });
  });
});
