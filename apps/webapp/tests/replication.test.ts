/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { createRxDatabase, addRxPlugin } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { syncDatabaseWithRemote } from '../src/db/replication.js';
import type { CloudSyncProvider, SyncDeltaPayload } from '@quomida/cloud-providers';

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
      },
      base_ingredients: {
        schema: {
          version: 0,
          primaryKey: 'id',
          type: 'object',
          properties: {
            id: { type: 'string', maxLength: 100 },
            name: { type: 'string' },
            source: { type: 'string' },
            updatedAt: { type: 'number', minimum: 0 }
          },
          required: ['id', 'name']
        }
      },
      system_metadata: {
        schema: {
          version: 0,
          primaryKey: 'key',
          type: 'object',
          properties: {
            key: { type: 'string', maxLength: 100 },
            value: { type: 'string' },
            updatedAt: { type: 'number', minimum: 0 }
          },
          required: ['key', 'value']
        }
      },
      user_settings: {
        schema: {
          version: 0,
          primaryKey: 'id',
          type: 'object',
          properties: {
            id: { type: 'string', maxLength: 100 },
            locale: { type: 'string' },
            theme: { type: 'string' },
            daily_calorie_target: { type: 'number' },
            target_mode: { type: 'string' },
            active_cloud_provider: { type: 'object', additionalProperties: true },
            updatedAt: { type: 'number', minimum: 0 }
          },
          required: ['id']
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

  it('should push local updates to the CloudSyncProvider if not found in remote payload', async () => {
    const db = await createTestDb();
    const mockCloudSyncProvider = createMockAdapter();
    mockCloudSyncProvider.pull = vi.fn().mockResolvedValue([
      { collection: 'daily_logs', documents: [] }
    ]);

    await db.daily_logs.insert({ id: 'log_1', name: 'Apple', updatedAt: 100 });
    
    await syncDatabaseWithRemote(db as any, mockCloudSyncProvider);

    expect(mockCloudSyncProvider.push).toHaveBeenCalled();
    const pushCall = (mockCloudSyncProvider.push as any).mock.calls[0][0] as SyncDeltaPayload;
    expect(pushCall.collection).toBe('daily_logs');
    expect(pushCall.documents[0].id).toBe('log_1');

    await db.remove();
  });

  it('should pull remote updates and resolve conflicts (LWW)', async () => {
    const db = await createTestDb();
    const mockCloudSyncProvider = createMockAdapter();
    mockCloudSyncProvider.pull = vi.fn().mockResolvedValue([
      {
        collection: 'daily_logs',
        documents: [{ id: 'log_2', name: 'Banana Remote', updatedAt: 200, _deleted: false }]
      }
    ]);

    await db.daily_logs.insert({ id: 'log_2', name: 'Banana Local', updatedAt: 100 });

    await syncDatabaseWithRemote(db as any, mockCloudSyncProvider);

    const doc = await db.daily_logs.findOne('log_2').exec();
    expect(doc.name).toBe('Banana Remote');
    
    await db.remove();
  });

  it('should keep local document if local updatedAt is newer than remote', async () => {
    const db = await createTestDb();
    const mockCloudSyncProvider = createMockAdapter();
    mockCloudSyncProvider.pull = vi.fn().mockResolvedValue([
      {
        collection: 'daily_logs',
        documents: [{ id: 'log_3', name: 'Stale Remote', updatedAt: 50, _deleted: false }]
      }
    ]);

    await db.daily_logs.insert({ id: 'log_3', name: 'Fresh Local', updatedAt: 150 });

    await syncDatabaseWithRemote(db as any, mockCloudSyncProvider);

    const doc = await db.daily_logs.findOne('log_3').exec();
    expect(doc.name).toBe('Fresh Local');
    
    expect(mockCloudSyncProvider.push).toHaveBeenCalled();
    const pushCall = (mockCloudSyncProvider.push as any).mock.calls[0][0] as SyncDeltaPayload;
    expect(pushCall.documents[0].id).toBe('log_3');

    await db.remove();
  });

  it('should handle remote _deleted soft deletes', async () => {
    const db = await createTestDb();
    const mockCloudSyncProvider = createMockAdapter();
    mockCloudSyncProvider.pull = vi.fn().mockResolvedValue([
      {
        collection: 'daily_logs',
        documents: [{ id: 'log_4', name: 'To be deleted', updatedAt: 300, _deleted: true }]
      }
    ]);

    await db.daily_logs.insert({ id: 'log_4', name: 'To be deleted', updatedAt: 100 });

    await syncDatabaseWithRemote(db as any, mockCloudSyncProvider);

    const doc = await db.daily_logs.findOne('log_4').exec();
    expect(doc).toBeNull();

    await db.remove();
  });

  it('should strictly skip non-syncable collections like system_metadata', async () => {
    const db = await createTestDb();
    const mockCloudSyncProvider = createMockAdapter();
    mockCloudSyncProvider.pull = vi.fn().mockResolvedValue([]);

    await db.system_metadata.insert({ key: 'catalog_version', value: '1.0.0', updatedAt: 100 });

    await syncDatabaseWithRemote(db as any, mockCloudSyncProvider);

    // Verify push was NEVER called with system_metadata
    const pushCalls = (mockCloudSyncProvider.push as any).mock.calls;
    const systemMetadataPush = pushCalls.find((c: any[]) => c[0].collection === 'system_metadata');
    expect(systemMetadataPush).toBeUndefined();

    await db.remove();
  });

  it('should only push custom ingredients and ignore bundled system ingredients', async () => {
    const db = await createTestDb();
    const mockCloudSyncProvider = createMockAdapter();
    mockCloudSyncProvider.pull = vi.fn().mockResolvedValue([
      { collection: 'base_ingredients', documents: [] }
    ]);

    // Insert 1 system ingredient and 1 custom ingredient
    await db.base_ingredients.insert({ id: 'sys_1', name: 'System Milk', source: 'system', updatedAt: 100 });
    await db.base_ingredients.insert({ id: 'cust_1', name: 'My Homemade Jam', source: 'custom', updatedAt: 200 });

    await syncDatabaseWithRemote(db as any, mockCloudSyncProvider);

    const pushCalls = (mockCloudSyncProvider.push as any).mock.calls;
    const ingPush = pushCalls.find((c: any[]) => c[0].collection === 'base_ingredients');
    expect(ingPush).toBeDefined();
    expect(ingPush[0].documents.length).toBe(1);
    expect(ingPush[0].documents[0].id).toBe('cust_1');
    expect(ingPush[0].documents.some((d: any) => d.id === 'sys_1')).toBe(false);

    await db.remove();
  });

  it('preserves local active_cloud_provider when pulling newer remote user_settings and does not push untouched factory defaults (updatedAt: 0)', async () => {
    const db = await createTestDb();
    const mockCloudSyncProvider = createMockAdapter();

    // Device B has untouched factory defaults (updatedAt: 0) + local OAuth credentials
    await db.user_settings.insert({
      id: 'global_settings',
      locale: 'es-AR',
      theme: 'dark',
      daily_calorie_target: 2000,
      target_mode: 'manual',
      active_cloud_provider: {
        id: 'google-drive',
        credentials: { accessToken: 'device-b-token' }
      },
      updatedAt: 0
    });

    // Remote has Device A's configured settings (updatedAt: 5000) without credentials (or with stale Device A credentials)
    mockCloudSyncProvider.pull = vi.fn().mockResolvedValue([
      {
        collection: 'user_settings',
        documents: [
          {
            id: 'global_settings',
            locale: 'en-US',
            theme: 'light',
            daily_calorie_target: 2750,
            target_mode: 'manual',
            active_cloud_provider: {
              id: 'google-drive',
              credentials: { accessToken: 'leaked-device-a-token' }
            },
            updatedAt: 5000
          }
        ]
      }
    ]);

    await syncDatabaseWithRemote(db as any, mockCloudSyncProvider);

    const localSettings = (await db.user_settings.findOne('global_settings').exec()).toJSON();
    expect(localSettings.daily_calorie_target).toBe(2750);
    expect(localSettings.locale).toBe('en-US');
    expect(localSettings.theme).toBe('light');
    // Device B's local token MUST be preserved!
    expect(localSettings.active_cloud_provider).toEqual({
      id: 'google-drive',
      credentials: { accessToken: 'device-b-token' }
    });

    // Furthermore, since manual mode did not recalibrate anything in Step B, push should NOT have been called for user_settings
    const pushCalls = (mockCloudSyncProvider.push as any).mock.calls;
    const settingsPush = pushCalls.find((c: any[]) => c[0].collection === 'user_settings');
    expect(settingsPush).toBeUndefined();

    await db.remove();
  });

  it('strips active_cloud_provider when pushing newer local user_settings to remote', async () => {
    const db = await createTestDb();
    const mockCloudSyncProvider = createMockAdapter();
    mockCloudSyncProvider.pull = vi.fn().mockResolvedValue([
      { collection: 'user_settings', documents: [] }
    ]);

    await db.user_settings.insert({
      id: 'global_settings',
      locale: 'en-US',
      theme: 'dark',
      daily_calorie_target: 2400,
      target_mode: 'manual',
      active_cloud_provider: {
        id: 'google-drive',
        credentials: { accessToken: 'secret-local-token' }
      },
      updatedAt: 3000
    });

    await syncDatabaseWithRemote(db as any, mockCloudSyncProvider);

    const pushCalls = (mockCloudSyncProvider.push as any).mock.calls;
    const settingsPush = pushCalls.find((c: any[]) => c[0].collection === 'user_settings');
    expect(settingsPush).toBeDefined();
    expect(settingsPush[0].documents[0].daily_calorie_target).toBe(2400);
    expect(settingsPush[0].documents[0].active_cloud_provider).toBeUndefined();

    await db.remove();
  });
});

