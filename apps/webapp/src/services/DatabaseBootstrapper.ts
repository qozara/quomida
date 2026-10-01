export class DatabaseBootstrapper {
  static async ensureSystemCatalogOPFS(): Promise<void> {
    try {
      if (typeof navigator === 'undefined' || !navigator.storage) {
        console.warn('[DatabaseBootstrapper] navigator.storage is not available. Skipping OPFS bootstrap.');
        return;
      }
      const opfsRoot = await navigator.storage.getDirectory();
      
      // Check if catalog.sqlite already exists in OPFS
      try {
        await opfsRoot.getFileHandle('catalog.sqlite');
        // File exists, bootstrapper is done.
        // It could be the small system catalog or the massive external one.
        console.log('[DatabaseBootstrapper] catalog.sqlite already exists in OPFS. Skipping bootstrap.');
        return;
      } catch (err: any) {
        if (err.name !== 'NotFoundError') {
          throw err;
        }
        // File doesn't exist, we must fetch system.sqlite
      }

      console.log('[DatabaseBootstrapper] OPFS is empty. Bootstrapping with built-in system.sqlite...');
      const res = await fetch('/system.sqlite');
      if (!res.ok) {
        throw new Error(`Failed to fetch /system.sqlite: ${res.status}`);
      }

      const fileHandle = await opfsRoot.getFileHandle('catalog.sqlite', { create: true });
      const writable = await fileHandle.createWritable();
      
      if (res.body) {
        await res.body.pipeTo(writable);
      } else {
        const buffer = await res.arrayBuffer();
        await writable.write(buffer);
        await writable.close();
      }

      console.log('[DatabaseBootstrapper] Successfully bootstrapped system.sqlite into OPFS as catalog.sqlite.');
    } catch (err) {
      console.error('[DatabaseBootstrapper] Error during bootstrap:', err);
    }
  }
}
