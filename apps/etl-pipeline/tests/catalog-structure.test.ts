import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

describe('Built Catalog Validation & Trigram Search', () => {
  const rootDir = path.resolve(__dirname, '../../..');
  const catalogPath = path.join(rootDir, 'apps/etl-pipeline/dist-cdn/catalog.sqlite');
  const catalogGzPath = path.join(rootDir, 'apps/etl-pipeline/dist-cdn/catalog.sqlite.gz');
  const systemPath = path.join(rootDir, 'apps/webapp/public/system.sqlite');

  it('verifies that all expected built catalog artifacts exist', () => {
    expect(fs.existsSync(catalogPath)).toBe(true);
    expect(fs.existsSync(catalogGzPath)).toBe(true);
    expect(fs.existsSync(systemPath)).toBe(true);
    
    const catalogStats = fs.statSync(catalogPath);
    const gzStats = fs.statSync(catalogGzPath);
    
    // GZ should be smaller than raw SQLite
    expect(gzStats.size).toBeLessThan(catalogStats.size);
    // Ensure catalog has decent size (at least 100MB for 1M items)
    expect(catalogStats.size).toBeGreaterThan(100 * 1024 * 1024);
  });

  it('validates FTS5 trigram structure and fuzzy matching on catalog.sqlite', () => {
    const db = new Database(catalogPath, { readonly: true });
    
    // Verify PRAGMA page_size
    const pragma = db.prepare('PRAGMA page_size').get() as { page_size: number };
    expect(pragma.page_size).toBe(1024);

    // Verify tables exist
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[];
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('base_ingredients');
    expect(tableNames).toContain('portions');
    expect(tableNames).toContain('base_ingredients_fts');

    // Test a trigram MATCH query
    // Search for something like 'banan' or a misspelled word to verify it returns results.
    // Trigrams match substrings. For example, 'ban' should match 'banana'.
    // FTS5 trigram MATCH syntax for substrings is just 'banan'
    const query = `
      SELECT id, name
      FROM base_ingredients_fts
      WHERE base_ingredients_fts MATCH '"banan"'
      LIMIT 10
    `;
    const results = db.prepare(query).all() as any[];
    
    // We expect some results for 'banan' since OFF has lots of bananas
    expect(results.length).toBeGreaterThan(0);
    const hasBanana = results.some(r => r.name.toLowerCase().includes('banan'));
    expect(hasBanana).toBe(true);

    db.close();
  });
});
