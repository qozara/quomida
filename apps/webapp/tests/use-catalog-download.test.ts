/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCatalogDownload } from '../src/hooks/useCatalogDownload';

describe('useCatalogDownload', () => {
  let mockWorker: any;

  beforeEach(() => {
    mockWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null
    };
    vi.stubGlobal('Worker', class {
      postMessage(msg: any) { mockWorker.postMessage(msg); }
      terminate() { mockWorker.terminate(); }
      set onmessage(fn: any) { mockWorker.onmessage = fn; }
      set onerror(fn: any) { mockWorker.onerror = fn; }
    });
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: vi.fn().mockResolvedValue({
          getFileHandle: vi.fn().mockRejectedValue(new Error('Not found'))
        })
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('initializes in idle state', () => {
    const { result } = renderHook(() => useCatalogDownload());
    expect(result.current.status).toBe('idle');
    expect(result.current.progress).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it('starts download and transitions to fetching state', () => {
    const { result } = renderHook(() => useCatalogDownload());
    
    act(() => {
      result.current.downloadCatalog('http://example.com/catalog.sqlite.gz');
    });

    expect(result.current.status).toBe('fetching');
    expect(mockWorker.postMessage).toHaveBeenCalledWith({
      type: 'START_DOWNLOAD',
      payload: { url: 'http://example.com/catalog.sqlite.gz' }
    });
  });

  it('handles worker PROGRESS messages', () => {
    const { result } = renderHook(() => useCatalogDownload());
    
    act(() => {
      result.current.downloadCatalog('url');
    });

    act(() => {
      mockWorker.onmessage({ data: { type: 'PROGRESS', payload: { percent: 45 } } });
    });

    expect(result.current.progress).toBe(45);
  });

  it('handles worker COMPLETE messages', () => {
    const { result } = renderHook(() => useCatalogDownload());
    
    act(() => {
      result.current.downloadCatalog('url');
    });

    act(() => {
      mockWorker.onmessage({ data: { type: 'COMPLETE' } });
    });

    expect(result.current.status).toBe('complete');
    expect(result.current.progress).toBe(100);
    expect(mockWorker.terminate).toHaveBeenCalled();
  });

  it('handles worker ERROR messages', () => {
    const { result } = renderHook(() => useCatalogDownload());
    
    act(() => {
      result.current.downloadCatalog('url');
    });

    act(() => {
      mockWorker.onmessage({ data: { type: 'ERROR', payload: 'Network error' } });
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Network error');
    expect(mockWorker.terminate).toHaveBeenCalled();
  });

  it('deletes downloaded catalog and resets status to idle', async () => {
    const { DatabaseBootstrapper } = await import('../src/services/DatabaseBootstrapper.js');
    const { RemoteCatalogService } = await import('../src/services/RemoteCatalogService.js');
    const reseedSpy = vi.spyOn(DatabaseBootstrapper, 'removeDownloadedCatalogAndReseed').mockResolvedValue(undefined as any);
    const resetSpy = vi.spyOn(RemoteCatalogService.getInstance(), 'reset').mockResolvedValue(undefined as any);
    const notifySpy = vi.spyOn(RemoteCatalogService, 'notifyCatalogDownloaded');

    const { result } = renderHook(() => useCatalogDownload());

    act(() => {
      result.current.downloadCatalog('url');
    });
    act(() => {
      mockWorker.onmessage({ data: { type: 'COMPLETE' } });
    });
    expect(result.current.status).toBe('complete');

    await act(async () => {
      await result.current.deleteCatalog();
    });

    expect(reseedSpy).toHaveBeenCalled();
    expect(resetSpy).toHaveBeenCalled();
    expect(notifySpy).toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.progress).toBe(0);
  });

  describe('checkAndTriggerAutoDownload', () => {
    it('triggers auto-download when online, size <= 10MB, and saveData is false', () => {
      const { result } = renderHook(() => useCatalogDownload());

      let triggered = false;
      act(() => {
        triggered = result.current.checkAndTriggerAutoDownload({
          downloadUrl: 'http://example.com/catalog.sqlite.gz',
          fileSizeBytes: 2.3 * 1024 * 1024, // 2.3MB
          isOnline: true,
          userAutoDownloadPref: true
        });
      });

      expect(triggered).toBe(true);
      expect(result.current.status).toBe('fetching');
      expect(mockWorker.postMessage).toHaveBeenCalledWith({
        type: 'START_DOWNLOAD',
        payload: { url: 'http://example.com/catalog.sqlite.gz' }
      });
    });

    it('does NOT trigger auto-download when size > 10MB', () => {
      const { result } = renderHook(() => useCatalogDownload());

      let triggered = false;
      act(() => {
        triggered = result.current.checkAndTriggerAutoDownload({
          downloadUrl: 'http://example.com/catalog.sqlite.gz',
          fileSizeBytes: 12 * 1024 * 1024, // 12MB
          isOnline: true,
          userAutoDownloadPref: true
        });
      });

      expect(triggered).toBe(false);
      expect(result.current.status).toBe('idle');
      expect(mockWorker.postMessage).not.toHaveBeenCalled();
    });

    it('does NOT trigger auto-download when user disabled auto-download preference', () => {
      const { result } = renderHook(() => useCatalogDownload());

      let triggered = false;
      act(() => {
        triggered = result.current.checkAndTriggerAutoDownload({
          downloadUrl: 'http://example.com/catalog.sqlite.gz',
          fileSizeBytes: 2.3 * 1024 * 1024,
          isOnline: true,
          userAutoDownloadPref: false
        });
      });

      expect(triggered).toBe(false);
      expect(result.current.status).toBe('idle');
      expect(mockWorker.postMessage).not.toHaveBeenCalled();
    });

    it('does NOT trigger auto-download when browser has saveData enabled', () => {
      vi.stubGlobal('navigator', {
        connection: { saveData: true },
        storage: {
          getDirectory: vi.fn().mockResolvedValue({
            getFileHandle: vi.fn().mockRejectedValue(new Error('Not found'))
          })
        }
      });

      const { result } = renderHook(() => useCatalogDownload());

      let triggered = false;
      act(() => {
        triggered = result.current.checkAndTriggerAutoDownload({
          downloadUrl: 'http://example.com/catalog.sqlite.gz',
          fileSizeBytes: 2.3 * 1024 * 1024,
          isOnline: true,
          userAutoDownloadPref: true
        });
      });

      expect(triggered).toBe(false);
      expect(result.current.status).toBe('idle');
    });

    it('does NOT trigger auto-download when app is offline', () => {
      const { result } = renderHook(() => useCatalogDownload());

      let triggered = false;
      act(() => {
        triggered = result.current.checkAndTriggerAutoDownload({
          downloadUrl: 'http://example.com/catalog.sqlite.gz',
          fileSizeBytes: 2.3 * 1024 * 1024,
          isOnline: false,
          userAutoDownloadPref: true
        });
      });

      expect(triggered).toBe(false);
      expect(result.current.status).toBe('idle');
    });
  });
});

