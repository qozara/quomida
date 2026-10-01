import { createSQLiteThread } from 'sqlite-wasm-http';
import type { BaseIngredient, Portion } from '@quomida/domain-core';

export class RemoteCatalogService {
  private workerPromise: Promise<any> | null = null;
  private catalogUrl: string;

  constructor(baseUrl: string) {
    const rawBaseUrl = baseUrl.replace(/\/+$/, '');
    this.catalogUrl = rawBaseUrl ? `${rawBaseUrl}/catalog.sqlite` : '/catalog.sqlite';
  }

  private getWorker() {
    if (!this.workerPromise) {
      this.workerPromise = this.initializeWorker();
    }
    return this.workerPromise;
  }

  private async initializeWorker() {
    try {
      // 1. Create a raw SQLite worker (supports both OPFS and HTTP VFS)
      const worker = await createSQLiteThread({ 
        httpOptions: { backendType: 'sync', maxPageSize: 4096 } 
      });

      let useHttp = false;

      // 2. Attempt to mount the OPFS database (catalog.sqlite)
      try {
        await worker('open', { filename: 'catalog.sqlite', vfs: 'opfs' });
        
        // 3. Perform a quick count to see if the full catalog is present locally
        const countRes = await worker('exec', { sql: 'SELECT count(*) FROM base_ingredients', rowMode: 'array' });
        const count = countRes?.resultRows?.[0]?.[0] || 0;
        
        if (count < 10000) {
          console.log('[RemoteCatalogService] OPFS catalog has < 10,000 items. Falling back to HTTP Range Requests.');
          useHttp = true;
          // Close OPFS DB to open HTTP one
          await worker('close', {});
        } else {
          console.log(`[RemoteCatalogService] Successfully mounted full OPFS catalog locally (${count} items). Zero network needed.`);
        }
      } catch (err) {
        console.warn('[RemoteCatalogService] Failed to mount OPFS catalog, falling back to HTTP:', err);
        useHttp = true;
      }

      if (useHttp) {
        // Fallback to HTTP Range Request VFS pointing to R2 URL
        await worker('open', { filename: this.catalogUrl, vfs: 'http' });
      }

      return worker;
    } catch (err) {
      this.workerPromise = null;
      throw err;
    }
  }

  async searchIngredients(query: string, limit: number = 20): Promise<BaseIngredient[]> {
    const worker = await this.getWorker();
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
    
    const results = await Promise.race([
      worker('exec', { sql, rowMode: 'array' }),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Remote search timeout')), 15000))
    ]).catch(err => {
      console.error('Remote search error:', err);
      this.workerPromise = null;
      try { worker('close', {}).catch(() => {}); } catch(e) {}
      return { resultRows: [] };
    });
    
    if (!results || !results.resultRows || results.resultRows.length === 0) return [];
    
    return results.resultRows.map((vals: any) => ({
      id: vals[0],
      name: vals[1],
      source: vals[2],
      lang: vals[3],
      calories_100g: vals[4],
      protein_100g: vals[5],
      carbs_100g: vals[6],
      fats_100g: vals[7],
      contentHash: vals[8]
    })) as BaseIngredient[];
  }

  async getPortionsForIngredient(baseFoodId: string): Promise<Portion[]> {
    const worker = await this.getWorker();
    const sql = `
      SELECT 
        id as id,
        base_food_id as base_food_id,
        name as name,
        equivalent_weight_g as equivalent_weight_g,
        contentHash as contentHash
      FROM portions 
      WHERE base_food_id = '${baseFoodId.replace(/'/g, "''")}'
    `;
    
    const results = await Promise.race([
      worker('exec', { sql, rowMode: 'array' }),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Remote search timeout')), 10000))
    ]).catch(err => {
      console.error('Remote portions error:', err);
      this.workerPromise = null;
      try { worker('close', {}).catch(() => {}); } catch(e) {}
      return { resultRows: [] };
    });
    
    if (!results || !results.resultRows || results.resultRows.length === 0) return [];
    
    return results.resultRows.map((vals: any) => ({
      id: vals[0],
      base_food_id: vals[1],
      name: vals[2],
      equivalent_weight_g: vals[3],
      contentHash: vals[4]
    })) as Portion[];
  }
}
