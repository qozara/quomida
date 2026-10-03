import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RemoteCatalogService, SYSTEM_CATALOG_META } from '../src/services/RemoteCatalogService.js';

let mockOpenedVfs: string[] = [];
let mockClosedCount = 0;
let mockLocalCount: number = SYSTEM_CATALOG_META.itemCount || 965;
let mockFtsThrows = false;

vi.mock('sqlite-wasm-http', () => {
  return {
    createSQLiteThread: async () => {
      const worker = async (action: string, payload: any) => {
        if (action === 'open') {
          mockOpenedVfs.push(payload.vfs || (payload.byteArray ? 'memory-bytearray' : 'memory'));
          return;
        }
        if (action === 'close') {
          mockClosedCount++;
          return;
        }
        if (action === 'exec') {
          const sql = payload.sql;
          if (sql.includes('SELECT (SELECT count(*)')) {
            return { result: { resultRows: [[mockLocalCount]] } };
          }
          if (sql.includes('SELECT count(*)')) {
            return { result: { resultRows: [[mockLocalCount]] } };
          }
          if (sql.includes('FROM portions')) {
            if (sql.includes("'1'")) {
              return { result: { resultRows: [['p1', '1', 'Slice', 30, 'hash']] } };
            }
            return { result: { resultRows: [] } };
          }
          if (sql.includes('base_ingredients_fts')) {
            if (mockFtsThrows) {
              throw new Error('FTS5 syntax error test');
            }
            if (sql.toLowerCase().includes('avocado')) {
              return { result: { resultRows: [['1', 'Avocado Test', 'system', 'en', 160, 2, 8, 15, 'hash']] } };
            }
            return { result: { resultRows: [] } };
          }
          if (sql.includes('WHERE name LIKE')) {
            if (sql.toLowerCase().includes('avocado')) {
              return { result: { resultRows: [['1', 'Avocado Test LIKE', 'system', 'en', 160, 2, 8, 15, 'hash']] } };
            }
            return { result: { resultRows: [] } };
          }
          return { result: { resultRows: [] } };
        }
      };
      return worker;
    }
  };
});

describe('RemoteCatalogService (Unified Single SQLite Architecture)', () => {
  let originalFetch: any;

  beforeEach(() => {
    mockOpenedVfs = [];
    mockClosedCount = 0;
    mockLocalCount = SYSTEM_CATALOG_META.itemCount || 965;
    mockFtsThrows = false;
    originalFetch = global.fetch;
    RemoteCatalogService.clearListeners();
    RemoteCatalogService.resetInstance();
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('window', { crossOriginIsolated: true });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('initializes single local worker and queries catalog via FTS5', async () => {
    const service = RemoteCatalogService.getInstance();
    const results = await service.searchIngredients('Avocado');

    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Avocado Test');
    expect(mockOpenedVfs).toEqual(['opfs']);
    expect(service.isFullCatalogLoaded).toBe(false); // only basic catalog
    expect(service.itemCount).toBe(mockLocalCount);
  });

  it('falls back to LIKE query if FTS5 query throws', async () => {
    mockFtsThrows = true;
    const service = RemoteCatalogService.getInstance();
    const results = await service.searchIngredients('Avocado');

    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Avocado Test LIKE');
    expect(mockOpenedVfs).toEqual(['opfs']);
  });

  it('returns empty array when query has no searchable characters', async () => {
    const service = RemoteCatalogService.getInstance();
    const results = await service.searchIngredients('   $$$   ');
    expect(results).toEqual([]);
    expect(mockOpenedVfs.length).toBe(0); // did not even need to query
  });

  it('returns empty array when no ingredients match query', async () => {
    const service = RemoteCatalogService.getInstance();
    const results = await service.searchIngredients('NonExistentFoodItem');
    expect(results).toEqual([]);
  });

  it('searches portions linked to base_food_id', async () => {
    const service = RemoteCatalogService.getInstance();
    const portions = await service.getPortionsForIngredient('1');
    expect(portions.length).toBe(1);
    expect(portions[0].name).toBe('Slice');
    expect(portions[0].equivalent_weight_g).toBe(30);
  });

  it('returns empty array for portions when none exist', async () => {
    const service = RemoteCatalogService.getInstance();
    const portions = await service.getPortionsForIngredient('999');
    expect(portions).toEqual([]);
  });

  it('hot-switches and updates item count when catalog download completes', async () => {
    const service = RemoteCatalogService.getInstance();
    await service.searchIngredients('Avocado');

    expect(service.isFullCatalogLoaded).toBe(false);
    expect(mockOpenedVfs).toEqual(['opfs']);

    // Simulate user downloading full catalog (1.1M items) into OPFS
    mockLocalCount = 1122244;
    mockOpenedVfs = [];
    mockClosedCount = 0;

    let listenerTriggered = false;
    RemoteCatalogService.onCatalogDownloaded(() => {
      listenerTriggered = true;
    });

    // Notify catalog downloaded
    RemoteCatalogService.notifyCatalogDownloaded();
    expect(listenerTriggered).toBe(true);

    // Give event loop tick to process async reset
    await new Promise((r) => setTimeout(r, 10));

    // Next search re-opens local SQLite worker with full database
    const results = await service.searchIngredients('Avocado');
    expect(results.length).toBe(1);
    expect(service.isFullCatalogLoaded).toBe(true);
    expect(service.itemCount).toBe(1122244);
    expect(mockOpenedVfs).toEqual(['opfs']);
    expect(mockClosedCount).toBe(1); // Previous worker closed
  });

  it('runs in zero-header mode: loads built-in system.sqlite via byteArray when crossOriginIsolated is false', async () => {
    vi.stubGlobal('window', { crossOriginIsolated: false });
    mockLocalCount = SYSTEM_CATALOG_META.itemCount;

    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/system.sqlite')) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(100))
        });
      }
      return Promise.resolve({ ok: false });
    });
    global.fetch = fetchSpy;

    const service = new RemoteCatalogService();
    const results = await service.searchIngredients('Avocado');

    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Avocado Test');
    expect(mockOpenedVfs).toEqual(['memory-bytearray']);
    expect(service.isFullCatalogLoaded).toBe(false);

    service.destroy();
  });

  it('runs in zero-header mode: loads downloaded catalog from OPFS via standard FileSystem API without vfs:opfs', async () => {
    vi.stubGlobal('window', { crossOriginIsolated: false });
    mockLocalCount = 1122244;

    const mockFile = {
      size: 15 * 1024 * 1024,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(200))
    };
    const mockFileHandle = {
      getFile: vi.fn().mockResolvedValue(mockFile)
    };
    vi.stubGlobal('navigator', {
      onLine: true,
      storage: {
        getDirectory: vi.fn().mockResolvedValue({
          getFileHandle: vi.fn().mockResolvedValue(mockFileHandle)
        })
      }
    });

    const service = new RemoteCatalogService();
    const results = await service.searchIngredients('Avocado');

    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Avocado Test');
    expect(mockOpenedVfs).toEqual(['memory-bytearray']);
    expect(service.isFullCatalogLoaded).toBe(true);

    service.destroy();
  });

  it('destroys instance and cleans up worker and listeners cleanly', async () => {
    const service = new RemoteCatalogService();
    await service.searchIngredients('Avocado');
    expect(mockOpenedVfs).toEqual(['opfs']);

    service.destroy();
    await new Promise((r) => setTimeout(r, 10));
    expect(mockClosedCount).toBe(1);
  });
});
