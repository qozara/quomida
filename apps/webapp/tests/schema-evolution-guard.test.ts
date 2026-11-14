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

  it('migrates legacy pre-Oct 19 v0 user_settings schema (without ai_settings or adaptive fields) to v1 without DB6 error', async () => {
    const testDbName = `legacy_user_settings_mig_${Date.now()}`;
    const storage = getRxStorageMemory();

    // 1. Initialize database with the exact production pre-Oct 19 v0 user_settings schema
    //    (hash: a37411d30ecd337d7508f0518fd1cfea5428b2894deee8082e3f79d7c93ad7ba)
    const legacyV0UserSettingsSchema = {
      title: 'user_settings',
      version: 0,
      description: 'Global application preferences and nutritional targets',
      primaryKey: 'id',
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 50 },
        locale: { type: 'string' },
        theme: { type: 'string', enum: ['light', 'dark', 'system'] },
        daily_calorie_target: { type: 'number', minimum: 500 },
        custom_macros: {
          type: 'object',
          properties: {
            protein: { type: 'number' },
            carbs: { type: 'number' },
            fats: { type: 'number' }
          },
          required: ['protein', 'carbs', 'fats']
        },
        active_cloud_provider: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            credentials: { type: 'object' }
          },
          required: ['id']
        },
        updatedAt: { type: 'number', minimum: 0 }
      },
      required: ['id', 'locale', 'theme', 'daily_calorie_target', 'custom_macros']
    };

    const initialDb = await createRxDatabase({
      name: testDbName,
      storage
    });

    await initialDb.addCollections({
      user_settings: { schema: legacyV0UserSettingsSchema as any }
    });

    await initialDb.user_settings.insert({
      id: 'global_settings',
      locale: 'es',
      theme: 'dark',
      daily_calorie_target: 2300,
      custom_macros: { protein: 170, carbs: 240, fats: 72 },
      active_cloud_provider: {
        id: 'google-drive-sheets',
        credentials: { accessToken: 'legacy-token', userEmail: 'user@example.com' }
      },
      updatedAt: 1760000000000
    });

    await initialDb.close();

    // 2. Reopen using getDatabase() — must migrate v0 -> v1 cleanly without throwing DB6
    const migratedDb = await getDatabase({ name: testDbName, storage });
    expect(migratedDb.user_settings).toBeDefined();

    const doc = await migratedDb.user_settings.findOne('global_settings').exec();
    expect(doc).not.toBeNull();
    const json = doc.toJSON();
    expect(json.locale).toBe('es');
    expect(json.theme).toBe('dark');
    expect(json.daily_calorie_target).toBe(2300);
    expect(json.custom_macros).toEqual({ protein: 170, carbs: 240, fats: 72 });
    expect(json.active_cloud_provider).toEqual({
      id: 'google-drive-sheets',
      credentials: { accessToken: 'legacy-token', userEmail: 'user@example.com' }
    });
    expect(json.target_mode).toBe('manual');
    expect(json.updatedAt).toBe(1760000000000);
  });

  it('migrates intermediate Oct 22 v0 user_settings schema (with ai_settings and adaptive fields) to v1 without DB6 error', async () => {
    const testDbName = `intermediate_user_settings_mig_${Date.now()}`;
    const storage = getRxStorageMemory();

    // Exact Oct 22 v0 schema (hash: e56e75cff19636921f230823bf4c663f41038d618f642e5330a53802e66070c4)
    const intermediateV0UserSettingsSchema = {
      title: 'user_settings',
      version: 0,
      description: 'Global application preferences and nutritional targets',
      primaryKey: 'id',
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 50 },
        locale: { type: 'string' },
        theme: { type: 'string', enum: ['light', 'dark', 'system'] },
        daily_calorie_target: { type: 'number', minimum: 500 },
        custom_macros: {
          type: 'object',
          properties: {
            protein: { type: 'number' },
            carbs: { type: 'number' },
            fats: { type: 'number' }
          },
          required: ['protein', 'carbs', 'fats']
        },
        active_cloud_provider: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            credentials: { type: 'object' }
          },
          required: ['id']
        },
        ai_settings: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            provider: { type: 'string', enum: ['qozara-intelligence', 'byok', 'ollama', 'window.ai'] },
            ciphertext: { type: 'string' },
            ollama_base_url: { type: 'string' },
            ollama_model: { type: 'string' }
          },
          required: ['provider']
        },
        target_mode: {
          type: 'string',
          enum: ['manual', 'deterministic_seed', 'adaptive']
        },
        biometrics: {
          type: 'object',
          properties: {
            sex: { type: 'string', enum: ['male', 'female'] },
            birth_date: { type: 'string', maxLength: 10 },
            height_cm: { type: 'number', minimum: 50, maximum: 260 },
            activity_multiplier: { type: 'number', minimum: 1.2, maximum: 1.9 }
          },
          required: ['sex', 'birth_date', 'height_cm', 'activity_multiplier']
        },
        goal_config: {
          type: 'object',
          properties: {
            goal_type: { type: 'string', enum: ['lose', 'maintain', 'gain'] },
            weekly_rate_pct: { type: 'number' },
            protein_g_per_kg: { type: 'number', minimum: 0 },
            fat_calorie_pct: { type: 'number', minimum: 0, maximum: 1 }
          },
          required: ['goal_type', 'weekly_rate_pct', 'protein_g_per_kg', 'fat_calorie_pct']
        },
        adaptive_state: {
          type: 'object',
          properties: {
            estimated_tdee: { type: 'number', minimum: 500 },
            prior_tdee: { type: 'number', minimum: 500 },
            last_calibrated_date: { type: 'string', maxLength: 10 },
            calibration_status: { type: 'string', enum: ['collecting_data', 'ready', 'insufficient_logs'] }
          },
          required: ['estimated_tdee']
        },
        updatedAt: { type: 'number', minimum: 0 }
      },
      required: ['id', 'locale', 'theme', 'daily_calorie_target', 'custom_macros']
    };

    const initialDb = await createRxDatabase({
      name: testDbName,
      storage
    });

    await initialDb.addCollections({
      user_settings: { schema: intermediateV0UserSettingsSchema as any }
    });

    await initialDb.user_settings.insert({
      id: 'global_settings',
      locale: 'en',
      theme: 'system',
      daily_calorie_target: 2450,
      custom_macros: { protein: 180, carbs: 260, fats: 75 },
      ai_settings: {
        enabled: true,
        provider: 'qozara-intelligence'
      },
      target_mode: 'adaptive',
      biometrics: {
        sex: 'male',
        birth_date: '1990-05-15',
        height_cm: 180,
        activity_multiplier: 1.55
      },
      goal_config: {
        goal_type: 'maintain',
        weekly_rate_pct: 0,
        protein_g_per_kg: 2.0,
        fat_calorie_pct: 0.28
      },
      adaptive_state: {
        estimated_tdee: 2450,
        calibration_status: 'ready',
        last_calibrated_date: '2026-11-10'
      },
      updatedAt: 1762000000000
    });

    await initialDb.close();

    // 2. Reopen using getDatabase() — must migrate v0 -> v1 cleanly and preserve all fields
    const migratedDb = await getDatabase({ name: testDbName, storage });
    const doc = await migratedDb.user_settings.findOne('global_settings').exec();
    expect(doc).not.toBeNull();
    const json = doc.toJSON();
    expect(json.target_mode).toBe('adaptive');
    expect(json.ai_settings).toEqual({ enabled: true, provider: 'qozara-intelligence' });
    expect(json.biometrics?.height_cm).toBe(180);
    expect(json.goal_config?.goal_type).toBe('maintain');
    expect(json.adaptive_state?.estimated_tdee).toBe(2450);
    expect(json.updatedAt).toBe(1762000000000);
  });
});
