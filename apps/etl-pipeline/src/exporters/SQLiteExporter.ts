import fs from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import zlib from 'zlib';
import { pipeline } from 'stream/promises';
import { normalizeFoodName } from '../utils/parserUtils.js';
import type { RawIngredientItem } from '../types.js';
import type { CatalogMetaPayload } from '../index.js';
import { sanitizeIngredient, computeContentHash } from '../utils/sanitizer.js';

function initDb(path: string, tokenizer: string = 'unicode61 remove_diacritics 1') {
  if (fs.existsSync(path)) {
    fs.unlinkSync(path);
  }
  const db = new Database(path);
  db.exec(`
    PRAGMA page_size = 1024;
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
      tokenize="${tokenizer}"
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

  return { db, insertStmt, insertFtsStmt, insertPortionStmt };
}

export async function exportSQLiteCatalog(
  inputFiles: string[],
  outCatalogPath: string,
  outSystemPath: string,
  metaPath: string
): Promise<CatalogMetaPayload> {
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  const externalCatalogItems: { id: string; hash: string }[] = [];

  const catalog = initDb(outCatalogPath, 'unicode61 remove_diacritics 1'); // For HTTP VFS
  const catalogDownload = initDb(outCatalogPath.replace('catalog.sqlite', 'catalog_download.sqlite'), 'trigram'); // For OPFS Download
  const system = initDb(outSystemPath, 'unicode61 remove_diacritics 1'); // Keep system small & HTTP-safe

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

      if (!seenKeys.has(key) && !seenIds.has(item.id)) {
        seenKeys.add(key);
        seenIds.add(item.id);
        
        let finalItem: any;
        let contentHash = '';

        const targetDbs = item.originSource === 'SYSTEM' 
          ? [catalog, catalogDownload, system] 
          : [catalog, catalogDownload];

        if (item._type === 'portion') {
          finalItem = item;
          contentHash = crypto.createHash('md5').update(`${item.id}|${item.name}|${(item as any).equivalent_weight_g}`, 'utf8').digest('hex');
          finalItem.contentHash = contentHash;
          
          for (const target of targetDbs) {
            target.insertPortionStmt.run(
              finalItem.id,
              finalItem.base_food_id,
              finalItem.name,
              finalItem.equivalent_weight_g,
              finalItem.contentHash
            );
          }
        } else {
          const sanitized = sanitizeIngredient(item);
          contentHash = computeContentHash(sanitized);
          finalItem = { ...sanitized, contentHash };

          for (const target of targetDbs) {
            target.insertStmt.run(
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
            target.insertFtsStmt.run(
              finalItem.id,
              finalItem.name
            );
          }
        }
        
        if (item.originSource === 'SYSTEM') {
          systemExportedCount++;
        } else {
          externalCatalogItems.push({ id: finalItem.id, hash: contentHash });
          externalExportedCount++;
        }
      }
    }
  }

  for (const target of [catalog, catalogDownload, system]) {
    target.db.exec(`
      CREATE INDEX idx_name ON base_ingredients(name COLLATE NOCASE);
      CREATE INDEX idx_portion_base_food ON portions(base_food_id);
      VACUUM;
    `);
    target.db.close();
  }

  const catalogDownloadPath = outCatalogPath.replace('catalog.sqlite', 'catalog_download.sqlite');
  
  console.log(`[ETL Pipeline] Exported ${systemExportedCount} system items to ${outSystemPath}`);
  console.log(`[ETL Pipeline] Exported ${externalExportedCount} external items (and ${systemExportedCount} system items) to ${outCatalogPath}`);
  console.log(`[ETL Pipeline] Exported trigram-enabled copy to ${catalogDownloadPath}`);

  // Compress catalog_download.sqlite to catalog.sqlite.gz (so the frontend downloads the trigram version)
  const gzPath = `${outCatalogPath}.gz`;
  console.log(`[ETL Pipeline] Compressing ${catalogDownloadPath} to ${gzPath}...`);
  await pipeline(
    fs.createReadStream(catalogDownloadPath),
    zlib.createGzip({ level: 9 }),
    fs.createWriteStream(gzPath)
  );
  
  // Clean up the uncompressed trigram DB to save disk space, keep the unicode61 catalog.sqlite
  fs.unlinkSync(catalogDownloadPath);
  
  // Optionally delete uncompressed to save space, but keeping it helps debugging. We'll leave it.

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
    itemCount: externalExportedCount + systemExportedCount,
    sources,
    fileSizeBytes: fs.statSync(gzPath).size
  };
  fs.writeFileSync(metaPath, JSON.stringify(externalMeta, null, 2), 'utf-8');

  return externalMeta;
}

export async function exportSystemSQLiteCatalog(
  inputFile: string | null,
  outSystemPath: string
): Promise<number> {
  const dir = path.dirname(outSystemPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const system = initDb(outSystemPath, 'unicode61 remove_diacritics 1');
  let systemExportedCount = 0;

  if (inputFile && fs.existsSync(inputFile)) {
    const fileStream = fs.createReadStream(inputFile);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    const seenKeys = new Set<string>();
    const seenIds = new Set<string>();

    for await (const line of rl) {
      if (!line.trim()) continue;
      const item: RawIngredientItem & { _type?: string } = JSON.parse(line);

      const key = item._type === 'portion'
        ? `portion:${item.id}`
        : item.barcode
          ? `barcode:${item.barcode.trim()}`
          : `name:${normalizeFoodName(item.name)}`;

      if (!seenKeys.has(key) && !seenIds.has(item.id)) {
        seenKeys.add(key);
        seenIds.add(item.id);

        if (item._type === 'portion') {
          const contentHash = crypto.createHash('md5').update(`${item.id}|${item.name}|${(item as any).equivalent_weight_g}`, 'utf8').digest('hex');
          system.insertPortionStmt.run(
            item.id,
            (item as any).base_food_id,
            item.name,
            (item as any).equivalent_weight_g,
            contentHash
          );
        } else {
          const sanitized = sanitizeIngredient(item);
          const contentHash = computeContentHash(sanitized);
          system.insertStmt.run(
            sanitized.id,
            sanitized.name,
            sanitized.source,
            sanitized.lang,
            sanitized.calories_100g,
            sanitized.protein_100g,
            sanitized.carbs_100g,
            sanitized.fats_100g,
            contentHash
          );
          system.insertFtsStmt.run(
            sanitized.id,
            sanitized.name
          );
          systemExportedCount++;
        }
      }
    }
  }

  system.db.exec(`
    CREATE INDEX idx_name ON base_ingredients(name COLLATE NOCASE);
    CREATE INDEX idx_portion_base_food ON portions(base_food_id);
    VACUUM;
  `);
  system.db.close();

  console.log(`[ETL Pipeline] Exported ${systemExportedCount} items to ${outSystemPath}`);
  return systemExportedCount;
}
