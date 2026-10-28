/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardContent } from '../src/App.js';
import { SettingsModal } from '../src/components/SettingsModal.js';
import * as AppContext from '../src/context/AppContext.js';
import { en } from '@quomida/i18n-locales';

describe('Modern User Settings & Home Avatar Action Specifications', () => {
  const mockSetIsSettingsOpen = vi.fn();
  const mockSetIsCatalogOpen = vi.fn();
  const mockSetIsAnalyticsOpen = vi.fn();
  const mockSetIsStorageSettingsOpen = vi.fn();
  const mockUpdateUserSettings = vi.fn().mockResolvedValue(undefined);

  const baseContext = {
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
      target_mode: 'manual'
    },
    updateUserSettings: mockUpdateUserSettings,
    activeProvider: null,
    uxSyncState: 'local',
    syncStatus: 'disconnected',
    isOnline: true,
    isSettingsOpen: false,
    setIsSettingsOpen: mockSetIsSettingsOpen,
    isCatalogOpen: false,
    setIsCatalogOpen: mockSetIsCatalogOpen,
    isAnalyticsOpen: false,
    setIsAnalyticsOpen: mockSetIsAnalyticsOpen,
    isStorageSettingsOpen: false,
    setIsStorageSettingsOpen: mockSetIsStorageSettingsOpen,
    dbInitError: null,
    dbVersion: 6,
    itemCounts: { logs: 5, catalog: 887, recipes: 0 },
    dailyLogs: [],
    weightLogs: [],
    ingredients: [],
    recipes: [],
    recipeFoods: [],
    logWeight: vi.fn(),
    refreshCatalog: vi.fn(),
    resetCatalogState: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Home Main Screen Top-Left Avatar Action', () => {
    it('renders Quomida app icon (/favicon.svg) when user is not connected to cloud storage', () => {
      vi.spyOn(AppContext, 'useApp').mockReturnValue({
        ...baseContext,
        activeProvider: null,
        userSettings: {
          daily_calorie_target: 2000,
          custom_macros: { protein: 150, carbs: 200, fats: 65 }
        }
      } as any);

      render(<DashboardContent />);

      const avatarBtn = screen.getByTestId('btn-open-settings-avatar');
      expect(avatarBtn).toBeDefined();
      const img = avatarBtn.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toBe('/favicon.svg');
    });

    it('renders Google profile picture when user is connected with profile picture', () => {
      vi.spyOn(AppContext, 'useApp').mockReturnValue({
        ...baseContext,
        userSettings: {
          daily_calorie_target: 2000,
          custom_macros: { protein: 150, carbs: 200, fats: 65 },
          active_cloud_provider: {
            id: 'google-drive',
            credentials: {
              userName: 'Jane Doe',
              userEmail: 'jane@gmail.com',
              userPicture: 'https://lh3.googleusercontent.com/a/photo.jpg'
            }
          }
        },
        activeProvider: {
          id: 'google-drive',
          name: 'Google Drive',
          getStatus: () => 'idle',
          isInitialized: () => true,
          getUserPicture: () => 'https://lh3.googleusercontent.com/a/photo.jpg'
        }
      } as any);

      render(<DashboardContent />);

      const avatarBtn = screen.getByTestId('btn-open-settings-avatar');
      expect(avatarBtn).toBeDefined();
      const img = avatarBtn.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toBe('https://lh3.googleusercontent.com/a/photo.jpg');
    });

    it('clicking top-left avatar button opens Settings dialog', () => {
      vi.spyOn(AppContext, 'useApp').mockReturnValue({
        ...baseContext
      } as any);

      render(<DashboardContent />);

      const avatarBtn = screen.getByTestId('btn-open-settings-avatar');
      fireEvent.click(avatarBtn);
      expect(mockSetIsSettingsOpen).toHaveBeenCalledWith(true);
    });

    it('renders the same avatar button across all 4 main screens (Diary, Progress, My Foods, Goals) and removes gear icon from Goals', () => {
      // 1. Diary
      vi.spyOn(AppContext, 'useApp').mockReturnValue({
        ...baseContext
      } as any);
      const { unmount: unmountDiary } = render(<DashboardContent />);
      expect(screen.getByTestId('btn-open-settings-avatar')).toBeDefined();
      unmountDiary();

      // 2. Progress / Analytics
      vi.spyOn(AppContext, 'useApp').mockReturnValue({
        ...baseContext,
        isAnalyticsOpen: true
      } as any);
      const { unmount: unmountAnalytics } = render(<DashboardContent />);
      expect(screen.getByTestId('btn-open-settings-avatar')).toBeDefined();
      unmountAnalytics();

      // 3. My Foods / Catalog
      vi.spyOn(AppContext, 'useApp').mockReturnValue({
        ...baseContext,
        isCatalogOpen: true
      } as any);
      const { unmount: unmountCatalog } = render(<DashboardContent />);
      expect(screen.getByTestId('btn-open-settings-avatar')).toBeDefined();
      unmountCatalog();

      // 4. Goals
      vi.spyOn(AppContext, 'useApp').mockReturnValue({
        ...baseContext,
        isProfileOpen: true
      } as any);
      const { unmount: unmountGoals } = render(<DashboardContent />);
      expect(screen.getByTestId('btn-open-settings-avatar')).toBeDefined();
      expect(screen.queryByTestId('btn-profile-open-settings')).toBeNull();
      unmountGoals();
    });
  });

  describe('Modern Settings Full-Screen Slide-Over', () => {
    it('renders modern full-screen container with back arrow button and title', () => {
      vi.spyOn(AppContext, 'useApp').mockReturnValue({
        ...baseContext,
        isSettingsOpen: true
      } as any);

      render(<SettingsModal />);

      // Verify full-screen dialog
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeDefined();
      expect(dialog.className).toContain('fixed inset-0 z-50');
      expect(dialog.className).toContain('animate-slide-in-right');

      // Verify back button
      const backBtn = screen.getByTestId('btn-back-settings');
      expect(backBtn).toBeDefined();
      fireEvent.click(backBtn);
      expect(mockSetIsSettingsOpen).toHaveBeenCalledWith(false);

      // Verify title
      expect(screen.getByText(en.settings.title)).toBeDefined();
    });

    it('displays connected user profile card at the top when connected to cloud', () => {
      vi.spyOn(AppContext, 'useApp').mockReturnValue({
        ...baseContext,
        isSettingsOpen: true,
        userSettings: {
          daily_calorie_target: 2000,
          custom_macros: { protein: 150, carbs: 200, fats: 65 },
          active_cloud_provider: {
            id: 'google-drive',
            credentials: {
              userName: 'Jane Doe',
              userEmail: 'jane@gmail.com',
              userPicture: 'https://lh3.googleusercontent.com/a/photo.jpg'
            }
          }
        },
        activeProvider: {
          id: 'google-drive',
          name: 'Google Drive',
          getStatus: () => 'idle',
          isInitialized: () => true,
          getUserPicture: () => 'https://lh3.googleusercontent.com/a/photo.jpg'
        },
        uxSyncState: 'synced'
      } as any);

      render(<SettingsModal />);

      // Top hero displays user details
      expect(screen.getByText('Jane Doe')).toBeDefined();
      expect(screen.getByText('jane@gmail.com')).toBeDefined();
      const heroImg = screen.getByAltText('Jane Doe');
      expect(heroImg.getAttribute('src')).toBe('https://lh3.googleusercontent.com/a/photo.jpg');
    });

    it('displays Quomida app hero at the top when not connected to cloud', () => {
      vi.spyOn(AppContext, 'useApp').mockReturnValue({
        ...baseContext,
        isSettingsOpen: true,
        userSettings: {
          daily_calorie_target: 2000,
          custom_macros: { protein: 150, carbs: 200, fats: 65 }
        },
        activeProvider: null
      } as any);

      render(<SettingsModal />);

      // Top hero displays app brand
      expect(screen.getByText('Quomida')).toBeDefined();
      expect(screen.getByText('Local-first')).toBeDefined();
    });
  });
});
