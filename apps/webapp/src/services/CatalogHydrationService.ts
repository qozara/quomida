import type { BaseIngredient } from '@quomida/domain-core';
import type { LocalDBService } from '../db/rxdb.js';

export interface HydrationResult {
  status: 'UP_TO_DATE' | 'UPDATED' | 'SKIPPED' | 'ERROR' | 'CANCELLED';
  version?: string;
  generatedAt?: string;
  itemsUpserted: number;
  error?: string;
}

export interface CatalogHydrationOptions {
  force?: boolean;
  baseUrl?: string;
  signal?: AbortSignal;
  onProgress?: (state: { loadedBytes: number; totalBytes?: number; itemsProcessed: number }) => void;
}

export class CatalogHydrationService {
  constructor(private dbService: LocalDBService) { }

  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('Aborted'));
      const timer = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('Aborted'));
        }, { once: true });
      }
    });
  }

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

    // 1. Fetch lightweight metadata
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

    if (!remoteVersion) return { status: 'ERROR', itemsUpserted: 0, error: 'Catalog metadata is missing catalogVersion property' };

    // 2. Compare versions
    const localVersion = await this.dbService.getMetadata('lastIngestedCatalogVersion');
    if (!options?.force && localVersion === remoteVersion) {
      return { status: 'UP_TO_DATE', version: remoteVersion, generatedAt: remoteGeneratedAt, itemsUpserted: 0 };
    }

    // 3. Fetch stream with auto-resume support
    const catalogUrl = `${baseUrl}/catalog.ndjson${options?.force ? `?t=${Date.now()}` : ''}`;
    
    let itemsProcessed = 0;
    let itemsUpsertedCount = 0;
    let bytesRead = 0;
    let totalBytes: number | undefined;
    
    let buffer = '';
    const decoder = new TextDecoder('utf-8');
    const BATCH_SIZE = 5000;
    let batch: BaseIngredient[] = [];
    let db = await this.dbService.init();
    
    const processBatch = async () => {
      if (batch.length === 0) return;
      
      const batchIds = batch.map(i => i.id);
      const existingDocs = await db.base_ingredients.find({ selector: { id: { $in: batchIds } } }).exec();
      const existingMap = new Map<string, any>();
      for (const doc of existingDocs) existingMap.set(doc.toJSON().id, doc.toJSON());

      const itemsToUpsert: BaseIngredient[] = [];
      const now = Date.now();

      for (const remoteItem of batch) {
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
          const { contentHash, ...cleanData } = remoteItem as any;
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
      }

      if (itemsToUpsert.length > 0) {
        await db.base_ingredients.bulkUpsert(itemsToUpsert);
        itemsUpsertedCount += itemsToUpsert.length;
      }
      
      batch = [];
      // Yield to UI thread to prevent blocking
      await new Promise(r => setTimeout(r, 0));
    };

    let retries = 0;
    const maxRetries = 5;
    
    while (retries < maxRetries) {
      if (options?.signal?.aborted) return { status: 'CANCELLED', itemsUpserted: itemsUpsertedCount };

      try {
        const headers: HeadersInit = {};
        if (bytesRead > 0) {
          headers['Range'] = `bytes=${bytesRead}-`;
        }

        const res = await fetch(catalogUrl, { ...fetchOptions, headers });
        if (!res.ok) {
          // If server doesn't support Range, 416 means we might be done, or we have to start over.
          // Let's just break out if it's a hard error
          throw new Error(`HTTP Error ${res.status}`);
        }
        
        if (retries === 0 && res.headers.has('content-length')) {
          totalBytes = parseInt(res.headers.get('content-length')!, 10);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No readable stream');

        while (true) {
          if (options?.signal?.aborted) {
            reader.cancel().catch(() => {});
            return { status: 'CANCELLED', itemsUpserted: itemsUpsertedCount };
          }

          const { done, value } = await reader.read();
          if (done) break;

          bytesRead += value.length;
          buffer += decoder.decode(value, { stream: true });
          
          let lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const item = JSON.parse(line);
              if (item && item.id && item.name) {
                batch.push(item);
                itemsProcessed++;
              }
            } catch (e) {
              // ignore malformed line
            }
          }

          if (batch.length >= BATCH_SIZE) {
            await processBatch();
          }
          
          if (options?.onProgress) {
            options.onProgress({ loadedBytes: bytesRead, totalBytes, itemsProcessed });
          }
        }
        
        // Success!
        break;

      } catch (err: any) {
        if (err.name === 'AbortError' || err.message === 'Aborted') {
          return { status: 'CANCELLED', itemsUpserted: itemsUpsertedCount };
        }
        console.warn(`[CatalogHydration] Stream error (retry ${retries + 1}/${maxRetries}):`, err);
        retries++;
        if (retries >= maxRetries) {
          return { status: 'ERROR', itemsUpserted: itemsUpsertedCount, error: err.message };
        }
        // Exponential backoff
        await this.delay(Math.min(5000 * Math.pow(2, retries - 1), 30000), options?.signal);
      }
    }

    // Process any remaining partial buffer
    if (buffer.trim()) {
      try {
        const item = JSON.parse(buffer);
        if (item && item.id && item.name) batch.push(item);
      } catch (e) { }
    }
    
    if (batch.length > 0) {
      await processBatch();
    }

    await this.dbService.setMetadata('lastIngestedCatalogVersion', remoteVersion);
    if (remoteGeneratedAt) {
      await this.dbService.setMetadata('lastIngestedCatalogGeneratedAt', remoteGeneratedAt);
    }

    return {
      status: 'UPDATED',
      version: remoteVersion,
      generatedAt: remoteGeneratedAt,
      itemsUpserted: itemsUpsertedCount
    };
  }
}
