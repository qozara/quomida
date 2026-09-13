import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabase, destroyDatabase, LocalDBService } from '../src/db/rxdb.js';
import { MockSyncAdapter } from '@quomida/sync-adapters';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { firstValueFrom } from 'rxjs';

describe('RxDB Engine & Local Persistence Layer (APP-101 to APP-104)', () => {
  beforeEach(async () => {
    await destroyDatabase();
  });

  afterEach(async () => {
    await destroyDatabase();
  });

  it('[APP-101] initializes singleton RxDB instance and collections using in-memory/storage adapter', async () => {
    const db = await getDatabase({ storage: getRxStorageMemory(), name: `test_db_${Date.now()}` });
    expect(db).toBeDefined();
    expect(db.base_ingredients).toBeDefined();
    expect(db.daily_logs).toBeDefined();
    expect(db.user_settings).toBeDefined();
  });

  it('[APP-102] registers sync-ready schemas and hydrates initial seed catalog with updatedAt', async () => {
    const dbName = `test_db_${Date.now()}`;
    const db = await getDatabase({ storage: getRxStorageMemory(), name: dbName });
    
    const ingredients = await db.base_ingredients.find().exec();
    expect(ingredients.length).toBeGreaterThan(0);
    expect(ingredients[0].toJSON().updatedAt).toBeDefined();

    const settings = await db.user_settings.findOne('global_settings').exec();
    expect(settings).not.toBeNull();
    expect(settings?.toJSON().updatedAt).toBeDefined();
  });

  it('[APP-103] initializes with MockSyncAdapter decoupling UI thread from background sync lifecycle', async () => {
    const dbName = `test_db_${Date.now()}`;
    const mockAdapter = new MockSyncAdapter();
    const service = new LocalDBService({ storage: getRxStorageMemory(), name: dbName }, mockAdapter);
    
    await service.init();
    expect(service.getSyncAdapter()?.isInitialized()).toBe(true);

    // Save a setting and verify sync push occurs asynchronously
    await service.saveSettings({ daily_calorie_target: 2500 });
    const pulled = await mockAdapter.pull();
    expect(pulled.some((p) => p.collection === 'user_settings')).toBe(true);
  });

  it('[APP-104] provides repository methods: saveSettings, saveCustomFood, logFood, observeLogsByDate', async () => {
    const dbName = `test_db_${Date.now()}`;
    const service = new LocalDBService({ storage: getRxStorageMemory(), name: dbName });
    await service.init();

    // 1. saveSettings
    await service.saveSettings({ daily_calorie_target: 2200 });
    const settings = await service.getSettings();
    expect(settings.daily_calorie_target).toBe(2200);

    // 2. saveCustomFood
    const customId = await service.saveCustomFood({
      name: 'Custom Granola',
      lang: 'es',
      calories_100g: 450,
      protein_100g: 10,
      carbs_100g: 65,
      fats_100g: 15
    });
    expect(customId).toContain('custom_');

    // 3. logFood
    const logDate = '2026-09-13';
    await service.logFood({
      date: logDate,
      meal_type: 'meal_breakfast',
      food_reference_id: customId,
      quantity: 1,
      portion_name: '100g',
      macros: { calories: 450, protein: 10, carbs: 65, fats: 15 }
    });

    // 4. observeLogsByDate
    const logs = await firstValueFrom(service.observeLogsByDate(logDate));
    expect(logs.length).toBe(1);
    expect(logs[0].food_reference_id).toBe(customId);
  });
});
