import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RemoteCatalogService } from '../src/services/RemoteCatalogService.js';
import fs from 'fs';
import { vi } from 'vitest';

vi.mock('sqlite-wasm-http', () => {
  return {
    createHttpBackend: () => ({}),
    createSQLiteThread: async () => {
      const worker = async (action: string, payload: any) => {
        if (action === 'open') return;
        if (action === 'close') return;
        if (action === 'exec') {
          const sql = payload.sql;
          if (sql.includes('SELECT count(*)')) {
            return { result: { resultRows: [[15000]] } }; // Simulate OPFS having full catalog
          }
          if (sql.includes('FROM portions')) {
            if (sql.includes("'1'")) {
              return { result: { resultRows: [['p1', '1', 'Slice', 30, 'hash']] } };
            }
            return { result: { resultRows: [] } };
          }
          if (sql.includes('FROM base_ingredients_fts')) {
            if (sql.toLowerCase().includes('avacado')) {
              return { result: { resultRows: [['1', 'Avacado Test', 'source', 'en', 100, 1, 1, 1, 'hash']] } };
            }
            return { result: { resultRows: [] } };
          }
          return { result: { resultRows: [] } };
        }
      };
      return worker;
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
    // Force a failure by hijacking the internal worker
    const worker = await (service as any).getWorker();
    vi.spyOn(service as any, 'getWorker').mockResolvedValue(async (action: string) => {
      if (action === 'exec') throw new Error('Network offline');
    });

    const results = await service.searchIngredients('Avacado');
    expect(results).toEqual([]);
  });

  it('should search for portions linked to a base_food_id', async () => {
    const portions = await service.getPortionsForIngredient('1');
    expect(portions.length).toBe(1);
    expect(portions[0].name).toBe('Slice');
  });

  it('should return empty array for portions when none exist', async () => {
    const portions = await service.getPortionsForIngredient('999');
    expect(portions).toEqual([]);
  });
});
