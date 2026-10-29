/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { en, es } from '@quomida/i18n-locales';
import {
  usePwaUpdate,
  registerPwaServiceWorker,
  checkForPwaAppUpdate,
  applyPwaAppUpdate,
  resetSharedPwaUpdateState,
  VISIBILITY_UPDATE_COOLDOWN_MS
} from '../src/hooks/usePwaUpdate.js';
import { PwaUpdatePrompt } from '../src/components/PwaUpdatePrompt.js';
import { SettingsModal } from '../src/components/SettingsModal.js';
import * as AppContext from '../src/context/AppContext.js';

describe('PWA Service Worker Update Lifecycle (Prompt, Visibility Resume & Settings Check)', () => {
  beforeEach(() => {
    resetSharedPwaUpdateState();
    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      locale: 'en',
      setLocale: vi.fn(),
      theme: 'dark',
      setTheme: vi.fn(),
      userSettings: {
        daily_calorie_target: 2000,
        custom_macros: { protein: 150, carbs: 200, fats: 65 }
      },
      updateUserSettings: vi.fn(),
      syncStatus: 'idle',
      activeProvider: null,
      lastSyncedTime: 'Just now',
      isSettingsOpen: true,
      setIsSettingsOpen: vi.fn(),
      setIsStorageSettingsOpen: vi.fn(),
      catalogVersion: '1.0.0',
      catalogGeneratedAt: '2026-10-01',
      catalogFileSizeBytes: 1000,
      refreshCatalog: vi.fn(),
      itemCounts: { logs: 10, customFoods: 2 },
      clearLocalDatabase: vi.fn(),
      disconnectProvider: vi.fn(),
      isOnline: true,
      dbVersion: 1,
      t: en
    } as any);
  });

  afterEach(() => {
    cleanup();
    resetSharedPwaUpdateState();
    vi.restoreAllMocks();
  });

  describe('Trigger 1: Event-Driven Check on App Resume (visibilitychange)', () => {
    it('triggers registration.update() when document visibilityState becomes visible after cooldown', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const mockRegistration = {
        update: mockUpdate,
        waiting: null,
        installing: null
      } as unknown as ServiceWorkerRegistration;

      const mockRegisterSW = vi.fn((options?: any) => {
        options?.onRegisteredSW?.('/sw.js', mockRegistration);
        return vi.fn().mockResolvedValue(undefined);
      });

      const nowSpy = vi.spyOn(Date, 'now');
      const initialTime = 1_000_000_000;
      nowSpy.mockReturnValue(initialTime);

      const cleanupListeners = registerPwaServiceWorker(mockRegisterSW);

      // Simulate time advancing past cooldown so visibilitychange triggers an update check
      nowSpy.mockReturnValue(initialTime + VISIBILITY_UPDATE_COOLDOWN_MS + 1000);

      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible'
      });

      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(mockUpdate).toHaveBeenCalledTimes(1);

      // Immediate second visibilitychange within cooldown should be throttled (no background spam)
      nowSpy.mockReturnValue(initialTime + VISIBILITY_UPDATE_COOLDOWN_MS + 2000);
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(mockUpdate).toHaveBeenCalledTimes(1);

      cleanupListeners();
    });

    it('does not trigger registration.update() when document is hidden or offline', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const mockRegistration = {
        update: mockUpdate,
        waiting: null,
        installing: null
      } as unknown as ServiceWorkerRegistration;

      const mockRegisterSW = vi.fn((options?: any) => {
        options?.onRegisteredSW?.('/sw.js', mockRegistration);
        return vi.fn().mockResolvedValue(undefined);
      });

      const cleanupListeners = registerPwaServiceWorker(mockRegisterSW);

      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + VISIBILITY_UPDATE_COOLDOWN_MS * 2);
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden'
      });

      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(mockUpdate).not.toHaveBeenCalled();
      cleanupListeners();
    });
  });

  describe('Trigger 2: Non-Disruptive Update Prompt Toast (PwaUpdatePrompt)', () => {
    it('remains hidden when needRefresh is false and renders accessible prompt when update is ready', async () => {
      let capturedOptions: any;
      const mockUpdateSW = vi.fn().mockResolvedValue(undefined);
      const mockRegisterSW = vi.fn((options?: any) => {
        capturedOptions = options;
        return mockUpdateSW;
      });

      const cleanupListeners = registerPwaServiceWorker(mockRegisterSW);

      render(<PwaUpdatePrompt />);
      expect(screen.queryByTestId('pwa-update-prompt')).toBeNull();

      // Simulate Workbox detecting a waiting Service Worker (onNeedRefresh)
      await act(async () => {
        capturedOptions?.onNeedRefresh?.();
      });

      const promptBanner = await screen.findByTestId('pwa-update-prompt');
      expect(promptBanner).toBeDefined();
      expect(screen.getByText(en.pwaUpdate.bannerTitle)).toBeDefined();
      expect(screen.getByText(en.pwaUpdate.bannerDescription)).toBeDefined();

      // Clicking "Update & Reload" calls updateServiceWorker(true)
      const updateBtn = screen.getByTestId('btn-pwa-update-reload');
      await act(async () => {
        fireEvent.click(updateBtn);
      });
      expect(mockUpdateSW).toHaveBeenCalledWith(true);

      cleanupListeners();
    });

    it('allows dismissing the update prompt without losing needRefresh state in Settings', async () => {
      let capturedOptions: any;
      const mockRegisterSW = vi.fn((options?: any) => {
        capturedOptions = options;
        return vi.fn().mockResolvedValue(undefined);
      });

      const cleanupListeners = registerPwaServiceWorker(mockRegisterSW);

      render(<PwaUpdatePrompt />);
      await act(async () => {
        capturedOptions?.onNeedRefresh?.();
      });

      expect(screen.getByTestId('pwa-update-prompt')).toBeDefined();

      const dismissBtn = screen.getByTestId('btn-pwa-update-dismiss');
      await act(async () => {
        fireEvent.click(dismissBtn);
      });

      expect(screen.queryByTestId('pwa-update-prompt')).toBeNull();
      cleanupListeners();
    });
  });

  describe('Trigger 3: Manual "Check for App Update" Button in Settings', () => {
    it('checks for app updates in SettingsModal and shows up-to-date status when no new SW is waiting', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const mockRegistration = {
        update: mockUpdate,
        waiting: null,
        installing: null
      } as unknown as ServiceWorkerRegistration;

      const cleanupListeners = registerPwaServiceWorker((options?: any) => {
        options?.onRegisteredSW?.('/sw.js', mockRegistration);
        return vi.fn().mockResolvedValue(undefined);
      });

      render(<SettingsModal />);

      // Open About & Legal accordion
      const aboutHeader = screen.getByTestId('accordion-header-about-legal');
      fireEvent.click(aboutHeader);

      const checkBtn = screen.getByTestId('btn-check-app-update');
      expect(checkBtn).toBeDefined();

      await act(async () => {
        fireEvent.click(checkBtn);
      });

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(screen.getByText(new RegExp(en.settings.appUpToDate, 'i'))).toBeDefined();
      });

      cleanupListeners();
    });

    it('detects waiting service worker during manual check and offers Update & Reload Now action', async () => {
      const mockUpdateSW = vi.fn().mockResolvedValue(undefined);
      const mockRegistration: any = {
        waiting: null,
        installing: null,
        update: vi.fn().mockImplementation(async () => {
          // Simulate browser finding a new waiting SW after registration.update()
          mockRegistration.waiting = { state: 'installed' };
        })
      };

      const cleanupListeners = registerPwaServiceWorker((options?: any) => {
        options?.onRegisteredSW?.('/sw.js', mockRegistration);
        return mockUpdateSW;
      });

      render(<SettingsModal />);

      const aboutHeader = screen.getByTestId('accordion-header-about-legal');
      fireEvent.click(aboutHeader);

      const checkBtn = screen.getByTestId('btn-check-app-update');
      await act(async () => {
        fireEvent.click(checkBtn);
      });

      // Now "Update & Reload Now" button should appear in Settings
      const installBtn = await screen.findByTestId('btn-install-app-update');
      expect(installBtn).toBeDefined();
      expect(screen.getByText(new RegExp(en.settings.appUpdateAvailable, 'i'))).toBeDefined();

      await act(async () => {
        fireEvent.click(installBtn);
      });

      expect(mockUpdateSW).toHaveBeenCalledWith(true);

      cleanupListeners();
    });
  });

  describe('Trigger 4: Update Execution & Reload Resilience (Dialog & Settings)', () => {
    it('messages waiting service worker with SKIP_WAITING and triggers window.location.reload on controllerchange', async () => {
      const mockPostMessage = vi.fn();
      const mockWaitingWorker = {
        postMessage: mockPostMessage,
        state: 'installed'
      };

      const mockRegistration: any = {
        waiting: mockWaitingWorker,
        installing: null,
        update: vi.fn()
      };

      let controllerChangeHandler: (() => void) | null = null;
      const mockServiceWorkerContainer = {
        addEventListener: vi.fn((event: string, handler: any) => {
          if (event === 'controllerchange') {
            controllerChangeHandler = handler;
          }
        }),
        removeEventListener: vi.fn(),
        getRegistration: vi.fn().mockResolvedValue(mockRegistration)
      };
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: mockServiceWorkerContainer
      });

      const originalReload = window.location.reload;
      const reloadMock = vi.fn();
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
          ...window.location,
          reload: reloadMock
        }
      });

      const mockUpdateSW = vi.fn().mockResolvedValue(undefined);
      const cleanupListeners = registerPwaServiceWorker((options?: any) => {
        options?.onRegisteredSW?.('/sw.js', mockRegistration);
        return mockUpdateSW;
      });

      render(<PwaUpdatePrompt />);

      const updateBtn = screen.getByTestId('btn-pwa-update-reload');
      expect(updateBtn).toBeDefined();

      await act(async () => {
        fireEvent.click(updateBtn);
      });

      // Verify button disabled state and feedback
      expect(updateBtn.hasAttribute('disabled')).toBe(true);
      expect(mockUpdateSW).toHaveBeenCalledWith(true);
      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

      // Simulate controllerchange event firing from activated ServiceWorker
      expect(controllerChangeHandler).toBeDefined();
      act(() => {
        controllerChangeHandler!();
      });

      expect(reloadMock).toHaveBeenCalledTimes(1);

      cleanupListeners();
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
          ...window.location,
          reload: originalReload
        }
      });
    });

    it('triggers fallback window.location.reload when controllerchange does not fire (dev or uncontrolled mode)', async () => {
      vi.useFakeTimers();

      const originalReload = window.location.reload;
      const reloadMock = vi.fn();
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
          ...window.location,
          reload: reloadMock
        }
      });

      const mockUpdateSW = vi.fn().mockResolvedValue(undefined);
      const cleanupListeners = registerPwaServiceWorker((options?: any) => {
        options?.onNeedRefresh?.();
        return mockUpdateSW;
      });

      render(<PwaUpdatePrompt />);

      const updateBtn = screen.getByTestId('btn-pwa-update-reload');
      await act(async () => {
        fireEvent.click(updateBtn);
      });

      expect(mockUpdateSW).toHaveBeenCalledWith(true);
      expect(reloadMock).not.toHaveBeenCalled();

      // Fast-forward past 500ms fallback timer
      await act(async () => {
        vi.advanceTimersByTime(600);
      });

      expect(reloadMock).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
      cleanupListeners();
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
          ...window.location,
          reload: originalReload
        }
      });
    });

    it('disables Update & Reload button in SettingsModal while update application is in progress', async () => {
      const mockUpdateSW = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));
      const cleanupListeners = registerPwaServiceWorker((options?: any) => {
        options?.onNeedRefresh?.();
        return mockUpdateSW;
      });

      render(<SettingsModal />);
      const aboutHeader = screen.getByTestId('accordion-header-about-legal');
      fireEvent.click(aboutHeader);

      const installBtn = await screen.findByTestId('btn-install-app-update');
      expect(installBtn.hasAttribute('disabled')).toBe(false);

      await act(async () => {
        fireEvent.click(installBtn);
      });

      expect(installBtn.hasAttribute('disabled')).toBe(true);
      expect(mockUpdateSW).toHaveBeenCalledWith(true);

      cleanupListeners();
    });
  });

  describe('Dual-Language i18n Key Parity for PWA Update Lifecycle', () => {
    it('verifies en and es dictionaries contain all pwaUpdate and settings app update keys', () => {
      expect(en.pwaUpdate.bannerTitle).toBeDefined();
      expect(es.pwaUpdate.bannerTitle).toBeDefined();
      expect(en.pwaUpdate.bannerDescription).toBeDefined();
      expect(es.pwaUpdate.bannerDescription).toBeDefined();
      expect(en.pwaUpdate.reloadNow).toBeDefined();
      expect(es.pwaUpdate.reloadNow).toBeDefined();
      expect(en.pwaUpdate.dismiss).toBeDefined();
      expect(es.pwaUpdate.dismiss).toBeDefined();

      expect(en.settings.checkAppUpdate).toBeDefined();
      expect(es.settings.checkAppUpdate).toBeDefined();
      expect(en.settings.appUpToDate).toBeDefined();
      expect(es.settings.appUpToDate).toBeDefined();
      expect(en.settings.appUpdateAvailable).toBeDefined();
      expect(es.settings.appUpdateAvailable).toBeDefined();
      expect(en.settings.appUpdateInstallNow).toBeDefined();
      expect(es.settings.appUpdateInstallNow).toBeDefined();
    });
  });
});
