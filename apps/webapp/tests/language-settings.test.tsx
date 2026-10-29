/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleOAuthProvider } from '@react-oauth/google';
import {
  isSpanishLocale,
  resolveSystemLocale,
  parseLanguagePreference,
  resolveEffectiveLocale,
  AppProvider,
  useApp
} from '../src/context/AppContext.js';
import { SettingsModal } from '../src/components/SettingsModal.js';
import * as AppContextModule from '../src/context/AppContext.js';
import { en, es } from '@quomida/i18n-locales';
import { destroyDatabase, clearLocalDatabase } from '../src/db/rxdb.js';

describe('Expanded Language Options (Spanish, English, System Default)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearLocalDatabase();
  });

  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    await clearLocalDatabase();
  });

  describe('1. System Language Detection Helpers', () => {
    it('isSpanishLocale correctly identifies Spanish variations', () => {
      // Spanish standard and regional codes
      expect(isSpanishLocale('es')).toBe(true);
      expect(isSpanishLocale('es-ES')).toBe(true);
      expect(isSpanishLocale('es-AR')).toBe(true);
      expect(isSpanishLocale('es-MX')).toBe(true);
      expect(isSpanishLocale('es-419')).toBe(true);
      expect(isSpanishLocale('es-US')).toBe(true);
      expect(isSpanishLocale('es-CO')).toBe(true);
      expect(isSpanishLocale('es_AR')).toBe(true);
      expect(isSpanishLocale('ES-CL')).toBe(true);

      // Non-Spanish languages
      expect(isSpanishLocale('en')).toBe(false);
      expect(isSpanishLocale('en-US')).toBe(false);
      expect(isSpanishLocale('en-GB')).toBe(false);
      expect(isSpanishLocale('fr-FR')).toBe(false);
      expect(isSpanishLocale('pt-BR')).toBe(false);
      expect(isSpanishLocale('de-DE')).toBe(false);
      expect(isSpanishLocale('it-IT')).toBe(false);
      expect(isSpanishLocale('')).toBe(false);
      expect(isSpanishLocale(null)).toBe(false);
      expect(isSpanishLocale(undefined)).toBe(false);
    });

    it('resolveSystemLocale returns "es" when navigator.language matches Spanish', () => {
      Object.defineProperty(navigator, 'language', { value: 'es-ES', configurable: true });
      Object.defineProperty(navigator, 'languages', { value: ['es-ES', 'es', 'en'], configurable: true });

      expect(resolveSystemLocale()).toBe('es');
    });

    it('resolveSystemLocale returns "es" for Latin American Spanish (es-419 / es-AR)', () => {
      Object.defineProperty(navigator, 'language', { value: 'es-419', configurable: true });
      Object.defineProperty(navigator, 'languages', { value: ['es-419', 'en-US'], configurable: true });

      expect(resolveSystemLocale()).toBe('es');
    });

    it('resolveSystemLocale returns "en" when system is English, Portuguese, French, etc.', () => {
      Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
      Object.defineProperty(navigator, 'languages', { value: ['en-US', 'en'], configurable: true });
      expect(resolveSystemLocale()).toBe('en');

      Object.defineProperty(navigator, 'language', { value: 'pt-BR', configurable: true });
      Object.defineProperty(navigator, 'languages', { value: ['pt-BR', 'pt'], configurable: true });
      expect(resolveSystemLocale()).toBe('en');

      Object.defineProperty(navigator, 'language', { value: 'fr-FR', configurable: true });
      Object.defineProperty(navigator, 'languages', { value: ['fr-FR'], configurable: true });
      expect(resolveSystemLocale()).toBe('en');
    });

    it('parseLanguagePreference defaults to "system" when not set on persistent storage or initial boot', () => {
      expect(parseLanguagePreference(undefined)).toBe('system');
      expect(parseLanguagePreference(null)).toBe('system');
      expect(parseLanguagePreference('')).toBe('system');
      expect(parseLanguagePreference('system')).toBe('system');
      expect(parseLanguagePreference('es')).toBe('es');
      expect(parseLanguagePreference('es-AR')).toBe('es');
      expect(parseLanguagePreference('en')).toBe('en');
      expect(parseLanguagePreference('en-US')).toBe('en');
    });

    it('resolveEffectiveLocale returns resolved system language when preference is "system"', () => {
      Object.defineProperty(navigator, 'language', { value: 'es-MX', configurable: true });
      Object.defineProperty(navigator, 'languages', { value: ['es-MX'], configurable: true });
      expect(resolveEffectiveLocale('system')).toBe('es');

      Object.defineProperty(navigator, 'language', { value: 'en-GB', configurable: true });
      Object.defineProperty(navigator, 'languages', { value: ['en-GB'], configurable: true });
      expect(resolveEffectiveLocale('system')).toBe('en');

      // Explicit overrides always take precedence over system
      expect(resolveEffectiveLocale('es')).toBe('es');
      expect(resolveEffectiveLocale('en')).toBe('en');
    });
  });

  describe('2. SettingsModal Language Selector UI', () => {
    it('renders language selector with Spanish, English, and System default options', () => {
      const mockSetLocale = vi.fn();
      vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
        locale: 'es',
        languagePreference: 'system',
        setLocale: mockSetLocale,
        theme: 'dark',
        setTheme: vi.fn(),
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

      const select = screen.getByTestId('select-language') as HTMLSelectElement;
      expect(select).toBeDefined();

      const options = Array.from(select.options).map((opt) => ({
        value: opt.value,
        text: opt.textContent?.trim()
      }));

      expect(options).toEqual([
        { value: 'system', text: 'Predeterminado del sistema' },
        { value: 'es', text: 'Español' },
        { value: 'en', text: 'Inglés' }
      ]);
      expect(select.value).toBe('system');
    });

    it('selecting Spanish, English, or System default invokes setLocale with the selected value', () => {
      const mockSetLocale = vi.fn();
      vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
        locale: 'en',
        languagePreference: 'en',
        setLocale: mockSetLocale,
        theme: 'dark',
        setTheme: vi.fn(),
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

      const select = screen.getByTestId('select-language') as HTMLSelectElement;

      // Select Spanish
      fireEvent.change(select, { target: { value: 'es' } });
      expect(mockSetLocale).toHaveBeenCalledWith('es');

      // Select System default
      fireEvent.change(select, { target: { value: 'system' } });
      expect(mockSetLocale).toHaveBeenCalledWith('system');

      // Select English
      fireEvent.change(select, { target: { value: 'en' } });
      expect(mockSetLocale).toHaveBeenCalledWith('en');
    });
  });

  describe('3. AppContext State & First-Boot Persistence Integration', () => {
    const TestLanguageConsumer = () => {
      const { locale, languagePreference, setLocale, userSettings } = useApp();
      return (
        <div>
          <span data-testid="current-locale">{locale}</span>
          <span data-testid="current-pref">{languagePreference}</span>
          <span data-testid="stored-locale">{userSettings.locale}</span>
          <button data-testid="btn-set-es" onClick={() => setLocale('es')}>Set ES</button>
          <button data-testid="btn-set-en" onClick={() => setLocale('en')}>Set EN</button>
          <button data-testid="btn-set-system" onClick={() => setLocale('system')}>Set System</button>
        </div>
      );
    };

    it('boots with system default preference and dynamically updates root html lang', async () => {
      // Simulate Spanish browser
      Object.defineProperty(navigator, 'language', { value: 'es-AR', configurable: true });
      Object.defineProperty(navigator, 'languages', { value: ['es-AR'], configurable: true });

      render(
        <GoogleOAuthProvider clientId="dummy_id">
          <AppProvider>
            <TestLanguageConsumer />
          </AppProvider>
        </GoogleOAuthProvider>
      );

      // On first boot without stored setting, preference is system and effective locale is es
      await waitFor(() => {
        expect(screen.getByTestId('current-pref').textContent).toBe('system');
        expect(screen.getByTestId('current-locale').textContent).toBe('es');
        expect(document.documentElement.lang).toBe('es');
      });

      // Switch to English explicitly
      await act(async () => {
        screen.getByTestId('btn-set-en').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('current-pref').textContent).toBe('en');
        expect(screen.getByTestId('current-locale').textContent).toBe('en');
        expect(document.documentElement.lang).toBe('en');
      });

      // Switch back to System default
      await act(async () => {
        screen.getByTestId('btn-set-system').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('current-pref').textContent).toBe('system');
        expect(screen.getByTestId('current-locale').textContent).toBe('es');
        expect(document.documentElement.lang).toBe('es');
      });
    });

    it('resolves system default to English when device language is non-Spanish (e.g. pt-BR)', async () => {
      Object.defineProperty(navigator, 'language', { value: 'pt-BR', configurable: true });
      Object.defineProperty(navigator, 'languages', { value: ['pt-BR'], configurable: true });

      render(
        <GoogleOAuthProvider clientId="dummy_id">
          <AppProvider>
            <TestLanguageConsumer />
          </AppProvider>
        </GoogleOAuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('current-pref').textContent).toBe('system');
        expect(screen.getByTestId('current-locale').textContent).toBe('en');
        expect(document.documentElement.lang).toBe('en');
      });
    });
  });
});
