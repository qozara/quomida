/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { App } from '../src/App.js';
import { LocalDBService, type QuomidaDBError } from '../src/db/rxdb.js';

describe('Database Recovery Flow on Async DB6 Initialization Failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (!window.matchMedia) {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }));
    }
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('transitions from initial render to DatabaseRecoveryScreen without throwing React hook-order error (#300) when init rejects with SCHEMA_MISMATCH', async () => {
    const db6Error = new Error('RxDB Error-Code: DB6') as QuomidaDBError;
    db6Error.type = 'SCHEMA_MISMATCH';
    db6Error.backupData = JSON.stringify({ daily_logs: [{ id: 'log-1' }] });

    vi.spyOn(LocalDBService.prototype, 'init').mockRejectedValue(db6Error);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Local Database Schema Conflict')).toBeDefined();
    });

    expect(screen.getByRole('button', { name: /Reset Local Storage/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Download Data Backup/i })).toBeDefined();

    // Ensure React did not log a hook-order mismatch error ("Rendered fewer hooks than expected" / #300)
    const hookOrderErrorLogged = consoleErrorSpy.mock.calls.some((call) =>
      call.some((arg) => typeof arg === 'string' && /Rendered fewer hooks|hooks|300/i.test(arg))
    );
    expect(hookOrderErrorLogged).toBe(false);
  });
});
