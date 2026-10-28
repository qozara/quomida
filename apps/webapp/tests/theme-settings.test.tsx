/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleOAuthProvider } from '@react-oauth/google';
import {
  resolveSystemTheme,
  resolveEffectiveTheme,
  AppProvider,
  useApp
} from '../src/context/AppContext.js';
import * as AppContextModule from '../src/context/AppContext.js';
import { SettingsModal } from '../src/components/SettingsModal.js';
import { en, es } from '@quomida/i18n-locales';
import { clearLocalDatabase } from '../src/db/rxdb.js';

describe('Expanded Theme Options (System Default, Light, Dark)', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(async () => {
    vi.clearAllMocks();
    document.documentElement.className = '';
    await clearLocalDatabase();
  });

  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    window.matchMedia = originalMatchMedia;
    document.documentElement.className = '';
    await clearLocalDatabase();
  });

  describe('1. Theme Resolution Helpers', () => {
    it('resolveSystemTheme returns "dark" when media query prefers dark', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      expect(resolveSystemTheme()).toBe('dark');
    });

    it('resolveSystemTheme returns "light" when media query prefers light', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      expect(resolveSystemTheme()).toBe('light');
    });

    it('resolveSystemTheme safely falls back to "dark" when matchMedia is missing', () => {
      // @ts-ignore
      delete window.matchMedia;
      expect(resolveSystemTheme()).toBe('dark');
    });

    it('resolveEffectiveTheme returns explicit choice or delegates to system', () => {
      // Light
      expect(resolveEffectiveTheme('light')).toBe('light');
      // Dark
      expect(resolveEffectiveTheme('dark')).toBe('dark');

      // System with dark matchMedia
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      expect(resolveEffectiveTheme('system')).toBe('dark');

      // System with light matchMedia
      window.matchMedia = vi.fn().mockImplementation(() => ({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      expect(resolveEffectiveTheme('system')).toBe('light');
    });
  });

  describe('2. SettingsModal 3-Option Theme Selector', () => {
    it('renders all 3 theme buttons (System, Light, Dark) with correct active button', () => {
      const mockSetTheme = vi.fn();
      vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
        locale: 'en',
        theme: 'system',
        setTheme: mockSetTheme,
        userSettings: {
          daily_calorie_target: 2000,
          custom_macros: { protein: 150, carbs: 200, fats: 65 }
        },
        updateUserSettings: vi.fn(),
        syncStatus: 'idle',
        uxSyncState: 'local',
        activeProvider: null,
        lastSyncedTime: 'Just now',
        isSettingsOpen: true,
        setIsSettingsOpen: vi.fn(),
        setIsStorageSettingsOpen: vi.fn(),
        catalogVersion: '1.0.0',
        catalogGeneratedAt: '2026-10-01',
        catalogFileSizeBytes: 1000,
        refreshCatalog: vi.fn(),
        itemCounts: { logs: 1, customFoods: 1 },
        isOnline: true,
        t: en,
        resetCatalogState: vi.fn()
      } as any);

      render(<SettingsModal />);

      const btnSystem = screen.getByTestId('btn-theme-system');
      const btnLight = screen.getByTestId('btn-theme-light');
      const btnDark = screen.getByTestId('btn-theme-dark');

      expect(btnSystem).toBeDefined();
      expect(btnLight).toBeDefined();
      expect(btnDark).toBeDefined();

      // System button should be active (bg-emerald-500)
      expect(btnSystem.className).toContain('bg-emerald-500');
      expect(btnLight.className).not.toContain('bg-emerald-500');
      expect(btnDark.className).not.toContain('bg-emerald-500');
    });

    it('clicking each theme button invokes setTheme with system, light, or dark', () => {
      const mockSetTheme = vi.fn();
      vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
        locale: 'es',
        theme: 'dark',
        setTheme: mockSetTheme,
        userSettings: {
          daily_calorie_target: 2000,
          custom_macros: { protein: 150, carbs: 200, fats: 65 }
        },
        updateUserSettings: vi.fn(),
        syncStatus: 'idle',
        uxSyncState: 'local',
        activeProvider: null,
        lastSyncedTime: 'Just now',
        isSettingsOpen: true,
        setIsSettingsOpen: vi.fn(),
        setIsStorageSettingsOpen: vi.fn(),
        catalogVersion: '1.0.0',
        catalogGeneratedAt: '2026-10-01',
        catalogFileSizeBytes: 1000,
        refreshCatalog: vi.fn(),
        itemCounts: { logs: 1, customFoods: 1 },
        isOnline: true,
        t: es,
        resetCatalogState: vi.fn()
      } as any);

      render(<SettingsModal />);

      const btnSystem = screen.getByTestId('btn-theme-system');
      const btnLight = screen.getByTestId('btn-theme-light');
      const btnDark = screen.getByTestId('btn-theme-dark');

      // Click System
      fireEvent.click(btnSystem);
      expect(mockSetTheme).toHaveBeenCalledWith('system');

      // Click Light
      fireEvent.click(btnLight);
      expect(mockSetTheme).toHaveBeenCalledWith('light');

      // Click Dark
      fireEvent.click(btnDark);
      expect(mockSetTheme).toHaveBeenCalledWith('dark');
    });
  });

  describe('3. Default Boot & Storage Behavior', () => {
    it('defaults to "system" theme on a fresh database boot', async () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-color-scheme: dark)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));

      let currentContextTheme: string | undefined;
      const Consumer = () => {
        const { theme } = useApp();
        currentContextTheme = theme;
        return <div data-testid="current-theme">{theme}</div>;
      };

      render(
        <GoogleOAuthProvider clientId="dummy_test_id">
          <AppProvider>
            <Consumer />
          </AppProvider>
        </GoogleOAuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('current-theme').textContent).toBe('system');
      });

      expect(currentContextTheme).toBe('system');
    });

    it('attaches listener to matchMedia when theme is system and updates class on change', async () => {
      let listenerCallback: (() => void) | null = null;
      let isDarkPref = false;

      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        get matches() {
          return isDarkPref;
        },
        addEventListener: vi.fn((event: string, cb: any) => {
          if (event === 'change') listenerCallback = cb;
        }),
        removeEventListener: vi.fn(),
      }));

      render(
        <GoogleOAuthProvider clientId="dummy_test_id">
          <AppProvider>
            <div data-testid="ready" />
          </AppProvider>
        </GoogleOAuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('ready')).toBeDefined();
      });

      // Initially light
      expect(document.documentElement.classList.contains('dark')).toBe(false);

      // System changes to dark
      isDarkPref = true;
      act(() => {
        if (listenerCallback) listenerCallback();
      });

      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });
});
