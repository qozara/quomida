import { createRxDatabase, addRxPlugin, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
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
import seedData from '../assets/seed_v1.json' with { type: 'json' };

export type QuomidaDatabaseCollections = {
  base_ingredients: any;
  recipes: any;
  portions: any;
  daily_logs: any;
  user_settings: any;
};

export type QuomidaDatabase = RxDatabase<QuomidaDatabaseCollections>;

let dbPromise: Promise<QuomidaDatabase> | null = null;

export function getDatabase(): Promise<QuomidaDatabase> {
  if (!dbPromise) {
    dbPromise = initDatabase();
  }
  return dbPromise;
}

async function initDatabase(): Promise<QuomidaDatabase> {
  const db = await createRxDatabase<QuomidaDatabaseCollections>({
    name: 'quomidadb_v1',
    storage: getRxStorageMemory()
  });

  await db.addCollections({
    base_ingredients: { schema: baseIngredientsSchema },
    recipes: { schema: recipesSchema },
    portions: { schema: portionsSchema },
    daily_logs: { schema: dailyLogsSchema },
    user_settings: { schema: userSettingsSchema }
  });

  // Hydrate seed catalog if empty
  const existingCount = await db.base_ingredients.find().exec();
  if (existingCount.length === 0) {
    console.log('[RxDB] Hydrating database with seed catalog v1.0.0...');
    await db.base_ingredients.bulkInsert(seedData.base_ingredients);
    await db.portions.bulkInsert(seedData.portions);
    await db.user_settings.insert({
      id: 'global_settings',
      locale: 'es-AR',
      theme: 'dark',
      daily_calorie_target: 2000,
      custom_macros: {
        protein: 150,
        carbs: 200,
        fats: 65
      }
    });
  }

  return db;
}
