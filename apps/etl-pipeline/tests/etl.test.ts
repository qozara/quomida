import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
});
