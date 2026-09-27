import type { BaseIngredient, Portion } from '@quomida/domain-core';
import type { LocalDBService } from '../db/rxdb.js';
import systemCatalogRaw from '../generated/catalog_system.ndjson?raw';

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

  async hydrateSystemCatalog(force: boolean = false): Promise<void> {
    const isSystemHydrated = await this.dbService.getMetadata('systemCatalogHydrated');
    if (!force && isSystemHydrated === 'true') {
      return; // Already hydrated on previous boot
    }

    const lines = systemCatalogRaw.split('\n');
    const itemsToUpsert: BaseIngredient[] = [];
    const portionsToUpsert: Portion[] = [];
    const now = Date.now();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        if (item._type === 'portion') {
          const { _type, contentHash, ...cleanPortion } = item;
          portionsToUpsert.push({
            ...cleanPortion,
            id: String(cleanPortion.id),
            base_food_id: String(cleanPortion.base_food_id),
            name: String(cleanPortion.name),
            equivalent_weight_g: Number(cleanPortion.equivalent_weight_g) || 0
          });
        } else if (item.id && item.name) {
          const { _type, contentHash, ...cleanData } = item;
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
        // ignore malformed line
      }
    }

    const db = await this.dbService.init();
    
    if (itemsToUpsert.length > 0) {
      await db.base_ingredients.bulkUpsert(itemsToUpsert);
    }
    
    if (portionsToUpsert.length > 0) {
      await db.portions.bulkUpsert(portionsToUpsert);
    }

    await this.dbService.setMetadata('systemCatalogHydrated', 'true');
    console.log(`[Hydration] Seeded ${itemsToUpsert.length} system ingredients and ${portionsToUpsert.length} system portions.`);
  }

  async hydrate(options?: CatalogHydrationOptions): Promise<HydrationResult> {
    // 1. Ensure foundational system catalog is fully hydrated immediately
    await this.hydrateSystemCatalog(options?.force);

    const rawBaseUrl = options?.baseUrl !== undefined
      ? options.baseUrl
      : (typeof import.meta !== 'undefined' && import.meta.env?.VITE_CATALOG_BASE_URL) || '';

    const baseUrl = rawBaseUrl.replace(/\/+$/, '');
    const metaUrl = `${baseUrl}/catalog_meta.json${options?.force ? `?t=${Date.now()}` : ''}`;
    
    const fetchOptions: RequestInit = { 
      cache: options?.force ? 'no-cache' : 'default',
      signal: options?.signal
    };

    // 2. Fetch lightweight metadata from remote VFS provider
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

    // 3. Compare versions
    const localVersion = await this.dbService.getMetadata('lastIngestedCatalogVersion');
    if (!options?.force && localVersion === remoteVersion) {
      return { status: 'UP_TO_DATE', version: remoteVersion, generatedAt: remoteGeneratedAt, fileSizeBytes: remoteFileSizeBytes, itemsUpserted: 0 };
    }

    // 4. Update metadata in local RxDB
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
