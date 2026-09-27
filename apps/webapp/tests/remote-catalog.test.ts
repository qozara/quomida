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
});
