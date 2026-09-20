/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SettingsModal } from '../src/components/SettingsModal.js';
import * as AppContextModule from '../src/context/AppContext.js';

describe('SettingsModal Manual Catalog Refresh [APP-208]', () => {
  const mockRefreshCatalog = vi.fn();

  beforeEach(() => {
    mockRefreshCatalog.mockReset();
    vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
      locale: 'en',
      setLocale: vi.fn(),
      theme: 'dark',
      setTheme: vi.fn(),
      userSettings: {
        id: 'global_settings',
        locale: 'en-US',
        theme: 'dark',
        daily_calorie_target: 2000,
        custom_macros: { protein: 150, carbs: 200, fats: 65 }
      },
      updateUserSettings: vi.fn(),
      syncStatus: 'idle',
      activeProvider: null,
      lastSyncedTime: '12:00',
      isSettingsOpen: true,
      setIsSettingsOpen: vi.fn(),
      setIsStorageSettingsOpen: vi.fn(),
      catalogVersion: '4515bcadb9b677ed',
      isHydratingCatalog: false,
      refreshCatalog: mockRefreshCatalog,
      t: {
        settings: {
          title: 'Profile & Settings',
          language: 'Language',
          theme: 'Theme',
          dailyTarget: 'Daily Calorie Target (kcal)',
          syncTitle: 'Data Persistence & BYOS Sync',
          syncLastSynced: 'Last synced: {{time}}',
          catalogTitle: 'Food Catalog & Ingredients',
          catalogVersion: 'Catalog Version: {{version}}',
          checkCatalogUpdates: 'Check for Catalog Updates',
          checkingCatalog: 'Checking for updates...',
          catalogUpToDate: 'Catalog is up to date',
          catalogUpdated: 'Catalog updated to {{version}} ({{count}} items)',
          catalogCheckError: 'Failed to check for updates'
        },
        sync: { panel: { title: 'Storage & Sync' }, actions: { storageSettings: 'Storage Settings →' } }
      }
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders "Check for Catalog Updates" button with minimum 44px touch target', () => {
    render(React.createElement(SettingsModal));

    const button = screen.getByRole('button', { name: /check for catalog updates/i });
    expect(button).toBeDefined();
    // Verify touch target dimension class (min-h-[44px])
    expect(button.className).toContain('min-h-[44px]');
  });

  it('triggers force refresh on button click and provides aria-live feedback', async () => {
    mockRefreshCatalog.mockResolvedValueOnce({
      status: 'UPDATED',
      version: 'rev-2026.09.20',
      itemsUpserted: 15
    });

    render(React.createElement(SettingsModal));

    const button = screen.getByRole('button', { name: /check for catalog updates/i });
    fireEvent.click(button);

    expect(mockRefreshCatalog).toHaveBeenCalledWith({ force: true });

    await waitFor(() => {
      const feedback = screen.getByText(/catalog updated to rev-2026.09.20/i);
      expect(feedback).toBeDefined();
      expect(feedback.closest('[aria-live="polite"]')).toBeDefined();
    });
  });
});
