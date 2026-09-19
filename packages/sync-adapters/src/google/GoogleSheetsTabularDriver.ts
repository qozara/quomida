import type { TabularStorageDriver, TabularRow } from '../strategy/types.js';
import type { GoogleDriverOptions, GoogleHttpClient } from './types.js';
import { ValidationService, type SchemaStatusDTO } from './ValidationService.js';
import {
  QuomidaDailyLogsSpreadsheetSchema,
  QuomidaFoodCatalogSpreadsheetSchema,
  type SchemaDefinition,
  type TabDefinition,
  type ColumnDefinition
} from './schemas.js';

export class GoogleSheetsTabularDriver implements TabularStorageDriver {
  id = 'google-sheets-tabular';
  name = 'Google Sheets Tabular Driver';

  private getAccessToken: () => string | null;
  private client: GoogleHttpClient;
  private validationService: ValidationService;
  private documentSchemas: Map<string, SchemaDefinition> = new Map();

  constructor(options: GoogleDriverOptions) {
    this.getAccessToken = options.getAccessToken;
    this.client = options.httpClient || {
      fetch: (url, init) => fetch(url, init)
    };
    this.validationService = new ValidationService(this.getAccessToken, this.client);
  }

  private getAuthHeaders(): Record<string, string> {
    const token = this.getAccessToken();
    if (!token) {
      throw new Error('Google Auth Failed: Access token is missing or expired');
    }
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  private async handleResponseErrors(res: Response, context: string): Promise<void> {
    if (!res.ok) {
      let errText = '';
      try {
        errText = await res.text();
      } catch {}

      if (res.status === 401 || res.status === 403) {
        let isQuotaExceeded = false;
        try {
          const json = JSON.parse(errText);
          if (json.error?.errors?.[0]?.reason === 'storageQuotaExceeded') {
            isQuotaExceeded = true;
          }
        } catch {}

        if (isQuotaExceeded) {
          throw new Error(`Google Drive Storage Quota Exceeded (403) during ${context}. Please free up space in your Google account.`);
        }
        throw new Error(`Google Auth Failed (${res.status}) during ${context}. Details: ${errText}`);
      }
      if (res.status === 429) {
        throw new Error(`Google Sheets API Rate Limit / Quota Exceeded (429) during ${context}`);
      }
      throw new Error(`Google Sheets API Error (${res.status}) during ${context}. Details: ${errText}`);
    }
  }

  private async resolveSchemaForDocument(documentId: string): Promise<SchemaDefinition> {
    if (this.documentSchemas.has(documentId)) {
      return this.documentSchemas.get(documentId)!;
    }

    try {
      const headers = this.getAuthHeaders();
      const res = await this.client.fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${documentId}?fields=sheets(properties(title))`,
        { headers }
      );
      if (res.ok) {
        const json = await res.json();
        const tabTitles = (json.sheets || []).map((s: any) => s.properties?.title);
        if (tabTitles.includes('daily_logs')) {
          this.documentSchemas.set(documentId, QuomidaDailyLogsSpreadsheetSchema);
          return QuomidaDailyLogsSpreadsheetSchema;
        }
        if (
          tabTitles.includes('base_ingredients') ||
          tabTitles.includes('recipes') ||
          tabTitles.includes('portions')
        ) {
          this.documentSchemas.set(documentId, QuomidaFoodCatalogSpreadsheetSchema);
          return QuomidaFoodCatalogSpreadsheetSchema;
        }
      }
    } catch {}

    return QuomidaDailyLogsSpreadsheetSchema;
  }

  async ensureDocument(title: string, tabs: string[]): Promise<string> {
    const headers = this.getAuthHeaders();

    const docType = tabs.includes('daily_logs') || title.includes('Daily Logs') ? 'daily_logs' : 'food_catalog';

    // 1. Search for existing spreadsheet in Drive by metadata
    const query = encodeURIComponent(`appProperties has { key='quomida_doc_type' and value='${docType}' } and trashed = false`);
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;

    const searchRes = await this.client.fetch(searchUrl, { method: 'GET', headers });
    await this.handleResponseErrors(searchRes, `searching spreadsheet metadata "${docType}"`);

    const searchJson = await searchRes.json();
    if (searchJson.files && searchJson.files.length > 0) {
      const docId = searchJson.files[0].id;
      this.documentSchemas.set(docId, docType === 'daily_logs' ? QuomidaDailyLogsSpreadsheetSchema : QuomidaFoodCatalogSpreadsheetSchema);
      return docId;
    }

    // 2. Create new spreadsheet with required tabs and _quomida_meta
    const createUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
    const allTabs = [...tabs, '_quomida_meta'];
    const createBody = {
      properties: { title },
      sheets: allTabs.map(tabName => ({
        properties: { title: tabName }
      }))
    };

    const createRes = await this.client.fetch(createUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(createBody)
    });
    await this.handleResponseErrors(createRes, `creating spreadsheet "${title}"`);

    const createJson = await createRes.json();
    const docId = createJson.spreadsheetId;

    this.documentSchemas.set(docId, docType === 'daily_logs' ? QuomidaDailyLogsSpreadsheetSchema : QuomidaFoodCatalogSpreadsheetSchema);

    // 3. Attach metadata to the file in Google Drive
    const patchUrl = `https://www.googleapis.com/drive/v3/files/${docId}`;
    const patchBody = {
      appProperties: {
        quomida_doc_type: docType
      }
    };
    const patchRes = await this.client.fetch(patchUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(patchBody)
    });
    await this.handleResponseErrors(patchRes, `attaching metadata to spreadsheet "${title}"`);

    // 4. Populate _quomida_meta and protect it
    const schemaVersion = this.documentSchemas.get(docId)?.version || 1;
    
    // Write text
    const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${docId}/values:batchUpdate`;
    const valuesBody = {
      valueInputOption: 'USER_ENTERED',
      data: [{
        range: `_quomida_meta!A1:B2`,
        majorDimension: 'ROWS',
        values: [
          ['QUOMIDA SYSTEM FILE - DO NOT DELETE', ''],
          ['Schema Version:', schemaVersion]
        ]
      }]
    };
    const valuesRes = await this.client.fetch(valuesUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(valuesBody)
    });
    await this.handleResponseErrors(valuesRes, `populating _quomida_meta in spreadsheet "${title}"`);

    // Protect sheet
    const metaSheetId = createJson.sheets?.find((s: any) => s.properties?.title === '_quomida_meta')?.properties?.sheetId;
    if (metaSheetId !== undefined) {
      const protectUrl = `https://sheets.googleapis.com/v4/spreadsheets/${docId}:batchUpdate`;
      const protectBody = {
        requests: [{
          addProtectedRange: {
            protectedRange: {
              range: { sheetId: metaSheetId },
              description: 'Quomida System Metadata',
              warningOnly: true
            }
          }
        }]
      };
      const protectRes = await this.client.fetch(protectUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(protectBody)
      });
      await this.handleResponseErrors(protectRes, `protecting _quomida_meta in spreadsheet "${title}"`);
    }

