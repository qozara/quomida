import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { RemoteCatalogService } from '../src/services/RemoteCatalogService.js';
import fs from 'fs';

// Mock sqlite-wasm-http for Node environment
import { vi } from 'vitest';

vi.mock('sqlite-wasm-http', () => {
  return {
    createSQLiteHTTPPool: async () => {
      // In tests, we connect directly to an in-memory db
      const db = new DatabaseSync(':memory:');
      db.exec(`
        CREATE TABLE base_ingredients (id TEXT, name TEXT);
        INSERT INTO base_ingredients (id, name) VALUES ('1', 'Avacado Test');
        CREATE TABLE portions (base_food_id TEXT, name TEXT, equivalent_weight_g REAL);
      `);
      return {
        open: async () => {},
        close: async () => db.close(),
        exec: async (sql: string, bind: any) => {
          const stmt = db.prepare(sql);
          const rows = stmt.all(bind);
          if (rows.length === 0) return [];
          const columnNames = Object.keys(rows[0] as any);
          return rows.map((row: any) => ({
            columnNames,
            row: Object.values(row)
          }));
        }
      };
    }
  };
});

describe('RemoteCatalogService', () => {
  let service: RemoteCatalogService;

  beforeEach(() => {
    service = new RemoteCatalogService('');
  });

  it('should search ingredients by name', async () => {
    const results = await service.searchIngredients('Avacado');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name.toLowerCase()).toContain('avacado');
  });

  it('should return empty array when no ingredients match (cache miss)', async () => {
    const results = await service.searchIngredients('NonExistentFood123');
    expect(results).toEqual([]);
  });

  it('should propagate connector failures when the remote database is unreachable', async () => {
    // Force a failure by hijacking the internal pool
    const pool = await (service as any).getPool();
    vi.spyOn(pool, 'exec').mockRejectedValueOnce(new Error('Network offline'));

    await expect(service.searchIngredients('Avacado')).rejects.toThrow('Network offline');
  });

  it('should search for portions linked to a base_food_id', async () => {
    const pool = await (service as any).getPool();
    await pool.exec("INSERT INTO portions (base_food_id, name, equivalent_weight_g) VALUES ('1', 'Slice', 30)", {});

    const portions = await service.getPortionsForIngredient('1');
    expect(portions.length).toBe(1);
    expect(portions[0].name).toBe('Slice');
  });

  it('should return empty array for portions when none exist', async () => {
    const portions = await service.getPortionsForIngredient('999');
    expect(portions).toEqual([]);
  });
});
