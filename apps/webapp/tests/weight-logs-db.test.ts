import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDatabase, destroyDatabase, LocalDBService } from '../src/db/rxdb.js';
import { SYNCABLE_COLLECTIONS, syncDatabaseWithRemote } from '../src/db/replication.js';
import { MockCloudSyncProvider } from '@quomida/cloud-providers/testing';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { firstValueFrom, take } from 'rxjs';
import {
  type WeightLog,
  type DailyLog,
  type UserSettings,
  addDaysToDate
} from '@quomida/domain-core';

describe('Wave 4: Weight Logs RxDB, LocalDBService & Replication', () => {
  beforeEach(async () => {
    await destroyDatabase();
  });

  afterEach(async () => {
    await destroyDatabase();
  });

  it('[WL-01] getDatabase registers the weight_logs collection with weightLogsSchema v0', async () => {
    const dbName = `test_wl_db_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const db = await getDatabase({ storage: getRxStorageMemory(), name: dbName });
    expect(db.weight_logs).toBeDefined();
    expect(db.weight_logs.schema.version).toBe(0);
  });

  it('[WL-02] SYNCABLE_COLLECTIONS includes weight_logs and syncDatabaseWithRemote syncs weight_logs with MockCloudSyncProvider', async () => {
    expect(SYNCABLE_COLLECTIONS.has('weight_logs')).toBe(true);

    const dbName = `test_wl_sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const mockAdapter = new MockCloudSyncProvider();
    const service = new LocalDBService({ storage: getRxStorageMemory(), name: dbName }, mockAdapter);
    await service.init();

    await service.saveWeightLog({
      date: '2026-10-15',
      weight_kg: 78.5,
      note: 'Morning weigh-in'
    });

    await syncDatabaseWithRemote(service.getDatabaseInstance()!, mockAdapter);
    const pulled = await mockAdapter.pull();
    const weightPayload = pulled.find((p) => p.collection === 'weight_logs');
    expect(weightPayload).toBeDefined();
    expect(weightPayload?.documents.length).toBe(1);
    expect(weightPayload?.documents[0].weight_kg).toBe(78.5);
    expect(weightPayload?.documents[0].id).toBe('weight_2026-10-15');
  });

  it('[WL-03] saveWeightLog creates deterministic id, computes initial EWMA trend, and recomputes chronologically on retroactive insert', async () => {
    const dbName = `test_wl_ewma_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const service = new LocalDBService({ storage: getRxStorageMemory(), name: dbName });
    await service.init();

    // 1. First log: trend_weight_kg == weight_kg
    const log1 = await service.saveWeightLog({
      date: '2026-10-10',
      weight_kg: 80.0
    });
    expect(log1.id).toBe('weight_2026-10-10');
    expect(log1.trend_weight_kg).toBe(80.0);

    // 2. Second log next day: EWMA computed
    const log2 = await service.saveWeightLog({
      date: '2026-10-11',
      weight_kg: 79.0
    });
    // alpha = 0.12, elapsed = 1 => 80.0 + 0.12 * (79 - 80) = 79.88
    expect(log2.trend_weight_kg).toBe(79.88);

    // 3. Retroactive insert for earlier date '2026-10-09'
    await service.saveWeightLog({
      date: '2026-10-09',
      weight_kg: 82.0
    });

    // Verify all logs recomputed chronologically from 2026-10-09 forward
    const allLogs = await service.getWeightLogs();
    expect(allLogs.length).toBe(3);
    expect(allLogs[0].date).toBe('2026-10-09');
    expect(allLogs[0].trend_weight_kg).toBe(82.0); // Now first
    // 2026-10-10 was 80.0 => 82.0 + 0.12 * (80 - 82) = 81.76
    expect(allLogs[1].date).toBe('2026-10-10');
    expect(allLogs[1].trend_weight_kg).toBe(81.76);
    // 2026-10-11 was 79.0 => 81.76 + 0.12 * (79 - 81.76) = 81.43
    expect(allLogs[2].date).toBe('2026-10-11');
    expect(allLogs[2].trend_weight_kg).toBe(81.43);
  });

  it('[WL-04] deleteWeightLog removes document by id or date and recomputes trend weight for remaining logs', async () => {
    const dbName = `test_wl_del_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const service = new LocalDBService({ storage: getRxStorageMemory(), name: dbName });
    await service.init();

    await service.saveWeightLog({ date: '2026-10-01', weight_kg: 80.0 });
    await service.saveWeightLog({ date: '2026-10-02', weight_kg: 85.0 });
    await service.saveWeightLog({ date: '2026-10-03', weight_kg: 82.0 });

    // Delete middle log by date
    await service.deleteWeightLog('2026-10-02');

    const logsAfter = await service.getWeightLogs();
    expect(logsAfter.length).toBe(2);
    expect(logsAfter[0].date).toBe('2026-10-01');
    expect(logsAfter[0].trend_weight_kg).toBe(80.0);
    expect(logsAfter[1].date).toBe('2026-10-03');
    // elapsed days = 2, alpha_eff = 1 - (1 - 0.12)^2 = 1 - 0.88^2 = 1 - 0.7744 = 0.2256
    // trend = 80.0 + 0.2256 * (82 - 80) = 80.45
    expect(logsAfter[1].trend_weight_kg).toBe(80.45);

    // Delete by id
    await service.deleteWeightLog('weight_2026-10-01');
    const logsFinal = await service.getWeightLogs();
    expect(logsFinal.length).toBe(1);
    expect(logsFinal[0].trend_weight_kg).toBe(82.0); // Now only one, so trend equals raw
  });

  it('[WL-05] observeWeightLogs emits reactive sorted stream of weight logs', async () => {
    const dbName = `test_wl_obs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const service = new LocalDBService({ storage: getRxStorageMemory(), name: dbName });
    await service.init();

    const emittedLists: WeightLog[][] = [];
    const sub = service.observeWeightLogs().subscribe((logs) => {
      emittedLists.push(logs);
    });

    await service.saveWeightLog({ date: '2026-10-02', weight_kg: 75.0 });
    await service.saveWeightLog({ date: '2026-10-01', weight_kg: 74.5 });

    // Wait a brief moment for observable emissions
    await new Promise((resolve) => setTimeout(resolve, 50));
    sub.unsubscribe();

    const lastEmitted = emittedLists[emittedLists.length - 1];
    expect(lastEmitted.length).toBe(2);
    expect(lastEmitted[0].date).toBe('2026-10-01');
    expect(lastEmitted[1].date).toBe('2026-10-02');
  });

  it('[WL-06] getDailyLogsInRange returns DailyLog items strictly within the given date window', async () => {
    const dbName = `test_wl_range_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const service = new LocalDBService({ storage: getRxStorageMemory(), name: dbName });
    await service.init();

    await service.logFood({
      date: '2026-10-05',
      meal_type: 'meal_breakfast',
      food_reference_id: 'food_1',
      quantity: 1,
      portion_name: '100g',
      macros: { calories: 300, protein: 20, carbs: 40, fats: 5 }
    });
    await service.logFood({
      date: '2026-10-10',
      meal_type: 'meal_lunch',
      food_reference_id: 'food_2',
      quantity: 1,
      portion_name: '100g',
      macros: { calories: 500, protein: 30, carbs: 50, fats: 15 }
    });
    await service.logFood({
      date: '2026-10-15',
      meal_type: 'meal_dinner',
      food_reference_id: 'food_3',
      quantity: 1,
      portion_name: '100g',
      macros: { calories: 600, protein: 40, carbs: 60, fats: 20 }
    });

    const windowLogs = await service.getDailyLogsInRange('2026-10-08', '2026-10-12');
    expect(windowLogs.length).toBe(1);
    expect(windowLogs[0].date).toBe('2026-10-10');
  });

  it('[WL-07] runAdaptiveCalibrationIfNeeded updates user_settings targets and adaptive_state when due', async () => {
    const dbName = `test_wl_calib_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const service = new LocalDBService({ storage: getRxStorageMemory(), name: dbName });
    await service.init();

    const today = '2026-10-20';

    // 1. Setup user_settings with adaptive mode
    await service.saveSettings({
      target_mode: 'adaptive',
      biometrics: {
        sex: 'male',
        birth_date: '1995-05-15',
        height_cm: 180,
        activity_multiplier: 1.55
      },
      goal_config: {
        goal_type: 'lose',
        weekly_rate_pct: -0.5,
        protein_g_per_kg: 2.0,
        fat_calorie_pct: 0.25
      },
      adaptive_state: {
        estimated_tdee: 2500,
        last_calibrated_date: '2026-10-10', // 10 days ago (>= 7 days => due!)
        calibration_status: 'ready'
      }
    });

    // Populate weight logs: 4 in recent week, 1 in prior week
    // window is [2026-10-07, 2026-10-20]
    await service.saveWeightLog({ date: '2026-10-08', weight_kg: 80.0 });
    await service.saveWeightLog({ date: '2026-10-14', weight_kg: 79.5 });
    await service.saveWeightLog({ date: '2026-10-16', weight_kg: 79.3 });
    await service.saveWeightLog({ date: '2026-10-18', weight_kg: 79.1 });
    await service.saveWeightLog({ date: '2026-10-20', weight_kg: 78.9 });

    // Populate daily logs: 10 days with intake >= 800 kcal
    for (let i = 0; i < 11; i++) {
      const date = addDaysToDate('2026-10-08', i);
      await service.logFood({
        date,
        meal_type: 'meal_lunch',
        food_reference_id: 'food_seed',
        quantity: 1,
        portion_name: 'portion',
        macros: { calories: 2000, protein: 150, carbs: 200, fats: 65 }
      });
    }

    const calibratedSettings = await service.runAdaptiveCalibrationIfNeeded(today);
    expect(calibratedSettings.adaptive_state).toBeDefined();
    expect(calibratedSettings.adaptive_state?.last_calibrated_date).toBe(today);
    expect(calibratedSettings.adaptive_state?.calibration_status).toBe('ready');
    expect(calibratedSettings.daily_calorie_target).toBeGreaterThan(1200);
    expect(calibratedSettings.custom_macros.protein).toBeGreaterThan(100);

    // Call again without force on same day => should not re-run (settings unchanged)
    const cachedSettings = await service.runAdaptiveCalibrationIfNeeded(today);
    expect(cachedSettings.adaptive_state?.last_calibrated_date).toBe(today);
  });
});
