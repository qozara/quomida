/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, act, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppProvider, useApp } from '../src/context/AppContext.js';
import { clearLocalDatabase, destroyDatabase, LocalDBService, type QuomidaDatabaseCollections } from '../src/db/rxdb.js';
import { syncDatabaseWithRemote } from '../src/db/replication.js';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { MacroRings } from '../src/components/MacroRings.js';
import { AnalyticsModal } from '../src/components/analytics/AnalyticsModal.js';
import * as CatalogDownloadHook from '../src/hooks/useCatalogDownload.js';
import * as CloudRegistryModule from '../src/cloud-providers/index.js';
import {
  addDaysToDate,
  recalculateEWMAWeightTrend,
  type BaseIngredient,
  type Portion,
  type WeightLog,
  type DailyLog,
  baseIngredientsSchema,
  recipesSchema,
  portionsSchema,
  dailyLogsSchema,
  userSettingsSchema,
  systemMetadataSchema,
  weightLogsSchema
} from '@quomida/domain-core';
import {
  GoogleDriveSheetsCloudSyncProvider,
  type GoogleHttpClient
} from '@quomida/cloud-providers';
import { MockCloudSyncProvider } from '@quomida/cloud-providers/testing';
import { createRxDatabase, addRxPlugin } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';

addRxPlugin(RxDBMigrationSchemaPlugin);

