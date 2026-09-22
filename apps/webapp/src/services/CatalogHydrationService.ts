import type { BaseIngredient } from '@quomida/domain-core';
import type { LocalDBService } from '../db/rxdb.js';

export interface HydrationResult {
  status: 'UP_TO_DATE' | 'UPDATED' | 'SKIPPED' | 'ERROR';
  version?: string;
  generatedAt?: string;
  itemsUpserted: number;
  error?: string;
}

export interface CatalogHydrationOptions {
  force?: boolean;
  baseUrl?: string;
}

export class CatalogHydrationService {
  constructor(private dbService: LocalDBService) { }

  /**
   * Checks for remote catalog updates and idempotently hydrates the local database.
   */
  async hydrate(options?: CatalogHydrationOptions): Promise<HydrationResult> {
    const rawBaseUrl = options?.baseUrl !== undefined
      ? options.baseUrl
      : (typeof import.meta !== 'undefined' && import.meta.env?.VITE_CATALOG_BASE_URL) || '';

    const baseUrl = rawBaseUrl.replace(/\/+$/, '');
    const metaUrl = `${baseUrl}/catalog_meta.json${options?.force ? `?t=${Date.now()}` : ''}`;
    const fetchOptions: RequestInit | undefined = options?.force ? { cache: 'no-cache' } : undefined;

    // 1. Fetch lightweight metadata (50 bytes)
    let metaRes: Response;
    try {
      metaRes = await fetch(metaUrl, fetchOptions);
    } catch (err: any) {
      return {
        status: 'SKIPPED',
        itemsUpserted: 0,
        error: `Network error fetching catalog metadata: ${err?.message || err}`
      };
    }

    if (metaRes.status === 404) {
      return {
        status: 'SKIPPED',
        itemsUpserted: 0,
        error: 'Catalog metadata not found (404)'
      };
    }

    if (!metaRes.ok) {
      return {
        status: 'ERROR',
        itemsUpserted: 0,
        error: `Failed to fetch catalog metadata (${metaRes.status})`
      };
    }

    const contentType = metaRes.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
      return {
        status: 'ERROR',
        itemsUpserted: 0,
        error: 'Error accessing catalog metadata, please try again later'
      };
    }

    let meta: any;
    try {
      meta = await metaRes.json();
    } catch (err: any) {
      return {
        status: 'ERROR',
        itemsUpserted: 0,
        error: `Invalid JSON in catalog metadata: ${err?.message || err}`
      };
    }

    const remoteVersion = meta?.catalogVersion;
    const remoteGeneratedAt = meta?.generatedAt;

    if (!remoteVersion) {
      return {
        status: 'ERROR',
        itemsUpserted: 0,
        error: 'Catalog metadata is missing catalogVersion property'
      };
    }

    // 2. Compare against locally stored ingested version
    const localVersion = await this.dbService.getMetadata('lastIngestedCatalogVersion');
    if (!options?.force && localVersion === remoteVersion) {
      return {
        status: 'UP_TO_DATE',
        version: remoteVersion,
        generatedAt: remoteGeneratedAt,
        itemsUpserted: 0
      };
    }

    // 3. Versions differ or manual force refresh: Fetch full catalog.ndjson
    const catalogUrl = `${baseUrl}/catalog.ndjson${options?.force ? `?t=${Date.now()}` : ''}`;
    let catalogRes: Response;
    try {
      catalogRes = await fetch(catalogUrl, fetchOptions);
    } catch (err: any) {
      return {
        status: 'ERROR',
        itemsUpserted: 0,
        error: `Network error fetching catalog: ${err?.message || err}`
      };
    }

    if (!catalogRes.ok || !catalogRes.body) {
      return {
        status: 'ERROR',
        itemsUpserted: 0,
        error: `Failed to fetch catalog payload (${catalogRes.status})`
      };
    }

    // 4. Perform diff against existing 'system' items
    const db = await this.dbService.init();
    const existingSystemDocs = await db.base_ingredients.find({
      selector: { source: 'system' }
    }).exec();

    const existingMap = new Map<string, any>();
    for (const doc of existingSystemDocs) {
      const data = doc.toJSON();
      existingMap.set(data.id, data);
    }

    const itemsToUpsert: BaseIngredient[] = [];
    const now = Date.now();

    const reader = catalogRes.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last incomplete line

      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const remoteItem = JSON.parse(line);
          if (!remoteItem.id || !remoteItem.name) continue;

          const existing = existingMap.get(remoteItem.id);
          const isUnchanged =
            existing &&
            existing.name === remoteItem.name &&
            existing.calories_100g === remoteItem.calories_100g &&
            existing.protein_100g === remoteItem.protein_100g &&
            existing.carbs_100g === remoteItem.carbs_100g &&
            existing.fats_100g === remoteItem.fats_100g &&
            existing.lang === remoteItem.lang;

          if (!isUnchanged) {
            const { contentHash, ...cleanData } = remoteItem;
            itemsToUpsert.push({
              ...cleanData,
              id: String(cleanData.id),
              name: String(cleanData.name),
              source: 'system',
              lang: cleanData.lang || 'es',
              calories_100g: Number(cleanData.calories_100g) || 0,
              protein_100g: Number(cleanData.protein_100g) || 0,
              carbs_100g: Number(cleanData.carbs_100g) || 0,
              fats_100g: Number(cleanData.fats_100g) || 0,
              updatedAt: now
            });
          }
        } catch (e) {
          console.error('[CatalogHydration] Failed to parse NDJSON line', e);
        }
      }

      // Batch insert every 10,000 items to avoid freezing the UI thread for too long
      if (itemsToUpsert.length >= 10000) {
        await db.base_ingredients.bulkUpsert(itemsToUpsert);
        itemsToUpsert.length = 0; // clear array
      }
    }

    if (buffer.trim()) {
      try {
        const remoteItem = JSON.parse(buffer);
        if (remoteItem.id && remoteItem.name) {
          const { contentHash, ...cleanData } = remoteItem;
          itemsToUpsert.push({
            ...cleanData,
            id: String(cleanData.id),
            name: String(cleanData.name),
            source: 'system',
            lang: cleanData.lang || 'es',
            calories_100g: Number(cleanData.calories_100g) || 0,
            protein_100g: Number(cleanData.protein_100g) || 0,
            carbs_100g: Number(cleanData.carbs_100g) || 0,
            fats_100g: Number(cleanData.fats_100g) || 0,
            updatedAt: now
          });
        }
      } catch (e) {
        // ignore
      }
    }

    if (itemsToUpsert.length > 0) {
      await db.base_ingredients.bulkUpsert(itemsToUpsert);
    }

    // 5. Update last ingested catalog version in system_metadata
    await this.dbService.setMetadata('lastIngestedCatalogVersion', remoteVersion);
    if (remoteGeneratedAt) {
      await this.dbService.setMetadata('lastIngestedCatalogGeneratedAt', remoteGeneratedAt);
    }

    return {
      status: 'UPDATED',
      version: remoteVersion,
      generatedAt: remoteGeneratedAt,
      // NOTE: We don't have the full itemsUpserted count easily available unless we tracked it across batches
      itemsUpserted: -1 // -1 signifies streaming update complete
    };
  }
}
