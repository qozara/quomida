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
  weightLogsSchema,
  recalculateEWMAWeightTrend,
  solveAdaptiveTdee,
  daysBetween,
  addDaysToDate,
  calculateBaselineSeed,
  type BaseIngredient,
  type Recipe,
  type Portion,
  type DailyLog,
  type UserSettings,
  type SystemMetadata,
  type WeightLog
} from '@quomida/domain-core';
import type { CloudSyncProvider } from '@quomida/cloud-providers';
import { Observable, of, map } from 'rxjs';

export type DBErrorType = 'SCHEMA_MISMATCH' | 'MIGRATION_FAILED' | 'CORRUPTION' | 'UNKNOWN';

export interface QuomidaDBError extends Error {
  type: DBErrorType;
  rxdbError?: any;
  backupData?: string;
}

export async function exportRawDexieBackup(dbName: string): Promise<string> {
  const idb = typeof window !== 'undefined' && 'indexedDB' in window
    ? window.indexedDB
    : (typeof indexedDB !== 'undefined' ? indexedDB : null);
  if (!idb) return '';
  try {
    return await new Promise((resolve, reject) => {
      const request = idb.open(dbName);
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

        // Target stores, excluding internal catalog system dumps
        const targetStores = objectStoreNames.filter(name => {
          const lower = name.toLowerCase();
          return !lower.includes('catalog_system');
        });

        const storesToExport = targetStores.length > 0 ? targetStores : objectStoreNames;
        let completed = 0;
        const transaction = db.transaction(storesToExport, 'readonly');
        
        storesToExport.forEach(storeName => {
          const store = transaction.objectStore(storeName);
          const getAllRequest = store.getAll();
          getAllRequest.onsuccess = () => {
            let records = getAllRequest.result || [];
            // Filter out system catalog items to prevent memory explosion
            if (storeName.includes('base_ingredients') || storeName.includes('portions')) {
              records = records.filter((r: any) => r?.source !== 'system');
            }
            backup[storeName] = records;
            completed++;
            if (completed === storesToExport.length) {
              db.close();
              // Compact JSON stringify to avoid OOM memory expansion
              resolve(JSON.stringify(backup));
            }
          };
          getAllRequest.onerror = () => {
            completed++;
            if (completed === storesToExport.length) {
              db.close();
              resolve(JSON.stringify(backup));
            }
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
  weight_logs: any;
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
      recipes: { 
        schema: recipesSchema,
        migrationStrategies: {
          1: (oldDoc: any) => {
            // Migration to v1: Ensure ingredients have modern RecipeComponent structure
            const oldIngredients = Array.isArray(oldDoc.ingredients) ? oldDoc.ingredients : [];
            oldDoc.ingredients = oldIngredients.map((item: any) => ({
              food_id: item.food_id || item.ingredient_id || 'unknown',
              name: item.name || item.ingredient_id || 'Ingredient',
              weight_g: Number(item.weight_g ?? item.raw_weight_g ?? 100),
              calories_100g: Number(item.calories_100g) || 0,
              protein_100g: Number(item.protein_100g) || 0,
              carbs_100g: Number(item.carbs_100g) || 0,
              fats_100g: Number(item.fats_100g) || 0,
              from_recipe: Boolean(item.from_recipe)
            }));
            oldDoc.yield_factor = Number(oldDoc.yield_factor) || 1.0;
            return oldDoc;
          }
        }
      },
      portions: { 
        schema: portionsSchema,
        migrationStrategies: {
          1: (oldDoc: any) => {
            // Migration to v1: Add generic source and flag
            oldDoc.source = 'system';
            oldDoc.is_generic = true;
            return oldDoc;
          }
        }
      },
      daily_logs: { schema: dailyLogsSchema },
      user_settings: { schema: userSettingsSchema },
      system_metadata: { schema: systemMetadataSchema },
      weight_logs: { schema: weightLogsSchema }
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
    
    // Always attempt emergency raw backup export so user data can be recovered
    let backupData = '';
    try {
      backupData = await exportRawDexieBackup(options?.name || 'quomidadb_v1');
    } catch (e) {
      console.warn('[RxDB] Emergency backup export notice:', e);
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
      target_mode: 'manual',
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
    const recipes = await this.db!.recipes.find().exec();
    return {
      logs: logs.length,
      customFoods: customFoods.length + recipes.length
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
      target_mode: 'manual',
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

  async saveCustomFood(foodInput: Omit<BaseIngredient, 'id' | 'source'> & { id?: string }, portions?: { name: string, equivalent_weight_g: number }[]): Promise<string> {
    if (!this.db) await this.init();
    const id = foodInput.id || `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newFood: BaseIngredient = {
      ...foodInput,
      id,
      source: 'custom',
      updatedAt: Date.now()
    };
    await this.db!.base_ingredients.upsert(newFood);

    if (portions && portions.length > 0) {
      const now = Date.now();
      const portionsToUpsert = portions.map((p, i) => ({
        id: `port-${id}-${i}`,
        base_food_id: id,
        name: p.name,
        equivalent_weight_g: p.equivalent_weight_g,
        source: 'custom' as const,
        updatedAt: now
      }));
      await this.db!.portions.bulkUpsert(portionsToUpsert);
    }
    
    return id;
  }

  async deleteCustomFood(id: string): Promise<void> {
    if (!this.db) await this.init();
    const doc = await this.db!.base_ingredients.findOne(id).exec();
    if (doc && doc.source === 'custom') {
      const patchedDoc = await doc.patch({ updatedAt: Date.now() });
      await patchedDoc.remove();
    }
    const portions = await this.db!.portions.find({ selector: { base_food_id: id } }).exec();
    for (const p of portions) {
      const patchedPortion = await p.patch({ updatedAt: Date.now() });
      await patchedPortion.remove();
    }
  }

  async saveRecipe(recipeInput: Recipe, portions?: { name: string, equivalent_weight_g: number }[]): Promise<string> {
    if (!this.db) await this.init();
    const id = recipeInput.id || `recipe-custom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newRecipe: Recipe = {
      ...recipeInput,
      id,
      updatedAt: Date.now()
    };
    await this.db!.recipes.upsert(newRecipe);

    if (portions && portions.length > 0) {
      const now = Date.now();
      const portionsToUpsert = portions.map((p, i) => ({
        id: `port-${id}-${i}`,
        base_food_id: id,
        name: p.name,
        equivalent_weight_g: p.equivalent_weight_g,
        source: 'custom' as const,
        updatedAt: now
      }));
      await this.db!.portions.bulkUpsert(portionsToUpsert);
    }

    return id;
  }

  async deleteRecipe(id: string): Promise<void> {
    if (!this.db) await this.init();
    const doc = await this.db!.recipes.findOne(id).exec();
    if (doc) {
      const patchedDoc = await doc.patch({ updatedAt: Date.now() });
      await patchedDoc.remove();
    }
    const portions = await this.db!.portions.find({ selector: { base_food_id: id } }).exec();
    for (const p of portions) {
      const patchedPortion = await p.patch({ updatedAt: Date.now() });
      await patchedPortion.remove();
    }
  }

  observeRecipes(): Observable<Recipe[]> {
    const db = this.db || this.getDatabaseInstance();
    if (!db || !db.recipes) {
      return of([]);
    }
    return db.recipes.find().$;
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
    await this.db!.daily_logs.upsert(logEntry);
    return id;
  }

  async updateLogItem(id: string, updates: Partial<Omit<DailyLog, 'id'>>): Promise<void> {
    if (!this.db) await this.init();
    const doc = await this.db!.daily_logs.findOne(id).exec();
    if (doc) {
      await doc.patch({
        ...updates,
        updatedAt: Date.now()
      });
    }
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

  async saveWeightLog(entry: { date: string; weight_kg: number; note?: string }): Promise<WeightLog> {
    if (!this.db) await this.init();
    const id = `weight_${entry.date}`;
    const now = Date.now();
    const existingDoc = await this.db!.weight_logs.findOne(id).exec();
    const timestamp = existingDoc?.timestamp || new Date().toISOString();

    const currentDocs = await this.db!.weight_logs.find().exec();
    const existingMap = new Map<string, WeightLog>();
    const otherLogs: WeightLog[] = [];

    for (const d of currentDocs) {
      const json = d.toJSON() as WeightLog;
      existingMap.set(json.id, json);
      if (json.id !== id) {
        otherLogs.push(json);
      }
    }

    const pendingLog: WeightLog = {
      id,
      date: entry.date,
      timestamp,
      weight_kg: entry.weight_kg,
      trend_weight_kg: entry.weight_kg,
      ...(entry.note !== undefined ? { note: entry.note } : (existingDoc?.note ? { note: existingDoc.note } : {})),
      updatedAt: now
    };

    const recomputedLogs = recalculateEWMAWeightTrend([...otherLogs, pendingLog]);
    const savedLog = recomputedLogs.find((l) => l.id === id)!;

    const toUpsert: WeightLog[] = [];
    for (const log of recomputedLogs) {
      if (log.id === id) {
        toUpsert.push(log);
      } else {
        const prev = existingMap.get(log.id);
        if (!prev || prev.trend_weight_kg !== log.trend_weight_kg) {
          toUpsert.push({
            ...log,
            updatedAt: now
          });
        }
      }
    }

    if (toUpsert.length > 0) {
      await this.db!.weight_logs.bulkUpsert(toUpsert);
    }

    return savedLog;
  }

  async deleteWeightLog(idOrDate: string): Promise<void> {
    if (!this.db) await this.init();
    const id = idOrDate.startsWith('weight_') ? idOrDate : `weight_${idOrDate}`;
    const doc = await this.db!.weight_logs.findOne(id).exec();
    const now = Date.now();

    if (doc) {
      const patchedDoc = await doc.patch({ updatedAt: now });
      await patchedDoc.remove();
    }

    const remainingDocs = await this.db!.weight_logs.find().exec();
    const remainingLogs: WeightLog[] = remainingDocs.map((d: any) => d.toJSON() as WeightLog);
    if (remainingLogs.length > 0) {
      const recomputed = recalculateEWMAWeightTrend(remainingLogs);
      const existingMap = new Map<string, WeightLog>(remainingDocs.map((d: any) => [d.id, d.toJSON() as WeightLog]));
      const toUpsert: WeightLog[] = [];

      for (const log of recomputed) {
        const prev = existingMap.get(log.id);
        if (!prev || prev.trend_weight_kg !== log.trend_weight_kg) {
          toUpsert.push({
            ...log,
            updatedAt: now
          });
        }
      }

      if (toUpsert.length > 0) {
        await this.db!.weight_logs.bulkUpsert(toUpsert);
      }
    }
  }

  async getWeightLogs(): Promise<WeightLog[]> {
    if (!this.db) await this.init();
    const docs = await this.db!.weight_logs.find().exec();
    return docs
      .map((d: any) => (d.toJSON ? d.toJSON() : d) as WeightLog)
      .sort((a: WeightLog, b: WeightLog) => {
        const cmp = a.date.localeCompare(b.date);
        if (cmp !== 0) return cmp;
        return (a.timestamp || '').localeCompare(b.timestamp || '');
      });
  }

  observeWeightLogs(): Observable<WeightLog[]> {
    const db = this.db || this.getDatabaseInstance();
    if (!db || !db.weight_logs) {
      return of([]);
    }
    return db.weight_logs.find().$.pipe(
      map((docs: any[]) =>
        docs
          .map((d: any) => (d.toJSON ? d.toJSON() : d) as WeightLog)
          .sort((a: WeightLog, b: WeightLog) => {
            const cmp = a.date.localeCompare(b.date);
            if (cmp !== 0) return cmp;
            return (a.timestamp || '').localeCompare(b.timestamp || '');
          })
      )
    );
  }

  async getDailyLogsInRange(startDate: string, endDate: string): Promise<DailyLog[]> {
    if (!this.db) await this.init();
    const docs = await this.db!.daily_logs.find({
      selector: {
        date: {
          $gte: startDate,
          $lte: endDate
        }
      }
    }).exec();
    return docs
      .map((d: any) => (d.toJSON ? d.toJSON() : d) as DailyLog)
      .sort((a: DailyLog, b: DailyLog) => a.date.localeCompare(b.date));
  }

  async runAdaptiveCalibrationIfNeeded(today?: string, force?: boolean): Promise<UserSettings> {
    if (!this.db) await this.init();
    const todayDate = today || new Date().toISOString().slice(0, 10);
    const settings = await this.getSettings();

    if (settings.target_mode !== 'adaptive' || !settings.biometrics || !settings.goal_config) {
      return settings;
    }

    const isCalibrated = settings.adaptive_state?.calibration_status === 'ready';
    const lastCalibrated = settings.adaptive_state?.last_calibrated_date;
    const isDue = !isCalibrated || !lastCalibrated || daysBetween(lastCalibrated, todayDate) >= 7;

    if (!isDue && !force) {
      return settings;
    }

    const windowStart = addDaysToDate(todayDate, -13);
    const weightLogs = await this.getWeightLogs();
    const dailyLogs = await this.getDailyLogsInRange(windowStart, todayDate);

    let previousEstimatedTdee = settings.adaptive_state?.estimated_tdee;
    if (!previousEstimatedTdee) {
      if (weightLogs.length > 0) {
        const latestWeight = weightLogs[weightLogs.length - 1];
        const seed = calculateBaselineSeed({
          biometrics: settings.biometrics,
          goalConfig: settings.goal_config,
          currentWeightKg: latestWeight.weight_kg,
          referenceDate: todayDate
        });
        previousEstimatedTdee = seed.seed_tdee;
      } else {
        previousEstimatedTdee = settings.daily_calorie_target || 2000;
      }
    }

    const result = solveAdaptiveTdee({
      today: todayDate,
      previousEstimatedTdee,
      sex: settings.biometrics.sex,
      goalConfig: settings.goal_config,
      weightLogs,
      dailyLogs
    });

    const updates: Partial<UserSettings> = {
      adaptive_state: {
        estimated_tdee: result.estimated_tdee,
        last_calibrated_date: result.status === 'ready' ? todayDate : (lastCalibrated || todayDate),
        calibration_status: result.status
      }
    };

    if (result.recommended_targets) {
      updates.daily_calorie_target = result.recommended_targets.daily_calorie_target;
      updates.custom_macros = result.recommended_targets.custom_macros;
    }

    await this.saveSettings(updates);
    return await this.getSettings();
  }
}
