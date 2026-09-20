import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockCloudSyncProvider, resolveUXStatus, resolveProviderDiagnostic, type UXSyncState } from '@quomida/cloud-providers';
import { LocalDBService, destroyDatabase } from '../src/db/rxdb.js';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

describe('Sync State Flow & Storage Management (TDD)', () => {
  let adapter: MockCloudSyncProvider;
  let dbService: LocalDBService;

  beforeEach(async () => {
    await destroyDatabase();
    adapter = new MockCloudSyncProvider();
    await adapter.initialize();
    dbService = new LocalDBService(
      { storage: getRxStorageMemory(), name: `sync_test_db_${Date.now()}` },
      adapter
    );
    await dbService.init();
  });

  afterEach(async () => {
    await destroyDatabase();
  });

  it('correctly maps adapter states and network connectivity to UX states', () => {
    // 1. All clean & synced (Online + Idle)
    expect(resolveUXStatus({ isOnline: true, adapter })).toBe('idle');

    // 2. Active sync in progress
    adapter.simulateSyncing();
    expect(resolveUXStatus({ isOnline: true, adapter })).toBe('syncing');

    // 3. Rate Limit / Transient 429
    adapter.simulateThrottled();
    expect(resolveUXStatus({ isOnline: true, adapter })).toBe('waiting');

    // 4. Session Revoked / Auth Failed (Action Required)
    adapter.simulateAuthFailed();
    expect(resolveUXStatus({ isOnline: true, adapter })).toBe('error');

    // 5. Device Offline (takes precedence over adapter state)
    expect(resolveUXStatus({ isOnline: false, adapter })).toBe('offline');

    // 6. Local Only (disconnected or null adapter)
    adapter.simulateOffline();
    expect(resolveUXStatus({ isOnline: true, adapter })).toBe('local');
    expect(resolveUXStatus({ isOnline: true, adapter: null })).toBe('local');
  });

  it('re-authenticates from auth_failed back to idle', async () => {
    adapter.simulateAuthFailed();
    expect(resolveUXStatus({ isOnline: true, adapter })).toBe('error');

    await adapter.reauthenticate();
    expect(resolveUXStatus({ isOnline: true, adapter })).toBe('idle');
  });

  it('forces sync and updates lastSyncedTime', async () => {
    const prevTime = adapter.getLastSyncedTime();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await adapter.forceSync();
    const newTime = adapter.getLastSyncedTime();
    expect(newTime).toBeDefined();
    expect(adapter.getStatus()).toBe('idle');
  });

  it('accurately counts local items for storage overview', async () => {
    // Seed data initial counts: 0 logs (empty date), some custom foods (0 custom)
    const counts = await dbService.getItemCounts();
    expect(counts.logs).toBe(0);
    expect(counts.customFoods).toBe(0);

    // Add a food log
    await dbService.logFood({
      date: '2026-09-15',
      meal_type: 'meal_breakfast',
      food_reference_id: 'ing-1',
      quantity: 100,
      portion_name: 'g',
      macros: { calories: 150, protein: 10, carbs: 20, fats: 2 }
    });

    // Add a custom food
    await dbService.saveCustomFood({
      name: 'Custom Protein Bar',
      calories_100g: 350,
      protein_100g: 30,
      carbs_100g: 20,
      fats_100g: 10,
      lang: 'es'
    });

    const updatedCounts = await dbService.getItemCounts();
    expect(updatedCounts.logs).toBe(1);
    expect(updatedCounts.customFoods).toBe(1);
  });

  it('correctly transitions state when user disconnects cloud connector while offline and then reconnects internet', async () => {
    // 1. Open app and disconnect internet
    // Device shows offline, cloud connector paused
    expect(adapter.isInitialized()).toBe(true);
    expect(adapter.getStatus()).toBe('idle');
    const offlineUX = resolveUXStatus({ isOnline: false, adapter });
    expect(offlineUX).toBe('offline');
    const pausedDiag = resolveProviderDiagnostic(offlineUX, true);
    expect(pausedDiag.statusKey).toBe('paused');
    expect(pausedDiag.variant).toBe('paused');

    // 2. Click on connector settings and click on disconnect
    await adapter.disconnect();
    dbService.setCloudSyncProvider(undefined);
    expect(adapter.isInitialized()).toBe(false);
    expect(adapter.getStatus()).toBe('disconnected');
    expect(dbService.getCloudSyncProvider()).toBeUndefined();

    // With disconnected adapter, state evaluates to local even if still offline
    const disconnectedOfflineUX = resolveUXStatus({ isOnline: false, adapter });
    expect(disconnectedOfflineUX).toBe('local');
    const disconnectedDiag = resolveProviderDiagnostic(disconnectedOfflineUX, false);
    expect(disconnectedDiag.statusKey).toBe('notConnected');
    expect(disconnectedDiag.variant).toBe('offline');

    // 3. Connect internet again
    // Expected: app shows online and cloud connector disconnected (local only)
    const reconnectedUX = resolveUXStatus({ isOnline: true, adapter: null });
    expect(reconnectedUX).toBe('local');

    // Even if adapter instance is passed, if its status is disconnected, it resolves to local
    const reconnectedWithOldAdapterUX = resolveUXStatus({ isOnline: true, adapter });
    expect(reconnectedWithOldAdapterUX).toBe('local');

    const onlineDiagWithoutAdapter = resolveProviderDiagnostic(reconnectedUX, false);
    expect(onlineDiagWithoutAdapter.statusKey).toBe('notConnected');
    expect(onlineDiagWithoutAdapter.variant).toBe('offline');
  });
});

