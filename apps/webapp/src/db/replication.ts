import { type QuomidaDatabase, prepareQuery } from './rxdb.js';
import type { SyncAdapter } from '@quomida/sync-adapters';

export async function syncDatabaseWithRemote(db: QuomidaDatabase, adapter: SyncAdapter) {
  if (!adapter.isInitialized()) return;

  try {
    const payloads = await adapter.pull();
    const payloadMap = new Map(payloads.map(p => [p.collection, p]));

    for (const [collectionName, collection] of Object.entries(db.collections)) {
      const payload = payloadMap.get(collectionName) || { collection: collectionName, documents: [] };

      // 1. Fetch all active local documents
      const localDocs = await collection.find().exec();
      const localDocsMap = new Map(localDocs.map((d: any) => [d.id, d.toJSON()]));

      // 1b. Fetch local tombstones (soft deleted)
      try {
        const q = prepareQuery(
          collection.schema.jsonSchema,
          {
            selector: { _deleted: true },
            skip: 0,
            limit: 100000,
            sort: [{ id: 'asc' }]
          }
        );
        const tombstoneResult = await collection.storageInstance.query(q);
        for (const t of tombstoneResult.documents) {
          localDocsMap.set(t.id, t);
        }
      } catch (err) {
        console.warn(`[SyncEngine] Failed to fetch tombstones for ${collectionName}:`, err);
      }

      const upserts: any[] = [];
      const pushBacks: any[] = [];

      // 2. Iterate remote documents
      for (const remoteDoc of payload.documents) {
        const localDoc = localDocsMap.get(remoteDoc.id);

        if (localDoc) {
          // Both exist, compare LWW
          const localTime = (localDoc as any).updatedAt || 0;
          const remoteTime = remoteDoc.updatedAt || 0;

          if (remoteTime > localTime) {
            // Remote is newer, local needs update
            if (remoteDoc._deleted) {
              await collection.findOne(remoteDoc.id).remove().catch(() => {});
            } else {
              const cleanRemote = { ...remoteDoc };
              delete cleanRemote._deleted;
              upserts.push(cleanRemote);
            }
          } else if (localTime > remoteTime) {
            // Local is newer, remote needs update
            pushBacks.push(localDoc);
          } else {
            // Identical time, if one is deleted, prefer deleted
            if (remoteDoc._deleted !== (localDoc as any)._deleted) {
              if ((localDoc as any)._deleted) pushBacks.push(localDoc);
              else {
                const cleanRemote = { ...remoteDoc };
                delete cleanRemote._deleted;
                upserts.push(cleanRemote);
              }
            }
          }
        } else {
          // Exists remotely but not locally (active)
          if (remoteDoc._deleted) {
            // It's a remote tombstone, and we don't have it locally. Do nothing.
          } else {
            // It's a new active remote document
            const cleanRemote = { ...remoteDoc };
            delete cleanRemote._deleted;
            upserts.push(cleanRemote);
          }
        }
        
        // Remove from local map to track what's missing in remote
        localDocsMap.delete(remoteDoc.id);
      }

      // 3. Local documents that do not exist AT ALL in the remote payload
      // These were created locally and never pushed successfully.
      for (const localDoc of localDocsMap.values()) {
        pushBacks.push(localDoc);
      }

      // 4. Apply changes
      if (upserts.length > 0) {
        await collection.bulkUpsert(upserts);
      }

      if (pushBacks.length > 0) {
        await adapter.push({
          collection: collectionName,
          documents: pushBacks
        });
      }
    }
  } catch (error) {
    console.error('[SyncEngine] Failed to sync database with remote:', error);
  }
}
