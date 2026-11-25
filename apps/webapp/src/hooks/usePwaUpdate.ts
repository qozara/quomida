import {
  configurePwaUpdate,
  registerPwaServiceWorker as baseRegisterPwaServiceWorker,
  checkForPwaAppUpdate as baseCheckForPwaAppUpdate,
  applyPwaAppUpdate as baseApplyPwaAppUpdate,
  dismissPwaUpdatePrompt as baseDismissPwaUpdatePrompt,
  resetPwaUpdateManager,
  usePwaUpdate as useBasePwaUpdate,
  type AppUpdateCheckResult,
  type PwaUpdateState,
  type RegisterSWFn,
} from '@qozara/pwa-update';

export const VISIBILITY_UPDATE_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown for foreground resume checks

export type { AppUpdateCheckResult, PwaUpdateState };

let isConfigured = false;
let activeGeneration = 0;

function getCurrentAppVersion(): string {
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
}

export function ensurePwaUpdateConfigured(): void {
  if (!isConfigured) {
    const generationAtConfig = ++activeGeneration;
    configurePwaUpdate({
      currentVersion: getCurrentAppVersion(),
      visibilityCooldownMs: VISIBILITY_UPDATE_COOLDOWN_MS,
      onReload: () => {
        if (generationAtConfig !== activeGeneration) {
          return;
        }
        if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
          try {
            window.location.reload();
          } catch {
            // Ignore jsdom navigation not implemented errors when unmocked
          }
        }
      },
    });
    isConfigured = true;
  }
}

export function resetSharedPwaUpdateState(): void {
  activeGeneration += 1;
  resetPwaUpdateManager();
  isConfigured = false;
  ensurePwaUpdateConfigured();
}

export function registerPwaServiceWorker(registerSWImpl: RegisterSWFn): () => void {
  ensurePwaUpdateConfigured();
  return baseRegisterPwaServiceWorker(registerSWImpl);
}

export async function checkForPwaAppUpdate(): Promise<AppUpdateCheckResult> {
  ensurePwaUpdateConfigured();
  return baseCheckForPwaAppUpdate();
}

export async function applyPwaAppUpdate(): Promise<void> {
  ensurePwaUpdateConfigured();
  return baseApplyPwaAppUpdate();
}

export function dismissPwaUpdatePrompt(): void {
  ensurePwaUpdateConfigured();
  baseDismissPwaUpdatePrompt();
}

export function usePwaUpdate() {
  ensurePwaUpdateConfigured();
  const state = useBasePwaUpdate();

  return {
    ...state,
    checkForUpdate: state.checkForUpdates,
  };
}
