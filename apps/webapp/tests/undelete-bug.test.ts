/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { createRxDatabase, addRxPlugin, prepareQuery } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { syncDatabaseWithRemote } from '../src/db/replication.js';
import type { CloudSyncProvider, SyncDeltaPayload } from '@quomida/cloud-providers';

addRxPlugin(RxDBMigrationSchemaPlugin);

describe('Undelete Bug Test', () => {

  const createTestDb = async () => {
    const db = await createRxDatabase({
      name: 'testdb_undelete_' + Math.random().toString(36).substring(7),
      storage: getRxStorageMemory()
    });

    await db.addCollections({
      daily_logs: {
        schema: {
          version: 0,
          primaryKey: 'id',
          type: 'object',
          properties: {
            id: { type: 'string', maxLength: 100 },
            name: { type: 'string' },
            updatedAt: { type: 'number', minimum: 0 }
          },
          required: ['id', 'name']
        }
      }
    });
    return db;
  };

  const createMockAdapter = (): CloudSyncProvider => ({
    id: 'mock',
    name: 'Mock',
    isInitialized: () => true,
    getStatus: () => 'idle',
    getLastSyncedTime: () => null,
    initialize: vi.fn(),
    pull: vi.fn().mockResolvedValue([]),
    push: vi.fn().mockResolvedValue(undefined)
  });

  it('should not undelete a locally deleted document if remote is stale', async () => {
    const db = await createTestDb();
    const mockCloudSyncProvider = createMockAdapter();

    // Setup: document exists remotely
    mockCloudSyncProvider.pull = vi.fn().mockResolvedValue([
      {
        collection: 'daily_logs',
        documents: [{ id: 'log_bug', name: 'To be deleted locally', updatedAt: 100, _deleted: false }]
      }
    ]);

    // Insert locally (like it was already pulled before)
    const doc = await db.daily_logs.insert({ id: 'log_bug', name: 'To be deleted locally', updatedAt: 100 });
    
    // Now user deletes it
    const patchedDoc = await doc.patch({ updatedAt: 200 }); // Simulate bumping updatedAt before remove
    await patchedDoc.remove();

    // Now a sync happens (before push completes, pull fetches the stale remote doc)
    await syncDatabaseWithRemote(db as any, mockCloudSyncProvider);

    // Let's query storage directly to see the tombstone
    const q = prepareQuery(db.daily_logs.schema.jsonSchema, { selector: { _deleted: true }, skip: 0, limit: 10, sort: [{ id: 'asc' }] });
    const ts = await db.daily_logs.storageInstance.query(q);
    console.log('Tombstone:', ts.documents[0]);

    // Verify it is still deleted locally
    const checkDoc = await db.daily_logs.findOne('log_bug').exec();
    expect(checkDoc).toBeNull();
    
    // Verify it pushed the tombstone back
    expect(mockCloudSyncProvider.push).toHaveBeenCalled();
    const pushCall = (mockCloudSyncProvider.push as any).mock.calls[0][0] as SyncDeltaPayload;
    expect(pushCall.documents[0].id).toBe('log_bug');
    expect(pushCall.documents[0]._deleted).toBe(true);

    await db.remove();
  });
});
