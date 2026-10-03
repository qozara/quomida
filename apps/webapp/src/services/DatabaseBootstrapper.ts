export class DatabaseBootstrapper {
  static async ensureSystemCatalogOPFS(): Promise<void> {
    try {
      if (typeof navigator === 'undefined' || !navigator.storage) {
        return;
      }
      const opfsRoot = await navigator.storage.getDirectory();
      
      // Check if catalog.sqlite already exists in OPFS
      try {
        await opfsRoot.getFileHandle('catalog.sqlite');
        // File already exists in OPFS, nothing to do
        return;
      } catch (err: any) {
        if (err.name !== 'NotFoundError') {
          throw err;
        }
      }

      // First run only: copy built-in static /system.sqlite into OPFS
      const res = await fetch('/system.sqlite');
      if (!res.ok) {
        return;
      }

      const fileHandle = await opfsRoot.getFileHandle('catalog.sqlite', { create: true });
      if (typeof fileHandle.createWritable === 'function') {
        const writable = await fileHandle.createWritable();
        if (res.body) {
          await res.body.pipeTo(writable);
        } else {
          const buffer = await res.arrayBuffer();
          await writable.write(buffer);
          await writable.close();
        }
      } else if (typeof (fileHandle as any).createSyncAccessHandle === 'function') {
        const accessHandle = await (fileHandle as any).createSyncAccessHandle();
        const buffer = await res.arrayBuffer();
        accessHandle.write(new Uint8Array(buffer));
        accessHandle.flush();
        accessHandle.close();
      }
    } catch (err) {
      console.warn('[DatabaseBootstrapper] OPFS seed notice:', err);
    }
  }
}
