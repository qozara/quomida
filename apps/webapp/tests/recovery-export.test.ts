import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportRawDexieBackup } from '../src/db/rxdb.js';

describe('exportRawDexieBackup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exports user data while filtering out system-sourced items and avoids pretty printing', async () => {
    const mockDailyLogs = [
      { id: 'log-1', food_name: 'Custom Oatmeal', calories: 200 }
    ];
    const mockIngredients = [
      { id: 'custom-1', name: 'My Homemade Jam', source: 'custom' },
      { id: 'sys-1', name: 'System Sugar', source: 'system' }
    ];

    const mockStores: Record<string, any[]> = {
      'daily_logs': mockDailyLogs,
      'base_ingredients': mockIngredients
    };

    const mockObjectStore = (name: string) => ({
      getAll: () => {
        const req: any = {
          onsuccess: null,
          onerror: null,
          result: mockStores[name] || []
        };
        setTimeout(() => {
          if (req.onsuccess) req.onsuccess();
        }, 0);
        return req;
      }
    });

    const mockDB = {
      objectStoreNames: ['daily_logs', 'base_ingredients'],
      transaction: vi.fn().mockReturnValue({
        objectStore: (name: string) => mockObjectStore(name)
      }),
      close: vi.fn()
    };

    vi.stubGlobal('indexedDB', {
      open: vi.fn().mockImplementation(() => {
        const req: any = {
          onsuccess: null,
          onerror: null,
          result: mockDB
        };
        setTimeout(() => {
          if (req.onsuccess) req.onsuccess();
        }, 0);
        return req;
      })
    });

    const backupJson = await exportRawDexieBackup('test_db');
    expect(backupJson).not.toBe('');

    // Must be compact JSON (no double space indentations)
    expect(backupJson).not.toContain('\n  ');

    const parsed = JSON.parse(backupJson);
    expect(parsed.daily_logs.length).toBe(1);
    expect(parsed.daily_logs[0].id).toBe('log-1');

    // System items must be filtered out
    expect(parsed.base_ingredients.length).toBe(1);
    expect(parsed.base_ingredients[0].id).toBe('custom-1');
    expect(parsed.base_ingredients[0].source).toBe('custom');
  });

  it('handles empty database without error', async () => {
    const mockDB = {
      objectStoreNames: [],
      close: vi.fn()
    };

    vi.stubGlobal('indexedDB', {
      open: vi.fn().mockImplementation(() => {
        const req: any = {
          onsuccess: null,
          onerror: null,
          result: mockDB
        };
        setTimeout(() => {
          if (req.onsuccess) req.onsuccess();
        }, 0);
        return req;
      })
    });

    const backupJson = await exportRawDexieBackup('test_empty_db');
    expect(backupJson).toBe('{}');
  });
});
