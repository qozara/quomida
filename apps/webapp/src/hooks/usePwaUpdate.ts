import { useState, useCallback, useEffect } from 'react';
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';

export const VISIBILITY_UPDATE_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown for foreground resume checks

export type AppUpdateCheckResult = 'update_available' | 'up_to_date' | 'offline' | 'error';

export interface PwaUpdateState {
  needRefresh: boolean;
  offlineReady: boolean;
  isChecking: boolean;
  isUpdating: boolean;
  isPromptDismissed: boolean;
  lastCheckResult: AppUpdateCheckResult | null;
}

let sharedState: PwaUpdateState = {
  needRefresh: false,
  offlineReady: false,
  isChecking: false,
  isUpdating: false,
  isPromptDismissed: false,
  lastCheckResult: null
};

const listeners = new Set<(state: PwaUpdateState) => void>();
let swRegistration: ServiceWorkerRegistration | undefined;
let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | undefined;
let lastVisibilityCheckTime = 0;
let activeCleanupFn: (() => void) | null = null;
let fallbackReloadTimer: ReturnType<typeof setTimeout> | null = null;

function setSharedState(partial: Partial<PwaUpdateState>) {
  sharedState = { ...sharedState, ...partial };
  listeners.forEach((listener) => {
    try {
      listener(sharedState);
    } catch (err) {
      console.warn('[usePwaUpdate] Error in state listener:', err);
    }
  });
}

export function resetSharedPwaUpdateState() {
  if (activeCleanupFn) {
    activeCleanupFn();
    activeCleanupFn = null;
  }
  if (fallbackReloadTimer) {
    clearTimeout(fallbackReloadTimer);
    fallbackReloadTimer = null;
  }
  sharedState = {
    needRefresh: false,
    offlineReady: false,
    isChecking: false,
    isUpdating: false,
    isPromptDismissed: false,
    lastCheckResult: null
  };
  swRegistration = undefined;
  updateSWFn = undefined;
  lastVisibilityCheckTime = 0;
  listeners.forEach((l) => l(sharedState));
}

function attachInstallingWorkerListener(worker: ServiceWorker) {
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
      setSharedState({
        needRefresh: true,
        isPromptDismissed: false,
        lastCheckResult: 'update_available'
      });
    }
  });
}

/**
 * Registers the PWA Service Worker and binds a zero-polling `visibilitychange` listener
 * so mobile Home Screen PWAs check for updates when resumed to the foreground.
 */
export function registerPwaServiceWorker(
  registerSWImpl: (options?: RegisterSWOptions) => (reloadPage?: boolean) => Promise<void>
): () => void {
  if (activeCleanupFn) {
    activeCleanupFn();
    activeCleanupFn = null;
  }

  lastVisibilityCheckTime = Date.now();

  updateSWFn = registerSWImpl({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      swRegistration = registration;
      if (registration?.waiting) {
        setSharedState({
          needRefresh: true,
          isPromptDismissed: false,
          lastCheckResult: 'update_available'
        });
      }
      if (registration && typeof registration.addEventListener === 'function') {
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            attachInstallingWorkerListener(installingWorker);
          }
        });
      }
    },
    onNeedRefresh() {
      setSharedState({
        needRefresh: true,
        isPromptDismissed: false,
        lastCheckResult: 'update_available'
      });
    },
    onOfflineReady() {
      setSharedState({ offlineReady: true });
    },
    onRegisterError(error) {
      console.warn('[PWA] Service Worker registration error:', error);
    }
  });

  const handleVisibilityChange = () => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') {
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return;
    }
    const now = Date.now();
    if (now - lastVisibilityCheckTime < VISIBILITY_UPDATE_COOLDOWN_MS) {
      return;
    }
    lastVisibilityCheckTime = now;

    if (swRegistration && typeof swRegistration.update === 'function') {
      swRegistration.update().catch((err) => {
        console.warn('[PWA] Foreground visibility update check failed:', err);
      });
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  const cleanup = () => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };

  activeCleanupFn = cleanup;
  return cleanup;
}

/**
 * Manually checks the server for a newer Service Worker bundle (e.g. from Settings).
 */
