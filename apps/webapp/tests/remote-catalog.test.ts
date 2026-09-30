import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RemoteCatalogService } from '../src/services/RemoteCatalogService.js';
import fs from 'fs';
import { vi } from 'vitest';

vi.mock('sqlite-wasm-http', () => {
  return {
    createSQLiteHTTPPool: async () => {
      return {
        open: async () => {},
        close: async () => {},
        exec: async (sql: string, bind: any, options: any) => {
          if (sql.includes('FROM portions')) {
            if (bind && bind[0] === '1') {
              // Return the worker message object shape
              return [{ row: ['p1', '1', 'Slice', 30, 'hash'] }];
            }
            return [];
          }
          if (sql.includes('FROM base_ingredients_fts')) {
            if (sql.toLowerCase().includes('avacado')) {
              return [{ row: ['1', 'Avacado Test', 'source', 'en', 100, 1, 1, 1, 'hash'] }];
            }
            return [];
          }
          return [];
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

  it('should gracefully return empty array when the remote database is unreachable', async () => {
    // Force a failure by hijacking the internal pool
    const pool = await (service as any).getPool();
    vi.spyOn(pool, 'exec').mockRejectedValueOnce(new Error('Network offline'));

    const results = await service.searchIngredients('Avacado');
    expect(results).toEqual([]);
  });

  it('should search for portions linked to a base_food_id', async () => {
    const pool = await (service as any).getPool();
    await pool.exec("INSERT INTO portions (base_food_id, name, equivalent_weight_g) VALUES ('1', 'Slice', 30)", {});

    const portions = await service.getPortionsForIngredient('1');
    console.log('PORTIONS', portions);
    expect(portions.length).toBe(1);
    expect(portions[0].name).toBe('Slice');
  });

  it('should return empty array for portions when none exist', async () => {
    const portions = await service.getPortionsForIngredient('999');
    expect(portions).toEqual([]);
  });
});
