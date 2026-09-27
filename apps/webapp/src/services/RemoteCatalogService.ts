import { createSQLiteHTTPPool } from 'sqlite-wasm-http';
import type { BaseIngredient, Portion } from '@quomida/domain-core';

export class RemoteCatalogService {
  private poolPromise: Promise<any> | null = null;
  private catalogUrl: string;

  constructor(baseUrl: string) {
    const rawBaseUrl = baseUrl.replace(/\/+$/, '');
    this.catalogUrl = rawBaseUrl ? `${rawBaseUrl}/catalog.sqlite` : '/catalog.sqlite';
  }

  private getPool() {
    if (!this.poolPromise) {
      this.poolPromise = createSQLiteHTTPPool({ workers: 1 })
        .then(async (pool) => {
          await pool.open(this.catalogUrl);
          return pool;
        });
    }
    return this.poolPromise;
  }

  async searchIngredients(query: string, limit: number = 20): Promise<BaseIngredient[]> {
    const pool = await this.getPool();
    const sql = `SELECT * FROM base_ingredients WHERE name LIKE '%' || $query || '%' LIMIT $limit`;
    const results = await pool.exec(sql, { $query: query, $limit: limit });
    
    if (!results || results.length === 0 || !results[0].row) return [];
    
    const out: BaseIngredient[] = [];
    for (const res of results) {
      if (!res.row) continue;
      const obj: any = {};
      for (let i = 0; i < res.columnNames.length; i++) {
        obj[res.columnNames[i]] = res.row[i];
      }
      out.push(obj as BaseIngredient);
    }
    
    return out;
  }

  async getPortionsForIngredient(baseFoodId: string): Promise<Portion[]> {
    const pool = await this.getPool();
    const sql = `SELECT * FROM portions WHERE base_food_id = $id`;
    const results = await pool.exec(sql, { $id: baseFoodId });
    
    if (!results || results.length === 0 || !results[0].row) return [];
    
    const out: Portion[] = [];
    for (const res of results) {
      if (!res.row) continue;
      const obj: any = {};
      for (let i = 0; i < res.columnNames.length; i++) {
        obj[res.columnNames[i]] = res.row[i];
      }
      out.push(obj as Portion);
    }
    
    return out;
  }
}
