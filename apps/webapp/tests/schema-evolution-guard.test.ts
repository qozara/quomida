import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRxDatabase, addRxPlugin } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { clearLocalDatabase, destroyDatabase, getDatabase } from '../src/db/rxdb.js';

addRxPlugin(RxDBMigrationSchemaPlugin);

describe('Schema Evolution & Migration Integrity Guard (APP-DB6-GUARD)', () => {
  beforeEach(async () => {
    await destroyDatabase();
  });

  afterEach(async () => {
    await destroyDatabase();
  });

  it('guarantees that modifying schema properties without bumping version throws RxDB DB6', async () => {
    const testDbName = `db6_guard_${Date.now()}`;
    const storage = getRxStorageMemory();

    // 1. Initialize client database with original version 0 schema
    const initialDb = await createRxDatabase({
      name: testDbName,
      storage
    });

    const v0OriginalSchema = {
      title: 'daily_logs',
      version: 0,
      primaryKey: 'id',
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 100 },
        timestamp: { type: 'string' }
      },
      required: ['id', 'timestamp']
    };

    await initialDb.addCollections({
      daily_logs: { schema: v0OriginalSchema as any }
    });

    await initialDb.daily_logs.insert({
      id: 'log_1',
      timestamp: '2026-09-17T12:00:00.000Z'
    });

    await initialDb.close();

    // 2. Simulate a developer adding a new property ('food_name') while leaving version at 0
    const modifiedV0Schema = {
      title: 'daily_logs',
      version: 0, // Not bumped!
      primaryKey: 'id',
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 100 },
        timestamp: { type: 'string' },
        food_name: { type: 'string' } // Newly added field
      },
      required: ['id', 'timestamp']
    };

    const reopeningDb = await createRxDatabase({
      name: testDbName,
      storage
    });

    // 3. RxDB must detect the schema hash mismatch on version 0 and reject with DB6
    let thrownError: any = null;
    try {
      await reopeningDb.addCollections({
        daily_logs: { schema: modifiedV0Schema as any }
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).not.toBeNull();
    // RxDB error code for schema hash mismatch on same version
    expect(thrownError.code || thrownError.message).toMatch(/DB6/);
    await reopeningDb.close();
  });

  it('guarantees that bumping version requires a migration strategy', async () => {
    const testDbName = `migration_strategy_guard_${Date.now()}`;
    const storage = getRxStorageMemory();

    const initialDb = await createRxDatabase({
      name: testDbName,
      storage
    });

    const v0Schema = {
      title: 'test_items',
      version: 0,
      primaryKey: 'id',
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 50 },
        val: { type: 'string' }
      },
      required: ['id', 'val']
    };

    await initialDb.addCollections({
      test_items: { schema: v0Schema as any }
    });

    await initialDb.test_items.insert({ id: 'item_1', val: 'alpha' });
    await initialDb.close();

    // Re-opening with version 1 but omitting migrationStrategies
    const v1SchemaWithoutMigration = {
      title: 'test_items',
      version: 1, // Bumped to 1
      primaryKey: 'id',
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 50 },
        val: { type: 'string' },
        newField: { type: 'string' }
      },
      required: ['id', 'val']
    };

    const reopeningDb = await createRxDatabase({
      name: testDbName,
      storage
    });

    let thrownError: any = null;
    try {
      await reopeningDb.addCollections({
        test_items: { schema: v1SchemaWithoutMigration as any }
      });
    } catch (err) {
      thrownError = err;
    }

    // RxDB requires migrationStrategies when version > 0
    expect(thrownError).not.toBeNull();
    await reopeningDb.close();
  });

  it('recovers from DB6 conflict by using clearLocalDatabase to start fresh at version 0', async () => {
    const testDbName = `recovery_test_db_${Date.now()}`;
    const storage = getRxStorageMemory();

    // 1. Create conflicting legacy state (old schema v0)
    const initialDb = await createRxDatabase({
      name: testDbName,
      storage
    });

    await initialDb.addCollections({
      daily_logs: {
        schema: {
          title: 'daily_logs',
          version: 0,
          primaryKey: 'id',
          type: 'object',
          properties: {
            id: { type: 'string', maxLength: 100 },
            legacy_only_field: { type: 'number' }
          },
          required: ['id']
        } as any
      }
    });

    await initialDb.close();

    // 2. Attempting to getDatabase on this conflicting DB fails with DB6
    let errorOnNormalInit: any = null;
    try {
      await getDatabase({ name: testDbName, storage });
    } catch (err) {
      errorOnNormalInit = err;
    }
    expect(errorOnNormalInit).not.toBeNull();
    expect(errorOnNormalInit.type).toBe('SCHEMA_MISMATCH');

    // 3. Calling clearLocalDatabase() successfully empties and recreates database at version 0
    const freshDb = await clearLocalDatabase({ name: testDbName, storage });
    expect(freshDb).toBeDefined();
    expect(freshDb.daily_logs).toBeDefined();
    expect(freshDb.base_ingredients).toBeDefined();

    // Verify DB starts empty
    const foods = await freshDb.base_ingredients.find().exec();
    expect(foods.length).toBe(0);
  });
});
