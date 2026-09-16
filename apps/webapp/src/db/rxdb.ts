import { createRxDatabase, addRxPlugin, type RxDatabase, type RxStorage } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';

addRxPlugin(RxDBMigrationSchemaPlugin);
import {
  baseIngredientsSchema,
  recipesSchema,
  portionsSchema,
  dailyLogsSchema,
  userSettingsSchema,
  type BaseIngredient,
  type Recipe,
  type Portion,
  type DailyLog,
  type UserSettings
} from '@quomida/domain-core';
import type { SyncAdapter } from '@quomida/sync-adapters';
import { Observable } from 'rxjs';
import seedData from '../assets/seed_v1.json' with { type: 'json' };

export type QuomidaDatabaseCollections = {
  base_ingredients: any;
  recipes: any;
  portions: any;
  daily_logs: any;
  user_settings: any;
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

  await db.addCollections({
    base_ingredients: { schema: baseIngredientsSchema },
    recipes: { schema: recipesSchema },
    portions: { schema: portionsSchema },
    daily_logs: { schema: dailyLogsSchema },
    user_settings: { 
      schema: userSettingsSchema,
      migrationStrategies: {
        1: function(oldDoc) {
          return oldDoc;
        }
      }
    }
  });

  // Hydrate seed catalog if empty
  const existingCount = await db.base_ingredients.find().exec();
  const now = Date.now();
  if (existingCount.length === 0) {
    const seededIngredients = seedData.base_ingredients.map((ing) => ({
      ...ing,
      updatedAt: now
    }));
    const seededPortions = seedData.portions.map((p) => ({
      ...p,
      updatedAt: now
    }));

    await db.base_ingredients.bulkInsert(seededIngredients);
    await db.portions.bulkInsert(seededPortions);

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
  }

  return db;
}

export class LocalDBService {
  private db: QuomidaDatabase | null = null;
  private options?: InitDBOptions;
  private syncAdapter?: SyncAdapter;

  constructor(options?: InitDBOptions, syncAdapter?: SyncAdapter) {
    this.options = options;
    this.syncAdapter = syncAdapter;
  }

  async init(): Promise<QuomidaDatabase> {
    this.db = await getDatabase(this.options);
    if (this.syncAdapter) {
      await this.syncAdapter.initialize();
    }
    return this.db;
  }

  getDatabaseInstance(): QuomidaDatabase | null {
    return this.db;
  }

  getSyncAdapter(): SyncAdapter | undefined {
    return this.syncAdapter;
  }

  setSyncAdapter(syncAdapter?: SyncAdapter): void {
    this.syncAdapter = syncAdapter;
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
    if (this.syncAdapter && this.syncAdapter.isInitialized()) {
      await this.syncAdapter.push({
        collection: 'user_settings',
        documents: [updated]
      });
    }
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
    if (this.syncAdapter && this.syncAdapter.isInitialized()) {
      await this.syncAdapter.push({
        collection: 'base_ingredients',
        documents: [newFood]
      });
    }
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
    if (this.syncAdapter && this.syncAdapter.isInitialized()) {
      await this.syncAdapter.push({
        collection: 'daily_logs',
        documents: [logEntry]
      });
    }
    return id;
  }

  async deleteLogItem(id: string): Promise<void> {
    if (!this.db) await this.init();
    const doc = await this.db!.daily_logs.findOne(id).exec();
    if (doc) {
      await doc.remove();
      if (this.syncAdapter && this.syncAdapter.isInitialized()) {
        await this.syncAdapter.push({
          collection: 'daily_logs',
          documents: [{ id, _deleted: true, updatedAt: Date.now() }]
        });
      }
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
}
