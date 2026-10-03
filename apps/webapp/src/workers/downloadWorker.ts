/// <reference lib="webworker" />

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'START_DOWNLOAD') {
    const { url } = payload;
    try {
      // 1. Attempt to persist storage
      if (navigator.storage && navigator.storage.persist) {
        const persisted = await navigator.storage.persist();
        self.postMessage({ type: 'LOG', payload: `Storage persisted: ${persisted}` });
      }

      // 2. Fetch the massive .gz file
      self.postMessage({ type: 'STATUS', payload: 'fetching' });
      const response = await fetch(url);
      if (!response.ok || !response.body) {
        throw new Error(`Failed to fetch catalog: ${response.status}`);
      }

      const totalBytesStr = response.headers.get('content-length');
      const totalBytes = totalBytesStr ? parseInt(totalBytesStr, 10) : 0;
      let loadedBytes = 0;

      // 3. Create a progress tracker TransformStream
      const progressTracker = new TransformStream({
        transform(chunk, controller) {
          loadedBytes += chunk.byteLength;
          let progress = 0;
          if (totalBytes > 0) {
             progress = Math.round((loadedBytes / totalBytes) * 100);
          } else {
             // Fake progress if no content length
             progress = loadedBytes > 50 * 1024 * 1024 ? 90 : Math.round((loadedBytes / (50 * 1024 * 1024)) * 100);
          }
          
          self.postMessage({ 
            type: 'PROGRESS', 
            payload: { loaded: loadedBytes, total: totalBytes, percent: Math.min(progress, 100) } 
          });
          
          controller.enqueue(chunk);
        }
      });

      // 4. Pipe through progress -> decompression
      const decompressedStream = response.body
        .pipeThrough(progressTracker)
        .pipeThrough(new DecompressionStream('gzip'));

      // 5. Write to OPFS directly (Zero RAM buffering)
      self.postMessage({ type: 'STATUS', payload: 'decompressing_and_writing' });
      const opfsRoot = await navigator.storage.getDirectory();
      
      const fileHandle = await opfsRoot.getFileHandle('catalog.sqlite', { create: true });
      if (typeof fileHandle.createWritable === 'function') {
        const writable = await fileHandle.createWritable();
        await decompressedStream.pipeTo(writable);
      } else if (typeof (fileHandle as any).createSyncAccessHandle === 'function') {
        const accessHandle = await (fileHandle as any).createSyncAccessHandle();
        const reader = decompressedStream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accessHandle.write(value);
        }
        accessHandle.flush();
        accessHandle.close();
      }

      self.postMessage({ type: 'COMPLETE' });
    } catch (err: any) {
      self.postMessage({ type: 'ERROR', payload: err.message || 'Download failed' });
    }
  }
};
