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
import { sanitizeIngredient, computeContentHash, computePortionHash, sanitizePortionWeight } from '../utils/sanitizer.js';

class DisjointSet {
  private parent = new Map<string, string>();

  makeSet(x: string): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
    }
  }

  find(x: string): string {
    let root = x;
    while (this.parent.has(root) && this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    let curr = x;
    while (this.parent.has(curr) && this.parent.get(curr) !== root) {
      const next = this.parent.get(curr)!;
      this.parent.set(curr, root);
      curr = next;
    }
    return root;
  }

  union(x: string, y: string): void {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX !== rootY) {
      this.parent.set(rootY, rootX);
    }
  }
}

function initDb(path: string, tokenizer: string = 'unicode61 remove_diacritics 1') {
  if (fs.existsSync(path)) {
    fs.unlinkSync(path);
  }
  const db = new Database(path);
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
  const externalCatalogItems: { id: string; hash: string }[] = [];

  const catalog = initDb(outCatalogPath, 'trigram');
  const system = initDb(outSystemPath, 'trigram');

  let externalExportedCount = 0;
  let systemExportedCount = 0;

  const offCandidates = new Map<string, RawIngredientItem>();
  const offPortions: any[] = [];
  const nonOffItems: any[] = [];
  const nonOffPortions: any[] = [];

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
      const item: any = JSON.parse(line);

      if (item._type === 'portion') {
        if (item.originSource === 'OPENFOODFACTS') {
          offPortions.push(item);
        } else {
          nonOffPortions.push(item);
        }
      } else {
        if (item.originSource === 'OPENFOODFACTS') {
          offCandidates.set(item.id, item);
        } else {
          nonOffItems.push(item);
        }
      }
    }
  }

  // --- Stage 4: Deduplication for Open Food Facts Items ---
  const dsu = new DisjointSet();
  const map4A = new Map<string, string>();
  const map4B = new Map<string, string>();

  for (const item of offCandidates.values()) {
    dsu.makeSet(item.id);

    // Pass 4A key: cleanNameWithoutWeight + brandTag + macroBucket
    const cals = Math.round((item.calories_100g ?? 0) / 15) * 15;
    const prot = Math.round((item.protein_100g ?? 0) / 2) * 2;
    const carbs = Math.round((item.carbs_100g ?? 0) / 2) * 2;
    const fats = Math.round((item.fats_100g ?? 0) / 2) * 2;
    const macroBucket = `${cals}:${prot}:${carbs}:${fats}`;
    const cleanNameKey = normalizeFoodName(item.cleanName || item.name);
    const brandKey = item.brandTag || '';
    const key4A = `${cleanNameKey}|${brandKey}|${macroBucket}`;

    if (map4A.has(key4A)) {
      dsu.union(map4A.get(key4A)!, item.id);
    } else {
      map4A.set(key4A, item.id);
    }

    // Pass 4B key: normBrandTag + leafCategoryTag + tightMacroBucket
    if (item.brandTag && item.categoryTag) {
      const tightCals = Math.round((item.calories_100g ?? 0) / 10) * 10;
      const tightProt = Math.round(item.protein_100g ?? 0);
      const tightCarbs = Math.round(item.carbs_100g ?? 0);
      const tightFats = Math.round(item.fats_100g ?? 0);
      const tightMacroBucket = `${tightCals}:${tightProt}:${tightCarbs}:${tightFats}`;
      const key4B = `xlang:${item.brandTag}|${item.categoryTag}|${tightMacroBucket}`;

      if (map4B.has(key4B)) {
        dsu.union(map4B.get(key4B)!, item.id);
      } else {
        map4B.set(key4B, item.id);
      }
    }
  }

  // Group items by their root representative
  const groups = new Map<string, RawIngredientItem[]>();
  for (const item of offCandidates.values()) {
    const root = dsu.find(item.id);
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root)!.push(item);
  }

  // Leader Election
  const leaderMap = new Map<string, string>(); // memberId -> winnerId
  const winnerIngredients: RawIngredientItem[] = [];

  for (const group of groups.values()) {
    const leader = group.reduce((best, curr) => {
      const scoreDiff = (curr.qualityScore ?? 0) - (best.qualityScore ?? 0);
      if (scoreDiff !== 0) return scoreDiff > 0 ? curr : best;
      return curr.id.localeCompare(best.id) < 0 ? curr : best;
    }, group[0]);

    for (const member of group) {
      leaderMap.set(member.id, leader.id);
    }
    winnerIngredients.push(leader);
  }

  // Group portions by winning base_food_id and deduplicate by weight
  const leaderPortionsMap = new Map<string, Array<{ id?: string; name: string; equivalent_weight_g: number }>>();

  for (const p of offPortions) {
    const winnerId = leaderMap.get(p.base_food_id) || p.base_food_id;
    const weight = sanitizePortionWeight(p.equivalent_weight_g);
    if (weight <= 0) continue;

    if (!leaderPortionsMap.has(winnerId)) {
      leaderPortionsMap.set(winnerId, []);
    }
    const existing = leaderPortionsMap.get(winnerId)!;
    const isDuplicate = existing.some(e => Math.abs(e.equivalent_weight_g - weight) < 0.5);
    if (!isDuplicate && existing.length < 5) {
      existing.push({ id: p.id, name: p.name, equivalent_weight_g: weight });
    }
  }

  // --- Insertion into SQLite ---

  // 1. Non-OFF ingredients
  const seenNonOffKeys = new Set<string>();
  const seenNonOffIds = new Set<string>();

  for (const item of nonOffItems) {
    const key = item.barcode
      ? `barcode:${item.barcode.trim()}`
      : `name:${normalizeFoodName(item.name)}`;

    if (!seenNonOffKeys.has(key) && !seenNonOffIds.has(item.id)) {
      seenNonOffKeys.add(key);
      seenNonOffIds.add(item.id);

      const sanitized = sanitizeIngredient(item);
      const contentHash = computeContentHash(sanitized);
      const finalItem = { ...sanitized, contentHash };

      const targetDbs = item.originSource === 'SYSTEM' ? [catalog, system] : [catalog];

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
        target.insertFtsStmt.run(finalItem.id, finalItem.name);
      }

      if (item.originSource === 'SYSTEM') {
        systemExportedCount++;
      } else {
        externalCatalogItems.push({ id: finalItem.id, hash: contentHash });
        externalExportedCount++;
      }
    }
  }

  // Non-OFF portions
  for (const portion of nonOffPortions) {
    const contentHash = computePortionHash(portion);
    const targetDbs = portion.originSource === 'SYSTEM' ? [catalog, system] : [catalog];

    for (const target of targetDbs) {
      target.insertPortionStmt.run(
        portion.id,
        portion.base_food_id,
        portion.name,
        portion.equivalent_weight_g,
        contentHash
      );
    }

    if (portion.originSource === 'SYSTEM') {
      systemExportedCount++;
    } else {
      externalCatalogItems.push({ id: portion.id, hash: contentHash });
      externalExportedCount++;
    }
  }

  // 2. OFF Winning Ingredients & Merged Portions
  for (const winner of winnerIngredients) {
    const sanitized = sanitizeIngredient(winner);
    const contentHash = computeContentHash(sanitized);
    const finalItem = { ...sanitized, contentHash };

    catalog.insertStmt.run(
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
    catalog.insertFtsStmt.run(finalItem.id, finalItem.name);

    externalCatalogItems.push({ id: finalItem.id, hash: contentHash });
    externalExportedCount++;

    const mergedPortions = leaderPortionsMap.get(winner.id) || [];
    for (let idx = 0; idx < mergedPortions.length; idx++) {
      const p = mergedPortions[idx];
      const portionId = p.id || `port-${winner.id}-${idx + 1}`;
      const portionHash = computePortionHash({ id: portionId, name: p.name, equivalent_weight_g: p.equivalent_weight_g });

      catalog.insertPortionStmt.run(
        portionId,
        winner.id,
        p.name,
        p.equivalent_weight_g,
        portionHash
      );

      externalCatalogItems.push({ id: portionId, hash: portionHash });
      externalExportedCount++;
    }
  }

  for (const target of [catalog, system]) {
    target.db.exec(`
      CREATE INDEX idx_name ON base_ingredients(name COLLATE NOCASE);
      CREATE INDEX idx_portion_base_food ON portions(base_food_id);
      VACUUM;
    `);
    if (target === system) {
      writeSystemCatalogMetadata(system.db, outSystemPath);
    }
    target.db.close();
  }

  console.log(`[ETL Pipeline] Exported ${systemExportedCount} system items to ${outSystemPath}`);
  console.log(`[ETL Pipeline] Exported ${externalExportedCount} external items (and ${systemExportedCount} system items) to ${outCatalogPath}`);

  // Compress catalog.sqlite to catalog.sqlite.gz for frontend OPFS download
  const gzPath = `${outCatalogPath}.gz`;
  console.log(`[ETL Pipeline] Compressing ${outCatalogPath} to ${gzPath}...`);
  await pipeline(
    fs.createReadStream(outCatalogPath),
    zlib.createGzip({ level: 9 }),
    fs.createWriteStream(gzPath)
  );

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

export function writeSystemCatalogMetadata(
  systemDb: any,
  outSystemPath: string
) {
  const portionsCountRes = systemDb.prepare('SELECT count(*) as count FROM portions').get() as { count: number };
  const ingredientsCountRes = systemDb.prepare('SELECT count(*) as count FROM base_ingredients').get() as { count: number };
  const totalItems = (ingredientsCountRes?.count || 0) + (portionsCountRes?.count || 0);

  const generatedAt = new Date().toISOString();
  const systemMeta = {
    itemCount: totalItems,
    ingredientsCount: ingredientsCountRes?.count || 0,
    portionsCount: portionsCountRes?.count || 0,
    generatedAt,
    catalogVersion: crypto.createHash('md5').update(`system:${totalItems}`).digest('hex').slice(0, 8),
  };

  const webappGeneratedDir = path.resolve(path.dirname(outSystemPath), '../src/generated');
  if (!fs.existsSync(webappGeneratedDir)) {
    fs.mkdirSync(webappGeneratedDir, { recursive: true });
  }
  const metaJsonPath = path.join(webappGeneratedDir, 'system_meta.json');
  fs.writeFileSync(metaJsonPath, JSON.stringify(systemMeta, null, 2), 'utf-8');

  return systemMeta;
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
      const item: any = JSON.parse(line);

      const key = item._type === 'portion'
        ? `portion:${item.id}`
        : item.barcode
          ? `barcode:${item.barcode.trim()}`
          : `name:${normalizeFoodName(item.name)}`;

      if (!seenKeys.has(key) && !seenIds.has(item.id)) {
        seenKeys.add(key);
        seenIds.add(item.id);

        if (item._type === 'portion') {
          const contentHash = computePortionHash(item);
          system.insertPortionStmt.run(
            item.id,
            item.base_food_id,
            item.name,
            item.equivalent_weight_g,
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

  const meta = writeSystemCatalogMetadata(system.db, outSystemPath);
  system.db.close();

  console.log(`[ETL Pipeline] Exported ${systemExportedCount} items to ${outSystemPath} (Total with portions: ${meta.itemCount})`);
  return systemExportedCount;
}
