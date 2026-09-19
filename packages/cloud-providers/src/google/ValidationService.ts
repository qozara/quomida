import {
  SchemaValidator,
  MigrationManager,
  GoogleSheetsFetchClient,
  type SchemaDefinition,
  type Migration,
  type TabDefinition,
  type ColumnDefinition
} from '@qozara/gdocs-schema';
import type { GoogleHttpClient } from './types.js';

export enum ValidationStatus {
  READY = 'READY',
  UPGRADE_REQUIRED = 'UPGRADE_REQUIRED',
  CORRUPTED = 'CORRUPTED',
  INCOMPATIBLE = 'INCOMPATIBLE'
}

export interface SchemaStatusDTO {
  spreadsheetId: string;
  currentVersion: number;
  latestVersion: number;
  status: ValidationStatus;
  valid: boolean;
  missingTabs: string[];
  missingColumns: Record<string, string[]>;
  canAutoMigrate: boolean;
  lastModifiedTime: string;
  errors: string[];
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class ValidationService {
  private getToken: () => string | null;
  private httpClient?: GoogleHttpClient;

  constructor(getToken: () => string | null, httpClient?: GoogleHttpClient) {
    this.getToken = getToken;
    this.httpClient = httpClient;
  }

  private getClient(): GoogleSheetsFetchClient {
    const token = this.getToken();
    if (!token) {
      throw new Error('ValidationService requires a valid Google access token.');
    }

    const fetchImpl = this.httpClient
      ? this.httpClient.fetch.bind(this.httpClient)
      : (url: string | Request | URL, init?: RequestInit) => {
          const finalInit = init ? { ...init } : {};
          if (finalInit.method === 'GET' && finalInit.headers) {
            const headers = new Headers(finalInit.headers as any);
            headers.delete('Content-Type');
            finalInit.headers = headers;
          }
          return globalThis.fetch(url, finalInit);
        };

    return new GoogleSheetsFetchClient({
      accessToken: token,
      fetchImpl: fetchImpl as any
    });
  }

  private async getFileMetadata(spreadsheetId: string): Promise<{ appProperties?: Record<string, string>; modifiedTime?: string }> {
    const token = this.getToken();
    const url = `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?fields=appProperties,modifiedTime`;
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const res = this.httpClient ? await this.httpClient.fetch(url, { headers }) : await fetch(url, { headers });
      if (!res.ok) return {};
      return await res.json();
    } catch {
      return {};
    }
  }

  public async checkHealth(spreadsheetId: string, schema: SchemaDefinition): Promise<SchemaStatusDTO> {
    const client = this.getClient();
    let currentVersion = 0;
    let lastModifiedTime = new Date().toISOString();

    try {
      const meta = await this.getFileMetadata(spreadsheetId);
      if (meta.modifiedTime) lastModifiedTime = meta.modifiedTime;
      currentVersion = parseInt(meta.appProperties?.quomida_schema_version || '0', 10);
    } catch {
      // Ignore error reading app properties
    }

    const validator = new SchemaValidator(client);
    const result = await validator.validateStructure(spreadsheetId, schema);

    const missingTabs: string[] = [];
    const missingColumns: Record<string, string[]> = {};

    for (const err of result.errors) {
      const tabMatch = err.match(/^Tab "([^"]+)" is missing$/);
      if (tabMatch) {
        missingTabs.push(tabMatch[1]);
      }
      const colMatch = err.match(/^Tab "([^"]+)" is missing column "([^"]+)"$/);
      if (colMatch) {
        const [, tab, col] = colMatch;
        if (!missingColumns[tab]) missingColumns[tab] = [];
        missingColumns[tab].push(col);
      }
    }

    let status = ValidationStatus.READY;
    let canAutoMigrate = false;

    if (!result.valid) {
      if (currentVersion > 0 && currentVersion < schema.version) {
        status = ValidationStatus.UPGRADE_REQUIRED;
        canAutoMigrate = true;
      } else {
        status = ValidationStatus.CORRUPTED;
      }
    }

