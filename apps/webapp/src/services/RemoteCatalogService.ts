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
        })
        .catch((err) => {
          this.poolPromise = null;
          throw err;
        });
    }
    return this.poolPromise;
  }

  async searchIngredients(query: string, limit: number = 20): Promise<BaseIngredient[]> {
    const pool = await this.getPool();
    const sanitizedQuery = query.replace(/[^\w\s\u00C0-\u017F]/g, '');
    const matchQuery = sanitizedQuery.split(/\s+/).filter(Boolean).map(term => term + '*').join(' ');
    
    if (!matchQuery) return [];

    const sql = `
      SELECT 
        b.id as id,
        b.name as name,
        b.source as source,
        b.lang as lang,
        b.calories_100g as calories_100g,
        b.protein_100g as protein_100g,
        b.carbs_100g as carbs_100g,
        b.fats_100g as fats_100g,
        b.contentHash as contentHash
      FROM (
        SELECT id FROM base_ingredients_fts 
        WHERE base_ingredients_fts MATCH '${matchQuery.replace(/'/g, "''")}' 
        LIMIT ${limit}
      ) f
      JOIN base_ingredients b ON f.id = b.id
    `;
    
    // Switch to rowMode: 'array' because object mapping across the worker boundary sometimes drops properties
    const results = await Promise.race([
      pool.exec(sql, {}, { rowMode: 'array' }),
      new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('Remote search timeout')), 15000))
    ]).catch(err => {
      console.error('Remote search error:', err);
      // Reset the pool promise so a fresh worker is spun up next time (crucial for network recovery)
      this.poolPromise = null;
      try { pool.close().catch(() => {}); } catch(e) {}
      return [];
    });
    
    if (!results || results.length === 0) return [];
    
    const mapped = results.map((msg: any) => {
      // sqlite-wasm-http returns worker message objects when using exec(): { type: 'exec#1:row', row: [...] }
      const vals = Array.isArray(msg) ? msg : (msg.row || Object.values(msg));
      return {
        id: vals[0],
        name: vals[1],
        source: vals[2],
        lang: vals[3],
        calories_100g: vals[4],
        protein_100g: vals[5],
        carbs_100g: vals[6],
        fats_100g: vals[7],
        contentHash: vals[8]
      };
    });
    
    return mapped as unknown as BaseIngredient[];
  }

  async getPortionsForIngredient(baseFoodId: string): Promise<Portion[]> {
    const pool = await this.getPool();
    const sql = `
      SELECT 
        id as id,
        base_food_id as base_food_id,
        name as name,
        equivalent_weight_g as equivalent_weight_g,
        contentHash as contentHash
      FROM portions 
      WHERE base_food_id = ?
    `;
    
    const results = await Promise.race([
      pool.exec(sql, [baseFoodId], { rowMode: 'array' }),
      new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('Remote search timeout')), 10000))
    ]).catch(err => {
      console.error('Remote portions error:', err);
      this.poolPromise = null;
      try { pool.close().catch(() => {}); } catch(e) {}
      return [];
    });
    
    if (!results || results.length === 0) return [];
    
    const mapped = results.map((msg: any) => {
      const vals = Array.isArray(msg) ? msg : (msg.row || Object.values(msg));
      return {
        id: vals[0],
        base_food_id: vals[1],
        name: vals[2],
        equivalent_weight_g: vals[3],
        contentHash: vals[4]
      };
    });
    
    return mapped as unknown as Portion[];
  }
}
