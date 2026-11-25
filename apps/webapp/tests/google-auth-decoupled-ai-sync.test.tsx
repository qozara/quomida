/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GoogleSessionStore,
  GOOGLE_IDENTITY_SCOPES,
  GOOGLE_IDENTITY_AND_DRIVE_SCOPES,
} from '@qozara/google-auth';
import { GoogleAuthSessionProvider } from '@qozara/google-auth/react';
import { AiProviderFactory } from '@quomida/ai-services';
import { dictionaries } from '@quomida/i18n-locales';
import * as AppContext from '../src/context/AppContext.js';
import { FoodLogger } from '../src/components/FoodLogger.js';
import { SettingsModal } from '../src/components/SettingsModal.js';
import { extractGoogleOAuthToken } from '../src/hooks/useMealAiService.js';

let mockOAuthScope = '';
vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useGoogleLogin: (opts: {
    scope: string;
    onSuccess: (res: {
      access_token: string;
      expires_in: number;
      scope: string;
      prompt: string;
      token_type: string;
    }) => void;
  }) => {
    return () => {
      mockOAuthScope = opts.scope;
      opts.onSuccess({
        access_token: opts.scope.includes('drive.file')
          ? 'ya29.drive-and-identity-token'
          : 'ya29.identity-only-ai-token',
        expires_in: 3600,
        scope: opts.scope,
        prompt: '',
        token_type: 'Bearer',
      });
    };
  },
}));

function createTestSessionStore() {
  const map = new Map<string, string>();
  return new GoogleSessionStore({
    storage: {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => {
        map.set(k, v);
      },
      removeItem: (k) => {
        map.delete(k);
      },
    },
  });
}

