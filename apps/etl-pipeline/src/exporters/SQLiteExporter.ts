import fs from 'fs';
import readline from 'readline';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { normalizeFoodName } from '../utils/parserUtils.js';
import type { RawIngredientItem } from '../types.js';
import type { CatalogMetaPayload } from '../index.js';
import { sanitizeIngredient, computeContentHash } from '../utils/sanitizer.js';

export async function exportSQLiteCatalog(
  inputFiles: string[],
  outPath: string,
  metaPath: string
): Promise<CatalogMetaPayload> {
  const seenKeys = new Set<string>();
  const externalCatalogItems: { id: string; hash: string }[] = [];

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

  let externalExportedCount = 0;

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
        
        // If it's a SYSTEM item, we just add it to seenKeys to prevent duplicates later,
        // but we do NOT insert it into the SQLite database.
        if (item.originSource === 'SYSTEM') continue;

        let finalItem: any;
        let contentHash = '';

        if (item._type === 'portion') {
          finalItem = item;
          contentHash = crypto.createHash('md5').update(`${item.id}|${item.name}|${(item as any).equivalent_weight_g}`, 'utf8').digest('hex');
          finalItem.contentHash = contentHash;
          
          insertPortionStmt.run(
            finalItem.id,
            finalItem.base_food_id,
            finalItem.name,
            finalItem.equivalent_weight_g,
            finalItem.contentHash
          );
        } else {
          const sanitized = sanitizeIngredient(item);
          contentHash = computeContentHash(sanitized);
          finalItem = { ...sanitized, contentHash };

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
        }
        externalCatalogItems.push({ id: finalItem.id, hash: contentHash });
        externalExportedCount++;
      }
    }
  }

  db.exec(`
    CREATE INDEX idx_name ON base_ingredients(name COLLATE NOCASE);
    CREATE INDEX idx_portion_base_food ON portions(base_food_id);
  `);
  db.close();

  console.log(`[ETL Pipeline] Exported ${externalExportedCount} external items to ${outPath}`);

  const sources = inputFiles
    .filter(file => fs.existsSync(file))
    .map(file => {
      const filename = file.split(/[/\\]/).pop() || '';
      return filename.replace('.ndjson', '').toUpperCase();
    })
    .filter(s => s !== 'SYSTEM');

  const generatedAt = new Date().toISOString();

  externalCatalogItems.sort((a, b) => a.id.localeCompare(b.id));
  const externalVersion = crypto.createHash('md5').update(externalCatalogItems.map(item => `${item.id}:${item.hash}`).join(';'), 'utf8').digest('hex');
  const externalMeta: CatalogMetaPayload = { 
    catalogVersion: externalVersion, 
    generatedAt,
    itemCount: externalExportedCount,
    sources,
    fileSizeBytes: fs.statSync(outPath).size
  };
  fs.writeFileSync(metaPath, JSON.stringify(externalMeta, null, 2), 'utf-8');

  return externalMeta;
}
