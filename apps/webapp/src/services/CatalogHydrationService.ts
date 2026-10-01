import type { LocalDBService } from '../db/rxdb.js';

export interface HydrationResult {
  status: 'UP_TO_DATE' | 'UPDATED' | 'SKIPPED' | 'ERROR' | 'CANCELLED';
  version?: string;
  generatedAt?: string;
  fileSizeBytes?: number;
  itemsUpserted: number;
  error?: string;
}

export interface CatalogHydrationOptions {
  force?: boolean;
  baseUrl?: string;
  signal?: AbortSignal;
}

export class CatalogHydrationService {
  constructor(private dbService: LocalDBService) { }

  async hydrate(options?: CatalogHydrationOptions): Promise<HydrationResult> {
    const rawBaseUrl = options?.baseUrl !== undefined
      ? options.baseUrl
      : (typeof import.meta !== 'undefined' && import.meta.env?.VITE_CATALOG_BASE_URL) || '';

    const baseUrl = rawBaseUrl.replace(/\/+$/, '');
    const metaUrl = `${baseUrl}/catalog_meta.json${options?.force ? `?t=${Date.now()}` : ''}`;
    
    const fetchOptions: RequestInit = { 
      cache: options?.force ? 'no-cache' : 'default',
      signal: options?.signal
    };

    let metaRes: Response;
    try {
      metaRes = await fetch(metaUrl, fetchOptions);
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message === 'Aborted') return { status: 'CANCELLED', itemsUpserted: 0 };
      return { status: 'SKIPPED', itemsUpserted: 0, error: `Network error fetching catalog metadata: ${err?.message || err}` };
    }

    if (metaRes.status === 404) return { status: 'SKIPPED', itemsUpserted: 0, error: 'Catalog metadata not found (404)' };
    if (!metaRes.ok) return { status: 'ERROR', itemsUpserted: 0, error: `Failed to fetch catalog metadata (${metaRes.status})` };

    const contentType = metaRes.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
      return { status: 'ERROR', itemsUpserted: 0, error: 'Error accessing catalog metadata, please try again later' };
    }

    let meta: any;
    try {
      meta = await metaRes.json();
    } catch (err: any) {
      return { status: 'ERROR', itemsUpserted: 0, error: `Invalid JSON in catalog metadata: ${err?.message || err}` };
    }

    const remoteVersion = meta?.catalogVersion;
    const remoteGeneratedAt = meta?.generatedAt;
    const remoteFileSizeBytes = meta?.fileSizeBytes;

    if (!remoteVersion) return { status: 'ERROR', itemsUpserted: 0, error: 'Catalog metadata is missing catalogVersion property' };

    // Compare versions
    const localVersion = await this.dbService.getMetadata('lastIngestedCatalogVersion');
    if (!options?.force && localVersion === remoteVersion) {
      return { status: 'UP_TO_DATE', version: remoteVersion, generatedAt: remoteGeneratedAt, fileSizeBytes: remoteFileSizeBytes, itemsUpserted: 0 };
    }

    // Update metadata in local RxDB
    await this.dbService.setMetadata('lastIngestedCatalogVersion', remoteVersion);
    if (remoteGeneratedAt) {
      await this.dbService.setMetadata('lastIngestedCatalogGeneratedAt', remoteGeneratedAt);
    }
    if (remoteFileSizeBytes) {
      await this.dbService.setMetadata('lastIngestedCatalogFileSizeBytes', String(remoteFileSizeBytes));
    }

    return {
      status: 'UPDATED',
      version: remoteVersion,
      generatedAt: remoteGeneratedAt,
      fileSizeBytes: remoteFileSizeBytes,
      itemsUpserted: 0
    };
  }
}
