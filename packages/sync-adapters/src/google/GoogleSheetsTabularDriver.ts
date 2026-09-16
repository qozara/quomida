import type { TabularStorageDriver, TabularRow } from '../strategy/types.js';
import type { GoogleDriverOptions, GoogleHttpClient } from './types.js';

export class GoogleSheetsTabularDriver implements TabularStorageDriver {
  id = 'google-sheets-tabular';
  name = 'Google Sheets Tabular Driver';

  private getAccessToken: () => string | null;
  private client: GoogleHttpClient;

  constructor(options: GoogleDriverOptions) {
    this.getAccessToken = options.getAccessToken;
    this.client = options.httpClient || {
      fetch: (url, init) => fetch(url, init)
    };
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

  private handleResponseErrors(res: Response, context: string): void {
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Google Auth Failed (${res.status}) during ${context}`);
    }
    if (res.status === 429) {
      throw new Error(`Google Sheets API Rate Limit / Quota Exceeded (429) during ${context}`);
    }
    if (!res.ok) {
      throw new Error(`Google Sheets API Error (${res.status}) during ${context}`);
    }
  }

  async ensureDocument(title: string, tabs: string[]): Promise<string> {
    const headers = this.getAuthHeaders();

    // 1. Search for existing spreadsheet in Drive
    const query = encodeURIComponent(`name = '${title}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`);
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;

    const searchRes = await this.client.fetch(searchUrl, { method: 'GET', headers });
    this.handleResponseErrors(searchRes, `searching spreadsheet "${title}"`);

    const searchJson = await searchRes.json();
    if (searchJson.files && searchJson.files.length > 0) {
      return searchJson.files[0].id;
    }

    // 2. Create new spreadsheet with required tabs
    const createUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
    const createBody = {
      properties: { title },
      sheets: tabs.map(tabName => ({
        properties: { title: tabName }
      }))
    };

    const createRes = await this.client.fetch(createUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(createBody)
    });
    this.handleResponseErrors(createRes, `creating spreadsheet "${title}"`);

    const createJson = await createRes.json();
    return createJson.spreadsheetId;
  }

  async readTable(documentId: string, tabName: string): Promise<TabularRow[]> {
    const headers = this.getAuthHeaders();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${documentId}/values/${encodeURIComponent(tabName)}!A1:Z`;

    const res = await this.client.fetch(url, { method: 'GET', headers });
    this.handleResponseErrors(res, `reading table "${tabName}" from document ${documentId}`);

    const json = await res.json();
    const values: any[][] = json.values || [];
    if (values.length <= 1) {
      return [];
    }

    // Row 0 is headers, Row 1..N are data
    const dataRows = values.slice(1);
    return dataRows.map(row => ({
      id: String(row[0] || ''),
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

    this.handleResponseErrors(res, `writing table "${tabName}" in document ${documentId}`);
  }
}
