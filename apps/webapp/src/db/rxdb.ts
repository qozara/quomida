import { createRxDatabase, removeRxDatabase, addRxPlugin, prepareQuery, type RxDatabase, type RxStorage } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';

addRxPlugin(RxDBMigrationSchemaPlugin);
export { prepareQuery };
import {
  baseIngredientsSchema,
  recipesSchema,
  portionsSchema,
  dailyLogsSchema,
  userSettingsSchema,
  systemMetadataSchema,
  type BaseIngredient,
  type Recipe,
  type Portion,
  type DailyLog,
  type UserSettings,
  type SystemMetadata
} from '@quomida/domain-core';
import type { CloudSyncProvider } from '@quomida/cloud-providers';
import { Observable } from 'rxjs';

export type DBErrorType = 'SCHEMA_MISMATCH' | 'MIGRATION_FAILED' | 'CORRUPTION' | 'UNKNOWN';

export interface QuomidaDBError extends Error {
  type: DBErrorType;
  rxdbError?: any;
  backupData?: string;
}

async function exportRawDexieBackup(dbName: string): Promise<string> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return '';
  try {
    return await new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const backup: any = {};
        const objectStoreNames = Array.from(db.objectStoreNames);
        if (objectStoreNames.length === 0) {
           db.close();
           resolve('{}');
           return;
        }
        
        let completed = 0;
        const transaction = db.transaction(objectStoreNames, 'readonly');
        
        objectStoreNames.forEach(storeName => {
          const store = transaction.objectStore(storeName);
          const getAllRequest = store.getAll();
          getAllRequest.onsuccess = () => {
            backup[storeName] = getAllRequest.result;
            completed++;
            if (completed === objectStoreNames.length) {
              db.close();
              resolve(JSON.stringify(backup, null, 2));
            }
          };
          getAllRequest.onerror = () => {
            // Error handling for getAll
          };
        });
      };
    });
  } catch (err) {
    console.error('Failed to export raw backup:', err);
    return '';
  }
}
export type QuomidaDatabaseCollections = {
  base_ingredients: any;
  recipes: any;
  portions: any;
  daily_logs: any;
  user_settings: any;
  system_metadata: any;
};

export type QuomidaDatabase = RxDatabase<QuomidaDatabaseCollections>;

export interface InitDBOptions {
  storage?: RxStorage<any, any>;
  name?: string;
}

let dbInstance: QuomidaDatabase | null = null;
let dbPromise: Promise<QuomidaDatabase> | null = null;