export async function checkForPwaAppUpdate(): Promise<AppUpdateCheckResult> {
  if (sharedState.isChecking) {
    return sharedState.needRefresh ? 'update_available' : 'up_to_date';
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setSharedState({ lastCheckResult: 'offline' });
    return 'offline';
  }

  // If a waiting Service Worker is already staged, surface it immediately
  if (sharedState.needRefresh || swRegistration?.waiting) {
    setSharedState({
      needRefresh: true,
      isPromptDismissed: false,
      lastCheckResult: 'update_available'
    });
    return 'update_available';
  }

  setSharedState({ isChecking: true, lastCheckResult: null });

  try {
    let reg = swRegistration;
    if (!reg && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        swRegistration = reg;
      }
    }

    if (!reg || typeof reg.update !== 'function') {
      setSharedState({ isChecking: false, lastCheckResult: 'up_to_date' });
      return 'up_to_date';
    }

    await reg.update();
    lastVisibilityCheckTime = Date.now();

    if (reg.waiting || sharedState.needRefresh) {
      setSharedState({
        isChecking: false,
        needRefresh: true,
        isPromptDismissed: false,
        lastCheckResult: 'update_available'
      });
      return 'update_available';
    }

    if (reg.installing) {
      attachInstallingWorkerListener(reg.installing);
      await new Promise<void>((resolve) => {
        const installingWorker = reg!.installing;
        if (!installingWorker) {
          resolve();
          return;
        }
        const timeout = setTimeout(resolve, 4000);
        const onStateChange = () => {
          if (installingWorker.state === 'installed' || installingWorker.state === 'activated' || installingWorker.state === 'redundant') {
            clearTimeout(timeout);
            installingWorker.removeEventListener('statechange', onStateChange);
            resolve();
          }
        };
        installingWorker.addEventListener('statechange', onStateChange);
      });

      if (reg.waiting || sharedState.needRefresh) {
        setSharedState({
          isChecking: false,
          needRefresh: true,
          isPromptDismissed: false,
          lastCheckResult: 'update_available'
        });
        return 'update_available';
      }
    }

    setSharedState({ isChecking: false, lastCheckResult: 'up_to_date' });
    return 'up_to_date';
  } catch (err) {
    console.warn('[PWA] Manual update check error:', err);
    setSharedState({ isChecking: false, lastCheckResult: 'error' });
    return 'error';
  }
}

/**
 * Triggers SKIP_WAITING on the waiting Service Worker and reloads the application.
 */
export async function applyPwaAppUpdate(): Promise<void> {
  setSharedState({ isUpdating: true });

  let hasReloaded = false;
  const triggerReload = () => {
    if (!hasReloaded) {
      hasReloaded = true;
      if (fallbackReloadTimer) {
        clearTimeout(fallbackReloadTimer);
        fallbackReloadTimer = null;
      }
      if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
        try {
          window.location.reload();
        } catch {
          // jsdom navigation guard
        }
      }
    }
  };

  // 1. Listen for the new service worker to take control
  if (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof navigator.serviceWorker?.addEventListener === 'function'
  ) {
    navigator.serviceWorker.addEventListener('controllerchange', triggerReload, { once: true });
  }

  // 2. Post SKIP_WAITING message directly to known waiting worker
  try {
    if (swRegistration?.waiting && typeof swRegistration.waiting.postMessage === 'function') {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  } catch (err) {
    console.warn('[PWA] Error posting SKIP_WAITING to swRegistration:', err);
  }

  // 3. Post SKIP_WAITING to any waiting worker discovered via navigator.serviceWorker
  if (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof navigator.serviceWorker?.getRegistration === 'function'
  ) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting && typeof reg.waiting.postMessage === 'function') {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    } catch (err) {
      console.warn('[PWA] Error querying serviceWorker registration:', err);
    }
  }

  // 4. Invoke vite-plugin-pwa's updateSWFn if present
  if (updateSWFn) {
    try {
      await updateSWFn(true);
    } catch (err) {
      console.warn('[PWA] Error executing updateSWFn:', err);
    }
  }

  // 5. Fallback reload: If controllerchange does not fire within 500ms
  // (e.g. dev mode, unservice-worker-controlled page, or already controlling worker),
  // guarantee the reload happens.
  if (typeof window !== 'undefined') {
    fallbackReloadTimer = setTimeout(() => {
      triggerReload();
    }, 500);
  }
}

export function dismissPwaUpdatePrompt(): void {
  setSharedState({ isPromptDismissed: true });
}

export function usePwaUpdate() {
  const [state, setState] = useState<PwaUpdateState>(sharedState);

  useEffect(() => {
    listeners.add(setState);
    setState(sharedState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  const checkForUpdate = useCallback(async () => {
    return checkForPwaAppUpdate();
  }, []);

  const applyUpdate = useCallback(async () => {
    return applyPwaAppUpdate();
  }, []);

  const dismissPrompt = useCallback(() => {
    dismissPwaUpdatePrompt();
  }, []);

  return {
    needRefresh: state.needRefresh,
    offlineReady: state.offlineReady,
    isChecking: state.isChecking,
    isUpdating: state.isUpdating,
    isPromptDismissed: state.isPromptDismissed,
    lastCheckResult: state.lastCheckResult,
    checkForUpdate,
    applyUpdate,
    dismissPrompt
  };
}
