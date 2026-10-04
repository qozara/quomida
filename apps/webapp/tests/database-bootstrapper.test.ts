import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseBootstrapper } from '../src/services/DatabaseBootstrapper';

describe('DatabaseBootstrapper', () => {
  let originalFetch: any;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('skips bootstrap if navigator.storage is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;
    await DatabaseBootstrapper.ensureSystemCatalogOPFS();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('skips bootstrap if catalog.sqlite already exists in OPFS', async () => {
    const mockGetFileHandle = vi.fn().mockResolvedValue({});
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: vi.fn().mockResolvedValue({
          getFileHandle: mockGetFileHandle
        })
      }
    });

    global.fetch = vi.fn();
    await DatabaseBootstrapper.ensureSystemCatalogOPFS();

    expect(mockGetFileHandle).toHaveBeenCalledWith('catalog.sqlite');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches system.sqlite and writes to OPFS if catalog.sqlite is missing', async () => {
    const mockWrite = vi.fn().mockResolvedValue(undefined);
    const mockClose = vi.fn().mockResolvedValue(undefined);
    const mockWritable = { write: mockWrite, close: mockClose };
    
    const mockGetFileHandle = vi.fn().mockImplementation((name, options) => {
      if (options?.create) {
        return Promise.resolve({ createWritable: vi.fn().mockResolvedValue(mockWritable) });
      }
      const err = new Error('Not found');
      err.name = 'NotFoundError';
      return Promise.reject(err);
    });

    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: vi.fn().mockResolvedValue({
          getFileHandle: mockGetFileHandle
        })
      }
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10)),
      body: undefined // Simulating arrayBuffer fallback
    });

    await DatabaseBootstrapper.ensureSystemCatalogOPFS();

    expect(global.fetch).toHaveBeenCalledWith('/system.sqlite');
    expect(mockGetFileHandle).toHaveBeenCalledWith('catalog.sqlite', { create: true });
    expect(mockWrite).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });

  it('supports createSyncAccessHandle fallback for mobile Safari when createWritable is undefined', async () => {
    const mockWriteSync = vi.fn();
    const mockFlushSync = vi.fn();
    const mockCloseSync = vi.fn();
    const mockAccessHandle = { write: mockWriteSync, flush: mockFlushSync, close: mockCloseSync };

    const mockGetFileHandle = vi.fn().mockImplementation((name, options) => {
      if (options?.create) {
        return Promise.resolve({
          createWritable: undefined, // Simulates mobile Safari 15.2 - 16.3
          createSyncAccessHandle: vi.fn().mockResolvedValue(mockAccessHandle)
        });
      }
      const err = new Error('Not found');
      err.name = 'NotFoundError';
      return Promise.reject(err);
    });

    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: vi.fn().mockResolvedValue({
          getFileHandle: mockGetFileHandle
        })
      }
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(12))
    });

    await DatabaseBootstrapper.ensureSystemCatalogOPFS();

    expect(global.fetch).toHaveBeenCalledWith('/system.sqlite');
    expect(mockWriteSync).toHaveBeenCalled();
    expect(mockFlushSync).toHaveBeenCalled();
    expect(mockCloseSync).toHaveBeenCalled();
  });
});
