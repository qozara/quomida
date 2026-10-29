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

      const buffer = await res.arrayBuffer();
      if (buffer.byteLength === 0) {
        console.warn('[DatabaseBootstrapper] /system.sqlite is empty (0 bytes). Aborting OPFS seed.');
        return;
      }

      // Stage in catalog.sqlite.tmp to avoid corrupting target on network or power drop
      const tmpHandle = await opfsRoot.getFileHandle('catalog.sqlite.tmp', { create: true });
      if (typeof tmpHandle.createWritable === 'function') {
        const writable = await tmpHandle.createWritable();
        await writable.write(buffer);
        await writable.close();
      } else if (typeof (tmpHandle as any).createSyncAccessHandle === 'function') {
        const accessHandle = await (tmpHandle as any).createSyncAccessHandle();
        accessHandle.write(new Uint8Array(buffer), { at: 0 });
        accessHandle.flush();
        accessHandle.close();
      }

      // Atomic swap / promotion from tmp to target
      let moved = false;
      if (typeof (tmpHandle as any).move === 'function') {
        try {
          try {
            await opfsRoot.removeEntry('catalog.sqlite');
          } catch (err: any) {
            if (err.name !== 'NotFoundError') throw err;
          }
          try {
            // WebKit/Safari requires destination directory handle as 1st argument: move(directory, newName)
            await (tmpHandle as any).move(opfsRoot, 'catalog.sqlite');
            moved = true;
          } catch {
            // Chromium single-argument fallback
            await (tmpHandle as any).move('catalog.sqlite');
            moved = true;
          }
        } catch (moveErr) {
          console.warn('[DatabaseBootstrapper] tmpHandle.move failed, falling back to copy:', moveErr);
          moved = false;
        }
      }

      if (!moved) {
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
        } else if (tmpFile && typeof (targetHandle as any).createSyncAccessHandle === 'function') {
          const accessHandle = await (targetHandle as any).createSyncAccessHandle();
          const buf = await tmpFile.arrayBuffer();
          accessHandle.write(new Uint8Array(buf), { at: 0 });
          accessHandle.flush();
          accessHandle.close();
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

  static async removeDownloadedCatalogAndReseed(): Promise<void> {
    try {
      console.log('[DatabaseBootstrapper] Removing downloaded catalog.sqlite from OPFS...');
      if (typeof navigator === 'undefined' || !navigator.storage) {
        return;
      }
      const opfsRoot = await navigator.storage.getDirectory();
      if (typeof opfsRoot.removeEntry === 'function') {
        try {
          await opfsRoot.removeEntry('catalog.sqlite');
          console.log('[DatabaseBootstrapper] catalog.sqlite successfully removed from OPFS.');
        } catch (err: any) {
          if (err.name !== 'NotFoundError') {
            console.warn('[DatabaseBootstrapper] Error removing catalog.sqlite:', err);
          }
        }
        try {
          await opfsRoot.removeEntry('catalog.sqlite.tmp');
        } catch {}
      }
      // Re-seed OPFS with the built-in system.sqlite
      console.log('[DatabaseBootstrapper] Reseeding OPFS with built-in system.sqlite...');
      await DatabaseBootstrapper.ensureSystemCatalogOPFS();
      console.log('[DatabaseBootstrapper] OPFS reseeded with system.sqlite successfully.');
    } catch (err) {
      console.warn('[DatabaseBootstrapper] Error removing downloaded catalog and reseeding:', err);
      throw err;
    }
  }
}

