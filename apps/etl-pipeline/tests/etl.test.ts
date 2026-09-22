import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runETL, buildCatalogPayload, sanitizeIngredient, computeContentHash, computeCatalogVersion } from '../src/index.js';
import type { BaseIngredient } from '@quomida/domain-core';

describe('ETL Pipeline & Catalog Generation [ETL-203]', () => {
  let tempDir: string;
  let publicDir: string;
  let assetsDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quomida-etl-test-'));
    publicDir = path.join(tempDir, 'public');
    assetsDir = path.join(tempDir, 'assets');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('sanitizes food names and validates nutritional macro values', () => {
    const maliciousFood: any = {
      id: 'ing-xss',
      name: '  <script>alert("hack")</script>Apple, raw  ',
      source: 'system',
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

  it('produces deterministic catalogVersion across multiple runs', () => {
    const items: BaseIngredient[] = [
      {
        id: 'ing-1',
        name: 'Item 1',
        source: 'system',
        lang: 'es',
        calories_100g: 100,
        protein_100g: 10,
        carbs_100g: 10,
        fats_100g: 2
      }
    ];

    const v1 = computeCatalogVersion(items);
    const v2 = computeCatalogVersion(items);
    expect(v1).toBe(v2);

    const changedItems: BaseIngredient[] = [
      {
        ...items[0],
        protein_100g: 12
      }
    ];
    const v3 = computeCatalogVersion(changedItems);
    expect(v3).not.toBe(v1);
  });

  it('generates catalog.json and catalog_meta.json in public directory with matching versions', async () => {
    // Pass a fake empty dataRawDir so it doesn't accidentally read the massive 10GB real dump during tests
    const emptyRawDir = path.join(tempDir, 'empty_raw');
    fs.mkdirSync(emptyRawDir, { recursive: true });
    
    await runETL({ publicDir, assetsDir, dataRawDir: emptyRawDir, reset: true });

    const catalogPath = path.join(publicDir, 'catalog.ndjson');
    const metaPath = path.join(publicDir, 'catalog_meta.json');

    expect(fs.existsSync(catalogPath)).toBe(true);
    expect(fs.existsSync(metaPath)).toBe(true);

    const catalogDataRaw = fs.readFileSync(catalogPath, 'utf-8');
    const items = catalogDataRaw.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
    const metaData = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

    expect(metaData.catalogVersion).toBeDefined();
    expect(metaData.generatedAt).toBeDefined();
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);

    const firstItem = items[0];
    expect(firstItem.id).toBeDefined();
    expect(firstItem.contentHash).toBeDefined();
    expect(firstItem.source).toBe('system');
  });

  it('ingests raw files from dataRawDir and resolves them properly', async () => {
    const rawDir = path.join(tempDir, 'raw');
    const argenDir = path.join(rawDir, 'argenfoods');
    fs.mkdirSync(argenDir, { recursive: true });

    fs.writeFileSync(
      path.join(argenDir, 'argenfoods.csv'),
      'codigo,alimento,energia_kcal,proteina,carbohidratos,lipidos\n9999,Alimento Test,100,5,10,2\n',
      'utf-8'
    );

    await runETL({ publicDir, assetsDir, dataRawDir: rawDir, reset: true });

    const catalogPath = path.join(publicDir, 'catalog.ndjson');
    const catalogDataRaw = fs.readFileSync(catalogPath, 'utf-8');
    const items = catalogDataRaw
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
    
    const testItem = items.find((i: any) => i.name === 'Alimento Test');
    expect(testItem).toBeDefined();
    expect(testItem.calories_100g).toBe(100);
    expect(testItem.source).toBe('system');
  });
});
