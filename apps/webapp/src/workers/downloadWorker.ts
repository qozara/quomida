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

      // 5. Write to temporary staging file in OPFS (Zero RAM buffering)
      self.postMessage({ type: 'STATUS', payload: 'decompressing_and_writing' });
      const opfsRoot = await navigator.storage.getDirectory();
      
      const tmpHandle = await opfsRoot.getFileHandle('catalog.sqlite.tmp', { create: true });
      if (typeof tmpHandle.createWritable === 'function') {
        const writable = await tmpHandle.createWritable();
        await decompressedStream.pipeTo(writable);
      } else if (typeof (tmpHandle as any).createSyncAccessHandle === 'function') {
        const accessHandle = await (tmpHandle as any).createSyncAccessHandle();
        const reader = decompressedStream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accessHandle.write(value);
        }
        accessHandle.flush();
        accessHandle.close();
      }

      // 6. Verify SQLite database integrity before swap
      const tmpFile = await tmpHandle.getFile();
      if (tmpFile.size < 100) {
        throw new Error('Downloaded catalog file is too small to be a valid SQLite database');
      }
      const headerBuffer = await tmpFile.slice(0, 16).arrayBuffer();
      const headerText = new TextDecoder('utf-8').decode(headerBuffer);
      if (headerText !== 'SQLite format 3\x00') {
        throw new Error('Downloaded catalog does not have a valid SQLite format 3 header');
      }


      // 7. Atomic Swap: move or copy tmp to target
      if (typeof (tmpHandle as any).move === 'function') {
        try {
          await opfsRoot.removeEntry('catalog.sqlite');
        } catch (err: any) {
          if (err.name !== 'NotFoundError') throw err;
        }
        await (tmpHandle as any).move('catalog.sqlite');
      } else {
        const targetHandle = await opfsRoot.getFileHandle('catalog.sqlite', { create: true });
        if (typeof targetHandle.createWritable === 'function') {
          const writable = await targetHandle.createWritable();
          await tmpFile.stream().pipeTo(writable);
        } else if (typeof (targetHandle as any).createSyncAccessHandle === 'function') {
          const accessHandle = await (targetHandle as any).createSyncAccessHandle();
          const reader = tmpFile.stream().getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            accessHandle.write(value);
          }
          accessHandle.flush();
          accessHandle.close();
        }
        await opfsRoot.removeEntry('catalog.sqlite.tmp').catch(() => {});
      }

      self.postMessage({ type: 'COMPLETE' });
    } catch (err: any) {
      try {
        const opfsRoot = await navigator.storage.getDirectory();
        await opfsRoot.removeEntry('catalog.sqlite.tmp').catch(() => {});
      } catch {}
      self.postMessage({ type: 'ERROR', payload: err.message || 'Download failed' });
    }
  }
};

