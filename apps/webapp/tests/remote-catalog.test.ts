import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RemoteCatalogService, SYSTEM_CATALOG_META } from '../src/services/RemoteCatalogService.js';

let mockOpenedVfs: string[] = [];
let mockClosedCount = 0;
let mockLocalCount: number = SYSTEM_CATALOG_META.itemCount || 965;
let mockShouldFailRemoteExec = false;

vi.mock('sqlite-wasm-http', () => {
  return {
    createHttpBackend: () => ({}),
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
            if (sql.toLowerCase().includes('avacado')) {
              return { result: { resultRows: [['1', 'Avacado Test', 'source', 'en', 100, 1, 1, 1, 'hash']] } };
            }
            return { result: { resultRows: [] } };
          }
          if (sql.includes('WHERE name LIKE')) {
            if (mockShouldFailRemoteExec) {
              throw new Error('Remote range request timeout / SQLITE_IOERR');
            }
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
    mockLocalCount = SYSTEM_CATALOG_META.itemCount;
    mockShouldFailRemoteExec = false;
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

  it('uses only local OPFS with zero network calls when full catalog is hydrated locally', async () => {
    mockLocalCount = 1122244;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    const service = new RemoteCatalogService('https://data.example.com');
    const results = await service.searchIngredients('Avacado');

    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Avacado Test');
    // Kept OPFS, did not close to open HTTP
    expect(mockOpenedVfs).toEqual(['opfs']);
    // ZERO network calls made
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('switches to HTTP range requests when online and local catalog is partial (localTotal < remoteItemCount)', async () => {
    mockLocalCount = SYSTEM_CATALOG_META.itemCount; // Built-in system catalog only
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ itemCount: 1122244, catalogVersion: 'v1' })
    });

    const service = new RemoteCatalogService('https://data.example.com');
    const results = await service.searchIngredients('Avacado');

    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Avacado Remote');
    // Both OPFS and HTTP workers opened, local OPFS kept open for resilience
    expect(mockOpenedVfs).toEqual(['opfs', 'http']);
    expect(mockClosedCount).toBe(0);
    expect(service.hasRemoteFailed).toBe(false);
  });

  it('falls back to local OPFS if remote metadata fetch fails (404 or network error)', async () => {
    mockLocalCount = SYSTEM_CATALOG_META.itemCount;
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const service = new RemoteCatalogService('https://data.example.com');
    const results = await service.searchIngredients('Avacado');

    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Avacado Test');
    expect(mockOpenedVfs).toEqual(['opfs']);
  });

  it('falls back to local OPFS and flags hasRemoteFailed when remote search query throws or times out', async () => {
    mockLocalCount = SYSTEM_CATALOG_META.itemCount;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ itemCount: 1122244, catalogVersion: 'v1' })
    });

    mockShouldFailRemoteExec = true; // Simulate remote range failure / timeout

    const service = new RemoteCatalogService('https://data.example.com');
    const results = await service.searchIngredients('Avacado');

    // Consolidated results return local ingredient
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Avacado Test');
    // Error state flagged for non-intrusive UI notice
    expect(service.hasRemoteFailed).toBe(true);
    expect(service.isCircuitBreakerOpen()).toBe(true);

    // Subsequent search uses local immediately without hanging
    const subsequentResults = await service.searchIngredients('Avacado');
    expect(subsequentResults.length).toBe(1);
    expect(subsequentResults[0].name).toBe('Avacado Test');

    // Resetting circuit breaker allows retrying remote
    service.resetCircuitBreaker();
    expect(service.hasRemoteFailed).toBe(false);
    expect(service.isCircuitBreakerOpen()).toBe(false);

    mockShouldFailRemoteExec = false;
    const retryResults = await service.searchIngredients('Avacado');
    expect(retryResults.length).toBe(1);
    expect(retryResults[0].name).toBe('Avacado Remote');
    expect(service.hasRemoteFailed).toBe(false);
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
    mockLocalCount = SYSTEM_CATALOG_META.itemCount;
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
    expect(mockClosedCount).toBe(2); // Both OPFS and HTTP workers closed on reset

    service.destroy();
  });

  it('runs in zero-header mode: loads built-in system.sqlite via byteArray when crossOriginIsolated is false, keeping remote search disabled', async () => {
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

    const service = new RemoteCatalogService('https://data.example.com');
    const results = await service.searchIngredients('Avacado');

    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Avacado Test');
    // Opened worker using byteArray in-memory SQLite, never opened OPFS or HTTP VFS
    expect(mockOpenedVfs).toEqual(['memory-bytearray']);
    // Remote search is disabled as progressive enhancement
    expect(service.isHttpFallbackActive).toBe(false);
    expect(service.hasRemoteFailed).toBe(false);
    expect(mockClosedCount).toBe(0);

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

    const service = new RemoteCatalogService('https://data.example.com');
    const results = await service.searchIngredients('Avacado');

    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Avacado Test');
    expect(mockOpenedVfs).toEqual(['memory-bytearray']);
    expect(service.isHttpFallbackActive).toBe(false);

    service.destroy();
  });
});
