import { useState, useCallback, useEffect } from 'react';
import { RemoteCatalogService } from '../services/RemoteCatalogService.js';

export type DownloadStatus = 'idle' | 'fetching' | 'decompressing_and_writing' | 'complete' | 'error';

export function useCatalogDownload() {
  const [status, setStatus] = useState<DownloadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if OPFS catalog.sqlite exists and is larger than 10MB (suggesting it's the full catalog)
    if (typeof navigator !== 'undefined' && navigator.storage) {
      navigator.storage.getDirectory().then(async (root) => {
        try {
          const handle = await root.getFileHandle('catalog.sqlite');
          const file = await handle.getFile();
          if (file.size > 10 * 1024 * 1024) {
            setStatus('complete');
            setProgress(100);
          }
        } catch {
          // Keep it idle
        }
      }).catch(() => {});
    }
  }, []);

  const downloadCatalog = useCallback((url: string) => {
    if (status === 'fetching' || status === 'decompressing_and_writing') return;
    
    setStatus('fetching');
    setProgress(0);
    setError(null);

    const worker = new Worker(new URL('../workers/downloadWorker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'STATUS') {
        setStatus(payload);
      } else if (type === 'PROGRESS') {
        setProgress(payload.percent);
      } else if (type === 'COMPLETE') {
        setStatus('complete');
        setProgress(100);
        worker.terminate();
        RemoteCatalogService.notifyCatalogDownloaded();
      } else if (type === 'ERROR') {
        setStatus('error');
        setError(payload);
        worker.terminate();
      }
    };

    worker.onerror = (err) => {
      setStatus('error');
      setError('Worker failed to initialize or crashed');
      worker.terminate();
    };

    worker.postMessage({ type: 'START_DOWNLOAD', payload: { url } });
  }, [status]);

  return { status, progress, error, downloadCatalog };
}
