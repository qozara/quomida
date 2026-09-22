import fs from 'fs';
import readline from 'readline';
import crypto from 'crypto';
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
    const key = item.barcode
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
  outPath: string,
  metaPath: string
): Promise<CatalogMetaPayload> {
  const seenKeys = new Set<string>();
  const catalogVersionItems: { id: string; hash: string }[] = [];

  const outStream = fs.createWriteStream(outPath, { flags: 'w' });
  let exportedCount = 0;

  for (const file of inputFiles) {
    if (!fs.existsSync(file)) continue;
    console.log(`[ETL Pipeline] Resolving items from ${file}`);
    const fileStream = fs.createReadStream(file);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      const item: RawIngredientItem = JSON.parse(line);

      const key = item.barcode
        ? `barcode:${item.barcode.trim()}`
        : `name:${normalizeFoodName(item.name)}`;

      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        
        const sanitized = sanitizeIngredient(item);
        const contentHash = computeContentHash(sanitized);
        const finalItem = {
          ...sanitized,
          contentHash
        };
        
        outStream.write(JSON.stringify(finalItem) + '\n');
        catalogVersionItems.push({ id: finalItem.id, hash: contentHash });
        exportedCount++;
      }
    }
  }

  await new Promise<void>((resolve) => {
    outStream.end(() => resolve());
  });

  console.log(`[ETL Pipeline] Exported ${exportedCount} items to ${outPath}`);

  // Extract sources from input files (e.g. 'system.ndjson' -> 'SYSTEM')
  const sources = inputFiles
    .filter(file => fs.existsSync(file))
    .map(file => {
      const filename = file.split(/[/\\]/).pop() || '';
      return filename.replace('.ndjson', '').toUpperCase();
    });

  catalogVersionItems.sort((a, b) => a.id.localeCompare(b.id));
  const composite = catalogVersionItems.map(item => `${item.id}:${item.hash}`).join(';');
  const catalogVersion = crypto.createHash('md5').update(composite, 'utf8').digest('hex');
  const generatedAt = new Date().toISOString();

  // Export meta
  const meta: CatalogMetaPayload = { 
    catalogVersion, 
    generatedAt,
    itemCount: exportedCount,
    sources
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

  return meta;
}
