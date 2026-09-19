/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { createRxDatabase, addRxPlugin } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { syncDatabaseWithRemote } from '../src/db/replication.js';
import type { SyncAdapter, SyncDeltaPayload } from '@quomida/sync-adapters';

addRxPlugin(RxDBMigrationSchemaPlugin);

describe('syncDatabaseWithRemote', () => {

  const createTestDb = async () => {
    const db = await createRxDatabase({
      name: 'testdb_repl_' + Math.random().toString(36).substring(7),
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

  const createMockAdapter = (): SyncAdapter => ({
    id: 'mock',
    name: 'Mock',
    isInitialized: () => true,
    getStatus: () => 'idle',
    getLastSyncedTime: () => null,
    initialize: vi.fn(),
    pull: vi.fn().mockResolvedValue([]),
    push: vi.fn().mockResolvedValue(undefined)
  });

  it('should push local updates to the SyncAdapter if not found in remote payload', async () => {
    const db = await createTestDb();
    const mockSyncAdapter = createMockAdapter();
    mockSyncAdapter.pull = vi.fn().mockResolvedValue([
      { collection: 'daily_logs', documents: [] }
    ]);

    await db.daily_logs.insert({ id: 'log_1', name: 'Apple', updatedAt: 100 });
    
    await syncDatabaseWithRemote(db as any, mockSyncAdapter);

    expect(mockSyncAdapter.push).toHaveBeenCalled();
    const pushCall = (mockSyncAdapter.push as any).mock.calls[0][0] as SyncDeltaPayload;
    expect(pushCall.collection).toBe('daily_logs');
    expect(pushCall.documents[0].id).toBe('log_1');

    await db.remove();
  });

  it('should pull remote updates and resolve conflicts (LWW)', async () => {
    const db = await createTestDb();
    const mockSyncAdapter = createMockAdapter();
    mockSyncAdapter.pull = vi.fn().mockResolvedValue([
      {
        collection: 'daily_logs',
        documents: [{ id: 'log_2', name: 'Banana Remote', updatedAt: 200, _deleted: false }]
      }
    ]);

    await db.daily_logs.insert({ id: 'log_2', name: 'Banana Local', updatedAt: 100 });

    await syncDatabaseWithRemote(db as any, mockSyncAdapter);

    const doc = await db.daily_logs.findOne('log_2').exec();
    expect(doc.name).toBe('Banana Remote');
    
    await db.remove();
  });

  it('should keep local document if local updatedAt is newer than remote', async () => {
    const db = await createTestDb();
    const mockSyncAdapter = createMockAdapter();
    mockSyncAdapter.pull = vi.fn().mockResolvedValue([
      {
        collection: 'daily_logs',
        documents: [{ id: 'log_3', name: 'Stale Remote', updatedAt: 50, _deleted: false }]
      }
    ]);

    await db.daily_logs.insert({ id: 'log_3', name: 'Fresh Local', updatedAt: 150 });

    await syncDatabaseWithRemote(db as any, mockSyncAdapter);

    const doc = await db.daily_logs.findOne('log_3').exec();
    expect(doc.name).toBe('Fresh Local');
    
    expect(mockSyncAdapter.push).toHaveBeenCalled();
    const pushCall = (mockSyncAdapter.push as any).mock.calls[0][0] as SyncDeltaPayload;
    expect(pushCall.documents[0].id).toBe('log_3');

    await db.remove();
  });

  it('should handle remote _deleted soft deletes', async () => {
    const db = await createTestDb();
    const mockSyncAdapter = createMockAdapter();
    mockSyncAdapter.pull = vi.fn().mockResolvedValue([
      {
        collection: 'daily_logs',
        documents: [{ id: 'log_4', name: 'To be deleted', updatedAt: 300, _deleted: true }]
      }
    ]);

    await db.daily_logs.insert({ id: 'log_4', name: 'To be deleted', updatedAt: 100 });

    await syncDatabaseWithRemote(db as any, mockSyncAdapter);

    const doc = await db.daily_logs.findOne('log_4').exec();
    expect(doc).toBeNull();

    await db.remove();
  });
});
