import { describe, it, expect, vi } from 'vitest';
import {
  GoogleDriveBlobDriver,
  GoogleSheetsTabularDriver,
  GOOGLE_DRIVE_SCOPES,
  type GoogleHttpClient
} from '../src/google/index.js';

describe('Google OAuth & Driver Configurations', () => {
  it('exposes strictly non-sensitive per-file and appdata scopes', () => {
    expect(GOOGLE_DRIVE_SCOPES).toContain('https://www.googleapis.com/auth/drive.file');
    expect(GOOGLE_DRIVE_SCOPES).toContain('https://www.googleapis.com/auth/drive.appdata');
    expect(GOOGLE_DRIVE_SCOPES).not.toContain('https://www.googleapis.com/auth/drive');
    expect(GOOGLE_DRIVE_SCOPES).not.toContain('https://www.googleapis.com/auth/drive.readonly');
  });
});

describe('GoogleDriveBlobDriver', () => {
  it('creates new file in appDataFolder on initial writeBlob', async () => {
    const mockCalls: { url: string; method?: string; body?: any }[] = [];

    const mockClient: GoogleHttpClient = {
      fetch: vi.fn(async (url: string, init?: RequestInit) => {
        mockCalls.push({ url, method: init?.method, body: init?.body });

        // 1. files.list query
        if (url.includes('/drive/v3/files?') && init?.method === 'GET') {
          return new Response(JSON.stringify({ files: [] }), { status: 200 });
        }
        // 2. files.create multipart
        if (url.includes('/upload/drive/v3/files') && init?.method === 'POST') {
          return new Response(JSON.stringify({ id: 'appdata_file_123', name: 'settings.json' }), { status: 200 });
        }
        return new Response('Not Found', { status: 404 });
      })
    };

    const driver = new GoogleDriveBlobDriver({
      getAccessToken: () => 'mock-token',
      httpClient: mockClient
    });

    await driver.writeBlob('settings.json', { theme: 'dark' });

    expect(mockCalls.length).toBe(2);
    // Verified search in appDataFolder
    expect(mockCalls[0].url).toContain('spaces=appDataFolder');
    // Verified multipart POST
    expect(mockCalls[1].method).toBe('POST');
    expect(mockCalls[1].url).toContain('uploadType=multipart');
    expect(mockCalls[1].body).toContain('appDataFolder');
    expect(mockCalls[1].body).toContain('"theme":"dark"');
  });

  it('reads blob from appDataFolder', async () => {
    const mockClient: GoogleHttpClient = {
      fetch: vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/drive/v3/files?') && init?.method === 'GET') {
          return new Response(JSON.stringify({ files: [{ id: 'appdata_file_123', name: 'settings.json' }] }), { status: 200 });
        }
        if (url.includes('/drive/v3/files/appdata_file_123?alt=media')) {
          return new Response(JSON.stringify({ theme: 'dark', daily_calorie_target: 2000 }), { status: 200 });
        }
        return new Response('Not Found', { status: 404 });
      })
    };

    const driver = new GoogleDriveBlobDriver({
      getAccessToken: () => 'mock-token',
      httpClient: mockClient
    });

    const data = await driver.readBlob('settings.json');
    expect(data).toEqual({ theme: 'dark', daily_calorie_target: 2000 });
  });

  it('throws authentication error on 401 response', async () => {
    const mockClient: GoogleHttpClient = {
      fetch: vi.fn(async () => new Response('Unauthorized', { status: 401 }))
    };

    const driver = new GoogleDriveBlobDriver({
      getAccessToken: () => 'invalid-token',
      httpClient: mockClient
    });

    await expect(driver.readBlob('settings.json')).rejects.toThrow(/auth|unauthorized|401/i);
  });
});

