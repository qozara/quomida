import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RemoteCatalogService } from '../src/services/RemoteCatalogService.js';

let mockOpenedVfs: string[] = [];
let mockClosedCount = 0;
let mockLocalCount = 885;

vi.mock('sqlite-wasm-http', () => {
  return {
    createHttpBackend: () => ({}),
    createSQLiteThread: async () => {
      const worker = async (action: string, payload: any) => {
        if (action === 'open') {
          mockOpenedVfs.push(payload.vfs);
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
            if (sql.toLowerCase().includes('avacado')) {
              return { result: { resultRows: [['1', 'Avacado Test', 'source', 'en', 100, 1, 1, 1, 'hash']] } };
            }
            return { result: { resultRows: [] } };
          }
          if (sql.includes('WHERE name LIKE')) {
            if (sql.toLowerCase().includes('avacado')) {
              return { result: { resultRows: [['1', 'Avacado Remote', 'system', 'en', 100, 1, 1, 1, 'hash']] } };
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

describe('RemoteCatalogService', () => {
  let originalFetch: any;

  beforeEach(() => {
    mockOpenedVfs = [];
    mockClosedCount = 0;
    mockLocalCount = 885;
    originalFetch = global.fetch;
    RemoteCatalogService.clearListeners();
    vi.stubGlobal('navigator', { onLine: true });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses only local OPFS when no remote URL is configured', async () => {
    const service = new RemoteCatalogService('');
    const results = await service.searchIngredients('Avacado');

    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Avacado Test');
    expect(mockOpenedVfs).toEqual(['opfs']);
  });

  it('uses only local OPFS when the app is offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    const service = new RemoteCatalogService('https://data.example.com');
    const results = await service.searchIngredients('Avacado');

    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Avacado Test');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockOpenedVfs).toEqual(['opfs']);
  });

  it('uses only local OPFS when full catalog is hydrated locally (localTotal >= remoteItemCount)', async () => {
    mockLocalCount = 1122244;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ itemCount: 1122244, catalogVersion: 'v1' })
    });

    const service = new RemoteCatalogService('https://data.example.com');
    const results = await service.searchIngredients('Avacado');

    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Avacado Test');
    // Kept OPFS, did not close to open HTTP
    expect(mockOpenedVfs).toEqual(['opfs']);
  });

  it('switches to HTTP range requests when online and local catalog is partial (localTotal < remoteItemCount)', async () => {
    mockLocalCount = 885; // Built-in system catalog only
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ itemCount: 1122244, catalogVersion: 'v1' })
    });

    const service = new RemoteCatalogService('https://data.example.com');
    const results = await service.searchIngredients('Avacado');

    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Avacado Remote');
    // First opened OPFS, checked count, then closed OPFS and opened HTTP
    expect(mockOpenedVfs).toEqual(['opfs', 'http']);
    expect(mockClosedCount).toBe(1);
  });

  it('falls back to local OPFS if remote metadata fetch fails (404 or network error)', async () => {
    mockLocalCount = 885;
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const service = new RemoteCatalogService('https://data.example.com');
    const results = await service.searchIngredients('Avacado');

    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Avacado Test');
    expect(mockOpenedVfs).toEqual(['opfs']);
  });

  it('returns empty array when query does not match', async () => {
    const service = new RemoteCatalogService('');
    const results = await service.searchIngredients('NonExistentFood');
    expect(results).toEqual([]);
  });

  it('searches portions linked to base_food_id', async () => {
    const service = new RemoteCatalogService('');
    const portions = await service.getPortionsForIngredient('1');
    expect(portions.length).toBe(1);
    expect(portions[0].name).toBe('Slice');
  });

  it('returns empty array for portions when none exist', async () => {
    const service = new RemoteCatalogService('');
    const portions = await service.getPortionsForIngredient('999');
    expect(portions).toEqual([]);
  });

  it('hot-switches from HTTP to OPFS without page reload when catalog download completes', async () => {
    mockLocalCount = 885;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ itemCount: 1122244, catalogVersion: 'v1' })
    });

    const service = new RemoteCatalogService('https://data.example.com');
    const firstResults = await service.searchIngredients('Avacado');

    expect(firstResults[0].name).toBe('Avacado Remote');
    expect(service.isHttpFallbackActive).toBe(true);
    expect(mockOpenedVfs).toEqual(['opfs', 'http']);

    // Simulate user downloading full catalog into OPFS
    mockLocalCount = 1122244;
    mockOpenedVfs = [];
    mockClosedCount = 0;

    // Trigger download completion event without page reload
    RemoteCatalogService.notifyCatalogDownloaded();

    // Give event loop tick to process event handler
    await new Promise((r) => setTimeout(r, 10));

    // Next search should seamlessly use OPFS now!
    const secondResults = await service.searchIngredients('Avacado');

    expect(secondResults[0].name).toBe('Avacado Test');
    expect(service.isHttpFallbackActive).toBe(false);
    expect(mockOpenedVfs).toEqual(['opfs']);
    expect(mockClosedCount).toBe(1); // Old HTTP worker was closed on reset

    service.destroy();
  });
});
