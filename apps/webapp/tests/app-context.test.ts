/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AppProvider, useApp } from '../src/context/AppContext.js';
import { LocalDBService } from '../src/db/rxdb.js';

// Mock window to simulate online status
global.window = {
  ...global.window,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
} as any;
vi.stubGlobal('navigator', { onLine: true });

describe('AppContext auto-connect logic (Issue 1)', () => {
  it('should auto-connect to GoogleDriveSheetsSyncAdapter on load if token is present', async () => {
    vi.spyOn(LocalDBService.prototype, 'getSettings').mockResolvedValue({
      cloud_providers: {
        google: {
          accessToken: 'fake-token',
          expiresAt: Date.now() + 100000 // valid
        }
      }
    } as any);

    const TestComponent = () => {
      const { activeAdapter } = useApp();
      return React.createElement('div', { 'data-testid': 'adapter-id' }, activeAdapter?.id || 'none');
    };

    const { container } = render(
      React.createElement(AppProvider, null, React.createElement(TestComponent))
    );

    // Initial adapter is mock, but it should quickly change to google-drive-sheets
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(container.querySelector('[data-testid="adapter-id"]')?.textContent).toBe('google-drive-sheets');

    vi.restoreAllMocks();
  });
});
