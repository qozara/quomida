import fs from 'fs';
import readline from 'readline';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { normalizeFoodName } from './utils/parserUtils.js';
import type { DataSourceOrigin, RawIngredientItem } from './types.js';
import type { CatalogItem, CatalogPayload, CatalogMetaPayload } from './index.js';
import type { BaseIngredient } from '@quomida/domain-core';

export const SOURCE_PRIORITY: Record<DataSourceOrigin, number> = {
  SYSTEM: 1,
  SARA2: 2,
  TBCA: 3,
  USDA: 4,
  OPENFOODFACTS: 5
};

export function sanitizeIngredient(raw: any): BaseIngredient {
  const sanitizedName = (raw.name || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]*>?/gm, '')
    .trim();

  const calories = Math.max(0, Number.isFinite(raw.calories_100g) ? raw.calories_100g : 0);
  const protein = Math.max(0, Number.isFinite(raw.protein_100g) ? raw.protein_100g : 0);
  const carbs = Math.max(0, Number.isFinite(raw.carbs_100g) ? raw.carbs_100g : 0);
  const fats = Math.max(0, Number.isFinite(raw.fats_100g) ? raw.fats_100g : 0);

  return {
    ...raw,
    id: String(raw.id).trim(),
    name: sanitizedName,
    source: 'system',
    lang: raw.lang || 'es',
    calories_100g: calories,
    protein_100g: protein,
    carbs_100g: carbs,
    fats_100g: fats
  };
}

export function computeContentHash(ingredient: BaseIngredient): string {
  const payload = [
    ingredient.name,
    ingredient.calories_100g,
    ingredient.protein_100g,
    ingredient.carbs_100g,
    ingredient.fats_100g,
    ingredient.lang
  ].join('|');
  return crypto.createHash('md5').update(payload, 'utf8').digest('hex');
}

export function computeCatalogVersion(items: (BaseIngredient & { contentHash?: string })[]): string {
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  const composite = sorted
    .map((item) => `${item.id}:${item.contentHash || computeContentHash(item)}`)
    .join(';');
  return crypto.createHash('md5').update(composite, 'utf8').digest('hex');
}