    return {
      spreadsheetId,
      currentVersion,
      latestVersion: schema.version,
      status,
      valid: result.valid,
      missingTabs,
      missingColumns,
      canAutoMigrate,
      lastModifiedTime,
      errors: result.errors
    };
  }

  public async repairFile(
    spreadsheetId: string,
    schema: SchemaDefinition,
    expectedLastModified?: string
  ): Promise<{ backupFileId: string }> {
    if (expectedLastModified) {
      const meta = await this.getFileMetadata(spreadsheetId);
      const currentModified = meta.modifiedTime ? new Date(meta.modifiedTime).getTime() : 0;
      const expectedModified = new Date(expectedLastModified).getTime();
      if (currentModified > 0 && expectedModified > 0 && currentModified > expectedModified) {
        throw new ConflictError('Spreadsheet has been modified since it was last fetched.');
      }
    }

    const client = this.getClient();

    // Step 1: Create backup first
    const backupFileId = await client.createBackup(spreadsheetId);

    // Step 2: Fetch spreadsheet tabs & columns
    const metadata = await client.getSpreadsheet(spreadsheetId);
    const sheets = metadata.sheets || [];

    const requests: any[] = [];

    // 2a. Add any completely missing tabs
    const existingTitles = new Set(sheets.map((s: any) => s.properties?.title));
    for (const tab of schema.tabs) {
      if (!existingTitles.has(tab.name)) {
        requests.push({
          addSheet: {
            properties: {
              title: tab.name
            }
          }
        });
      }
    }

    if (requests.length > 0) {
      await client.batchUpdate(spreadsheetId, requests);
      requests.length = 0;
    }

    // Refresh sheets metadata if tabs were created
    const refreshedMeta = requests.length > 0 ? await client.getSpreadsheet(spreadsheetId) : metadata;
    const currentSheets = refreshedMeta.sheets || sheets;

    const tabsToFetch: string[] = schema.tabs
      .filter((t: TabDefinition) => currentSheets.some((s: any) => s.properties?.title === t.name))
      .map((t: TabDefinition) => t.name);

    if (tabsToFetch.length > 0) {
      const ranges = tabsToFetch.map(name => `${name}!1:1`);
      const batchGetResult = await client.batchGet(spreadsheetId, ranges);
      const valueRanges = batchGetResult.valueRanges || [];

      for (let i = 0; i < tabsToFetch.length; i++) {
        const tabName = tabsToFetch[i];
        const tabSchema = schema.tabs.find((t: TabDefinition) => t.name === tabName);
        if (!tabSchema) continue;

        const sheetId = currentSheets.find((s: any) => s.properties?.title === tabName)?.properties?.sheetId;
        if (sheetId === undefined) continue;

        const valueRange = valueRanges[i];
        const rows = valueRange?.values || [];
        const headers = rows[0] || [];
        const headerSet = new Set(headers.map((h: any) => String(h).trim()));

        const missingCols = tabSchema.columns.filter((c: ColumnDefinition) => !headerSet.has(c.name));

        if (missingCols.length > 0) {
          requests.push({
            appendDimension: {
              sheetId,
              dimension: 'COLUMNS',
              length: missingCols.length
            }
          });

          requests.push({
            updateCells: {
              rows: [
                {
                  values: missingCols.map((col: ColumnDefinition) => ({
                    userEnteredValue: { stringValue: col.name }
                  }))
                }
              ],
              fields: 'userEnteredValue',
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: headers.length,
                endColumnIndex: headers.length + missingCols.length
              }
            }
          });
        }
      }

      if (requests.length > 0) {
        await client.batchUpdate(spreadsheetId, requests);
      }
    }

    // Step 3: Update app properties to mark schema as READY and current version
    await client.updateFileAppProperties(spreadsheetId, {
      quomida_validation_status: ValidationStatus.READY,
      quomida_validation_time: new Date().toISOString(),
      quomida_schema_version: schema.version.toString()
    });

    return { backupFileId };
  }

  public async migrateFile(
    spreadsheetId: string,
    schema: SchemaDefinition,
    migrations: Migration[],
    expectedLastModified?: string
  ): Promise<{ backupFileId: string }> {
    const client = this.getClient();

    if (expectedLastModified) {
      const meta = await this.getFileMetadata(spreadsheetId);
      const currentModified = meta.modifiedTime ? new Date(meta.modifiedTime).getTime() : 0;
      const expectedModified = new Date(expectedLastModified).getTime();
      if (currentModified > 0 && expectedModified > 0 && currentModified > expectedModified) {
        throw new ConflictError('Spreadsheet has been modified since it was last fetched.');
      }
    }

    const backupFileId = await client.createBackup(spreadsheetId);
    const migrationManager = new MigrationManager(client);
    await migrationManager.runMigrations(spreadsheetId, migrations);

    await client.updateFileAppProperties(spreadsheetId, {
      quomida_validation_status: ValidationStatus.READY,
      quomida_validation_time: new Date().toISOString(),
      quomida_schema_version: schema.version.toString()
    });

    return { backupFileId };
  }
}
