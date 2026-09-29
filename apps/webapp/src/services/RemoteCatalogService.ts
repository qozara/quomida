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
      this.poolPromise = createSQLiteHTTPPool({ 
        workers: 1,
        httpOptions: { backendType: 'sync', maxPageSize: 4096 } 
      })
        .then(async (pool) => {
          await pool.open(this.catalogUrl);
          return pool;
        });
    }
    return this.poolPromise;
  }

  async searchIngredients(query: string, limit: number = 20): Promise<BaseIngredient[]> {
    const pool = await this.getPool();
    // Use FTS5 virtual table for sub-millisecond full substring searching over HTTP VFS
    // Format query for FTS prefix matching: "apple pie" -> "apple* pie*"
    const matchQuery = query.split(/\s+/).filter(Boolean).map(term => term + '*').join(' ');

    const sql = `
      SELECT b.* 
      FROM base_ingredients_fts f
      JOIN base_ingredients b ON f.id = b.id
      WHERE f.name MATCH $matchQuery
      LIMIT $limit
    `;
    
    // Add a timeout to prevent infinite spinning if the worker crashes (e.g. due to 403 Forbidden)
    const results = await Promise.race([
      pool.exec(sql, { $matchQuery: matchQuery, $limit: limit }, { rowMode: 'object' }),
      new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('Remote search timeout')), 10000))
    ]).catch(err => {
      console.error('Remote search error:', err);
      return [];
    });
    
    if (!results || results.length === 0) return [];
    
    return results as unknown as BaseIngredient[];
  }

  async getPortionsForIngredient(baseFoodId: string): Promise<Portion[]> {
    const pool = await this.getPool();
    const sql = `SELECT * FROM portions WHERE base_food_id = $id`;
    
    const results = await Promise.race([
      pool.exec(sql, { $id: baseFoodId }, { rowMode: 'object' }),
      new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('Remote search timeout')), 10000))
    ]).catch(err => {
      console.error('Remote portions error:', err);
      return [];
    });
    
    if (!results || results.length === 0) return [];
    
    return results as unknown as Portion[];
  }
}
