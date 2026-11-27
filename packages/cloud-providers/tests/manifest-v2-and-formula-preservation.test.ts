import { describe, it, expect } from 'vitest';
import { MANIFEST_KEYS, QOZARA_MANIFEST_VERSION, SchemaEngine } from '@qozara/cloud-sync';
import { GoogleSheetsContainerDriver } from '@qozara/cloud-sync-google';
import {
  dailyLogsSerializer,
  baseIngredientsSerializer,
  recipesSerializer,
  portionsSerializer,
  weightLogsSerializer,
} from '../src/strategy/serializers.js';
import {
  dailyLogsMigrations,
  QuomidaDailyLogsSpreadsheetSchema,
  QuomidaFoodCatalogSpreadsheetSchema,
  ValidationService,
  ValidationStatus,
  UnmanagedDocumentError,
  ForeignDocumentError,
} from '../src/google/index.js';

describe('Quomida v2 Canonical Manifest & Formula-Preserving Serializers', () => {
  it('defines version 2 with identity for daily_logs and food_catalog schemas', () => {
    expect(QuomidaDailyLogsSpreadsheetSchema.version).toBe(2);
    expect(QuomidaDailyLogsSpreadsheetSchema.identity?.appId).toBe('quomida');
    expect(QuomidaDailyLogsSpreadsheetSchema.identity?.docType).toBe('daily_logs');

    expect(QuomidaFoodCatalogSpreadsheetSchema.version).toBe(2);
    expect(QuomidaFoodCatalogSpreadsheetSchema.identity?.appId).toBe('quomida');
    expect(QuomidaFoodCatalogSpreadsheetSchema.identity?.docType).toBe('food_catalog');
  });

  it('migrates legacy v1 Quomida sheet (_quomida_meta) to canonical _meta without deleting legacy tab', async () => {
    const sheets = [
      { properties: { title: 'daily_logs', sheetId: 1, gridProperties: { columnCount: 15 } } },
      { properties: { title: 'weight_logs', sheetId: 2, gridProperties: { columnCount: 8 } } },
      { properties: { title: '_quomida_meta', sheetId: 3, gridProperties: { columnCount: 3 } } },
    ];
    const cellData = new Map<string, any[][]>([
      ['daily_logs', [QuomidaDailyLogsSpreadsheetSchema.tabs[0].columns.map((c) => c.name)]],
      ['weight_logs', [QuomidaDailyLogsSpreadsheetSchema.tabs[1].columns.map((c) => c.name)]],
      [
        '_quomida_meta',
        [
          ['key', 'value', 'updatedAt'],
          ['custom_note', 'keep-me', '2026-09-01T00:00:00Z'],
        ],
      ],
    ]);

    const fakeClient: any = {
      getFileMetadata: async () => ({
        properties: { quomida_doc_type: 'daily_logs' },
        appProperties: { quomida_doc_type: 'daily_logs', quomida_schema_version: '1' },
        modifiedTime: '2026-11-27T00:00:00Z',
      }),
      updateFileProperties: async () => ({}),
      getSpreadsheetMetadata: async () => ({ properties: { title: 'Quomida Daily Logs' }, sheets }),
      getSpreadsheet: async () => ({ properties: { title: 'Quomida Daily Logs' }, sheets }),
      createBackup: async (id: string) => `backup-${id}`,
      deleteBackup: async () => ({}),
      acquireLock: async () => true,
      releaseLock: async () => true,
      batchGet: async (_id: string, ranges: string[]) => ({
        valueRanges: ranges.map((range) => {
          const tab = range.split('!')[0].replace(/^'|'$/g, '');
          return { values: cellData.get(tab) || [] };
        }),
      }),
      batchUpdateValues: async (_id: string, data: Array<{ range: string; values: any[][] }>) => {
        for (const item of data) {
          const tab = item.range.split('!')[0].replace(/^'|'$/g, '');
          cellData.set(tab, item.values);
        }
        return {};
      },
      batchUpdate: async (_id: string, requests: any[]) => {
        const replies: any[] = [];
        for (const req of requests) {
          if (req.addSheet) {
            const sheetId = sheets.length + 1;
            sheets.push({
              properties: { ...req.addSheet.properties, sheetId, gridProperties: { columnCount: 10 } },
            });
            cellData.set(req.addSheet.properties.title, []);
            replies.push({ addSheet: { properties: { sheetId, title: req.addSheet.properties.title } } });
          } else if (req.appendCells) {
            const target = sheets.find((s) => s.properties.sheetId === req.appendCells.sheetId);
            if (target) {
              const rows = cellData.get(target.properties.title) || [];
              for (const r of req.appendCells.rows || []) {
                rows.push((r.values || []).map((v: any) => v.userEnteredValue?.stringValue ?? ''));
              }
              cellData.set(target.properties.title, rows);
            }
          }
        }
        return { replies };
      },
    };

    const engine = new SchemaEngine(new GoogleSheetsContainerDriver(fakeClient));
    const preHealth = await engine.checkHealth('sheet-daily-1', QuomidaDailyLogsSpreadsheetSchema);
    expect(preHealth.status).toBe(ValidationStatus.UPGRADE_REQUIRED);

    await engine.migrate('sheet-daily-1', QuomidaDailyLogsSpreadsheetSchema, dailyLogsMigrations);

    // _quomida_meta preserved
    expect(cellData.get('_quomida_meta')).toHaveLength(2);

    // Canonical _meta stamped
    const metaRows = cellData.get('_meta') || [];
    const metaMap = Object.fromEntries(metaRows.slice(1).map((r) => [r[0], r[1]]));
    expect(metaMap[MANIFEST_KEYS.MANIFEST_VERSION]).toBe(QOZARA_MANIFEST_VERSION);
    expect(metaMap[MANIFEST_KEYS.APP_ID]).toBe('quomida');
    expect(metaMap[MANIFEST_KEYS.DOC_TYPE]).toBe('daily_logs');
    expect(metaMap[MANIFEST_KEYS.SCHEMA_VERSION]).toBe('2');
    expect(metaMap[MANIFEST_KEYS.ORIGIN_CONTAINER_ID]).toBe('sheet-daily-1');
    expect(metaMap.custom_note).toBe('keep-me');

    const postHealth = await engine.checkHealth('sheet-daily-1', QuomidaDailyLogsSpreadsheetSchema);
    expect(postHealth.status).toBe(ValidationStatus.READY);
  });

  it('rejects UNMANAGED and FOREIGN_APP spreadsheets cleanly via ValidationService', async () => {
    const unmanagedHttp: any = {
      fetch: async (url: string) => {
        if (url.includes('/drive/v3/files/')) {
          return new Response(JSON.stringify({ properties: {}, appProperties: {} }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ sheets: [{ properties: { title: 'RandomTab', sheetId: 1 } }] }),
          { status: 200 }
        );
      },
    };
    const svcUnmanaged = new ValidationService(() => 'tok', unmanagedHttp);
    const unmanagedHealth = await svcUnmanaged.checkHealth('random-doc', QuomidaDailyLogsSpreadsheetSchema);
    expect(unmanagedHealth.status).toBe(ValidationStatus.UNMANAGED);
    await expect(
      svcUnmanaged.repairFile('random-doc', QuomidaDailyLogsSpreadsheetSchema)
    ).rejects.toThrow(UnmanagedDocumentError);

    const foreignHttp: any = {
      fetch: async (url: string) => {
        if (url.includes('/drive/v3/files/')) {
          return new Response(JSON.stringify({ properties: {}, appProperties: {} }), { status: 200 });
        }
        if (url.includes('/values:batchGet')) {
          return new Response(
            JSON.stringify({
              valueRanges: [
                {
                  values: [
                    ['key', 'value', 'updatedAt'],
                    ['app_id', 'quozen', '2026-11-27T00:00:00Z'],
                    ['doc_type', 'group', '2026-11-27T00:00:00Z'],
                  ],
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({ sheets: [{ properties: { title: '_meta', sheetId: 1 } }] }),
          { status: 200 }
        );
      },
    };
    const svcForeign = new ValidationService(() => 'tok', foreignHttp);
    const foreignHealth = await svcForeign.checkHealth('quozen-doc', QuomidaDailyLogsSpreadsheetSchema);
    expect(foreignHealth.status).toBe(ValidationStatus.FOREIGN_APP);
    expect(foreignHealth.detectedAppId).toBe('quozen');
    await expect(
      svcForeign.migrateFile('quozen-doc', QuomidaDailyLogsSpreadsheetSchema, dailyLogsMigrations)
    ).rejects.toThrow(ForeignDocumentError);
  });

  it('maps reordered live headers and leaves user-added formula columns undefined across all 5 serializers', () => {
    const dailyRow = dailyLogsSerializer.docToRow(
      {
        id: 'dl-1',
        timestamp: '2026-11-27T12:00:00Z',
        date: '2026-11-27',
        meal_type: 'meal_lunch',
        food_reference_id: 'f-1',
        food_name: 'Rice',
        quantity: 2,
        portion_name: '100g',
        macros: { calories: 260, protein: 5, carbs: 56, fats: 1 },
        updatedAt: 1000,
        _deleted: false,
      },
      ['date', 'UserFormulaCol', 'calories', 'id']
    );
    expect(dailyRow.values).toEqual(['2026-11-27', undefined, 260, 'dl-1']);

    const ingRow = baseIngredientsSerializer.docToRow(
      {
        id: 'bi-1',
        name: 'Oats',
        source: 'custom',
        lang: 'en',
        calories_100g: 389,
        protein_100g: 17,
        carbs_100g: 66,
        fats_100g: 7,
        updatedAt: 2000,
        _deleted: false,
      },
      ['name', 'CostFormula', 'id']
    );
    expect(ingRow.values).toEqual(['Oats', undefined, 'bi-1']);

    const recRow = recipesSerializer.docToRow(
      { id: 'r-1', name: 'Stew', ingredients: [{ id: 'bi-1', grams: 100 }], yield_factor: 0.9, updatedAt: 3000, _deleted: false },
      ['name', 'TotalMacroFormula', 'yield_factor', 'id']
    );
    expect(recRow.values).toEqual(['Stew', undefined, 0.9, 'r-1']);

    const porRow = portionsSerializer.docToRow(
      { id: 'p-1', base_food_id: 'bi-1', name: 'Cup', equivalent_weight_g: 80, updatedAt: 4000, _deleted: false },
      ['equivalent_weight_g', 'UserUnitFormula', 'id']
    );
    expect(porRow.values).toEqual([80, undefined, 'p-1']);

    const weightRow = weightLogsSerializer.docToRow(
      {
        id: 'w-1',
        date: '2026-11-27',
        timestamp: '2026-11-27T08:00:00Z',
        weight_kg: 72.5,
        trend_weight_kg: 72.8,
        note: 'Morning',
        updatedAt: 5000,
        _deleted: false,
      },
      ['weight_kg', 'MovingAvgFormula', 'date', 'id']
    );
    expect(weightRow.values).toEqual([72.5, undefined, '2026-11-27', 'w-1']);
  });
});