vi.mock('../src/services/DatabaseBootstrapper.js', () => ({
  DatabaseBootstrapper: {
    ensureSystemCatalogOPFS: vi.fn().mockResolvedValue(true),
    removeDownloadedCatalogAndReseed: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
  useGoogleLogin: vi.fn(() => vi.fn())
}));

/**
 * High-fidelity in-memory Mock of Google Cloud Drive v3 & Sheets v4 REST APIs.
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

      // 2. Search Drive for spreadsheets
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

      // 8. Get Spreadsheet metadata
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

      // 9. BatchUpdate spreadsheet (addSheet, etc.)
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

describe('Cloud Sync Multi-Device Adaptive Recalculation & EWMA Healing Test Suite', () => {
  beforeEach(async () => {
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    vi.clearAllMocks();
    vi.spyOn(CatalogDownloadHook, 'useCatalogDownload').mockReturnValue({
      status: 'idle',
      progress: 0,
      error: null,
      isDeleting: false,
      downloadCatalog: vi.fn(),
      deleteCatalog: vi.fn(),
      checkAndTriggerAutoDownload: vi.fn()
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 } as any);
    await clearLocalDatabase();
  });

  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    await destroyDatabase();
  });

  const sampleFood: BaseIngredient = {
    id: 'food_test_cloud',
    name: 'Protein Oatmeal',
    source: 'custom',
    lang: 'en',
    calories_100g: 500,
    protein_100g: 40,
    carbs_100g: 50,
    fats_100g: 10,
    updatedAt: Date.now()
  };

  const samplePortion: Portion = {
    id: 'portion_test_cloud',
    base_food_id: 'food_test_cloud',
    name: 'Standard Portion',
    equivalent_weight_g: 100,
    updatedAt: Date.now()
  };

  it('Test 1: Multi-Device Cloud Sync of Past Weight Logs Recomputes EWMA Tendency & Adaptive Targets', async () => {
    const dbService = new LocalDBService();
    await dbService.init();

    const sharedAdapter = new MockCloudSyncProvider();
    await sharedAdapter.initialize();
    dbService.setCloudSyncProvider(sharedAdapter);

    vi.spyOn(CloudRegistryModule, 'useCloudProviderRegistry').mockReturnValue([
      {
        id: 'mock-sync-adapter',
        name: 'Mock Cloud Connector',
        description: 'Mock',
        iconType: 'custom',
        connect: async () => ({ adapter: sharedAdapter, credentials: {} }),
        restore: async () => sharedAdapter
      }
    ]);

    const today = '2026-10-20';

    // Device A configures Adaptive mode with biometrics & goal
    await dbService.saveSettings({
      target_mode: 'adaptive',
      active_cloud_provider: {
        id: 'mock-sync-adapter',
        credentials: {}
      },
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
        prior_tdee: 2500,
        calibration_status: 'ready',
        last_calibrated_date: '2026-10-10'
      }
    });

    await dbService.saveCustomFood(sampleFood, [samplePortion]);

    // Device A logs Day 1 (2026-10-07) at 80.0 kg and Days 8..14 (2026-10-14..2026-10-20) at 80.0 kg
    await dbService.saveWeightLog({ date: '2026-10-07', weight_kg: 80.0 });
    for (let i = 7; i < 14; i++) {
      const d = addDaysToDate('2026-10-07', i);
      await dbService.saveWeightLog({ date: d, weight_kg: 80.0 });
    }

    // Device A logs 14 days of food at 2100 kcal/day
    for (let i = 0; i < 14; i++) {
      const d = addDaysToDate('2026-10-07', i);
      await dbService.logFood({
        date: d,
        meal_type: 'meal_lunch',
        food_reference_id: 'food_test_cloud',
        food_name: 'Protein Oatmeal',
        quantity: 4.2,
        portion_name: 'Standard Portion',
        macros: { calories: 2100, protein: 168, carbs: 210, fats: 42 }
      });
    }

    // Initial sync pushes Device A's state to cloud
    await syncDatabaseWithRemote(dbService.getDatabaseInstance()!, sharedAdapter);

    // Initial calibration on Device A
    const initialCalibrated = await dbService.runAdaptiveCalibrationIfNeeded(today);
    const initialTdee = initialCalibrated.adaptive_state?.estimated_tdee!;
    const initialTarget = initialCalibrated.daily_calorie_target!;

    // Mount UI on Device A to verify reactive updates across components
    const TestConsumer = () => {
      const {
        userSettings,
        forceSync,
        setIsAnalyticsOpen
      } = useApp();

      return (
        <div>
          <span data-testid="calorie-target">{userSettings.daily_calorie_target}</span>
          <span data-testid="estimated-tdee">{userSettings.adaptive_state?.estimated_tdee}</span>
          <span data-testid="cal-status">{userSettings.adaptive_state?.calibration_status}</span>
          <MacroRings />
          <button data-testid="btn-open-analytics" onClick={() => setIsAnalyticsOpen(true)}>
            Open Analytics
          </button>
          <button data-testid="btn-force-sync" onClick={forceSync}>
            Sync Now
          </button>
          <AnalyticsModal />
        </div>
      );
    };

    render(
      <GoogleOAuthProvider clientId="test-client-id">
        <AppProvider>
          <TestConsumer />
        </AppProvider>
      </GoogleOAuthProvider>
    );

    // Initial assertions before sync
    await waitFor(() => {
      expect(screen.getByTestId('estimated-tdee').textContent).toBe(String(initialTdee));
      expect(screen.getByTestId('calorie-target').textContent).toBe(String(initialTarget));
    });

    // Open analytics modal to verify it reflects live state
    await act(async () => {
      screen.getByTestId('btn-open-analytics').click();
    });

    // Now simulate Device B (or direct remote edit) modifying the remote cloud provider:
    // Device B adds past weights for Days 2..7 (2026-10-08..2026-10-13) at 81.0 kg
    // and modifies Day 1 to 81.5 kg with an intentionally stale/raw trend_weight_kg: 81.5
    const remoteWeightPayload = (await sharedAdapter.pull()).find(p => p.collection === 'weight_logs')!;
    const existingRemoteWeights = new Map(remoteWeightPayload.documents.map(d => [d.id, d]));

    // Edit Day 1
    existingRemoteWeights.set('weight_2026-10-07', {
      id: 'weight_2026-10-07',
      date: '2026-10-07',
      timestamp: '2026-10-07T08:00:00.000Z',
      weight_kg: 81.5,
      trend_weight_kg: 81.5, // stale/un-healed
      updatedAt: Date.now() + 5000
    });

    // Add Days 2..7 (with stale trend_weight_kg = weight_kg, simulating remote edits without full EWMA run)
    for (let i = 1; i <= 6; i++) {
      const d = addDaysToDate('2026-10-07', i);
      existingRemoteWeights.set(`weight_${d}`, {
        id: `weight_${d}`,
        date: d,
        timestamp: `${d}T08:00:00.000Z`,
        weight_kg: 81.0,
        trend_weight_kg: 81.0,
        updatedAt: Date.now() + 5000
      });
    }

    // Push Device B's changes to the shared remote provider
    await sharedAdapter.push({
      collection: 'weight_logs',
      documents: Array.from(existingRemoteWeights.values())
    });

    // Now trigger sync on Device A
    await act(async () => {
      screen.getByTestId('btn-force-sync').click();
    });

    // 1. Verify all 14 weight_logs on Device A are chronologically recalculated with EWMA
    const finalLocalWeights = await dbService.getWeightLogs();
    expect(finalLocalWeights.length).toBe(14);
    const expectedEWMA = recalculateEWMAWeightTrend(finalLocalWeights);
    for (let i = 0; i < finalLocalWeights.length; i++) {
      expect(finalLocalWeights[i].trend_weight_kg).toBeCloseTo(expectedEWMA[i].trend_weight_kg, 4);
    }

    // 2. Verify healed weight logs were pushed back to remote provider
    const remotePulled = await sharedAdapter.pull();
    const remoteWeights = remotePulled.find(p => p.collection === 'weight_logs')?.documents || [];
    expect(remoteWeights.length).toBe(14);
    const day14Remote = remoteWeights.find((d: any) => d.date === '2026-10-20');
    expect(day14Remote).toBeDefined();
    expect(day14Remote!.trend_weight_kg).toBeCloseTo(expectedEWMA[13].trend_weight_kg, 4);

    // 3. Verify adaptive expenditure and targets recalculated
    // The user lost weight from 81.5 kg / 81.0 kg down to 80.0 kg over 14 days with 2100 kcal intake
    // So the new TDEE should be higher than initial flat-weight TDEE!
    await waitFor(() => {
      const updatedTdee = Number(screen.getByTestId('estimated-tdee').textContent);
      const updatedTarget = Number(screen.getByTestId('calorie-target').textContent);
      expect(updatedTdee).toBeGreaterThan(initialTdee);
      expect(updatedTarget).toBeGreaterThan(initialTarget);
    });

    // 4. Verify AnalyticsModal displays compliance 14/10 and updated TDEE
    const toggleBtn1 = await screen.findByTestId('btn-toggle-calibration-details');
    fireEvent.click(toggleBtn1);

    await waitFor(() => {
      expect(screen.getByText(/14\/10/i)).toBeDefined();
      expect(screen.getAllByText(new RegExp(`${Math.round(expectedEWMA[13].trend_weight_kg)}`, 'i')).length).toBeGreaterThan(0);
    });
  });

  it('Test 2: Remote Edition/Deletion of Past Food Logs on Another Device Updates Local Adaptive Targets & Analytics', async () => {
    const dbService = new LocalDBService();
    await dbService.init();

    const sharedAdapter = new MockCloudSyncProvider();
    await sharedAdapter.initialize();
    dbService.setCloudSyncProvider(sharedAdapter);

    vi.spyOn(CloudRegistryModule, 'useCloudProviderRegistry').mockReturnValue([
      {
        id: 'mock-sync-adapter',
        name: 'Mock Cloud Connector',
        description: 'Mock',
        iconType: 'custom',
        connect: async () => ({ adapter: sharedAdapter, credentials: {} }),
        restore: async () => sharedAdapter
      }
    ]);

    const today = '2026-10-20';

    await dbService.saveSettings({
      target_mode: 'adaptive',
      active_cloud_provider: {
        id: 'mock-sync-adapter',
        credentials: {}
      },
      biometrics: {
        sex: 'female',
        birth_date: '1998-02-10',
        height_cm: 165,
        activity_multiplier: 1.4
      },
      goal_config: {
        goal_type: 'maintain',
        weekly_rate_pct: 0,
        protein_g_per_kg: 1.8,
        fat_calorie_pct: 0.25
      },
      adaptive_state: {
        estimated_tdee: 2000,
        prior_tdee: 2000,
        calibration_status: 'ready',
        last_calibrated_date: '2026-10-10'
      }
    });

    await dbService.saveCustomFood(sampleFood, [samplePortion]);

    // 14 days of weights at 65.0 kg
    for (let i = 0; i < 14; i++) {
      const d = addDaysToDate('2026-10-07', i);
      await dbService.saveWeightLog({ date: d, weight_kg: 65.0 });
    }

    // 14 days of food at 1800 kcal
    for (let i = 0; i < 14; i++) {
      const d = addDaysToDate('2026-10-07', i);
      await dbService.logFood({
        date: d,
        meal_type: 'meal_lunch',
        food_reference_id: 'food_test_cloud',
        food_name: 'Protein Oatmeal',
        quantity: 3.6,
        portion_name: 'Standard Portion',
        macros: { calories: 1800, protein: 144, carbs: 180, fats: 36 }
      });
    }

    // Initial sync
    await syncDatabaseWithRemote(dbService.getDatabaseInstance()!, sharedAdapter);

    const initialCalibrated = await dbService.runAdaptiveCalibrationIfNeeded(today);
    const initialTdee = initialCalibrated.adaptive_state?.estimated_tdee!;

    const TestConsumer = () => {
      const {
        userSettings,
        forceSync,
        setIsAnalyticsOpen
      } = useApp();

      return (
        <div>
          <span data-testid="calorie-target">{userSettings.daily_calorie_target}</span>
          <span data-testid="estimated-tdee">{userSettings.adaptive_state?.estimated_tdee}</span>
          <span data-testid="cal-status">{userSettings.adaptive_state?.calibration_status}</span>
          <MacroRings />
          <button data-testid="btn-open-analytics" onClick={() => setIsAnalyticsOpen(true)}>
            Open Analytics
          </button>
          <button data-testid="btn-force-sync" onClick={forceSync}>
            Sync Now
          </button>
          <AnalyticsModal />
        </div>
      );
    };

    render(
      <GoogleOAuthProvider clientId="test-client-id">
        <AppProvider>
          <TestConsumer />
        </AppProvider>
      </GoogleOAuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('estimated-tdee').textContent).toBe(String(initialTdee));
    });

    await act(async () => {
      screen.getByTestId('btn-open-analytics').click();
    });

    // Remote Device B modifies past food logs: increases 10 past days by +800 kcal each!
    const remoteFoodPayload = (await sharedAdapter.pull()).find(p => p.collection === 'daily_logs')!;
    const remoteDocs = remoteFoodPayload.documents.map((d: any) => {
      // Modify dates between 2026-10-08 and 2026-10-17
      if (d.date >= '2026-10-08' && d.date <= '2026-10-17') {
        return {
          ...d,
          macros: {
            ...d.macros,
            calories: d.macros.calories + 800
          },
          updatedAt: Date.now() + 10000
        };
      }
      return d;
    });

    await sharedAdapter.push({
      collection: 'daily_logs',
      documents: remoteDocs
    });

    // Device A runs sync while on 2026-10-20
    await act(async () => {
      screen.getByTestId('btn-force-sync').click();
    });

    // Local TDEE must immediately recompute upwards because higher past calorie intake with stable weight = higher TDEE!
    await waitFor(() => {
      const updatedTdee = Number(screen.getByTestId('estimated-tdee').textContent);
      expect(updatedTdee).toBeGreaterThan(initialTdee);
    });

    // Now test deletion: Remote Device B deletes 6 food logs (leaving only 8 qualifying days, < 10)
    const logsToDelete = remoteDocs.slice(0, 6).map((d: any) => ({
      ...d,
      _deleted: true,
      updatedAt: Date.now() + 20000
    }));

    await sharedAdapter.push({
      collection: 'daily_logs',
      documents: logsToDelete
    });

    // Device A syncs again
    await act(async () => {
      screen.getByTestId('btn-force-sync').click();
    });

    // Device A should now drop out of calibration ('collecting_data') because < 10 qualifying food days
    await waitFor(() => {
      expect(screen.getByTestId('cal-status').textContent).toBe('collecting_data');
    });

    // Verify AnalyticsModal reflects the dropped count (8/10)
    const toggleBtn2 = await screen.findByTestId('btn-toggle-calibration-details');
    fireEvent.click(toggleBtn2);

    await waitFor(() => {
      expect(screen.getByText(/8\/10/i)).toBeDefined();
    });
  });

  it('Test 3: Google Sheets Tabular Sync End-to-End with GoogleDriveSheetsCloudSyncProvider', async () => {
    const backend = createMockGoogleCloudBackend();

    const dbService = new LocalDBService();
    await dbService.init();

    const googleProvider = new GoogleDriveSheetsCloudSyncProvider({
      httpClient: backend.httpClient
    });

    await googleProvider.initialize({
      accessToken: 'token-device-a',
      userEmail: 'quomida-user@gmail.com'
    });

    dbService.setCloudSyncProvider(googleProvider);

    // Initial setup on Device A
    await dbService.saveSettings({
      target_mode: 'adaptive',
      biometrics: {
        sex: 'male',
        birth_date: '1990-01-01',
        height_cm: 175,
        activity_multiplier: 1.55
      },
      goal_config: {
        goal_type: 'lose',
        weekly_rate_pct: -0.5,
        protein_g_per_kg: 2.0,
        fat_calorie_pct: 0.25
      },
      adaptive_state: {
        estimated_tdee: 2400,
        prior_tdee: 2400,
        calibration_status: 'ready',
        last_calibrated_date: '2026-10-10'
      }
    });

    // Log 14 days of weights at 75.0 kg
    for (let i = 0; i < 14; i++) {
      const d = addDaysToDate('2026-10-07', i);
      await dbService.saveWeightLog({ date: d, weight_kg: 75.0 });
    }

    // Log 14 days of food at 2000 kcal
    for (let i = 0; i < 14; i++) {
      const d = addDaysToDate('2026-10-07', i);
      await dbService.logFood({
        date: d,
        meal_type: 'meal_lunch',
        food_reference_id: 'food_test_cloud',
        food_name: 'Protein Oatmeal',
        quantity: 4,
        portion_name: 'Standard Portion',
        macros: { calories: 2000, protein: 160, carbs: 200, fats: 40 }
      });
    }

    // Push initial data to Google Drive & Sheets
    await syncDatabaseWithRemote(dbService.getDatabaseInstance()!, googleProvider);

    // Verify backend received the spreadsheet and appData settings
    expect(backend.files.size).toBeGreaterThanOrEqual(2);

    // Locate the daily logs spreadsheet
    const logsSheet = Array.from(backend.files.values()).find(
      f => f.appProperties?.quomida_doc_type === 'daily_logs' || f.name.includes('Quomida Daily Logs')
    );
    expect(logsSheet).toBeDefined();
    expect(logsSheet!.tabs?.has('weight_logs')).toBe(true);

    // Directly mutate rows in the Google Sheet's 'weight_logs' tab (as if edited by user in Google Sheets UI):
    // Change Day 1 weight to 77.0 kg with stale trend_weight_kg: 0
    const weightTabRows = logsSheet!.tabs!.get('weight_logs')!;
    expect(weightTabRows.length).toBeGreaterThan(1); // Header + 14 rows

    // Find row with date 2026-10-07 (Row values: id, date, timestamp, weight_kg, trend_weight_kg, note, updatedAt, _deleted)
    for (let r = 1; r < weightTabRows.length; r++) {
      if (weightTabRows[r][1] === '2026-10-07') {
        weightTabRows[r][3] = 77.0; // weight_kg
        weightTabRows[r][4] = 0; // stale trend_weight_kg
        weightTabRows[r][6] = Date.now() + 50000; // newer updatedAt
      }
    }

    // Now execute sync on Device A
    await syncDatabaseWithRemote(dbService.getDatabaseInstance()!, googleProvider);

    // 1. Verify Device A pulled the edit from Google Sheets
    const localWeights = await dbService.getWeightLogs();
    const day1Local = localWeights.find(w => w.date === '2026-10-07');
    expect(day1Local?.weight_kg).toBe(77.0);

    // 2. Verify all trend_weight_kg values were healed locally across all 14 days
    const expectedTrend = recalculateEWMAWeightTrend(localWeights);
    for (let i = 0; i < localWeights.length; i++) {
      expect(localWeights[i].trend_weight_kg).toBeCloseTo(expectedTrend[i].trend_weight_kg, 4);
      expect(localWeights[i].trend_weight_kg).not.toBe(0);
    }

    // 3. Verify healed trend_weight_kg was pushed back to Google Sheets
    const updatedWeightTabRows = logsSheet!.tabs!.get('weight_logs')!;
    const day1SheetRow = updatedWeightTabRows.find(r => r[1] === '2026-10-07');
    expect(day1SheetRow).toBeDefined();
    expect(Number(day1SheetRow![4])).toBeCloseTo(expectedTrend[0].trend_weight_kg, 4);

    // 4. Verify user_settings was recalibrated and pushed back to Google Drive appData
    const settingsFile = Array.from(backend.files.values()).find(
      f => f.spaces?.includes('appDataFolder') && f.name === 'settings.json'
    );
    expect(settingsFile).toBeDefined();
    expect(settingsFile!.content).toBeDefined();
    const settingsDoc = Array.isArray(settingsFile!.content)
      ? settingsFile!.content[0]
      : settingsFile!.content;
    expect(settingsDoc.adaptive_state?.estimated_tdee).toBeGreaterThan(2400);
  });
});