export function getDatabase(options?: InitDBOptions): Promise<QuomidaDatabase> {
  if (!dbPromise) {
    dbPromise = initDatabase(options).then((db) => {
      dbInstance = db;
      return db;
    }).catch((err) => {
      // Clear cached promise on failure so subsequent attempts or resets can retry cleanly
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export async function destroyDatabase(): Promise<void> {
  if (dbInstance) {
    try {
      await dbInstance.close();
    } catch {
      // Ignore cleanup error if already closed
    }
    dbInstance = null;
  }
  dbPromise = null;
}

export async function clearLocalDatabase(options?: InitDBOptions): Promise<QuomidaDatabase> {
  const storage =
    options?.storage ||
    (typeof window !== 'undefined' && 'indexedDB' in window
      ? getRxStorageDexie()
      : getRxStorageMemory());
  const name = options?.name || 'quomidadb_v1';

  await destroyDatabase();

  try {
    await removeRxDatabase(name, storage);
  } catch (err) {
    console.warn('[RxDB] removeRxDatabase notice:', err);
  }

  if (typeof window !== 'undefined' && 'indexedDB' in window) {
    try {
      window.indexedDB.deleteDatabase(name);
    } catch {
      // Ignore browser deletion fallback error
    }
  }

  return getDatabase(options);
}

async function initDatabase(options?: InitDBOptions): Promise<QuomidaDatabase> {
  const storage =
    options?.storage ||
    (typeof window !== 'undefined' && 'indexedDB' in window
      ? getRxStorageDexie()
      : getRxStorageMemory());

  const db = await createRxDatabase<QuomidaDatabaseCollections>({
    name: options?.name || 'quomidadb_v1',
    storage
  });

  try {
    await db.addCollections({
      base_ingredients: { schema: baseIngredientsSchema },
      recipes: { schema: recipesSchema },
      portions: { schema: portionsSchema },
      daily_logs: { schema: dailyLogsSchema },
      user_settings: { schema: userSettingsSchema },
      system_metadata: { schema: systemMetadataSchema }
    });
  } catch (err: any) {
    try {
      await db.close();
    } catch {
      // ignore
    }
    
    let errorType: DBErrorType = 'UNKNOWN';
    const errStr = String(err);
    
    if (err?.code === 'DB6' || errStr.includes('DB6')) {
      errorType = 'SCHEMA_MISMATCH';
    } else if (err?.code === 'DM5' || err?.code === 'DM4' || errStr.includes('DM5') || errStr.includes('DM4')) {
      errorType = 'MIGRATION_FAILED';
    } else {
      errorType = 'CORRUPTION';
    }
    
    let backupData = '';
    if (errorType === 'MIGRATION_FAILED' || errorType === 'CORRUPTION') {
      backupData = await exportRawDexieBackup(options?.name || 'quomidadb_v1');
    }

    const customError = new Error(err?.message || 'Database initialization failed') as QuomidaDBError;
    customError.type = errorType;
    customError.rxdbError = err;
    customError.backupData = backupData;

    if (errorType === 'SCHEMA_MISMATCH') {
      console.error(
        '[RxDB DB6 Schema Mismatch] Stored local database schema hash differs from the application code without a version bump. ' +
        'To reset and start fresh with version 0, call clearLocalDatabase() or use the UI reset button in Settings/Recovery screen.'
      );
    }
    throw customError;
  }

  // Hydrate global user settings if empty
  const now = Date.now();
  const existingSettings = await db.user_settings.findOne('global_settings').exec();
  if (!existingSettings) {
    await db.user_settings.insert({
      id: 'global_settings',
      locale: 'es-AR',
      theme: 'dark',
      daily_calorie_target: 2000,
      custom_macros: {
        protein: 150,
        carbs: 200,
        fats: 65
      },
      updatedAt: now
    });
  }

  return db;
}

export class LocalDBService {
  private db: QuomidaDatabase | null = null;
  private options?: InitDBOptions;
  private cloudSyncProvider?: CloudSyncProvider;

  constructor(options?: InitDBOptions, cloudSyncProvider?: CloudSyncProvider) {
    this.options = options;
    this.cloudSyncProvider = cloudSyncProvider;
  }

  async resetDatabase(): Promise<QuomidaDatabase> {
    if (this.db) {
      try {
        await this.db.close();
      } catch {
        // ignore
      }
      this.db = null;
    }
    this.db = await clearLocalDatabase(this.options);
    return this.db;
  }

  async init(): Promise<QuomidaDatabase> {
    this.db = await getDatabase(this.options);
    if (this.cloudSyncProvider) {
      await this.cloudSyncProvider.initialize();
    }
    return this.db;
  }

  getDatabaseInstance(): QuomidaDatabase | null {
    return this.db;
  }

  getCloudSyncProvider(): CloudSyncProvider | undefined {
    return this.cloudSyncProvider;
  }

  setCloudSyncProvider(cloudSyncProvider?: CloudSyncProvider): void {
    this.cloudSyncProvider = cloudSyncProvider;
  }

  async getItemCounts(): Promise<{ logs: number; customFoods: number }> {
    if (!this.db) await this.init();
    const logs = await this.db!.daily_logs.find().exec();
    const customFoods = await this.db!.base_ingredients.find({ selector: { source: 'custom' } }).exec();
    return {
      logs: logs.length,
      customFoods: customFoods.length
    };
  }

  async getSettings(): Promise<UserSettings> {
    if (!this.db) await this.init();
    const doc = await this.db!.user_settings.findOne('global_settings').exec();
    if (doc) {
      return doc.toJSON() as UserSettings;
    }
    const fallback: UserSettings = {
      id: 'global_settings',
      locale: 'es-AR',
      theme: 'dark',
      daily_calorie_target: 2000,
      custom_macros: { protein: 150, carbs: 200, fats: 65 },
      updatedAt: Date.now()
    };
    await this.db!.user_settings.insert(fallback);
    return fallback;
  }

  async saveSettings(settings: Partial<UserSettings>): Promise<void> {
    if (!this.db) await this.init();
    const current = await this.getSettings();
    const updated: UserSettings = {
      ...current,
      ...settings,
      updatedAt: Date.now()
    };
    await this.db!.user_settings.upsert(updated);
  }

  async saveCustomFood(foodInput: Omit<BaseIngredient, 'id' | 'source'> & { id?: string }): Promise<string> {
    if (!this.db) await this.init();
    const id = foodInput.id || `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newFood: BaseIngredient = {
      ...foodInput,
      id,
      source: 'custom',
      updatedAt: Date.now()
    };
    await this.db!.base_ingredients.insert(newFood);
    return id;
  }

  async logFood(logInput: Omit<DailyLog, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): Promise<string> {
    if (!this.db) await this.init();
    const id = logInput.id || `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const timestamp = logInput.timestamp || new Date().toISOString();
    const logEntry: DailyLog = {
      ...logInput,
      id,
      timestamp,
      updatedAt: Date.now()
    };
    await this.db!.daily_logs.insert(logEntry);
    return id;
  }

  async deleteLogItem(id: string): Promise<void> {
    if (!this.db) await this.init();
    const doc = await this.db!.daily_logs.findOne(id).exec();
    if (doc) {
      const patchedDoc = await doc.patch({ updatedAt: Date.now() });
      await patchedDoc.remove();
    }
  }

  observeLogsByDate(date: string): Observable<DailyLog[]> {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() before observeLogsByDate()');
    }
    return this.db.daily_logs.find({ selector: { date } }).$;
  }

  observeIngredients(): Observable<BaseIngredient[]> {
    if (!this.db) {
      throw new Error('Database not initialized.');
    }
    return this.db.base_ingredients.find().$;
  }

  async getMetadata(key: string): Promise<string | null> {
    if (!this.db) await this.init();
    const doc = await this.db!.system_metadata.findOne(key).exec();
    return doc ? doc.value : null;
  }

  async setMetadata(key: string, value: string): Promise<void> {
    if (!this.db) await this.init();
    await this.db!.system_metadata.upsert({
      key,
      value,
      updatedAt: Date.now()
    });
  }
}