describe('Decoupled Google Identity Session vs. Cloud Storage Sync', () => {
  beforeEach(() => {
    mockOAuthScope = '';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('rejects expired legacy tokens in extractGoogleOAuthToken instead of forwarding dead tokens', () => {
    const expired = extractGoogleOAuthToken({
      active_cloud_provider: {
        id: 'google-drive-sheets',
        credentials: {
          accessToken: 'ya29.dead-expired-token',
          expiresAt: Date.now() - 5_000,
        },
      },
    });
    expect(expired).toBeNull();
  });

  it('allows signing into Qozara Cloud AI with identity-only scopes while keeping Storage Sync disconnected (Local-Only)', async () => {
    const store = createTestSessionStore();
    const mockFetchProfile = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sub: 'u-local-ai',
        email: 'localuser@qozara.org',
        name: 'Local Privacy User',
        picture: 'https://example.com/avatar.png',
      }),
    });

    let capturedGetAuthToken: (() => Promise<string | null>) | null = null;
    vi.spyOn(AiProviderFactory, 'createProvider').mockImplementation(
      async (_cfg: unknown, getAuthToken?: any) => {
        capturedGetAuthToken = getAuthToken;
        return {
          id: 'cloud-proxy',
          mode: 'cloud',
          chat: vi.fn().mockResolvedValue({
            type: 'tool_call',
            tool: 'decompose_dish',
            arguments: {
              dish_name: 'Locro',
              kind: 'recipe',
              ingredients: [
                {
                  food_name: 'Maíz blanco',
                  quantity: 150,
                  unit: 'g',
                  calories_100g: 360,
                  protein_100g: 8,
                  carbs_100g: 75,
                  fats_100g: 3,
                },
              ],
            },
          }),
          checkAvailability: vi.fn().mockResolvedValue(true),
          getSetupMessage: vi.fn().mockReturnValue(null),
        };
      }
    );

    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      ingredients: [],
      recipes: [],
      recipeFoods: [],
      weightLogs: [],
      t: dictionaries.en,
      locale: 'en',
      languagePreference: 'en',
      theme: 'dark',
      isOnline: true,
      uxSyncState: 'local',
      syncStatus: 'disconnected',
      activeProvider: null,
      lastSyncedTime: null,
      isSettingsOpen: true,
      setIsSettingsOpen: vi.fn(),
      setIsStorageSettingsOpen: vi.fn(),
      updateUserSettings: vi.fn(),
      setLocale: vi.fn(),
      setTheme: vi.fn(),
      refreshCatalog: vi.fn(),
      downloadStatus: 'idle',
      catalogVersion: null,
      catalogItemCount: null,
      dbVersion: 2,
      userSettings: {
        id: 'global_settings',
        locale: 'en',
        theme: 'dark',
        daily_calorie_target: 2000,
        custom_macros: { protein: 150, carbs: 200, fats: 65 },
        target_mode: 'manual',
        // Storage Sync is NOT connected!
        active_cloud_provider: undefined,
        ai_settings: { enabled: true, provider: 'cloud' },
      },
      logBatchFoodItems: vi.fn(),
      addRecipe: vi.fn(),
      db: null,
    } as any);

    render(
      <GoogleAuthSessionProvider
        store={store}
        fetchImpl={mockFetchProfile as unknown as typeof fetch}
      >
        <SettingsModal />
        <FoodLogger onSelectIngredient={vi.fn()} />
      </GoogleAuthSessionProvider>
    );

    // Open AI accordion and click Sign in with Google for Qozara Cloud AI
    fireEvent.click(screen.getByTestId('accordion-header-ai'));
    const aiSignInBtn = await screen.findByTestId('btn-ai-google-signin');
    fireEvent.click(aiSignInBtn);

    await waitFor(() => {
      expect(store.getValidAccessToken(GOOGLE_IDENTITY_SCOPES)).toBe('ya29.identity-only-ai-token');
    });
    // Must request ONLY identity scopes, NOT Google Drive scopes
    expect(mockOAuthScope).not.toContain('drive.file');

    // FoodLogger now resolves Qozara Cloud AI token from GoogleSessionStore even with active_cloud_provider = undefined
    fireEvent.change(screen.getByPlaceholderText(dictionaries.en.search.unifiedPlaceholder), {
      target: { value: '1 plato de locro criollo' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(dictionaries.en.search.parseButton, 'i') })
    );

    await waitFor(() => {
      expect(capturedGetAuthToken).not.toBeNull();
    });
    expect(await capturedGetAuthToken!()).toBe('ya29.identity-only-ai-token');
  });

  it('keeps Qozara Cloud AI authenticated after Storage Sync is disconnected, and distinguishes 403 unregistered account from 401 expired session', async () => {
    const store = createTestSessionStore();
    store.setSession({
      accessToken: 'ya29.persisted-session-after-drive-disconnect',
      expiresInSeconds: 3600,
      scopes: GOOGLE_IDENTITY_AND_DRIVE_SCOPES,
      user: { email: 'unregistered@qozara.org', name: 'Test User' },
    });

    const mockChat = vi.fn().mockResolvedValueOnce({
      type: 'text',
      error: 'FORBIDDEN_403',
      errorCode: 'FORBIDDEN_403',
      errorMessage: 'Your Google account is not registered for Qozara Intelligence free quota.',
      status: 403,
    });

    let capturedToken: string | null = null;
    vi.spyOn(AiProviderFactory, 'createProvider').mockImplementation(
      async (_cfg: unknown, getAuthToken?: any) => ({
        id: 'cloud-proxy',
        mode: 'cloud',
        chat: async (req: unknown) => {
          capturedToken = getAuthToken ? await getAuthToken() : null;
          return mockChat(req);
        },
        checkAvailability: vi.fn().mockResolvedValue(true),
        getSetupMessage: vi.fn().mockReturnValue(null),
      })
    );

    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      ingredients: [],
      recipes: [],
      recipeFoods: [],
      t: dictionaries.en,
      setIsSettingsOpen: vi.fn(),
      userSettings: {
        // User disconnected Google Drive Storage Sync -> active_cloud_provider is undefined!
        active_cloud_provider: undefined,
        ai_settings: { enabled: true, provider: 'cloud' },
      },
      logBatchFoodItems: vi.fn(),
      addRecipe: vi.fn(),
      db: null,
    } as any);

    render(
      <GoogleAuthSessionProvider store={store}>
        <FoodLogger onSelectIngredient={vi.fn()} />
      </GoogleAuthSessionProvider>
    );

    fireEvent.change(screen.getByPlaceholderText(dictionaries.en.search.unifiedPlaceholder), {
      target: { value: 'sorrentinos caseros' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(dictionaries.en.search.parseButton, 'i') })
    );

    await waitFor(() => {
      expect(
        screen.getByText((dictionaries.en.ai as any).accountNotRegisteredNotice)
      ).toBeDefined();
    });
    // Token was still sent despite Storage Sync being disconnected
    expect(capturedToken).toBe('ya29.persisted-session-after-drive-disconnect');
  });
});
