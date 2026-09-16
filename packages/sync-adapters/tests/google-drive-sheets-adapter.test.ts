import { describe, it, expect, vi } from 'vitest';
import { GoogleDriveSheetsSyncAdapter } from '../src/GoogleDriveSheetsSyncAdapter.js';
import type { GoogleHttpClient } from '../src/google/types.js';

describe('GoogleDriveSheetsSyncAdapter (Integrated Strategy)', () => {
  it('instantiates, initializes with OAuth token, and manages connection state', async () => {
    const adapter = new GoogleDriveSheetsSyncAdapter();
    expect(adapter.id).toBe('google-drive-sheets');
    expect(adapter.getStatus()).toBe('disconnected');
    expect(adapter.isInitialized()).toBe(false);

    await adapter.initialize({ accessToken: 'test-oauth-token', userEmail: 'user@example.com' });
    expect(adapter.isInitialized()).toBe(true);
    expect(adapter.getStatus()).toBe('idle');
    expect(adapter.getConnectedAccount()).toBe('user@example.com');

    await adapter.disconnect();
    expect(adapter.isInitialized()).toBe(false);
    expect(adapter.getStatus()).toBe('disconnected');
  });

  it('orchestrates multi-format sync: JSON settings to appData and separate spreadsheets for Catalog vs Logs', async () => {
    const createdSpreadsheets: { title: string; id: string; tabs: string[] }[] = [];
    const sheetsData = new Map<string, any[][]>();
    let appDataBlob: any = null;

    const mockClient: GoogleHttpClient = {
      fetch: vi.fn(async (url: string, init?: RequestInit) => {
        // AppData Drive search
        if (url.includes('/drive/v3/files?') && url.includes('spaces=appDataFolder')) {
          return new Response(JSON.stringify({ files: appDataBlob ? [{ id: 'appdata_file_id', name: 'settings.json' }] : [] }), { status: 200 });
        }
        // AppData Drive upload
        if (url.includes('/upload/drive/v3/files')) {
          // Parse json from body
          const bodyStr = String(init?.body);
          const parts = bodyStr.split('\r\n\r\n');
          if (parts.length >= 3) {
            appDataBlob = JSON.parse(parts[2].replace(/\r\n--.*$/, ''));
          }
          return new Response(JSON.stringify({ id: 'appdata_file_id', name: 'settings.json' }), { status: 200 });
        }
        // AppData Drive read
        if (url.includes('/drive/v3/files/appdata_file_id?alt=media')) {
          return new Response(JSON.stringify(appDataBlob), { status: 200 });
        }

        // Search Drive for spreadsheets
        if (url.includes('/drive/v3/files?') && url.includes('spreadsheet')) {
          const found = createdSpreadsheets.filter(s => url.includes(encodeURIComponent(s.title)));
          return new Response(JSON.stringify({ files: found.map(s => ({ id: s.id, name: s.title })) }), { status: 200 });
        }

        // Create spreadsheet
        if (url.includes('/v4/spreadsheets') && init?.method === 'POST' && !url.includes('values:batchUpdate')) {
          const body = JSON.parse(String(init?.body));
          const newSheet = {
            title: body.properties.title,
            id: `sheet_${body.properties.title.replace(/\s+/g, '_').toLowerCase()}`,
            tabs: body.sheets.map((s: any) => s.properties.title)
          };
          createdSpreadsheets.push(newSheet);
          return new Response(JSON.stringify({ spreadsheetId: newSheet.id }), { status: 200 });
        }

        // Batch update spreadsheet values
        if (url.includes('/values:batchUpdate') && init?.method === 'POST') {
          const match = url.match(/\/spreadsheets\/([^/]+)\/values:batchUpdate/);
          const sheetId = match ? match[1] : 'unknown';
          const body = JSON.parse(String(init?.body));
          for (const item of body.data) {
            sheetsData.set(`${sheetId}:${item.range}`, item.values);
          }
          return new Response(JSON.stringify({ totalUpdatedRows: 1 }), { status: 200 });
        }

        // Get spreadsheet values
        if (url.includes('/values/') && init?.method === 'GET') {
          const match = url.match(/\/spreadsheets\/([^/]+)\/values\/([^!]+)!/);
          const sheetId = match ? match[1] : '';
          const tab = match ? decodeURIComponent(match[2]) : '';
          const key = `${sheetId}:${tab}!A1:Z`;
          const values = sheetsData.get(key) || [];
          return new Response(JSON.stringify({ values }), { status: 200 });
        }

        return new Response('Not Found', { status: 404 });
      })
    };

    const adapter = new GoogleDriveSheetsSyncAdapter({ httpClient: mockClient });
    await adapter.initialize({ accessToken: 'valid-oauth-token' });

    // 1. Push user settings
    await adapter.push({
      collection: 'user_settings',
      documents: [{ id: 'global_settings', theme: 'system', daily_calorie_target: 2500, custom_macros: { protein: 180, carbs: 250, fats: 80 } }]
    });
    expect(appDataBlob).toBeDefined();
    expect(appDataBlob[0].daily_calorie_target).toBe(2500);

    // 2. Push Catalog food
    await adapter.push({
      collection: 'base_ingredients',
      documents: [
        {
          id: 'custom_apple',
          name: 'Manzana Fuji',
          source: 'custom',
          lang: 'es',
          calories_100g: 52,
          protein_100g: 0.3,
          carbs_100g: 14,
          fats_100g: 0.2
        }
      ]
    });

    // 3. Push Daily Log
    await adapter.push({
      collection: 'daily_logs',
      documents: [
        {
          id: 'log_apple_lunch',
          timestamp: '2026-09-15T13:00:00Z',
          date: '2026-09-15',
          meal_type: 'meal_lunch',
          food_reference_id: 'custom_apple',
          food_name: 'Manzana Fuji',
          quantity: 1,
          portion_name: 'Unidad mediana (150g)',
          macros: { calories: 78, protein: 0.5, carbs: 21, fats: 0.3 }
        }
      ]
    });

    // Verify Catalog and Logs are created as TWO SEPARATE files
    expect(createdSpreadsheets.length).toBe(2);
    const catalogSheet = createdSpreadsheets.find(s => s.title === 'Quomida Food Catalog');
    const logsSheet = createdSpreadsheets.find(s => s.title === 'Quomida Daily Logs');

    expect(catalogSheet).toBeDefined();
    expect(logsSheet).toBeDefined();
    expect(catalogSheet!.id).not.toBe(logsSheet!.id);

    // Verify Catalog tabs
    expect(catalogSheet!.tabs).toContain('base_ingredients');
    expect(catalogSheet!.tabs).toContain('recipes');
    expect(catalogSheet!.tabs).toContain('portions');

    // Verify Logs tab has denormalized column
    const logsKey = `${logsSheet!.id}:daily_logs!A1:Z`;
    const logValues = sheetsData.get(logsKey);
    expect(logValues).toBeDefined();
    expect(logValues!.length).toBe(2); // Header + 1 row
    const row = logValues![1];
    expect(row[12]).toContain('Manzana Fuji');
    expect(row[12]).toContain('78kcal');

    // 4. Pull remote changes
    const pulled = await adapter.pull();
    expect(pulled.length).toBeGreaterThanOrEqual(2);

    const pulledSettings = pulled.find(p => p.collection === 'user_settings');
    expect(pulledSettings!.documents[0].daily_calorie_target).toBe(2500);

    const pulledLogs = pulled.find(p => p.collection === 'daily_logs');
    expect(pulledLogs!.documents[0].food_name).toBe('Manzana Fuji');
    expect(pulledLogs!.documents[0].macros.calories).toBe(78);
  });
});
