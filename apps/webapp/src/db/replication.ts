import { type QuomidaDatabase, prepareQuery, runAdaptiveCalibrationOnDatabase } from './rxdb.js';
import type { CloudSyncProvider } from '@quomida/cloud-providers';
import { recalculateEWMAWeightTrend, type WeightLog } from '@quomida/domain-core';

export const SYNCABLE_COLLECTIONS = new Set([
  'daily_logs',
  'base_ingredients',
  'recipes',
  'portions',
  'user_settings',
  'weight_logs'
]);

export async function syncDatabaseWithRemote(db: QuomidaDatabase, adapter: CloudSyncProvider) {
  if (!adapter.isInitialized()) return;

  try {
    const payloads = await adapter.pull();
    const payloadMap = new Map(payloads.map(p => [p.collection, p]));
    const collectionsWithRemoteChanges = new Set<string>();

    for (const [collectionName, collection] of Object.entries(db.collections)) {
      if (!SYNCABLE_COLLECTIONS.has(collectionName)) {
        continue;
      }

      const isCustomOnlyCollection = collectionName === 'base_ingredients' || collectionName === 'portions';
      const payload = payloadMap.get(collectionName) || { collection: collectionName, documents: [] };

      // 1. Fetch active local documents
      const localDocs = isCustomOnlyCollection
        ? await collection.find({ selector: { source: 'custom' } }).exec()
        : await collection.find().exec();
      const localDocsMap = new Map(localDocs.map((d: any) => [d.id, d.toJSON()]));

      // 1b. Fetch local tombstones (soft deleted)
      try {
        const selector: any = { _deleted: true };
        if (isCustomOnlyCollection) {
          selector.source = 'custom';
        }
        const q = prepareQuery(
          collection.schema.jsonSchema,
          {
            selector,
            skip: 0,
            limit: 100000,
            sort: [{ id: 'asc' }]
          }
        );
        const tombstoneResult = await collection.storageInstance.query(q);
        for (const t of tombstoneResult.documents) {
          if (!isCustomOnlyCollection || t.source === 'custom') {
            localDocsMap.set(t.id, t);
          }
        }
      } catch (err) {
        console.warn(`[SyncEngine] Failed to fetch tombstones for ${collectionName}:`, err);
      }

      const upserts: any[] = [];
      const pushBacks: any[] = [];

      // 1c. Deduplicate remote payload by ID, keeping the newest (highest updatedAt)
      const deduplicatedRemoteDocs = new Map<string, any>();
      for (const doc of payload.documents) {
        const existing = deduplicatedRemoteDocs.get(doc.id);
        if (!existing || (doc.updatedAt || 0) > (existing.updatedAt || 0)) {
          deduplicatedRemoteDocs.set(doc.id, doc);
        }
      }

      // 2. Iterate remote documents
      for (const remoteDoc of deduplicatedRemoteDocs.values()) {
        if (isCustomOnlyCollection && remoteDoc.source && remoteDoc.source !== 'custom') {
          continue;
        }

        const localDoc = localDocsMap.get(remoteDoc.id);

        if (localDoc) {
          // Both exist, compare LWW
          const localTime = (localDoc as any).updatedAt || 0;
          const remoteTime = remoteDoc.updatedAt || 0;

          if (remoteTime > localTime) {
            // Remote is newer, local needs update
            if (remoteDoc._deleted) {
              await collection.findOne(remoteDoc.id).remove().catch(() => {});
              collectionsWithRemoteChanges.add(collectionName);
            } else {
              const cleanRemote = { ...remoteDoc };
              delete cleanRemote._deleted;
              upserts.push(cleanRemote);
              collectionsWithRemoteChanges.add(collectionName);
            }
          } else if (localTime > remoteTime) {
            // Local is newer, remote needs update
            pushBacks.push(localDoc);
          } else {
            // Identical time, if one is deleted, prefer deleted
            if (remoteDoc._deleted !== (localDoc as any)._deleted) {
              if (remoteDoc._deleted) {
                // Remote is deleted, local is active -> delete local
                await collection.findOne(remoteDoc.id).remove().catch(() => {});
                collectionsWithRemoteChanges.add(collectionName);
              } else {
                // Local is deleted, remote is active -> push local tombstone to remote
                pushBacks.push(localDoc);
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
            collectionsWithRemoteChanges.add(collectionName);
          }
        }
        
        // Remove from local map to track what's missing in remote
        localDocsMap.delete(remoteDoc.id);
      }

      // 3. Local documents that do not exist AT ALL in the remote payload
      // These were created locally and never pushed successfully.
      for (const localDoc of localDocsMap.values()) {
        const docObj = localDoc as any;
        if (isCustomOnlyCollection && docObj.source && docObj.source !== 'custom') {
          continue;
        }
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

    // Step A: EWMA Trend Healing after weight_logs Sync
    if (db.collections.weight_logs) {
      const weightDocs = await db.collections.weight_logs.find().exec();
      const allWeightLogs: WeightLog[] = weightDocs
        .map((d: any) => (d.toJSON ? d.toJSON() : d) as WeightLog)
        .sort((a: WeightLog, b: WeightLog) => {
          const cmp = a.date.localeCompare(b.date);
          if (cmp !== 0) return cmp;
          return (a.timestamp || '').localeCompare(b.timestamp || '');
        });

      if (allWeightLogs.length > 0) {
        const recalculated = recalculateEWMAWeightTrend(allWeightLogs);
        const healedLogs: WeightLog[] = [];
        const now = Date.now();

        for (let i = 0; i < allWeightLogs.length; i++) {
          const orig = allWeightLogs[i];
          const rec = recalculated[i];
          const origTrend = orig.trend_weight_kg;
          const recTrend = rec.trend_weight_kg;
          const needsHealing =
            origTrend === undefined ||
            origTrend === null ||
            (origTrend === 0 && orig.weight_kg > 0) ||
            Math.abs(origTrend - recTrend) > 1e-4;

          if (needsHealing) {
            healedLogs.push({
              ...orig,
              trend_weight_kg: recTrend,
              updatedAt: now
            });
          }
        }

        if (healedLogs.length > 0) {
          await db.collections.weight_logs.bulkUpsert(healedLogs);
          await adapter.push({
            collection: 'weight_logs',
            documents: healedLogs
          });
          collectionsWithRemoteChanges.add('weight_logs');
        }
      }
    }

    // Step B: Adaptive Target Recalculation after Sync
    const shouldRecalibrate =
      collectionsWithRemoteChanges.has('weight_logs') ||
      collectionsWithRemoteChanges.has('daily_logs') ||
      collectionsWithRemoteChanges.has('user_settings');

    if (shouldRecalibrate && db.collections.user_settings) {
      const updatedSettings = await runAdaptiveCalibrationOnDatabase(db, undefined, true);
      if (updatedSettings) {
        await adapter.push({
          collection: 'user_settings',
          documents: [updatedSettings]
        });
      }
    }
  } catch (error) {
    console.error('[SyncEngine] Failed to sync database with remote:', error);
    throw error;
  }
}
