export class DatabaseBootstrapper {
  static async ensureSystemCatalogOPFS(): Promise<void> {
    try {
      if (typeof navigator === 'undefined' || !navigator.storage) {
        return;
      }
      const opfsRoot = await navigator.storage.getDirectory();
      
      // Check if catalog.sqlite already exists in OPFS
      try {
        const existingHandle = await opfsRoot.getFileHandle('catalog.sqlite');
        const existingFile = typeof existingHandle.getFile === 'function'
          ? await existingHandle.getFile()
          : { size: 100 };
        if (existingFile.size >= 100) {
          // File already exists with valid size in OPFS, nothing to do
          return;
        }
      } catch (err: any) {
        if (err.name !== 'NotFoundError') {
          throw err;
        }
      }

      // First run only: fetch built-in static /system.sqlite
      const res = await fetch('/system.sqlite');
      if (!res.ok) {
        return;
      }

      // Stage in catalog.sqlite.tmp to avoid corrupting target on network or power drop
      const tmpHandle = await opfsRoot.getFileHandle('catalog.sqlite.tmp', { create: true });
      if (typeof tmpHandle.createWritable === 'function') {
        const writable = await tmpHandle.createWritable();
        if (res.body) {
          await res.body.pipeTo(writable);
        } else {
          const buffer = await res.arrayBuffer();
          await writable.write(buffer);
          await writable.close();
        }
      } else if (typeof (tmpHandle as any).createSyncAccessHandle === 'function') {
        const accessHandle = await (tmpHandle as any).createSyncAccessHandle();
        const buffer = await res.arrayBuffer();
        accessHandle.write(new Uint8Array(buffer));
        accessHandle.flush();
        accessHandle.close();
      }

      // Atomic swap / promotion from tmp to target
      if (typeof (tmpHandle as any).move === 'function') {
        try {
          await opfsRoot.removeEntry('catalog.sqlite');
        } catch (err: any) {
          if (err.name !== 'NotFoundError') throw err;
        }
        await (tmpHandle as any).move('catalog.sqlite');
      } else {
        const targetHandle = await opfsRoot.getFileHandle('catalog.sqlite', { create: true });
        const tmpFile = typeof tmpHandle.getFile === 'function'
          ? await tmpHandle.getFile()
          : null;
        if (tmpFile && typeof targetHandle.createWritable === 'function') {
          const writable = await targetHandle.createWritable();
          if (typeof tmpFile.stream === 'function') {
            await tmpFile.stream().pipeTo(writable);
          } else {
            const buf = await tmpFile.arrayBuffer();
            await writable.write(buf);
            await writable.close();
          }
        }
        if (typeof opfsRoot.removeEntry === 'function') {
          await opfsRoot.removeEntry('catalog.sqlite.tmp').catch(() => {});
        }
      }
    } catch (err) {
      try {
        if (typeof navigator !== 'undefined' && navigator.storage) {
          const opfsRoot = await navigator.storage.getDirectory();
          if (typeof opfsRoot.removeEntry === 'function') {
            await opfsRoot.removeEntry('catalog.sqlite.tmp').catch(() => {});
          }
        }
      } catch {}
      console.warn('[DatabaseBootstrapper] OPFS seed notice:', err);
    }
  }
}

