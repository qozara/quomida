import { useState, useCallback, useEffect } from 'react';
import { RemoteCatalogService } from '../services/RemoteCatalogService.js';
import { DatabaseBootstrapper } from '../services/DatabaseBootstrapper.js';

export type DownloadStatus = 'idle' | 'fetching' | 'decompressing_and_writing' | 'complete' | 'error';

export const AUTO_DOWNLOAD_MAX_BYTES = 10 * 1024 * 1024; // 10 MB threshold

export interface CatalogDownloadState {
  status: DownloadStatus;
  progress: number;
  error: string | null;
  isDeleting: boolean;
}

let sharedState: CatalogDownloadState = {
  status: 'idle',
  progress: 0,
  error: null,
  isDeleting: false
};

const listeners = new Set<(state: CatalogDownloadState) => void>();
let activeWorker: Worker | null = null;

function setSharedState(partial: Partial<CatalogDownloadState>) {
  sharedState = { ...sharedState, ...partial };
  listeners.forEach((listener) => {
    try {
      listener(sharedState);
    } catch (err) {
      console.warn('[useCatalogDownload] Error in state listener:', err);
    }
  });
}

export function resetSharedCatalogDownloadState() {
  sharedState = {
    status: 'idle',
    progress: 0,
    error: null,
    isDeleting: false
  };
  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
  }
  listeners.forEach((l) => l(sharedState));
}

/**
 * Directly inspects OPFS catalog.sqlite file size and synchronizes shared status.
 * Returns 'complete' if size > 1MB, otherwise 'idle'.
 */
export async function refreshCatalogDownloadStatus(): Promise<DownloadStatus> {
  if (typeof navigator !== 'undefined' && navigator.storage) {
    try {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle('catalog.sqlite');
      const file = await handle.getFile();
      console.log(`[CatalogDownload] Verified OPFS catalog.sqlite: size = ${file.size} bytes (${file.size > 1024 * 1024 ? 'full catalog' : 'system catalog'})`);
      if (file.size > 1 * 1024 * 1024) {
        if (sharedState.status !== 'fetching' && sharedState.status !== 'decompressing_and_writing') {
          setSharedState({ status: 'complete', progress: 100, error: null });
        }
        return 'complete';
      } else {
        if (sharedState.status !== 'fetching' && sharedState.status !== 'decompressing_and_writing') {
          setSharedState({ status: 'idle', progress: 0, error: null });
        }
        return 'idle';
      }
    } catch (err: any) {
      console.log('[CatalogDownload] OPFS catalog.sqlite not found or error accessing:', err?.message || err);
      if (sharedState.status !== 'fetching' && sharedState.status !== 'decompressing_and_writing') {
        setSharedState({ status: 'idle', progress: 0, error: null });
      }
      return 'idle';
    }
  }
  return sharedState.status;
}

export function startCatalogDownload(url: string): void {
  if (sharedState.status === 'fetching' || sharedState.status === 'decompressing_and_writing') {
    console.log('[CatalogDownload] Download already active. Ignoring duplicate request.');
    return;
  }

  console.log('[CatalogDownload] Starting download from:', url);
  setSharedState({ status: 'fetching', progress: 0, error: null });

  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
  }

  const worker = new Worker(new URL('../workers/downloadWorker.ts', import.meta.url), { type: 'module' });
  activeWorker = worker;

  worker.onmessage = (e) => {
    const { type, payload } = e.data;
    if (type === 'LOG') {
      console.log('[CatalogDownload:Worker]', payload);
    } else if (type === 'STATUS') {
      console.log('[CatalogDownload] Worker status transition:', payload);
      setSharedState({ status: payload });
    } else if (type === 'PROGRESS') {
      setSharedState({ progress: payload.percent });
    } else if (type === 'COMPLETE') {
      console.log('[CatalogDownload] Download complete! Catalog is ready in OPFS.');
      setSharedState({ status: 'complete', progress: 100, error: null });
      worker.terminate();
      activeWorker = null;
      RemoteCatalogService.notifyCatalogDownloaded();
    } else if (type === 'ERROR') {
      console.error('[CatalogDownload] Worker reported error:', payload);
      setSharedState({ status: 'error', error: payload });
      worker.terminate();
      activeWorker = null;
    }
  };

  worker.onerror = (err) => {
    console.error('[CatalogDownload] Worker failed to initialize or crashed:', err);
    setSharedState({ status: 'error', error: 'Worker failed to initialize or crashed' });
    worker.terminate();
    activeWorker = null;
  };

  worker.postMessage({ type: 'START_DOWNLOAD', payload: { url } });
}

