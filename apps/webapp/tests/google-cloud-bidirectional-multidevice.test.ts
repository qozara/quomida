/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRxDatabase, addRxPlugin } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import {
  baseIngredientsSchema,
  recipesSchema,
  portionsSchema,
  dailyLogsSchema,
  userSettingsSchema,
  systemMetadataSchema
} from '@quomida/domain-core';
import {
  GoogleDriveSheetsCloudSyncProvider,
  type GoogleHttpClient
} from '@quomida/cloud-providers';
import { syncDatabaseWithRemote } from '../src/db/replication.js';
import { LocalDBService, type QuomidaDatabaseCollections } from '../src/db/rxdb.js';

addRxPlugin(RxDBMigrationSchemaPlugin);

/**
 * High-fidelity in-memory Mock of Google Cloud Drive v3 & Sheets v4 REST APIs.
 * Stores spreadsheets and appData files centrally, simulating the Google Cloud backend
 * shared across multiple client devices.
 */
function createMockGoogleCloudBackend() {
  interface FileRecord {
    id: string;
    name: string;
    spaces?: string[];
    appProperties?: Record<string, string>;
    content?: any;
    tabs?: Map<string, any[][]>;
    trashed?: boolean;
  }

  const files = new Map<string, FileRecord>();
  let fileCounter = 1;

  const httpClient: GoogleHttpClient = {
    fetch: vi.fn(async (url: string, init?: RequestInit) => {
      // 1. AppData Search
      if (url.includes('/drive/v3/files') && url.includes('spaces=appDataFolder') && init?.method !== 'POST') {
        const queryMatch = url.match(/name%20%3D%20'([^']+)'/) || url.match(/name = '([^']+)'/);
        const targetName = queryMatch ? decodeURIComponent(queryMatch[1]) : '';
        const matching = Array.from(files.values()).filter(
          f => f.spaces?.includes('appDataFolder') && (!targetName || f.name === targetName) && !f.trashed
        );
        return new Response(JSON.stringify({ files: matching.map(f => ({ id: f.id, name: f.name })) }), { status: 200 });
      }

      // 2. Search Drive for spreadsheets by metadata (appProperties) or filename
      if (url.includes('/drive/v3/files?') && init?.method !== 'POST' && !url.includes('alt=media')) {
        let matching = Array.from(files.values()).filter(f => !f.trashed);

        if (url.includes('appProperties')) {
          const isLogs = url.includes('daily_logs');
          const isCatalog = url.includes('food_catalog');
          matching = matching.filter(f => {
            const docType = f.appProperties?.quomida_doc_type;
            if (isLogs) return docType === 'daily_logs';
            if (isCatalog) return docType === 'food_catalog';
            return !!docType;
          });
        } else if (url.includes('name%20%3D%20') || url.includes('name = ')) {
          const match = url.match(/name%20%3D%20'([^']+)'/) || url.match(/name = '([^']+)'/);
          if (match) {
            const targetName = decodeURIComponent(match[1]);
            matching = matching.filter(f => f.name === targetName);
          }
        }
        return new Response(JSON.stringify({ files: matching.map(f => ({ id: f.id, name: f.name })) }), { status: 200 });
      }

      // 3. AppData Upload (Multipart Create or Update)
      if (url.includes('/upload/drive/v3/files')) {
        const bodyStr = String(init?.body || '');
        const parts = bodyStr.split('\r\n\r\n');
        let content: any = null;
        if (parts.length >= 3) {
          content = JSON.parse(parts[2].replace(/\r\n--.*$/, ''));
        }

        const fileIdMatch = url.match(/\/upload\/drive\/v3\/files\/([^?]+)/);
        const fileId = fileIdMatch ? fileIdMatch[1] : `appdata_${fileCounter++}`;

        const existing = files.get(fileId);
        if (existing) {
          existing.content = content;
          return new Response(JSON.stringify({ id: existing.id, name: existing.name }), { status: 200 });
        } else {
          const newRecord: FileRecord = {
            id: fileId,
            name: 'settings.json',
            spaces: ['appDataFolder'],
            content
          };
          files.set(fileId, newRecord);
          return new Response(JSON.stringify({ id: newRecord.id, name: newRecord.name }), { status: 200 });
        }
      }

      // 4. AppData Read Media
      if (url.includes('/drive/v3/files/') && url.includes('alt=media')) {
        const fileIdMatch = url.match(/\/drive\/v3\/files\/([^?]+)/);
        const fileId = fileIdMatch ? fileIdMatch[1] : '';
        const file = files.get(fileId);
        if (file && file.content !== undefined) {
          return new Response(JSON.stringify(file.content), { status: 200 });
        }
        return new Response(JSON.stringify(null), { status: 404 });
      }

      // 5. Drive metadata PATCH
      if (url.includes('/drive/v3/files/') && init?.method === 'PATCH') {
        const fileIdMatch = url.match(/\/drive\/v3\/files\/([^?]+)/);
        const fileId = fileIdMatch ? fileIdMatch[1] : '';
        const file = files.get(fileId);
        if (file && init?.body) {
          try {
            const body = JSON.parse(String(init.body));
            if (body.appProperties) {
              file.appProperties = { ...file.appProperties, ...body.appProperties };
            }
          } catch {}
          return new Response(JSON.stringify(file), { status: 200 });
        }
        return new Response('Not Found', { status: 404 });
      }

      // 6. Delete file
      if (url.includes('/drive/v3/files/') && init?.method === 'DELETE') {
        const fileIdMatch = url.match(/\/drive\/v3\/files\/([^?]+)/);
        const fileId = fileIdMatch ? fileIdMatch[1] : '';
        files.delete(fileId);
        return new Response(JSON.stringify({}), { status: 200 });
      }

      // 7. Create Spreadsheet
      if (url.includes('/v4/spreadsheets') && init?.method === 'POST' && !url.includes(':batchUpdate')) {
        const body = JSON.parse(String(init?.body));
        const id = `sheet_${fileCounter++}_${body.properties.title.replace(/\s+/g, '_').toLowerCase()}`;
        const tabMap = new Map<string, any[][]>();
        const sheetsList = (body.sheets || []).map((s: any, idx: number) => {
          tabMap.set(s.properties.title, []);
          return { properties: { title: s.properties.title, sheetId: idx } };
        });

        const newSheet: FileRecord = {
          id,
          name: body.properties.title,
          tabs: tabMap
        };
        files.set(id, newSheet);

        return new Response(JSON.stringify({ spreadsheetId: id, sheets: sheetsList }), { status: 200 });
      }

      // 8. Get Spreadsheet metadata (sheets & titles)
      if (url.includes('/v4/spreadsheets/') && init?.method === 'GET' && !url.includes('/values/')) {
        const match = url.match(/\/v4\/spreadsheets\/([^?]+)/);
        const id = match ? match[1] : '';
        const sheet = files.get(id);
        if (sheet && sheet.tabs) {
          const tabNames = Array.from(sheet.tabs.keys());
          return new Response(JSON.stringify({
            spreadsheetId: id,
            sheets: tabNames.map((t, idx) => ({ properties: { title: t, sheetId: idx } }))
          }), { status: 200 });
        }
        return new Response('Not Found', { status: 404 });
      }

      // 9. BatchUpdate spreadsheet (addSheet, addProtectedRange, etc.)
      if (url.includes(':batchUpdate') && !url.includes('values:batchUpdate') && init?.method === 'POST') {
        const match = url.match(/\/v4\/spreadsheets\/([^:]+):batchUpdate/);
        const id = match ? match[1] : '';
        const sheet = files.get(id);
        if (sheet && sheet.tabs && init?.body) {
          const body = JSON.parse(String(init.body));
          for (const req of (body.requests || [])) {
            if (req.addSheet?.properties?.title) {
              sheet.tabs.set(req.addSheet.properties.title, []);
            }
          }
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }

      // 10. BatchUpdate spreadsheet values (writeTable)
      if (url.includes('/values:batchUpdate') && init?.method === 'POST') {
        const match = url.match(/\/spreadsheets\/([^/]+)\/values:batchUpdate/);
        const id = match ? match[1] : '';
        const sheet = files.get(id);
        if (sheet && sheet.tabs && init?.body) {
          const body = JSON.parse(String(init.body));
          for (const item of (body.data || [])) {
            const tabName = item.range.split('!')[0];
            sheet.tabs.set(tabName, item.values);
          }
          return new Response(JSON.stringify({ totalUpdatedRows: 1 }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }

      // 11. Read spreadsheet values (readTable)
      if (url.includes('/values/') && init?.method === 'GET') {
        const match = url.match(/\/spreadsheets\/([^/]+)\/values\/([^!]+)!/);
        const id = match ? match[1] : '';
        const tab = match ? decodeURIComponent(match[2]) : '';
        const sheet = files.get(id);
        const values = (sheet && sheet.tabs) ? (sheet.tabs.get(tab) || []) : [];
        return new Response(JSON.stringify({ values }), { status: 200 });
      }

      // 12. Clear values
      if (url.includes(':clear') && init?.method === 'POST') {
        return new Response(JSON.stringify({ clearedRange: 'A:Z' }), { status: 200 });
      }

      return new Response('Not Found', { status: 404 });
    })
  };

  return { httpClient, files };
}

describe('Google Drive Cloud Connector — Multi-Device Bi-Directional Synchronization Workflow', () => {
  let backend: ReturnType<typeof createMockGoogleCloudBackend>;

  const createDeviceContext = async (deviceName: string) => {
    const db = await createRxDatabase<QuomidaDatabaseCollections>({
      name: `db_${deviceName}_${Math.random().toString(36).substring(7)}`,
      storage: getRxStorageMemory()
    });

    await db.addCollections({
      base_ingredients: { schema: baseIngredientsSchema },
      recipes: { schema: recipesSchema },
      portions: { schema: portionsSchema },
      daily_logs: { schema: dailyLogsSchema },
      user_settings: { schema: userSettingsSchema },
      system_metadata: { schema: systemMetadataSchema }
    });

    const provider = new GoogleDriveSheetsCloudSyncProvider({
      httpClient: backend.httpClient
    });

    await provider.initialize({
      accessToken: `token-device-${deviceName}`,
      userEmail: 'quomida-tester@gmail.com'
    });

    return { db, provider };
  };

  beforeEach(() => {
    backend = createMockGoogleCloudBackend();
  });

  it('Device A logs food & syncs -> Device B pulls, modifies log, adds custom ingredient & syncs -> Device A receives all updates while left open', async () => {
    // -------------------------------------------------------------
    // STEP 1: Device A boots and starts working
    // -------------------------------------------------------------
    const deviceA = await createDeviceContext('A');

    // Device A logs a lunch food item
    await deviceA.db.daily_logs.insert({
      id: 'log_lunch_apple',
      timestamp: '2026-10-05T12:30:00.000Z',
      date: '2026-10-05',
      meal_type: 'meal_lunch',
      food_reference_id: 'food_apple_system',
      food_name: 'Manzana Gala',
      quantity: 1,
      portion_name: 'Unidad mediana (150g)',
      macros: { calories: 78, protein: 0.5, carbs: 21, fats: 0.3 },
      updatedAt: 1000
    });

    // Device A customizes user settings
    await deviceA.db.user_settings.insert({
      id: 'global_settings',
      locale: 'es-AR',
      theme: 'dark',
      daily_calorie_target: 2250,
      custom_macros: { protein: 160, carbs: 220, fats: 70 },
      updatedAt: 1000
    });

    // Device A syncs to Google Drive/Sheets
    await syncDatabaseWithRemote(deviceA.db as any, deviceA.provider);

    // Verify remote Google Drive & Sheets received the data
    expect(backend.files.size).toBeGreaterThanOrEqual(2);
    const catalogFile = Array.from(backend.files.values()).find(f => f.name === 'Quomida Food Catalog');
    const logsFile = Array.from(backend.files.values()).find(f => f.name === 'Quomida Daily Logs');
    const settingsFile = Array.from(backend.files.values()).find(f => f.name === 'settings.json');

    expect(catalogFile).toBeDefined();
    expect(logsFile).toBeDefined();
    expect(settingsFile).toBeDefined();
    expect(settingsFile!.content[0].daily_calorie_target).toBe(2250);

    const logsTab = logsFile!.tabs?.get('daily_logs');
    expect(logsTab).toBeDefined();
    expect(logsTab!.length).toBe(2); // Header + 1 row
    expect(logsTab![1][0]).toBe('log_lunch_apple');

    // -------------------------------------------------------------
    // STEP 2: Device B boots, connects to Google, and pulls data
    // -------------------------------------------------------------
    const deviceB = await createDeviceContext('B');

    // Device B initial pull
    await syncDatabaseWithRemote(deviceB.db as any, deviceB.provider);

    // Verify Device B has Device A's daily log and settings
    const logOnB = await deviceB.db.daily_logs.findOne('log_lunch_apple').exec();
    expect(logOnB).toBeDefined();
    expect(logOnB.food_name).toBe('Manzana Gala');
    expect(logOnB.quantity).toBe(1);

    const settingsOnB = await deviceB.db.user_settings.findOne('global_settings').exec();
    expect(settingsOnB).toBeDefined();
    expect(settingsOnB.daily_calorie_target).toBe(2250);

    // -------------------------------------------------------------
    // STEP 3: Device B changes contents made on Device A AND adds a custom ingredient
    // -------------------------------------------------------------
    // 3a. Device B modifies the lunch log (doubles the portion quantity from 1 to 2)
    const logDocToUpdate = await deviceB.db.daily_logs.findOne('log_lunch_apple').exec();
    await logDocToUpdate.patch({
      quantity: 2,
      portion_name: '2 Unidades medianas (300g)',
      macros: { calories: 156, protein: 1.0, carbs: 42, fats: 0.6 },
      updatedAt: 2000 // Newer timestamp
    });

    // 3b. Device B adds a brand new custom ingredient with custom portions
    await deviceB.db.base_ingredients.insert({
      id: 'custom_almond_butter',
      name: 'Mantequilla de Almendras Casera',
      source: 'custom',
      lang: 'es',
      calories_100g: 614,
      protein_100g: 21,
      carbs_100g: 20,
      fats_100g: 55,
      updatedAt: 2500
    });

    await deviceB.db.portions.insert({
      id: 'portion_ab_tbsp',
      base_food_id: 'custom_almond_butter',
      name: 'Cucharada sopera (15g)',
      equivalent_weight_g: 15,
      source: 'custom',
      updatedAt: 2500
    });

    // 3c. Device B logs the new custom ingredient as dinner
    await deviceB.db.daily_logs.insert({
      id: 'log_dinner_custom_ab',
      timestamp: '2026-10-05T20:30:00.000Z',
      date: '2026-10-05',
      meal_type: 'meal_dinner',
      food_reference_id: 'custom_almond_butter',
      food_name: 'Mantequilla de Almendras Casera',
      quantity: 2,
      portion_name: 'Cucharada sopera (15g)',
      macros: { calories: 184, protein: 6.3, carbs: 6.0, fats: 16.5 },
      updatedAt: 2600
    });

    // Device B syncs to Google
    await syncDatabaseWithRemote(deviceB.db as any, deviceB.provider);

    // Verify remote Google Sheets now contains the updated log and new custom items
    const remoteLogsTab = logsFile!.tabs?.get('daily_logs');
    expect(remoteLogsTab!.length).toBe(3); // Header + 2 rows
    const modifiedLogRemote = remoteLogsTab!.find(r => r[0] === 'log_lunch_apple');
    expect(modifiedLogRemote).toBeDefined();
    expect(modifiedLogRemote![6]).toBe(2); // quantity = 2
    expect(modifiedLogRemote![8]).toBe(156); // calories = 156

    const remoteIngsTab = catalogFile!.tabs?.get('base_ingredients');
    expect(remoteIngsTab).toBeDefined();
    const customIngRow = remoteIngsTab!.find(r => r[0] === 'custom_almond_butter');
    expect(customIngRow).toBeDefined();
    expect(customIngRow![1]).toBe('Mantequilla de Almendras Casera');
    expect(customIngRow![2]).toBe('custom');

    const remotePortionsTab = catalogFile!.tabs?.get('portions');
    expect(remotePortionsTab).toBeDefined();
    const customPortionRow = remotePortionsTab!.find(r => r[0] === 'portion_ab_tbsp');
    expect(customPortionRow).toBeDefined();
    expect(customPortionRow![2]).toBe('Cucharada sopera (15g)');

    // -------------------------------------------------------------
    // STEP 4: User returns to Device A (Device A was left open)
    // -------------------------------------------------------------
    // Before sync: Device A still has old quantity 1 and no custom ingredient
    const oldLogOnA = await deviceA.db.daily_logs.findOne('log_lunch_apple').exec();
    expect(oldLogOnA.quantity).toBe(1);
    const ingBeforeSyncOnA = await deviceA.db.base_ingredients.findOne('custom_almond_butter').exec();
    expect(ingBeforeSyncOnA).toBeNull();

    // Device A triggers bi-directional sync (simulating visibility change / focus / periodic poll)
    await syncDatabaseWithRemote(deviceA.db as any, deviceA.provider);

    // VERIFICATIONS ON DEVICE A:
    // 1. Modified log has been updated to Device B's changes (quantity = 2, calories = 156)
    const updatedLogOnA = await deviceA.db.daily_logs.findOne('log_lunch_apple').exec();
    expect(updatedLogOnA).toBeDefined();
    expect(updatedLogOnA.quantity).toBe(2);
    expect(updatedLogOnA.macros.calories).toBe(156);
    expect(updatedLogOnA.portion_name).toBe('2 Unidades medianas (300g)');

    // 2. Custom ingredient added on Device B is now in Device A's collection
    const syncedIngOnA = await deviceA.db.base_ingredients.findOne('custom_almond_butter').exec();
    expect(syncedIngOnA).toBeDefined();
    expect(syncedIngOnA.name).toBe('Mantequilla de Almendras Casera');
    expect(syncedIngOnA.source).toBe('custom');
    expect(syncedIngOnA.calories_100g).toBe(614);

    // 3. Custom portion added on Device B is now in Device A's collection
    const syncedPortionOnA = await deviceA.db.portions.findOne('portion_ab_tbsp').exec();
    expect(syncedPortionOnA).toBeDefined();
    expect(syncedPortionOnA.equivalent_weight_g).toBe(15);

    // 4. Dinner log created on Device B is now in Device A's collection
    const dinnerLogOnA = await deviceA.db.daily_logs.findOne('log_dinner_custom_ab').exec();
    expect(dinnerLogOnA).toBeDefined();
    expect(dinnerLogOnA.food_name).toBe('Mantequilla de Almendras Casera');

    // -------------------------------------------------------------
    // STEP 5: Device A continues working and syncs back to Device B
    // -------------------------------------------------------------
    // User on Device A logs an afternoon snack using the synced custom ingredient
    await deviceA.db.daily_logs.insert({
      id: 'log_snack_device_a',
      timestamp: '2026-10-05T16:00:00.000Z',
      date: '2026-10-05',
      meal_type: 'meal_snack',
      food_reference_id: 'custom_almond_butter',
      food_name: 'Mantequilla de Almendras Casera',
      quantity: 1,
      portion_name: 'Cucharada sopera (15g)',
      macros: { calories: 92, protein: 3.1, carbs: 3.0, fats: 8.2 },
      updatedAt: 3000
    });

    await syncDatabaseWithRemote(deviceA.db as any, deviceA.provider);

    // Device B syncs and receives the snack log from Device A
    await syncDatabaseWithRemote(deviceB.db as any, deviceB.provider);

    const snackOnB = await deviceB.db.daily_logs.findOne('log_snack_device_a').exec();
    expect(snackOnB).toBeDefined();
    expect(snackOnB.quantity).toBe(1);
    expect(snackOnB.macros.calories).toBe(92);

    await deviceA.db.remove();
    await deviceB.db.remove();
  });

  it('handles app closed on device and reloaded (cold start / reboot sync)', async () => {
    // 1. Device A sets up and syncs initial data
    const deviceA = await createDeviceContext('A_Cold');

    await deviceA.db.daily_logs.insert({
      id: 'log_breakfast_cold',
      timestamp: '2026-10-06T08:00:00.000Z',
      date: '2026-10-06',
      meal_type: 'meal_breakfast',
      food_reference_id: 'food_eggs',
      food_name: 'Huevos Revueltos',
      quantity: 2,
      portion_name: 'Unidades',
      macros: { calories: 140, protein: 12, carbs: 1, fats: 10 },
      updatedAt: 1000
    });

    await syncDatabaseWithRemote(deviceA.db as any, deviceA.provider);

    // 2. Device B opens, modifies data, adds a custom ingredient, and syncs
    const deviceB = await createDeviceContext('B_Cold');
    await syncDatabaseWithRemote(deviceB.db as any, deviceB.provider);

    await deviceB.db.base_ingredients.insert({
      id: 'custom_protein_shake',
      name: 'Batido Proteico Whey Vainilla',
      source: 'custom',
      lang: 'es',
      calories_100g: 375,
      protein_100g: 75,
      carbs_100g: 8,
      fats_100g: 4,
      updatedAt: 2000
    });

    await deviceB.db.user_settings.insert({
      id: 'global_settings',
      locale: 'es-AR',
      theme: 'dark',
      daily_calorie_target: 2600,
      custom_macros: { protein: 200, carbs: 250, fats: 75 },
      updatedAt: 2000
    });

    await syncDatabaseWithRemote(deviceB.db as any, deviceB.provider);

    // 3. Device A was CLOSED (simulate quitting app by closing previous DB)
    await deviceA.db.close();

    // 4. Device A RELOADS (simulated cold boot with persistent state or fresh re-hydration from cloud)
    const deviceAReloaded = await createDeviceContext('A_Cold_Reloaded');

    // On cold boot, auto-sync runs against Google Drive/Sheets
    await syncDatabaseWithRemote(deviceAReloaded.db as any, deviceAReloaded.provider);

    // Verifications on Reloaded Device A:
    const customFoodOnReloadedA = await deviceAReloaded.db.base_ingredients.findOne('custom_protein_shake').exec();
    expect(customFoodOnReloadedA).toBeDefined();
    expect(customFoodOnReloadedA.name).toBe('Batido Proteico Whey Vainilla');

    const breakfastOnReloadedA = await deviceAReloaded.db.daily_logs.findOne('log_breakfast_cold').exec();
    expect(breakfastOnReloadedA).toBeDefined();
    expect(breakfastOnReloadedA.food_name).toBe('Huevos Revueltos');

    const settingsOnReloadedA = await deviceAReloaded.db.user_settings.findOne('global_settings').exec();
    expect(settingsOnReloadedA).toBeDefined();
    expect(settingsOnReloadedA.daily_calorie_target).toBe(2600);

    await deviceB.db.remove();
    await deviceAReloaded.db.remove();
  });

  it('propagates soft deletions of logs and custom ingredients across devices without resurrection', async () => {
    const deviceA = await createDeviceContext('A_Delete');
    const deviceB = await createDeviceContext('B_Delete');

    // 1. Device A creates an item and custom ingredient
    await deviceA.db.daily_logs.insert({
      id: 'log_to_delete',
      timestamp: '2026-10-05T10:00:00.000Z',
      date: '2026-10-05',
      meal_type: 'meal_breakfast',
      food_reference_id: 'food_toast',
      food_name: 'Tostadas Integrales',
      quantity: 2,
      portion_name: 'Rebanadas',
      macros: { calories: 160, protein: 6, carbs: 30, fats: 2 },
      updatedAt: 1000
    });

    await deviceA.db.base_ingredients.insert({
      id: 'custom_to_delete',
      name: 'Galletas Caseras de Avena',
      source: 'custom',
      lang: 'es',
      calories_100g: 400,
      protein_100g: 8,
      carbs_100g: 65,
      fats_100g: 12,
      updatedAt: 1000
    });

    await syncDatabaseWithRemote(deviceA.db as any, deviceA.provider);

    // 2. Device B pulls them
    await syncDatabaseWithRemote(deviceB.db as any, deviceB.provider);
    expect(await deviceB.db.daily_logs.findOne('log_to_delete').exec()).toBeDefined();
    expect(await deviceB.db.base_ingredients.findOne('custom_to_delete').exec()).toBeDefined();

    // 3. Device B deletes both items
    const logDoc = await deviceB.db.daily_logs.findOne('log_to_delete').exec();
    const patchedLog = await logDoc.patch({ updatedAt: 2000 });
    await patchedLog.remove();

    const ingDoc = await deviceB.db.base_ingredients.findOne('custom_to_delete').exec();
    const patchedIng = await ingDoc.patch({ updatedAt: 2000 });
    await patchedIng.remove();

    // Device B syncs tombstones to Google
    await syncDatabaseWithRemote(deviceB.db as any, deviceB.provider);

    // 4. Device A syncs from Google
    await syncDatabaseWithRemote(deviceA.db as any, deviceA.provider);

    // Verify both items are deleted on Device A
    expect(await deviceA.db.daily_logs.findOne('log_to_delete').exec()).toBeNull();
    expect(await deviceA.db.base_ingredients.findOne('custom_to_delete').exec()).toBeNull();

    // 5. Subsequent sync on Device A does NOT resurrect the deleted items
    await syncDatabaseWithRemote(deviceA.db as any, deviceA.provider);
    expect(await deviceA.db.daily_logs.findOne('log_to_delete').exec()).toBeNull();
    expect(await deviceA.db.base_ingredients.findOne('custom_to_delete').exec()).toBeNull();

    await deviceA.db.remove();
    await deviceB.db.remove();
  });

  it('resolves concurrent offline edits with Last-Write-Wins and merges non-conflicting documents', async () => {
    const deviceA = await createDeviceContext('A_LWW');
    const deviceB = await createDeviceContext('B_LWW');

    // 1. Initial shared state
    await deviceA.db.daily_logs.insert({
      id: 'shared_log_target',
      timestamp: '2026-10-05T12:00:00.000Z',
      date: '2026-10-05',
      meal_type: 'meal_lunch',
      food_reference_id: 'food_pasta',
      food_name: 'Pasta con Tomate',
      quantity: 1,
      portion_name: 'Plato',
      macros: { calories: 350, protein: 12, carbs: 65, fats: 5 },
      updatedAt: 1000
    });

    await syncDatabaseWithRemote(deviceA.db as any, deviceA.provider);
    await syncDatabaseWithRemote(deviceB.db as any, deviceB.provider);

    // 2. Both devices make edits concurrently while offline
    // Device A edits shared_log_target at timestamp 1500
    const logOnA = await deviceA.db.daily_logs.findOne('shared_log_target').exec();
    await logOnA.patch({
      food_name: 'Pasta con Tomate y Albahaca (Device A edit)',
      quantity: 1.2,
      updatedAt: 1500
    });

    // Device A also adds a new log on a different date (non-conflicting)
    await deviceA.db.daily_logs.insert({
      id: 'log_exclusive_device_a',
      timestamp: '2026-10-04T19:00:00.000Z',
      date: '2026-10-04',
      meal_type: 'meal_dinner',
      food_reference_id: 'food_salad',
      food_name: 'Ensalada Mixta',
      quantity: 1,
      portion_name: 'Bowl',
      macros: { calories: 120, protein: 3, carbs: 10, fats: 7 },
      updatedAt: 1600
    });

    // Device B edits shared_log_target at timestamp 2000 (Newer than Device A!)
    const logOnB = await deviceB.db.daily_logs.findOne('shared_log_target').exec();
    await logOnB.patch({
      food_name: 'Pasta con Salsa Boloñesa (Device B winner)',
      quantity: 1.5,
      macros: { calories: 480, protein: 25, carbs: 65, fats: 14 },
      updatedAt: 2000
    });

    // Device B syncs first
    await syncDatabaseWithRemote(deviceB.db as any, deviceB.provider);

    // Device A syncs second
    await syncDatabaseWithRemote(deviceA.db as any, deviceA.provider);

    // Verifications on Device A:
    // LWW winner: Device B's newer edit (2000 > 1500) overrides Device A's older edit
    const finalSharedOnA = await deviceA.db.daily_logs.findOne('shared_log_target').exec();
    expect(finalSharedOnA.food_name).toBe('Pasta con Salsa Boloñesa (Device B winner)');
    expect(finalSharedOnA.quantity).toBe(1.5);
    expect(finalSharedOnA.macros.calories).toBe(480);

    // Non-conflicting addition from Device A is preserved locally and pushed to Google
    const exclusiveOnA = await deviceA.db.daily_logs.findOne('log_exclusive_device_a').exec();
    expect(exclusiveOnA).toBeDefined();

    // Device B syncs again and receives Device A's non-conflicting addition
    await syncDatabaseWithRemote(deviceB.db as any, deviceB.provider);
    const exclusiveOnB = await deviceB.db.daily_logs.findOne('log_exclusive_device_a').exec();
    expect(exclusiveOnB).toBeDefined();
    expect(exclusiveOnB.food_name).toBe('Ensalada Mixta');

    await deviceA.db.remove();
    await deviceB.db.remove();
  });

  it('manages complete user workflow via LocalDBService across Device A and Device B with Google Drive', async () => {
    // 1. Device A sets up via LocalDBService
    const serviceA = new LocalDBService({
      name: `db_service_A_${Math.random().toString(36).substring(7)}`,
      storage: getRxStorageMemory()
    });
    const dbA = await serviceA.init();
    const providerA = new GoogleDriveSheetsCloudSyncProvider({
      httpClient: backend.httpClient
    });
    await providerA.initialize({ accessToken: 'token-A', userEmail: 'user@gmail.com' });
    serviceA.setCloudSyncProvider(providerA);

    // Device A logs food and saves settings
    const logId = await serviceA.logFood({
      date: '2026-10-05',
      meal_type: 'meal_breakfast',
      food_reference_id: 'food_oatmeal',
      food_name: 'Avena Clásica',
      quantity: 1,
      portion_name: 'Bowl (60g)',
      macros: { calories: 230, protein: 8, carbs: 40, fats: 4 }
    });
    await serviceA.saveSettings({ daily_calorie_target: 2100 });

    // Device A syncs to Google
    await syncDatabaseWithRemote(dbA, providerA);

    // 2. Device B sets up via LocalDBService
    const serviceB = new LocalDBService({
      name: `db_service_B_${Math.random().toString(36).substring(7)}`,
      storage: getRxStorageMemory()
    });
    const dbB = await serviceB.init();
    const providerB = new GoogleDriveSheetsCloudSyncProvider({
      httpClient: backend.httpClient
    });
    await providerB.initialize({ accessToken: 'token-B', userEmail: 'user@gmail.com' });
    serviceB.setCloudSyncProvider(providerB);

    // Device B pulls from Google
    await syncDatabaseWithRemote(dbB, providerB);

    // Verify Device B has Device A's settings and log
    const settingsB = await serviceB.getSettings();
    expect(settingsB.daily_calorie_target).toBe(2100);
    const countsB = await serviceB.getItemCounts();
    expect(countsB.logs).toBe(1);

    // Device B updates logItem using updateLogItem
    await serviceB.updateLogItem(logId, {
      quantity: 2,
      portion_name: '2 Bowls (120g)',
      macros: { calories: 460, protein: 16, carbs: 80, fats: 8 }
    });

    // Device B adds custom food with portions using saveCustomFood
    const customFoodId = await serviceB.saveCustomFood(
      {
        name: 'Mermelada de Frutilla Casera',
        lang: 'es',
        calories_100g: 150,
        protein_100g: 0.5,
        carbs_100g: 36,
        fats_100g: 0.1
      },
      [
        { name: 'Cucharadita (10g)', equivalent_weight_g: 10 },
        { name: 'Cucharada (25g)', equivalent_weight_g: 25 }
      ]
    );

    // Device B syncs to Google
    await syncDatabaseWithRemote(dbB, providerB);

    // 3. User returns to Device A (left open) -> triggers sync
    await syncDatabaseWithRemote(dbA, providerA);

    // Verify Device A now has the updated log quantity and the new custom food
    const countsA = await serviceA.getItemCounts();
    expect(countsA.logs).toBe(1);
    expect(countsA.customFoods).toBe(1);

    const logOnA = await dbA.daily_logs.findOne(logId).exec();
    expect(logOnA.quantity).toBe(2);
    expect(logOnA.macros.calories).toBe(460);

    const customFoodOnA = await dbA.base_ingredients.findOne(customFoodId).exec();
    expect(customFoodOnA).toBeDefined();
    expect(customFoodOnA.name).toBe('Mermelada de Frutilla Casera');

    const portionsOnA = await dbA.portions.find({ selector: { base_food_id: customFoodId } }).exec();
    expect(portionsOnA.length).toBe(2);

    // 4. Device A deletes the custom food using deleteCustomFood
    await serviceA.deleteCustomFood(customFoodId);
    await syncDatabaseWithRemote(dbA, providerA);

    // Device B syncs from Google
    await syncDatabaseWithRemote(dbB, providerB);

    // Verify custom food and its portions are deleted on Device B
    const customFoodOnB = await dbB.base_ingredients.findOne(customFoodId).exec();
    expect(customFoodOnB).toBeNull();
    const portionsOnB = await dbB.portions.find({ selector: { base_food_id: customFoodId } }).exec();
    expect(portionsOnB.length).toBe(0);

    await dbA.remove();
    await dbB.remove();
  });
});
