/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from '../src/App.js';
import { LocalDBService } from '../src/db/rxdb.js';

vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
  useGoogleLogin: vi.fn(() => vi.fn())
}));

// Mock DatabaseBootstrapper and RemoteCatalog
vi.mock('../src/services/DatabaseBootstrapper.js', () => ({
  DatabaseBootstrapper: {
    ensureSystemCatalogOPFS: vi.fn().mockResolvedValue(true)
  }
}));

describe('Onboarding Banner Reactivity & Dismissal', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    const mockDb = {
      base_ingredients: { find: () => ({ $: { subscribe: () => ({ unsubscribe: () => {} }) } }) },
      daily_logs: { find: () => ({ $: { subscribe: () => ({ unsubscribe: () => {} }) } }) }
    };
    vi.spyOn(LocalDBService.prototype, 'init').mockResolvedValue(mockDb as any);
    vi.spyOn(LocalDBService.prototype, 'getDatabaseInstance').mockReturnValue(mockDb as any);
    vi.spyOn(LocalDBService.prototype, 'getSettings').mockResolvedValue({
      id: 'global_settings',
      locale: 'es-AR',
      theme: 'dark',
      daily_calorie_target: 2000,
      custom_macros: { protein: 150, carbs: 200, fats: 65 }
    } as any);
    vi.spyOn(LocalDBService.prototype, 'getItemCounts').mockResolvedValue({ logs: 0, customFoods: 0 });
    vi.spyOn(LocalDBService.prototype, 'observeLogsByDate').mockReturnValue({ subscribe: () => ({ unsubscribe: () => {} }) } as any);
    vi.spyOn(LocalDBService.prototype, 'getMetadata').mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders banner on fresh device with 0 logs and local sync mode', async () => {
    render(React.createElement(App));
    
    const bannerTitle = await screen.findByText(/Returning User\?|¿Usuario recurrente\?/i);
    expect(bannerTitle).toBeDefined();

    const connectButton = screen.getByRole('button', { name: /Connect Cloud Storage|Conectar Almacenamiento en la Nube/i });
    expect(connectButton).toBeDefined();
  });

  it('dismisses banner and stores flag in localStorage when clicking Connect Cloud Storage', async () => {
    render(React.createElement(App));
    
    const connectButton = await screen.findByRole('button', { name: /Connect Cloud Storage|Conectar Almacenamiento en la Nube/i });
    fireEvent.click(connectButton);

    expect(localStorage.getItem('quomida_onboarding_dismissed')).toBe('true');
  });

  it('does not render banner if quomida_onboarding_dismissed is already set in localStorage', () => {
    localStorage.setItem('quomida_onboarding_dismissed', 'true');
    render(React.createElement(App));

    expect(screen.queryByText(/Returning User\?|¿Usuario recurrente\?/i)).toBeNull();
  });
});