export async function removeDownloadedCatalog(): Promise<void> {
  if (sharedState.isDeleting) return;
  console.log('[CatalogDownload] Deleting downloaded catalog from OPFS and reseeding with built-in system catalog...');
  setSharedState({ isDeleting: true, error: null });
  try {
    await RemoteCatalogService.getInstance().reset();
    await DatabaseBootstrapper.removeDownloadedCatalogAndReseed();
    console.log('[CatalogDownload] Downloaded catalog removed and system.sqlite reseeded successfully.');
    setSharedState({ status: 'idle', progress: 0, error: null });
    RemoteCatalogService.notifyCatalogDownloaded();
  } catch (err: any) {
    console.error('[CatalogDownload] Error deleting catalog:', err);
    setSharedState({ error: err?.message || 'Failed to delete catalog' });
  } finally {
    setSharedState({ isDeleting: false });
  }
}

export interface UseCatalogDownloadResult {
  status: DownloadStatus;
  progress: number;
  error: string | null;
  isDeleting: boolean;
  downloadCatalog: (url: string) => void;
  deleteCatalog: () => Promise<void>;
  checkAndTriggerAutoDownload: (options: {
    downloadUrl: string;
    fileSizeBytes?: number | null;
    isOnline: boolean;
    userAutoDownloadPref?: boolean;
  }) => boolean;
  refreshStatus?: () => Promise<DownloadStatus>;
}

export function useCatalogDownload(): UseCatalogDownloadResult {
  const [state, setState] = useState<CatalogDownloadState>(sharedState);

  useEffect(() => {
    listeners.add(setState);
    refreshCatalogDownloadStatus();
    return () => {
      listeners.delete(setState);
    };
  }, []);

  useEffect(() => {
    const unsub = RemoteCatalogService.onCatalogDownloaded(() => {
      console.log('[useCatalogDownload] Detected catalog update broadcast. Refreshing OPFS status...');
      refreshCatalogDownloadStatus();
    });
    return unsub;
  }, []);

  const downloadCatalog = useCallback((url: string) => {
    startCatalogDownload(url);
  }, []);

  const deleteCatalog = useCallback(async () => {
    await removeDownloadedCatalog();
  }, []);

  /**
   * Evaluates whether auto-download should occur based on size, saveData, and user opt-in
   */
  const checkAndTriggerAutoDownload = useCallback((options: {
    downloadUrl: string;
    fileSizeBytes?: number | null;
    isOnline: boolean;
    userAutoDownloadPref?: boolean;
  }): boolean => {
    const { downloadUrl, fileSizeBytes, isOnline, userAutoDownloadPref = true } = options;

    if (!isOnline || sharedState.status !== 'idle') {
      return false;
    }

    if (userAutoDownloadPref === false) {
      console.log('[CatalogDownload] Auto-download disabled by user settings.');
      return false;
    }

    if (typeof navigator !== 'undefined') {
      const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      if (conn && conn.saveData === true) {
        console.log('[CatalogDownload] Auto-download skipped: navigator.connection.saveData is enabled.');
        return false;
      }
    }

    const effectiveSize = fileSizeBytes && fileSizeBytes > 0 ? fileSizeBytes : 0;
    if (effectiveSize > AUTO_DOWNLOAD_MAX_BYTES) {
      console.log(`[CatalogDownload] Auto-download skipped: catalog size (${effectiveSize} bytes) exceeds limit (${AUTO_DOWNLOAD_MAX_BYTES} bytes).`);
      return false;
    }

    console.log(`[CatalogDownload] Auto-download eligible: ${effectiveSize} bytes <= 10MB. Initiating download...`);
    downloadCatalog(downloadUrl);
    return true;
  }, [downloadCatalog]);

  return {
    status: state.status,
    progress: state.progress,
    error: state.error,
    isDeleting: state.isDeleting,
    downloadCatalog,
    deleteCatalog,
    checkAndTriggerAutoDownload,
    refreshStatus: refreshCatalogDownloadStatus
  };
}
