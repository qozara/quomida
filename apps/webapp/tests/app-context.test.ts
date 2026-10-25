/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AppProvider, useApp } from '../src/context/AppContext.js';
import { LocalDBService } from '../src/db/rxdb.js';
import { GoogleOAuthProvider } from '@react-oauth/google';

// Mock window to simulate online status
global.window = {
  ...global.window,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
} as any;
vi.stubGlobal('navigator', { onLine: true });

describe('AppContext auto-connect logic (Issue 1)', () => {
  it('should auto-connect to GoogleDriveSheetsCloudSyncProvider on load if token is present', async () => {
    vi.spyOn(LocalDBService.prototype, 'getSettings').mockResolvedValue({
      active_cloud_provider: {
        id: 'google-drive-sheets',
        credentials: { accessToken: 'fake-token' }
      }
    } as any);

    const TestComponent = () => {
      const { activeProvider } = useApp();
      return React.createElement('div', { 'data-testid': 'adapter-id' }, activeProvider?.id || 'none');
    };

    const { container } = render(
      React.createElement(GoogleOAuthProvider as any, { clientId: 'test-client-id' },
        React.createElement(AppProvider, null, React.createElement(TestComponent))
      )
    );

    // Initial adapter is mock, but it should quickly change to google-drive-sheets
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(container.querySelector('[data-testid="adapter-id"]')?.textContent).toBe('google-drive-sheets');

    vi.restoreAllMocks();
  });

  it('rehydrates userEmail and userName on Google provider restore', async () => {
    vi.spyOn(LocalDBService.prototype, 'getSettings').mockResolvedValue({
      active_cloud_provider: {
        id: 'google-drive-sheets',
        credentials: {
          accessToken: 'fake-token',
          userEmail: 'alice@qozara.org',
          userName: 'Alice Smith'
        }
      }
    } as any);

    const TestAccountComponent = () => {
      const { activeProvider } = useApp();
      return React.createElement('div', { 'data-testid': 'account-info' }, activeProvider?.getConnectedAccount?.() || 'none');
    };

    const { container } = render(
      React.createElement(GoogleOAuthProvider as any, { clientId: 'test-client-id' },
        React.createElement(AppProvider, null, React.createElement(TestAccountComponent))
      )
    );

    await new Promise(resolve => setTimeout(resolve, 500));
    expect(container.querySelector('[data-testid="account-info"]')?.textContent).toBe('Alice Smith (alice@qozara.org)');

    vi.restoreAllMocks();
  });

  it('persists refreshed credentials locally when activeProvider emits onCredentialsChange', async () => {
    const saveSettingsSpy = vi.spyOn(LocalDBService.prototype, 'saveSettings').mockResolvedValue(undefined);
    vi.spyOn(LocalDBService.prototype, 'getSettings').mockResolvedValue({
      id: 'global_settings',
      locale: 'es-AR',
      theme: 'dark',
      daily_calorie_target: 2100,
      custom_macros: { protein: 160, carbs: 210, fats: 70 },
      target_mode: 'manual',
      active_cloud_provider: {
        id: 'google-drive-sheets',
        credentials: {
          accessToken: 'initial-token',
          userEmail: 'alice@qozara.org'
        }
      },
      updatedAt: 12345
    } as any);

    let capturedProvider: any = null;
    const TestComponent = () => {
      const { activeProvider } = useApp();
      capturedProvider = activeProvider;
      return React.createElement('div', { 'data-testid': 'adapter-id' }, activeProvider?.id || 'none');
    };

    render(
      React.createElement(GoogleOAuthProvider as any, { clientId: 'test-client-id' },
        React.createElement(AppProvider, null, React.createElement(TestComponent))
      )
    );

    await new Promise(resolve => setTimeout(resolve, 500));
    expect(capturedProvider?.id).toBe('google-drive-sheets');

    // Simulate silent token refresh notification from provider
    capturedProvider.notifyCredentialsChange({
      accessToken: 'refreshed-token-xyz',
      userEmail: 'alice@qozara.org'
    });

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(saveSettingsSpy).toHaveBeenCalledWith({
      active_cloud_provider: {
        id: 'google-drive-sheets',
        credentials: {
          accessToken: 'refreshed-token-xyz',
          userEmail: 'alice@qozara.org'
        }
      }
    });

    vi.restoreAllMocks();
  });
});
