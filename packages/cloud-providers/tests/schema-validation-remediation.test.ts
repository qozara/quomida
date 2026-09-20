import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dailyLogsSerializer, baseIngredientsSerializer } from '../src/strategy/serializers.js';
import { GoogleSheetsTabularDriver } from '../src/google/GoogleSheetsTabularDriver.js';
import { ValidationService, ValidationStatus } from '../src/google/ValidationService.js';
import { QuomidaDailyLogsSpreadsheetSchema, QuomidaFoodCatalogSpreadsheetSchema } from '../src/google/schemas.js';
import { CompositeCloudSyncProvider } from '../src/strategy/CompositeCloudSyncProvider.js';
import type { GoogleHttpClient } from '../src/google/types.js';

describe('Dynamic Header Mapping in Serializers', () => {
  it('correctly maps daily_logs doc fields when columns are in standard order', () => {
    const headers = dailyLogsSerializer.headers;
    const row = {
      id: 'log-123',
      headers,
      values: [
        'log-123',
        '2026-09-18T12:00:00Z',
        '2026-09-18',
        'meal_lunch',
        'food-456',
        'Manzana',
        2,
        '100g',
        104,
        0.5,
        28,
        0.3,
        'Manzana | 104kcal',
        1726660000000,
        false
      ]
    };

    const doc = dailyLogsSerializer.rowToDoc(row);
    expect(doc.id).toBe('log-123');
    expect(doc.timestamp).toBe('2026-09-18T12:00:00Z');
    expect(doc.date).toBe('2026-09-18');
    expect(doc.meal_type).toBe('meal_lunch');
    expect(doc.food_reference_id).toBe('food-456');
    expect(doc.food_name).toBe('Manzana');
    expect(doc.quantity).toBe(2);
    expect(doc.portion_name).toBe('100g');
    expect(doc.macros.calories).toBe(104);
    expect(doc.macros.protein).toBe(0.5);
    expect(doc.macros.carbs).toBe(28);
    expect(doc.macros.fats).toBe(0.3);
    expect(doc.updatedAt).toBe(1726660000000);
    expect(doc._deleted).toBe(false);
  });

  it('correctly maps daily_logs doc fields when user reorders columns in Google Sheets', () => {
    // Simulated user reordered columns: date first, then calories, then id, etc.
    const reorderedHeaders = [
      'date',
      'calories',
      'id',
      'timestamp',
      'food_name',
      'quantity',
      'portion_name',
      'meal_type',
      'protein',
      'carbs',
      'fats',
      'food_reference_id',
      'food_details_readonly',
      '_deleted',
      'updatedAt'
    ];

    const row = {
      id: 'log-reordered',
      headers: reorderedHeaders,
      values: [
        '2026-09-19',             // date
        520,                      // calories
        'log-reordered',          // id
        '2026-09-19T08:30:00Z',    // timestamp
        'Avena con Leche',        // food_name
        1.5,                      // quantity
        'taza',                   // portion_name
        'meal_breakfast',         // meal_type
        18,                       // protein
        75,                       // carbs
        12,                       // fats
        'food-avena-1',           // food_reference_id
        'Avena | 520kcal',        // food_details_readonly
        false,                    // _deleted
        1726700000000             // updatedAt
      ]
    };

    const doc = dailyLogsSerializer.rowToDoc(row);
    expect(doc.id).toBe('log-reordered');
    expect(doc.date).toBe('2026-09-19');
    expect(doc.timestamp).toBe('2026-09-19T08:30:00Z');
    expect(doc.meal_type).toBe('meal_breakfast');
    expect(doc.food_reference_id).toBe('food-avena-1');
    expect(doc.food_name).toBe('Avena con Leche');
    expect(doc.quantity).toBe(1.5);
    expect(doc.portion_name).toBe('taza');
    expect(doc.macros.calories).toBe(520);
    expect(doc.macros.protein).toBe(18);
    expect(doc.macros.carbs).toBe(75);
    expect(doc.macros.fats).toBe(12);
    expect(doc.updatedAt).toBe(1726700000000);
    expect(doc._deleted).toBe(false);
  });

  it('correctly maps base_ingredients doc fields when columns are reordered', () => {
    const reorderedHeaders = [
      'name',
      'fats_100g',
      'id',
      'protein_100g',
      'calories_100g',
      'carbs_100g',
      'source',
      'lang',
      '_deleted',
      'updatedAt'
    ];

    const row = {
      id: 'ing-100',
      headers: reorderedHeaders,
      values: [
        'Huevo duro',
        10.6,
        'ing-100',
        12.6,
        155,
        1.1,
        'custom',
        'es',
        false,
        1726705000000
      ]
    };

    const doc = baseIngredientsSerializer.rowToDoc(row);
    expect(doc.id).toBe('ing-100');
    expect(doc.name).toBe('Huevo duro');
    expect(doc.calories_100g).toBe(155);
    expect(doc.protein_100g).toBe(12.6);
    expect(doc.carbs_100g).toBe(1.1);
    expect(doc.fats_100g).toBe(10.6);
    expect(doc.source).toBe('custom');
    expect(doc.lang).toBe('es');
    expect(doc.updatedAt).toBe(1726705000000);
    expect(doc._deleted).toBe(false);
  });
});

