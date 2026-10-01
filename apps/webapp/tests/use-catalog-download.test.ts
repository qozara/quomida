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
});
