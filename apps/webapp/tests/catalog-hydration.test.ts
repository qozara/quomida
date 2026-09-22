import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDatabase, destroyDatabase, LocalDBService } from '../src/db/rxdb.js';
import { CatalogHydrationService } from '../src/services/CatalogHydrationService.js';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

describe('CatalogHydrationService [APP-206]', () => {
  let service: LocalDBService;
  let hydrationService: CatalogHydrationService;

  beforeEach(async () => {
    await destroyDatabase();
    const dbName = `hydration_test_db_${Date.now()}`;
    service = new LocalDBService({ storage: getRxStorageMemory(), name: dbName });
    await service.init();
    hydrationService = new CatalogHydrationService(service);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await destroyDatabase();
  });

  it('handles 404 on metadata gracefully in CI environments without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    const result = await hydrationService.hydrate();
    expect(result.status).toBe('SKIPPED');
    expect(result.itemsUpserted).toBe(0);
  });

  it('skips catalog download when local version matches remote version', async () => {
    await service.setMetadata('lastIngestedCatalogVersion', 'v1.0.0');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('catalog_meta.json')) {
        return new Response(JSON.stringify({ catalogVersion: 'v1.0.0', generatedAt: '2026-09-20T00:00:00Z' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response('{}', { status: 200 });
    });

    const result = await hydrationService.hydrate();
    expect(result.status).toBe('UP_TO_DATE');
    expect(result.version).toBe('v1.0.0');
    expect(result.itemsUpserted).toBe(0);

    const metaCalls = fetchSpy.mock.calls.filter(c => String(c[0]).includes('catalog_meta.json'));
    expect(metaCalls.length).toBe(1);
  });

  it('downloads catalog and updates database when a newer version is available', async () => {
    await service.setMetadata('lastIngestedCatalogVersion', 'v1.0.0');

    const metaResponse = { catalogVersion: 'v1.0.1', generatedAt: '2026-09-20T12:00:00Z' };
    const catalogNdjson = JSON.stringify({
      id: 'ing-new-apple',
      name: 'Golden Apple',
      source: 'system',
      lang: 'en',
      calories_100g: 60,
      protein_100g: 0.5,
      carbs_100g: 15,
      fats_100g: 0.1,
      contentHash: 'mockhash123'
    }) + '\n';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('catalog_meta.json')) return new Response(JSON.stringify(metaResponse), { status: 200 });
      if (String(url).includes('catalog.ndjson')) return new Response(catalogNdjson, { status: 200 });
      return new Response('{}', { status: 200 });
    });

    const result = await hydrationService.hydrate();
    expect(result.status).toBe('UPDATED');
    expect(result.version).toBe('v1.0.1');
    expect(result.itemsUpserted).toBe(1);

    // Verify lastIngestedCatalogVersion was saved
    const updatedVersion = await service.getMetadata('lastIngestedCatalogVersion');
    expect(updatedVersion).toBe('v1.0.1');

    // Verify item exists in database
    const db = service.getDatabaseInstance()!;
    const item = await db.base_ingredients.findOne('ing-new-apple').exec();
    expect(item).not.toBeNull();
    expect(item?.name).toBe('Golden Apple');
  });

  it('never modifies or compares against user-created custom ingredients', async () => {
    // 1. User saves custom ingredient
    const customId = await service.saveCustomFood({
      name: 'My Special Meal',
      lang: 'es',
      calories_100g: 300,
      protein_100g: 20,
      carbs_100g: 30,
      fats_100g: 10
    });

    // 2. Remote catalog includes system food updates
    const metaResponse = { catalogVersion: 'v2.0.0', generatedAt: '2026-09-20T12:00:00Z' };
    const catalogNdjson = JSON.stringify({
      id: 'ing-vacambre',
      name: 'Vacío vacuno (crudo) UPDATED',
      source: 'system',
      lang: 'es',
      calories_100g: 180,
      protein_100g: 21.0,
      carbs_100g: 0,
      fats_100g: 11.0,
      contentHash: 'updatedhash'
    }) + '\n';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('catalog_meta.json')) return new Response(JSON.stringify(metaResponse), { status: 200 });
      if (String(url).includes('catalog.ndjson')) return new Response(catalogNdjson, { status: 200 });
      return new Response('{}', { status: 200 });
    });

    await hydrationService.hydrate();

    // 3. Verify user custom food is completely intact
    const db = service.getDatabaseInstance()!;
    const customFood = await db.base_ingredients.findOne(customId).exec();
    expect(customFood).not.toBeNull();
    expect(customFood?.source).toBe('custom');
    expect(customFood?.name).toBe('My Special Meal');

    // 4. Verify system food was updated
    const systemFood = await db.base_ingredients.findOne('ing-vacambre').exec();
    expect(systemFood?.name).toBe('Vacío vacuno (crudo) UPDATED');
  });

  it('supports force refresh with cache bypass', async () => {
    await service.setMetadata('lastIngestedCatalogVersion', 'v1.0.0');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('catalog_meta.json')) return new Response(JSON.stringify({ catalogVersion: 'v1.0.0', items: [] }), { status: 200 });
      return new Response('{}', { status: 200 });
    });

    const result = await hydrationService.hydrate({ force: true });
    const metaCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('catalog_meta.json'));
    expect(metaCall).toBeDefined();
    expect(metaCall![1]?.cache).toBe('no-cache');
  });
});
