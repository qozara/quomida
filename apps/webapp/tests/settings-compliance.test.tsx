/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { SettingsModal } from '../src/components/SettingsModal.js';
import { StorageSettingsPanel } from '../src/components/sync/StorageSettingsPanel.js';
import * as AppContext from '../src/context/AppContext.js';
import { en, es } from '@quomida/i18n-locales';

describe('Google OAuth Certification Compliance & Legal Verification', () => {
  beforeEach(() => {
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
      dbVersion: 1,
      t: en
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('SettingsModal Support & Legal Sections', () => {
    it('renders support assistance links pointing to support@qozara.org and legal@qozara.org', () => {
      render(<SettingsModal />);

      const supportLink = screen.getByRole('link', { name: /get help & support/i });
      expect(supportLink).toBeDefined();
      expect(supportLink.getAttribute('href')).toBe('mailto:support@qozara.org');

      const legalLink = screen.getByRole('link', { name: /legal & privacy inquiries/i });
      expect(legalLink).toBeDefined();
      expect(legalLink.getAttribute('href')).toBe('mailto:legal@qozara.org');
    });

    it('renders accessible Terms of Service, Privacy Policy, and License links', () => {
      render(<SettingsModal />);

      const tosLink = screen.getByRole('link', { name: /terms of service/i });
      expect(tosLink.getAttribute('href')).toBe('https://qozara.org/legal/quomida/tos.html');
      expect(tosLink.getAttribute('target')).toBe('_blank');
      expect(tosLink.getAttribute('rel')).toContain('noopener');

      const privacyLink = screen.getByRole('link', { name: /privacy policy/i });
      expect(privacyLink.getAttribute('href')).toBe('https://qozara.org/legal/quomida/privacy.html');
      expect(privacyLink.getAttribute('target')).toBe('_blank');
      expect(privacyLink.getAttribute('rel')).toContain('noopener');

      const licenseLink = screen.getByRole('link', { name: /license/i });
      expect(licenseLink.getAttribute('href')).toBe('https://quomida.qozara.org/LICENSE');
      expect(licenseLink.getAttribute('target')).toBe('_blank');
      expect(licenseLink.getAttribute('rel')).toContain('noopener');
    });

    it('displays Google Limited Use compliance indicator and Qozara Lab attribution', () => {
      render(<SettingsModal />);

      expect(screen.getByText(/google limited use/i)).toBeDefined();

      const qozaraLink = screen.getByRole('link', { name: /quomida is a research project by qozara lab/i });
      expect(qozaraLink.getAttribute('href')).toBe('https://qozara.org');
      expect(screen.getByText(/built for the open source community/i)).toBeDefined();
    });
  });

  describe('StorageSettingsPanel Google Limited Use Disclosure', () => {
    it('renders the Google API Limited Use disclosure card and legal links', () => {
      render(
        <GoogleOAuthProvider clientId="dummy_id">
          <StorageSettingsPanel isOpen={true} onClose={vi.fn()} />
        </GoogleOAuthProvider>
      );

      expect(screen.getByText(/google api limited use disclosure/i)).toBeDefined();
      expect(screen.getByText(/google api services user data policy/i)).toBeDefined();

      const privacyLink = screen.getByRole('link', { name: /privacy policy/i });
      expect(privacyLink.getAttribute('href')).toBe('https://qozara.org/legal/quomida/privacy.html');

      const tosLink = screen.getByRole('link', { name: /terms of service/i });
      expect(tosLink.getAttribute('href')).toBe('https://qozara.org/legal/quomida/tos.html');
    });
  });

  describe('Dual-Language i18n Key Parity', () => {
    it('verifies en and es locale dictionaries have matching legal and support keys', () => {
      const requiredSettingsKeys = [
        'supportTitle',
        'supportHelp',
        'supportHelpSubtitle',
        'supportLegal',
        'supportLegalSubtitle',
        'legalTitle',
        'termsOfService',
        'privacyPolicy',
        'googleComplianceBadge',
        'license',
        'aboutNotice',
        'aboutCommunity'
      ];

      for (const key of requiredSettingsKeys) {
        expect((en.settings as any)[key]).toBeDefined();
        expect((es.settings as any)[key]).toBeDefined();
        expect(typeof (en.settings as any)[key]).toBe('string');
        expect(typeof (es.settings as any)[key]).toBe('string');
      }

      expect(en.sync.panel.googleLimitedUseNote).toBeDefined();
      expect(es.sync.panel.googleLimitedUseNote).toBeDefined();
    });
  });
});