describe('Google ValidationService & Repair Strategy', () => {
  let mockHttpClient: GoogleHttpClient;
  let calls: { url: string; method?: string; body?: any }[];

  beforeEach(() => {
    calls = [];
  });

  it('detects corrupted status when columns are missing', async () => {
    mockHttpClient = {
      fetch: vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method, body: init?.body });

        if (url.includes('/drive/v3/files/sheet_logs?fields=')) {
          return new Response(JSON.stringify({
            modifiedTime: '2026-09-18T20:00:00Z',
            appProperties: { quomida_schema_version: '1' }
          }), { status: 200 });
        }

        if (url.includes('/v4/spreadsheets/sheet_logs') && !url.includes('/values/')) {
          return new Response(JSON.stringify({
            sheets: [{ properties: { title: 'daily_logs', sheetId: 0 } }]
          }), { status: 200 });
        }

        if (url.includes('/values:batchGet')) {
          // Missing 'calories' and 'meal_type' columns
          return new Response(JSON.stringify({
            valueRanges: [
              {
                range: 'daily_logs!1:1',
                values: [['id', 'timestamp', 'date', 'food_reference_id', 'quantity']]
              }
            ]
          }), { status: 200 });
        }

        return new Response('Not Found', { status: 404 });
      })
    };

    const validationService = new ValidationService(() => 'test-token', mockHttpClient);
    const health = await validationService.checkHealth('sheet_logs', QuomidaDailyLogsSpreadsheetSchema);

    expect(health.status).toBe(ValidationStatus.CORRUPTED);
    expect(health.valid).toBe(false);
    expect(health.missingColumns['daily_logs']).toContain('calories');
    expect(health.missingColumns['daily_logs']).toContain('meal_type');
  });

  it('repairs missing columns non-destructively after creating a backup', async () => {
    let backupCreated = false;
    let appendedColumnsCount = 0;
    let newColumnNames: string[] = [];

    mockHttpClient = {
      fetch: vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method, body: init?.body });

        // Backup creation: POST /drive/v3/files/<id>/copy
        if (url.includes('/drive/v3/files/sheet_logs/copy') && init?.method === 'POST') {
          backupCreated = true;
          return new Response(JSON.stringify({ id: 'backup_sheet_logs_copy_1' }), { status: 200 });
        }

        if (url.includes('/drive/v3/files/sheet_logs?fields=')) {
          return new Response(JSON.stringify({
            modifiedTime: '2026-09-18T20:00:00Z',
            appProperties: { quomida_schema_version: '1' }
          }), { status: 200 });
        }

        if (url.includes('/v4/spreadsheets/sheet_logs') && !url.includes('/values')) {
          if (init?.method === 'POST' && url.includes(':batchUpdate')) {
            const body = JSON.parse(init.body);
            for (const req of body.requests) {
              if (req.appendDimension) {
                appendedColumnsCount += req.appendDimension.length;
              }
              if (req.updateCells) {
                for (const r of req.updateCells.rows) {
                  for (const v of r.values) {
                    if (v.userEnteredValue?.stringValue) {
                      newColumnNames.push(v.userEnteredValue.stringValue);
                    }
                  }
                }
              }
            }
            return new Response(JSON.stringify({}), { status: 200 });
          }

          return new Response(JSON.stringify({
            sheets: [{ properties: { title: 'daily_logs', sheetId: 0 } }]
          }), { status: 200 });
        }

        if (url.includes('/values:batchGet')) {
          // Missing 'calories'
          const existingHeaders = QuomidaDailyLogsSpreadsheetSchema.tabs[0].columns
            .map(c => c.name)
            .filter(name => name !== 'calories');

          return new Response(JSON.stringify({
            valueRanges: [
              {
                range: 'daily_logs!1:1',
                values: [existingHeaders]
              }
            ]
          }), { status: 200 });
        }

        if (url.includes('/drive/v3/files/sheet_logs') && init?.method === 'PATCH') {
          return new Response(JSON.stringify({}), { status: 200 });
        }

        return new Response('OK', { status: 200 });
      })
    };

    const validationService = new ValidationService(() => 'test-token', mockHttpClient);
    const result = await validationService.repairFile('sheet_logs', QuomidaDailyLogsSpreadsheetSchema);

    expect(backupCreated).toBe(true);
    expect(result.backupFileId).toBe('backup_sheet_logs_copy_1');
    expect(appendedColumnsCount).toBe(1);
    expect(newColumnNames).toContain('calories');
  });

  it('enforces OCC when repairing: throws if expectedLastModified is stale', async () => {
    mockHttpClient = {
      fetch: vi.fn(async (url: string) => {
        if (url.includes('/drive/v3/files/sheet_logs')) {
          return new Response(JSON.stringify({
            modifiedTime: '2026-09-18T22:00:00Z', // newer than expected
            appProperties: {}
          }), { status: 200 });
        }
        return new Response('OK', { status: 200 });
      })
    };

    const validationService = new ValidationService(() => 'test-token', mockHttpClient);
    await expect(
      validationService.repairFile('sheet_logs', QuomidaDailyLogsSpreadsheetSchema, '2026-09-18T20:00:00Z')
    ).rejects.toThrow(/modified|conflict/i);
  });
});

