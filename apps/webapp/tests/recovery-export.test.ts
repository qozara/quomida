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

  it('exports per-collection rxdb-dexie IndexedDB databases when main db has no object stores', async () => {
    const emptyMainDb = {
      objectStoreNames: [],
      close: vi.fn()
    };

    const collectionStores: Record<string, any[]> = {
      'rxdb-dexie-quomidadb_v1--0--daily_logs': [
        { id: 'log-1', food_name: 'Eggs', _deleted: false },
        { id: 'log-deleted', food_name: 'Old', _deleted: true }
      ],
      'rxdb-dexie-quomidadb_v1--0--base_ingredients': [
        { id: 'custom-1', name: 'My Bread', source: 'custom', _deleted: false },
        { id: 'sys-1', name: 'Apple', source: 'system', _deleted: false }
      ],
      'rxdb-dexie-quomidadb_v1--0--_rxdb_internal': [
        { id: 'internal-1' }
      ]
    };

    const makeCollectionDb = (dbName: string) => ({
      objectStoreNames: ['docs', 'changes'],
      transaction: vi.fn().mockReturnValue({
        objectStore: (storeName: string) => ({
          getAll: () => {
            const req: any = {
              onsuccess: null,
              onerror: null,
              result: storeName === 'docs' ? (collectionStores[dbName] || []) : []
            };
            setTimeout(() => {
              if (req.onsuccess) req.onsuccess();
            }, 0);
            return req;
          }
        })
      }),
      close: vi.fn()
    });

    vi.stubGlobal('indexedDB', {
      databases: vi.fn().mockResolvedValue([
        { name: 'rxdb-dexie-quomidadb_v1--0--daily_logs' },
        { name: 'rxdb-dexie-quomidadb_v1--0--base_ingredients' },
        { name: 'rxdb-dexie-quomidadb_v1--0--_rxdb_internal' },
        { name: 'other-unrelated-db' }
      ]),
      open: vi.fn().mockImplementation((name: string) => {
        const req: any = {
          onsuccess: null,
          onerror: null,
          result: name === 'quomidadb_v1' ? emptyMainDb : makeCollectionDb(name)
        };
        setTimeout(() => {
          if (req.onsuccess) req.onsuccess();
        }, 0);
        return req;
      })
    });

    const backupJson = await exportRawDexieBackup('quomidadb_v1');
    const parsed = JSON.parse(backupJson);

    expect(parsed.daily_logs).toEqual([{ id: 'log-1', food_name: 'Eggs', _deleted: false }]);
    expect(parsed.base_ingredients).toEqual([{ id: 'custom-1', name: 'My Bread', source: 'custom', _deleted: false }]);
    expect(parsed._rxdb_internal).toBeUndefined();
  });
});
