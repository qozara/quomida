/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppProvider, useApp } from '../src/context/AppContext.js';
import { CatalogHydrationService } from '../src/services/CatalogHydrationService.js';
import { GoogleOAuthProvider } from '@react-oauth/google';

describe('Application Boot Hydration [APP-207]', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('triggers catalog hydration asynchronously on boot without blocking initial render', async () => {
    const hydrateSpy = vi.spyOn(CatalogHydrationService.prototype, 'hydrate').mockResolvedValue({
      status: 'UP_TO_DATE',
      version: 'v1.0.0',
      itemsUpserted: 0
    });

    const TestComponent = () => {
      const { ingredients, isOnline } = useApp();
      return React.createElement('div', { 'data-testid': 'boot-status' }, `ready-${isOnline}`);
    };

    const { container } = render(
      React.createElement(GoogleOAuthProvider as any, { clientId: 'test-client-id' },
        React.createElement(AppProvider, null, React.createElement(TestComponent))
      )
    );

    // Verify UI rendered immediately
    expect(container.querySelector('[data-testid="boot-status"]')).not.toBeNull();

    // Verify hydration was invoked
    await vi.waitFor(() => {
      expect(hydrateSpy).toHaveBeenCalled();
    }, { timeout: 1500 });
  });

  it('remains fully functional offline when network fails or catalog is unreachable', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    // Simulate network error when offline
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Failed to fetch (offline)'));

    const TestComponent = () => {
      const { ingredients, isOnline } = useApp();
      return React.createElement('div', null, [
        React.createElement('span', { key: 'status', 'data-testid': 'online-status' }, String(isOnline)),
        React.createElement('span', { key: 'count', 'data-testid': 'ing-count' }, String(ingredients.length))
      ]);
    };

    const { container } = render(
      React.createElement(GoogleOAuthProvider as any, { clientId: 'test-client-id' },
        React.createElement(AppProvider, null, React.createElement(TestComponent))
      )
    );

    // Verify app renders offline state without crashing
    expect(container.querySelector('[data-testid="online-status"]')?.textContent).toBe('false');

    // Verify no ingredients are available when offline and DB is fresh
    await vi.waitFor(() => {
      const count = Number(container.querySelector('[data-testid="ing-count"]')?.textContent || 0);
      expect(count).toBe(0);
    }, { timeout: 1500 });
  });

  it('remains fully functional online when remote catalog returns 404 (not present)', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Not Found', { status: 404 }));

    const TestComponent = () => {
      const { ingredients, isOnline } = useApp();
      return React.createElement('div', null, [
        React.createElement('span', { key: 'status', 'data-testid': 'online-status' }, String(isOnline)),
        React.createElement('span', { key: 'count', 'data-testid': 'ing-count' }, String(ingredients.length))
      ]);
    };

    const { container } = render(
      React.createElement(GoogleOAuthProvider as any, { clientId: 'test-client-id' },
        React.createElement(AppProvider, null, React.createElement(TestComponent))
      )
    );

    expect(container.querySelector('[data-testid="online-status"]')?.textContent).toBe('true');

    // Verify no ingredients are available when catalog is absent (404)
    await vi.waitFor(() => {
      const count = Number(container.querySelector('[data-testid="ing-count"]')?.textContent || 0);
      expect(count).toBe(0);
    }, { timeout: 1500 });
  });
});