    return docId;
  }

  async readTable(documentId: string, tabName: string): Promise<TabularRow[]> {
    const headers = this.getAuthHeaders();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${documentId}/values/${encodeURIComponent(tabName)}!A1:Z`;

    const res = await this.client.fetch(url, { method: 'GET', headers });
    await this.handleResponseErrors(res, `reading table "${tabName}" from document ${documentId}`);

    const json = await res.json();
    const values: any[][] = json.values || [];
    if (values.length <= 1) {
      return [];
    }

    // Row 0 is headers, Row 1..N are data
    const sheetHeaders: string[] = (values[0] || []).map(h => String(h).trim());
    const headerSet = new Set(sheetHeaders);

    // Fast-path header validation: verify required columns exist
    const schema = await this.resolveSchemaForDocument(documentId);
    const tabDef = schema.tabs.find((t: TabDefinition) => t.name === tabName);
    if (tabDef) {
      const missingRequired = tabDef.columns
        .filter((col: ColumnDefinition) => col.required && !headerSet.has(col.name))
        .map((col: ColumnDefinition) => col.name);

      if (missingRequired.length > 0) {
        throw new Error(
          `Schema corruption: missing required column "${missingRequired[0]}" in tab "${tabName}". (Missing: ${missingRequired.join(', ')})`
        );
      }
    }

    const dataRows = values.slice(1);
    return dataRows.map(row => ({
      id: String(row[0] || ''),
      headers: sheetHeaders,
      values: row
    }));
  }

  async writeTable(
    documentId: string,
    tabName: string,
    headers: string[],
    rows: TabularRow[]
  ): Promise<void> {
    const authHeaders = this.getAuthHeaders();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${documentId}/values:batchUpdate`;

    // Flatten headers + all rows into 2D array
    const allValues = [headers, ...rows.map(r => r.values)];

    const body = {
      valueInputOption: 'USER_ENTERED',
      data: [
        {
          range: `${tabName}!A1:Z`,
          majorDimension: 'ROWS',
          values: allValues
        }
      ]
    };

    const res = await this.client.fetch(url, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(body)
    });

    await this.handleResponseErrors(res, `writing table "${tabName}" in document ${documentId}`);
  }

  async repairTable(documentId: string, _tabName?: string, expectedLastModified?: string): Promise<void> {
    const schema = await this.resolveSchemaForDocument(documentId);
    await this.validationService.repairFile(documentId, schema, expectedLastModified);
  }

  async migrateTable(documentId: string, expectedLastModified?: string): Promise<void> {
    const schema = await this.resolveSchemaForDocument(documentId);
    await this.validationService.migrateFile(documentId, schema, [], expectedLastModified);
  }

  async checkHealth(documentId: string): Promise<SchemaStatusDTO> {
    const schema = await this.resolveSchemaForDocument(documentId);
    return await this.validationService.checkHealth(documentId, schema);
  }
}
