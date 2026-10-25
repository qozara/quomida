import type { BlobStorageDriver } from '../strategy/types.js';
import type { GoogleDriverOptions, GoogleHttpClient } from './types.js';

export class GoogleDriveBlobDriver implements BlobStorageDriver {
  id = 'google-drive-appdata-blob';
  name = 'Google Drive AppData Blob Driver';

  private getAccessToken: () => string | null;
  private client: GoogleHttpClient;
  private fileIdCache: Map<string, string> = new Map();

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

  private async handleResponseErrors(res: Response, context: string): Promise<void> {
    if (!res.ok) {
      let errText = '';
      try {
        errText = await res.text();
      } catch (e) {}

      if (res.status === 401 || res.status === 403) {
        let isQuotaExceeded = false;
        try {
          const json = JSON.parse(errText);
          if (json.error?.errors?.[0]?.reason === 'storageQuotaExceeded') {
            isQuotaExceeded = true;
          }
        } catch (e) {}

        if (isQuotaExceeded) {
          throw new Error(`Google Drive Storage Quota Exceeded (403) during ${context}. Please free up space in your Google account.`);
        }
        throw new Error(`Google Auth Failed (${res.status}) during ${context}. Details: ${errText}`);
      }
      if (res.status === 429) {
        throw new Error(`Google Drive API Rate Limit / Quota Exceeded (429) during ${context}`);
      }
      throw new Error(`Google Drive API Error (${res.status}) during ${context}. Details: ${errText}`);
    }
  }

  private async findFileInAppData(filename: string, bypassCache = false): Promise<string | null> {
    if (!bypassCache && this.fileIdCache.has(filename)) {
      return this.fileIdCache.get(filename)!;
    }

    const headers = this.getAuthHeaders();
    const query = encodeURIComponent(`name = '${filename}' and trashed = false`);
    const orderBy = encodeURIComponent('modifiedTime desc');
    const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&orderBy=${orderBy}&fields=files(id,name,modifiedTime)`;

    const res = await this.client.fetch(url, { method: 'GET', headers });
    await this.handleResponseErrors(res, 'searching appDataFolder');

    const json = await res.json();
    if (json.files && json.files.length > 0) {
      const primaryId: string = json.files[0].id;
      this.fileIdCache.set(filename, primaryId);

      // Clean up any stale duplicate files in appDataFolder caused by eventual consistency
      if (json.files.length > 1) {
        for (const dup of json.files.slice(1)) {
          if (dup?.id && dup.id !== primaryId) {
            this.client
              .fetch(`https://www.googleapis.com/drive/v3/files/${dup.id}`, {
                method: 'DELETE',
                headers
              })
              .catch(() => {});
          }
        }
      }

      return primaryId;
    }
    return null;
  }

  async readBlob<T = any>(filename: string): Promise<T | null> {
    let fileId = await this.findFileInAppData(filename);
    if (!fileId) return null;

    const headers = this.getAuthHeaders();
    let url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    let res = await this.client.fetch(url, { method: 'GET', headers });
    if (res.status === 404) {
      this.fileIdCache.delete(filename);
      fileId = await this.findFileInAppData(filename, true);
      if (!fileId) return null;
      url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      res = await this.client.fetch(url, { method: 'GET', headers });
    }

    await this.handleResponseErrors(res, 'reading blob from appDataFolder');

    return (await res.json()) as T;
  }

  async writeBlob<T = any>(filename: string, data: T): Promise<void> {
    let existingFileId = await this.findFileInAppData(filename);
    const headers = this.getAuthHeaders();
    const boundary = '-------quomida_blob_boundary';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const buildBody = (isUpdate: boolean) => {
      const metadata = isUpdate
        ? { name: filename }
        : { name: filename, parents: ['appDataFolder'] };

      return (
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(data) +
        closeDelimiter
      );
    };

    const sendUpload = async (targetFileId: string | null) => {
      const url = targetFileId
        ? `https://www.googleapis.com/upload/drive/v3/files/${targetFileId}?uploadType=multipart`
        : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
      const method = targetFileId ? 'PATCH' : 'POST';

      return await this.client.fetch(url, {
        method,
        headers: {
          ...headers,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: buildBody(Boolean(targetFileId))
      });
    };

    let res = await sendUpload(existingFileId);
    if (existingFileId && res.status === 404) {
      this.fileIdCache.delete(filename);
      existingFileId = await this.findFileInAppData(filename, true);
      res = await sendUpload(existingFileId);
    }

    await this.handleResponseErrors(res, 'writing blob to appDataFolder');

    try {
      const resJson = await res.json();
      if (resJson && typeof resJson.id === 'string' && resJson.id) {
        this.fileIdCache.set(filename, resJson.id);
      }
    } catch {}
  }

  async deleteBlob(filename: string): Promise<void> {
    const fileId = await this.findFileInAppData(filename);
    this.fileIdCache.delete(filename);
    if (!fileId) return;

    const headers = this.getAuthHeaders();
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
    const res = await this.client.fetch(url, { method: 'DELETE', headers });
    await this.handleResponseErrors(res, 'deleting blob from appDataFolder');
  }
}
