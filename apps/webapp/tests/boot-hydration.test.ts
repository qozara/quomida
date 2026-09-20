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
});