export function resolveIngredients(items: RawIngredientItem[]): RawIngredientItem[] {
  const resolvedMap = new Map<string, RawIngredientItem>();
  for (const item of items) {
    const key = (item as any)._type === 'portion'
      ? `portion:${item.id}`
      : item.barcode
        ? `barcode:${item.barcode.trim()}`
        : `name:${normalizeFoodName(item.name)}`;

    const existing = resolvedMap.get(key);
    if (!existing) {
      resolvedMap.set(key, item);
    } else {
      const existingPriority = SOURCE_PRIORITY[existing.originSource] ?? 999;
      const itemPriority = SOURCE_PRIORITY[item.originSource] ?? 999;
      if (itemPriority < existingPriority) {
        resolvedMap.set(key, item);
      }
    }
  }
  return Array.from(resolvedMap.values()).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Reads NDJSON files sequentially, resolves conflicts in-memory,
 * and outputs a deduped `catalog.json`.
 */
export async function resolveAndExportNDJSON(
  inputFiles: string[],
  outPath: string, // This is now a .sqlite path
  metaPath: string,
  systemOutPath?: string,
  systemMetaPath?: string
): Promise<CatalogMetaPayload> {
  const seenKeys = new Set<string>();
  const externalCatalogItems: { id: string; hash: string }[] = [];
  const systemCatalogItems: { id: string; hash: string }[] = [];

  if (fs.existsSync(outPath)) {
    fs.unlinkSync(outPath);
  }
  const db = new Database(outPath);
  db.exec(`
    PRAGMA page_size = 4096;
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    CREATE TABLE base_ingredients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source TEXT NOT NULL,
      lang TEXT NOT NULL,
      calories_100g REAL NOT NULL,
      protein_100g REAL NOT NULL,
      carbs_100g REAL NOT NULL,
      fats_100g REAL NOT NULL,
      contentHash TEXT NOT NULL
    );
    CREATE TABLE portions (
      id TEXT PRIMARY KEY,
      base_food_id TEXT NOT NULL,
      name TEXT NOT NULL,
      equivalent_weight_g REAL NOT NULL,
      contentHash TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE base_ingredients_fts USING fts5(
      name,
      id UNINDEXED,
      tokenize='trigram'
    );
  `);
  const insertStmt = db.prepare(`
    INSERT INTO base_ingredients (id, name, source, lang, calories_100g, protein_100g, carbs_100g, fats_100g, contentHash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFtsStmt = db.prepare(`
    INSERT INTO base_ingredients_fts (id, name)
    VALUES (?, ?)
  `);
  const insertPortionStmt = db.prepare(`
    INSERT INTO portions (id, base_food_id, name, equivalent_weight_g, contentHash)
    VALUES (?, ?, ?, ?, ?)
  `);

  const sysStream = systemOutPath ? fs.createWriteStream(systemOutPath, { flags: 'w' }) : null;
  
  let externalExportedCount = 0;
  let systemExportedCount = 0;

  for (const file of inputFiles) {
    if (!fs.existsSync(file)) continue;
    
    const stats = fs.statSync(file);
    const mbTotal = (stats.size / (1024 * 1024)).toFixed(1);
    const filename = file.split(/[/\\]/).pop() || 'unknown';
    
    console.log(`[ETL Pipeline] Resolving items from ${filename} (${mbTotal}MB)`);
    const fileStream = fs.createReadStream(file);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    
    let linesProcessed = 0;

    for await (const line of rl) {
      linesProcessed++;
      if (linesProcessed % 100000 === 0) {
        console.log(`[ETL Pipeline] [RESOLVER] ${filename} - Processed ${linesProcessed} lines...`);
      }

      if (!line.trim()) continue;
      const item: RawIngredientItem & { _type?: string } = JSON.parse(line);

      const key = item._type === 'portion'
        ? `portion:${item.id}`
        : item.barcode
          ? `barcode:${item.barcode.trim()}`
          : `name:${normalizeFoodName(item.name)}`;

      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        
        let finalItem: any;
        let contentHash = '';

        if (item._type === 'portion') {
          // Portions do not need full ingredient sanitization
          finalItem = item;
          contentHash = crypto.createHash('md5').update(`${item.id}|${item.name}|${(item as any).equivalent_weight_g}`, 'utf8').digest('hex');
          finalItem.contentHash = contentHash;
        } else {
          const sanitized = sanitizeIngredient(item);
          contentHash = computeContentHash(sanitized);
          finalItem = {
            ...sanitized,
            contentHash
          };
        }
        
        const isSystem = item.originSource === 'SYSTEM';
        
        if (isSystem && sysStream) {
          sysStream.write(JSON.stringify(finalItem) + '\n');
          systemCatalogItems.push({ id: finalItem.id, hash: contentHash });
          systemExportedCount++;
        } else {
          if (item._type === 'portion') {
            insertPortionStmt.run(
              finalItem.id,
              finalItem.base_food_id,
              finalItem.name,
              finalItem.equivalent_weight_g,
              finalItem.contentHash
            );
          } else {
            insertStmt.run(
              finalItem.id,
              finalItem.name,
              finalItem.source,
              finalItem.lang,
              finalItem.calories_100g,
              finalItem.protein_100g,
              finalItem.carbs_100g,
              finalItem.fats_100g,
              finalItem.contentHash
            );
            insertFtsStmt.run(
              finalItem.id,
              finalItem.name
            );
            externalExportedCount++;
          }
          externalCatalogItems.push({ id: finalItem.id, hash: contentHash });
        }
      }
    }
  }

  if (sysStream) {
    await new Promise<void>((resolve) => sysStream.end(() => resolve()));
  }

  db.exec(`
    CREATE INDEX idx_name ON base_ingredients(name COLLATE NOCASE);
    CREATE INDEX idx_portion_base_food ON portions(base_food_id);
  `);
  db.close();

  console.log(`[ETL Pipeline] Exported ${externalExportedCount} external items to ${outPath}`);
  if (systemOutPath) {
    console.log(`[ETL Pipeline] Exported ${systemExportedCount} system items to ${systemOutPath}`);
  }

  // Extract sources
  const sources = inputFiles
    .filter(file => fs.existsSync(file))
    .map(file => {
      const filename = file.split(/[/\\]/).pop() || '';
      return filename.replace('.ndjson', '').toUpperCase();
    });

  const generatedAt = new Date().toISOString();

  // Meta for external
  externalCatalogItems.sort((a, b) => a.id.localeCompare(b.id));
  const externalVersion = crypto.createHash('md5').update(externalCatalogItems.map(item => `${item.id}:${item.hash}`).join(';'), 'utf8').digest('hex');
  const externalMeta: CatalogMetaPayload = { 
    catalogVersion: externalVersion, 
    generatedAt,
    itemCount: externalExportedCount,
    sources: sources.filter(s => s !== 'SYSTEM'),
    fileSizeBytes: fs.statSync(outPath).size
  };
  fs.writeFileSync(metaPath, JSON.stringify(externalMeta, null, 2), 'utf-8');

  // Meta for system
  if (systemMetaPath) {
    systemCatalogItems.sort((a, b) => a.id.localeCompare(b.id));
    const systemVersion = crypto.createHash('md5').update(systemCatalogItems.map(item => `${item.id}:${item.hash}`).join(';'), 'utf8').digest('hex');
    const systemMeta: CatalogMetaPayload = { 
      catalogVersion: systemVersion, 
      generatedAt,
      itemCount: systemExportedCount,
      sources: ['SYSTEM'],
      fileSizeBytes: systemOutPath ? fs.statSync(systemOutPath).size : 0
    };
    fs.writeFileSync(systemMetaPath, JSON.stringify(systemMeta, null, 2), 'utf-8');
  }

  return externalMeta;
}
