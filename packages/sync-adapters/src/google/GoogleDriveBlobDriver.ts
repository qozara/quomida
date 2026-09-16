import type { BlobStorageDriver } from '../strategy/types.js';
import type { GoogleDriverOptions, GoogleHttpClient } from './types.js';

export class GoogleDriveBlobDriver implements BlobStorageDriver {
  id = 'google-drive-appdata-blob';
  name = 'Google Drive AppData Blob Driver';

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
      Authorization: `Bearer ${token}`
    };
  }

  private handleResponseErrors(res: Response, context: string): void {
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Google Auth Failed (${res.status}) during ${context}`);
    }
    if (res.status === 429) {
      throw new Error(`Google Drive API Rate Limit / Quota Exceeded (429) during ${context}`);
    }
    if (!res.ok) {
      throw new Error(`Google Drive API Error (${res.status}) during ${context}`);
    }
  }

  private async findFileInAppData(filename: string): Promise<string | null> {
    const headers = this.getAuthHeaders();
    const query = encodeURIComponent(`name = '${filename}' and trashed = false`);
    const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name)`;

    const res = await this.client.fetch(url, { method: 'GET', headers });
    this.handleResponseErrors(res, 'searching appDataFolder');

    const json = await res.json();
    if (json.files && json.files.length > 0) {
      return json.files[0].id;
    }
    return null;
  }

  async readBlob<T = any>(filename: string): Promise<T | null> {
    const fileId = await this.findFileInAppData(filename);
    if (!fileId) return null;

    const headers = this.getAuthHeaders();
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    const res = await this.client.fetch(url, { method: 'GET', headers });
    this.handleResponseErrors(res, 'reading blob from appDataFolder');

    return (await res.json()) as T;
  }

  async writeBlob<T = any>(filename: string, data: T): Promise<void> {
    const existingFileId = await this.findFileInAppData(filename);
    const headers = this.getAuthHeaders();
    const boundary = '-------quomida_blob_boundary';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = existingFileId
      ? { name: filename }
      : { name: filename, parents: ['appDataFolder'] };

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(data) +
      closeDelimiter;

    const url = existingFileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

    const method = existingFileId ? 'PATCH' : 'POST';

    const res = await this.client.fetch(url, {
      method,
      headers: {
        ...headers,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    });

    this.handleResponseErrors(res, 'writing blob to appDataFolder');
  }

  async deleteBlob(filename: string): Promise<void> {
    const fileId = await this.findFileInAppData(filename);
    if (!fileId) return;

    const headers = this.getAuthHeaders();
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
    const res = await this.client.fetch(url, { method: 'DELETE', headers });
    this.handleResponseErrors(res, 'deleting blob from appDataFolder');
  }
}
