import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { sanitizeIngredient, computeContentHash } from '../src/utils/sanitizer.js';
import { exportSQLiteCatalog } from '../src/exporters/SQLiteExporter.js';
import type { BaseIngredient } from '@quomida/domain-core';

describe('ETL Pipeline & Catalog Generation [ETL-203]', () => {
  let tempDir: string;
  let publicDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quomida-etl-test-'));
    publicDir = path.join(tempDir, 'public');
    fs.mkdirSync(publicDir, { recursive: true });
    
    // Unset environment variable during tests so it doesn't attempt to fetch
    delete process.env.PREBUILT_SYSTEM_CATALOG_URL;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('sanitizes food names and validates nutritional macro values', () => {
    const maliciousFood: any = {
      id: 'ing-xss',
      name: '  <script>alert("hack")</script>Apple, raw  ',
      originSource: 'system',
      lang: 'es',
      calories_100g: 52,
      protein_100g: 0.3,
      carbs_100g: 13.8,
      fats_100g: 0.2
    };

    const sanitized = sanitizeIngredient(maliciousFood);
    expect(sanitized.name).not.toContain('<script>');
    expect(sanitized.name).toBe('Apple, raw');
    expect(sanitized.calories_100g).toBe(52);
  });

  it('produces deterministic contentHash based on name and macros', () => {
    const item1: BaseIngredient = {
      id: 'ing-apple',
      name: 'Apple',
      source: 'system',
      lang: 'es',
      calories_100g: 52,
      protein_100g: 0.3,
      carbs_100g: 13.8,
      fats_100g: 0.2
    };

    const item2: BaseIngredient = { ...item1 };
    const hash1 = computeContentHash(item1);
    const hash2 = computeContentHash(item2);
    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe('string');
    expect(hash1.length).toBe(32); // MD5 hex length

    const modifiedItem: BaseIngredient = { ...item1, calories_100g: 55 };
    const hashModified = computeContentHash(modifiedItem);
    expect(hashModified).not.toBe(hash1);
  });

  it('generates catalog.sqlite.gz, system.sqlite, and catalog_meta.json using SQLiteExporter', async () => {
    const ndjsonPath = path.join(tempDir, 'source.ndjson');
    fs.writeFileSync(
      ndjsonPath,
      JSON.stringify({
        id: "ing-1",
        name: "Alimento Test Bife Magico",
        originSource: "SARA2",
        lang: "es",
        calories_100g: 210,
        protein_100g: 22.5,
        carbs_100g: 0,
        fats_100g: 13.4
      }) + '\n' +
      JSON.stringify({
        id: "sys-1",
        name: "System Apple",
        originSource: "SYSTEM",
        lang: "en",
        calories_100g: 50,
        protein_100g: 0,
        carbs_100g: 10,
        fats_100g: 0
      }) + '\n',
      'utf-8'
    );
    
    const catalogPath = path.join(publicDir, 'catalog.sqlite');
    const systemPath = path.join(publicDir, 'system.sqlite');
    const metaPath = path.join(publicDir, 'catalog_meta.json');

    await exportSQLiteCatalog([ndjsonPath], catalogPath, systemPath, metaPath);

    expect(fs.existsSync(catalogPath)).toBe(true);
    expect(fs.existsSync(systemPath)).toBe(true);
    expect(fs.existsSync(`${catalogPath}.gz`)).toBe(true);
    expect(fs.existsSync(metaPath)).toBe(true);

    const { DatabaseSync } = await import('node:sqlite');
    
    // Check catalog.sqlite
    const db = new DatabaseSync(catalogPath);
    const items = db.prepare('SELECT * FROM base_ingredients').all() as any[];
    db.close();
    
    // Check system.sqlite
    const sysDb = new DatabaseSync(systemPath);
    const sysItems = sysDb.prepare('SELECT * FROM base_ingredients').all() as any[];
    sysDb.close();

    expect(items.length).toBe(2); // catalog has both SARA2 and SYSTEM
    expect(sysItems.length).toBe(1); // system has only SYSTEM
    expect(sysItems[0].source).toBe('system');
    
    const metaData = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

    expect(metaData.catalogVersion).toBeDefined();
    expect(metaData.generatedAt).toBeDefined();
    expect(metaData.itemCount).toBe(2);
  });

  it('fetches prebuilt system catalog and companion system_meta.json via HTTP without SQL', async () => {
    const { fetchPrebuiltSystemCatalog } = await import('../src/utils/fetchPrebuiltSystem.js');
    const mockSqliteBuffer = new TextEncoder().encode('mock sqlite binary content');
    const mockMetaContent = {
      itemCount: 965,
      ingredientsCount: 885,
      portionsCount: 80,
      generatedAt: '2026-10-03T12:00:00Z',
      catalogVersion: 'abc12345'
    };

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('system.sqlite')) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => mockSqliteBuffer.buffer
        } as any;
      }
      if (url.includes('system_meta.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockMetaContent
        } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    try {
      const systemOut = path.join(publicDir, 'system.sqlite');
      await fetchPrebuiltSystemCatalog('https://cdn.example.com/system.sqlite', systemOut, tempDir);

      expect(fs.existsSync(systemOut)).toBe(true);
      expect(fs.readFileSync(systemOut).toString()).toBe('mock sqlite binary content');

      const metaPath = path.resolve(path.dirname(systemOut), '../src/generated/system_meta.json');
      expect(fs.existsSync(metaPath)).toBe(true);
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      expect(meta.itemCount).toBe(965);
      expect(meta.catalogVersion).toBe('abc12345');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('falls back to local better-sqlite3 inspection when remote system_meta.json returns 404', async () => {
    const { fetchPrebuiltSystemCatalog } = await import('../src/utils/fetchPrebuiltSystem.js');
    const Database = (await import('better-sqlite3')).default;
    
    // Create a real sample sqlite file to mock binary download
    const sampleDbPath = path.join(tempDir, 'sample.sqlite');
    const sampleDb = new Database(sampleDbPath);
    sampleDb.exec(`
      CREATE TABLE base_ingredients (id TEXT PRIMARY KEY, name TEXT);
      CREATE TABLE portions (id TEXT PRIMARY KEY, base_food_id TEXT);
      INSERT INTO base_ingredients (id, name) VALUES ('ing_1', 'Apple');
      INSERT INTO portions (id, base_food_id) VALUES ('port_1', 'ing_1');
    `);
    sampleDb.close();
    const realSqliteBuffer = fs.readFileSync(sampleDbPath);

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('system.sqlite')) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => realSqliteBuffer.buffer.slice(realSqliteBuffer.byteOffset, realSqliteBuffer.byteOffset + realSqliteBuffer.byteLength)
        } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    try {
      const systemOut = path.join(publicDir, 'system.sqlite');
      await fetchPrebuiltSystemCatalog('https://cdn.example.com/system.sqlite', systemOut, tempDir);

      expect(fs.existsSync(systemOut)).toBe(true);

      const metaPath = path.resolve(path.dirname(systemOut), '../src/generated/system_meta.json');
      expect(fs.existsSync(metaPath)).toBe(true);
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      expect(meta.itemCount).toBe(2);
      expect(meta.ingredientsCount).toBe(1);
      expect(meta.portionsCount).toBe(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('fails and exits with code 1 if remote system_meta.json returns 404 and native sqlite inspection fails', async () => {
    const { fetchPrebuiltSystemCatalog } = await import('../src/utils/fetchPrebuiltSystem.js');
    const corruptBuffer = new TextEncoder().encode('corrupt not a sqlite database');

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('system.sqlite')) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => corruptBuffer.buffer
        } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit(1)');
    }) as any);

    try {
      const systemOut = path.join(publicDir, 'system.sqlite');
      await expect(
        fetchPrebuiltSystemCatalog('https://cdn.example.com/system.sqlite', systemOut, tempDir)
      ).rejects.toThrow('process.exit(1)');

      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
      global.fetch = originalFetch;
    }
  });

  it('deduplicates package size variants (Pass 4A) into quality leader and merges distinct portions', async () => {
    const ndjsonPath = path.join(tempDir, 'off-variants.ndjson');
    const catalogPath = path.join(publicDir, 'catalog.sqlite');
    const systemPath = path.join(publicDir, 'system.sqlite');
    const metaPath = path.join(publicDir, 'catalog_meta.json');

    // Two Oreo variants with identical cleanName, brandTag, macroBucket
    // Winner: Barcode 779111111111 (qualityScore 10050)
    // Loser: Barcode 779222222222 (qualityScore 10010)
    const lines = [
      // Leader ingredient
      JSON.stringify({
        id: 'ing-off-779111111111',
        name: 'Galletitas Oreo - Oreo',
        cleanName: 'Galletitas Oreo',
        brandTag: 'oreo',
        categoryTag: 'en:chocolate-biscuits',
        qualityScore: 10050,
        originSource: 'OPENFOODFACTS',
        barcode: '779111111111',
        lang: 'es-AR',
        calories_100g: 480,
        protein_100g: 5.0,
        carbs_100g: 71.0,
        fats_100g: 20.0
      }),
      // Portion 1 for Leader
      JSON.stringify({
        _type: 'portion',
        id: 'port-off-779111111111-1',
        base_food_id: 'ing-off-779111111111',
        name: '1 paquete individual (36g)',
        equivalent_weight_g: 36,
        source: 'system',
        originSource: 'OPENFOODFACTS'
      }),
      // Variant 2 (package size 118g)
      JSON.stringify({
        id: 'ing-off-779222222222',
        name: 'Galletitas Oreo - Oreo',
        cleanName: 'Galletitas Oreo',
        brandTag: 'oreo',
        categoryTag: 'en:chocolate-biscuits',
        qualityScore: 10010,
        originSource: 'OPENFOODFACTS',
        barcode: '779222222222',
        lang: 'es-AR',
        calories_100g: 480,
        protein_100g: 5.0,
        carbs_100g: 71.0,
        fats_100g: 20.0
      }),
      // Portion 2 for Variant 2 (distinct weight 118g)
      JSON.stringify({
        _type: 'portion',
        id: 'port-off-779222222222-1',
        base_food_id: 'ing-off-779222222222',
        name: '1 paquete mediano (118g)',
        equivalent_weight_g: 118,
        source: 'system',
        originSource: 'OPENFOODFACTS'
      }),
      // Portion 3 for Variant 2 with duplicate weight (36g) - should be merged/deduped
      JSON.stringify({
        _type: 'portion',
        id: 'port-off-779222222222-2',
        base_food_id: 'ing-off-779222222222',
        name: '3 galletas (36g)',
        equivalent_weight_g: 36,
        source: 'system',
        originSource: 'OPENFOODFACTS'
      })
    ].join('\n') + '\n';

    fs.writeFileSync(ndjsonPath, lines, 'utf-8');

    await exportSQLiteCatalog([ndjsonPath], catalogPath, systemPath, metaPath);

    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(catalogPath);

    // Assert only the leader barcode exists in base_ingredients
    const ingredients = db.prepare('SELECT id, name, calories_100g FROM base_ingredients').all() as any[];
    expect(ingredients.length).toBe(1);
    expect(ingredients[0].id).toBe('ing-off-779111111111');
    expect(ingredients[0].name).toBe('Galletitas Oreo - Oreo');

    // Assert both distinct portions (36g and 118g) were merged under winning base_food_id
    const portions = db.prepare('SELECT id, base_food_id, equivalent_weight_g FROM portions WHERE base_food_id = ?').all('ing-off-779111111111') as any[];
    expect(portions.length).toBe(2);
    const weights = portions.map(p => p.equivalent_weight_g).sort((a, b) => a - b);
    expect(weights).toEqual([36, 118]);

    db.close();
  });

  it('deduplicates cross-language products (Pass 4B) into higher-scored LatAm/Spain leader', async () => {
    const ndjsonPath = path.join(tempDir, 'off-xlang.ndjson');
    const catalogPath = path.join(publicDir, 'catalog.sqlite');
    const systemPath = path.join(publicDir, 'system.sqlite');
    const metaPath = path.join(publicDir, 'catalog_meta.json');

    // French product vs Spanish product sharing brandTag + categoryTag + tightMacroBucket
    // Winner: Spanish (qualityScore 10050 due to LatAm/Spain priority)
    // Loser: French (qualityScore 25)
    const lines = [
      JSON.stringify({
        id: 'ing-off-301760000001',
        name: 'Oréo Biscuit Cacaoté - Oreo',
        cleanName: 'Oréo Biscuit Cacaoté',
        brandTag: 'oreo',
        categoryTag: 'en:chocolate-biscuits',
        qualityScore: 25,
        originSource: 'OPENFOODFACTS',
        barcode: '301760000001',
        lang: 'fr-FR',
        calories_100g: 480,
        protein_100g: 5.0,
        carbs_100g: 71.0,
        fats_100g: 20.0
      }),
      JSON.stringify({
        id: 'ing-off-779111111112',
        name: 'Galletitas Oreo - Oreo',
        cleanName: 'Galletitas Oreo',
        brandTag: 'oreo',
        categoryTag: 'en:chocolate-biscuits',
        qualityScore: 10050,
        originSource: 'OPENFOODFACTS',
        barcode: '779111111112',
        lang: 'es-AR',
        calories_100g: 480,
        protein_100g: 5.0,
        carbs_100g: 71.0,
        fats_100g: 20.0
      })
    ].join('\n') + '\n';

    fs.writeFileSync(ndjsonPath, lines, 'utf-8');

    await exportSQLiteCatalog([ndjsonPath], catalogPath, systemPath, metaPath);

    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(catalogPath);

    const ingredients = db.prepare('SELECT id, name FROM base_ingredients').all() as any[];
    expect(ingredients.length).toBe(1);
    expect(ingredients[0].id).toBe('ing-off-779111111112');
    expect(ingredients[0].name).toBe('Galletitas Oreo - Oreo');

    db.close();
  });
});