describe('CompositeCloudSyncProvider with Schema Remediation', () => {
  it('suspends sync when status is corrupted, and allows repair', async () => {
    let repairCalled = false;

    const mockTabularDriver = {
      id: 'mock-tabular',
      name: 'Mock Tabular Driver',
      ensureDocument: vi.fn(async () => 'sheet_mock'),
      readTable: vi.fn(async () => {
        throw new Error('Schema corruption: missing required column "calories"');
      }),
      writeTable: vi.fn(async () => {}),
      repairTable: vi.fn(async () => {
        repairCalled = true;
      })
    };

    const adapter = new CompositeCloudSyncProvider({
      id: 'test-adapter',
      name: 'Test Adapter',
      tabularDriver: mockTabularDriver as any,
      routes: {
        daily_logs: {
          target: 'tabular',
          documentKey: 'logs',
          documentTitle: 'Quomida Daily Logs',
          tabName: 'daily_logs'
        }
      }
    });

    await adapter.initialize();

    // Pull triggers schema corruption
    try {
      await adapter.pull();
    } catch {
      // expected
    }

    // Status enters corrupted
    adapter.setCorruptedStatus();
    expect(adapter.getStatus()).toBe('corrupted');

    // Attempting push while corrupted is rejected / suspended
    await expect(adapter.push({
      collection: 'daily_logs',
      documents: [{ id: '1' }]
    })).rejects.toThrow(/suspended|corrupt/i);

    // Call generic repair()
    await adapter.repair();
    expect(repairCalled).toBe(true);
    expect(adapter.getStatus()).toBe('idle');
  });
});
