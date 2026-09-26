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
  outPath: string,
  metaPath: string,
  systemOutPath?: string,
  systemMetaPath?: string
): Promise<CatalogMetaPayload> {
  const seenKeys = new Set<string>();
  const externalCatalogItems: { id: string; hash: string }[] = [];
  const systemCatalogItems: { id: string; hash: string }[] = [];

  const outStream = fs.createWriteStream(outPath, { flags: 'w' });
  const sysStream = systemOutPath ? fs.createWriteStream(systemOutPath, { flags: 'w' }) : null;
  
  let externalExportedCount = 0;
  let systemExportedCount = 0;

  for (const file of inputFiles) {
    if (!fs.existsSync(file)) continue;
    console.log(`[ETL Pipeline] Resolving items from ${file}`);
    const fileStream = fs.createReadStream(file);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
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
        
        const isSystem = item.originSource === 'SYSTEM' || item._type === 'portion';
        
        if (isSystem && sysStream) {
          sysStream.write(JSON.stringify(finalItem) + '\n');
          systemCatalogItems.push({ id: finalItem.id, hash: contentHash });
          systemExportedCount++;
        } else {
          outStream.write(JSON.stringify(finalItem) + '\n');
          externalCatalogItems.push({ id: finalItem.id, hash: contentHash });
          externalExportedCount++;
        }
      }
    }
  }

  await new Promise<void>((resolve) => {
    outStream.end(() => {
      if (sysStream) {
        sysStream.end(() => resolve());
      } else {
        resolve();
      }
    });
  });

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