describe('GoogleSheetsTabularDriver', () => {
  it('creates new spreadsheet with tabs if none exists', async () => {
    const mockCalls: { url: string; method?: string; body?: any }[] = [];

    const mockClient: GoogleHttpClient = {
      fetch: vi.fn(async (url: string, init?: RequestInit) => {
        mockCalls.push({ url, method: init?.method, body: init?.body });

        // Search Drive
        if (url.includes('/drive/v3/files?') && init?.method === 'GET') {
          return new Response(JSON.stringify({ files: [] }), { status: 200 });
        }
        // Create Sheet
        if (url.includes('/v4/spreadsheets') && init?.method === 'POST' && !url.includes(':batchUpdate')) {
          const body = JSON.parse(String(init?.body));
          return new Response(
            JSON.stringify({
              spreadsheetId: 'sheet_created_999',
              properties: { title: 'Quomida Daily Logs' },
              sheets: body.sheets.map((s: any, idx: number) => ({ properties: { title: s.properties.title, sheetId: idx } }))
            }),
            { status: 200 }
          );
        }
        
        // Patch Drive metadata
        if (url.includes('/drive/v3/files/') && init?.method === 'PATCH') {
           return new Response(JSON.stringify({}), { status: 200 });
        }

        // Batch update spreadsheet protection
        if (url.includes(':batchUpdate') && !url.includes('values:batchUpdate') && init?.method === 'POST') {
           return new Response(JSON.stringify({}), { status: 200 });
        }
        
        // Batch update spreadsheet values
        if (url.includes('values:batchUpdate') && init?.method === 'POST') {
           return new Response(JSON.stringify({ totalUpdatedRows: 1 }), { status: 200 });
        }
        return new Response('Not Found', { status: 404 });
      })
    };

    const driver = new GoogleSheetsTabularDriver({
      getAccessToken: () => 'mock-token',
      httpClient: mockClient
    });

    const docId = await driver.ensureDocument('Quomida Daily Logs', ['daily_logs']);
    expect(docId).toBe('sheet_created_999');

    const createCall = mockCalls.find(c => c.url.includes('/v4/spreadsheets') && c.method === 'POST' && !c.url.includes(':batchUpdate'));
    expect(createCall).toBeDefined();
    const payload = JSON.parse(createCall!.body);
    expect(payload.properties.title).toBe('Quomida Daily Logs');
    expect(payload.sheets[0].properties.title).toBe('daily_logs');
    
    // Verify meta sheet is included in creation
    expect(payload.sheets.find((s: any) => s.properties.title === '_quomida_meta')).toBeDefined();
    
    // Verify PATCH was called
    const patchCall = mockCalls.find(c => c.method === 'PATCH');
    expect(patchCall).toBeDefined();
    expect(patchCall!.url).toContain('sheet_created_999');
    expect(JSON.parse(patchCall!.body).appProperties.quomida_doc_type).toBe('daily_logs');
  });

  it('writes rows using values:batchUpdate and reads table', async () => {
    let savedValues: any[][] = [];

    const mockClient: GoogleHttpClient = {
      fetch: vi.fn(async (url: string, init?: RequestInit) => {
        // Write batch
        if (url.includes('/values:batchUpdate') && init?.method === 'POST') {
          const body = JSON.parse(init.body);
          savedValues = body.data[0].values;
          return new Response(JSON.stringify({ totalUpdatedRows: savedValues.length }), { status: 200 });
        }
        // Read table
        if (url.includes('/values/') && init?.method === 'GET') {
          return new Response(
            JSON.stringify({
              range: 'daily_logs!A1:Z',
              values: savedValues
            }),
            { status: 200 }
          );
        }
        return new Response('OK', { status: 200 });
      })
    };

    const driver = new GoogleSheetsTabularDriver({
      getAccessToken: () => 'mock-token',
      httpClient: mockClient
    });

    const headers = [
      'id',
      'timestamp',
      'date',
      'meal_type',
      'food_reference_id',
      'food_name',
      'quantity',
      'portion_name',
      'calories',
      'protein',
      'carbs',
      'fats',
      'food_details_readonly',
      'updatedAt',
      '_deleted'
    ];
    const rows = [
      {
        id: 'log_1',
        values: [
          'log_1',
          '2026-09-15T12:00:00Z',
          '2026-09-15',
          'meal_lunch',
          'food_ref_1',
          'Pollo',
          1,
          '100g',
          200,
          30,
          0,
          5,
          'Pollo | 200kcal',
          1726440000000,
          false
        ]
      }
    ];

    await driver.writeTable('sheet_created_999', 'daily_logs', headers, rows);
    expect(savedValues.length).toBe(2); // Header row + 1 data row

    const readRows = await driver.readTable('sheet_created_999', 'daily_logs');
    expect(readRows.length).toBe(1);
    expect(readRows[0].id).toBe('log_1');
    expect(readRows[0].values).toContain('Pollo | 200kcal');
  });

  it('identifies and handles 429 quota errors', async () => {
    const mockClient: GoogleHttpClient = {
      fetch: vi.fn(async () => new Response('Quota exceeded', { status: 429 }))
    };

    const driver = new GoogleSheetsTabularDriver({
      getAccessToken: () => 'mock-token',
      httpClient: mockClient
    });

    await expect(driver.readTable('sheet_123', 'daily_logs')).rejects.toThrow(/quota|rate limit|429/i);
  });
});
