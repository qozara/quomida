import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import type { BaseIngredient, Portion } from '@quomida/domain-core';
import type { RawIngredientItem } from './types.js';
import { resolveIngredients } from './resolver.js';
import { parseArgenfoodsCSV } from './sources/argenfoods.js';
import { parseSara2CSV } from './sources/sara2.js';
import { parseTbcaCSV } from './sources/tbca.js';
import { parseOpenFoodFactsJSONL } from './sources/openfoodfacts.js';

export * from './types.js';
export * from './resolver.js';
export * from './utils/parserUtils.js';
export * from './sources/argenfoods.js';
export * from './sources/sara2.js';
export * from './sources/tbca.js';
export * from './sources/openfoodfacts.js';

export interface CatalogItem extends BaseIngredient {
  contentHash: string;
}

export interface CatalogPayload {
  catalogVersion: string;
  generatedAt: string;
  items: CatalogItem[];
}

export interface CatalogMetaPayload {
  catalogVersion: string;
  generatedAt: string;
}

export const seedIngredients: BaseIngredient[] = [
  // Local cuts & preparations (ARGENFOODS / LATINFOODS)
  { id: 'ing-vacambre', name: 'Vacío vacuno (crudo)', source: 'system', lang: 'es', calories_100g: 175, protein_100g: 20.5, carbs_100g: 0, fats_100g: 10.5 },
  { id: 'ing-asado-tira', name: 'Asado de tira (crudo)', source: 'system', lang: 'es', calories_100g: 250, protein_100g: 18.0, carbs_100g: 0, fats_100g: 19.5 },
  { id: 'ing-peceto', name: 'Peceto vacuno (crudo)', source: 'system', lang: 'es', calories_100g: 120, protein_100g: 22.0, carbs_100g: 0, fats_100g: 3.5 },
  { id: 'ing-matambre', name: 'Matambre vacuno (crudo)', source: 'system', lang: 'es', calories_100g: 210, protein_100g: 19.0, carbs_100g: 0, fats_100g: 14.8 },
  { id: 'ing-entranha', name: 'Entraña vacuna (cruda)', source: 'system', lang: 'es', calories_100g: 190, protein_100g: 21.0, carbs_100g: 0, fats_100g: 11.5 },
  { id: 'ing-milanesa-carne', name: 'Milanesa de carne vacuna (al horno)', source: 'system', lang: 'es', calories_100g: 215, protein_100g: 23.5, carbs_100g: 12.0, fats_100g: 8.0 },
  { id: 'ing-empanada-carne', name: 'Empanada de carne (al horno)', source: 'system', lang: 'es', calories_100g: 260, protein_100g: 11.0, carbs_100g: 24.0, fats_100g: 13.5 },
  { id: 'ing-palta', name: 'Palta / Aguacate', source: 'system', lang: 'es', calories_100g: 160, protein_100g: 2.0, carbs_100g: 8.5, fats_100g: 14.7 },
  { id: 'ing-frutilla', name: 'Frutilla / Fresa', source: 'system', lang: 'es', calories_100g: 32, protein_100g: 0.7, carbs_100g: 7.7, fats_100g: 0.3 },
  { id: 'ing-choclo', name: 'Choclo / Elote amarillo', source: 'system', lang: 'es', calories_100g: 86, protein_100g: 3.2, carbs_100g: 19.0, fats_100g: 1.2 },

  // Base Universal Ingredients (USDA FoodData Central)
  { id: 'ing-aceite-oliva', name: 'Aceite de oliva virgen extra', source: 'system', lang: 'es', calories_100g: 884, protein_100g: 0, carbs_100g: 0, fats_100g: 100 },
  { id: 'ing-pechuga-pollo', name: 'Pechuga de pollo (cruda)', source: 'system', lang: 'es', calories_100g: 165, protein_100g: 31.0, carbs_100g: 0, fats_100g: 3.6 },
  { id: 'ing-arroz-blanco', name: 'Arroz blanco (crudo)', source: 'system', lang: 'es', calories_100g: 365, protein_100g: 7.1, carbs_100g: 80.0, fats_100g: 0.7 },
  { id: 'ing-huevo', name: 'Huevo entero (fresco)', source: 'system', lang: 'es', calories_100g: 155, protein_100g: 12.6, carbs_100g: 1.1, fats_100g: 10.6 },
  { id: 'ing-pan-masa-madre', name: 'Pan de masa madre', source: 'system', lang: 'es', calories_100g: 245, protein_100g: 9.0, carbs_100g: 48.0, fats_100g: 1.5 }
];

export const seedPortions: Portion[] = [
  { id: 'port-vacambre-1', base_food_id: 'ing-vacambre', name: '1 porción mediana', equivalent_weight_g: 200 },
  { id: 'port-milanesa-1', base_food_id: 'ing-milanesa-carne', name: '1 unidad (120g)', equivalent_weight_g: 120 },
  { id: 'port-empanada-1', base_food_id: 'ing-empanada-carne', name: '1 unidad (90g)', equivalent_weight_g: 90 },
  { id: 'port-palta-1', base_food_id: 'ing-palta', name: '1/2 unidad mediana', equivalent_weight_g: 80 },
  { id: 'port-huevo-1', base_food_id: 'ing-huevo', name: '1 huevo mediano (50g)', equivalent_weight_g: 50 },
  { id: 'port-aceite-1', base_food_id: 'ing-aceite-oliva', name: '1 cucharada (15ml)', equivalent_weight_g: 14 }
];

/**
 * Sanitizes input food records to prevent XSS and malformed numerical entries.
 */
export function sanitizeIngredient(raw: BaseIngredient): BaseIngredient {
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

/**
 * Computes an MD5 content hash for a single food item based on its nutritional profile and name.
 */
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

/**
 * Computes a deterministic catalog version hash across all ingredients.
 */
export function computeCatalogVersion(items: (BaseIngredient & { contentHash?: string })[]): string {
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  const composite = sorted
    .map((item) => `${item.id}:${item.contentHash || computeContentHash(item)}`)
    .join(';');

  return crypto.createHash('md5').update(composite, 'utf8').digest('hex');
}

/**
 * Builds the full versioned catalog payload from ingredients.
 */
export function buildCatalogPayload(ingredients: BaseIngredient[] = seedIngredients): {
  catalog: CatalogPayload;
  meta: CatalogMetaPayload;
} {
  const sanitizedItems: CatalogItem[] = ingredients.map((raw) => {
    const sanitized = sanitizeIngredient(raw);
    const contentHash = computeContentHash(sanitized);
    return {
      ...sanitized,
      contentHash
    };
  });

  const catalogVersion = computeCatalogVersion(sanitizedItems);
  const generatedAt = new Date().toISOString();

  const catalog: CatalogPayload = {
    catalogVersion,
    generatedAt,
    items: sanitizedItems
  };

  const meta: CatalogMetaPayload = {
    catalogVersion,
    generatedAt
  };

  return { catalog, meta };
}

export interface RunETLOptions {
  publicDir?: string;
  assetsDir?: string;
  dataRawDir?: string;
}

function findDataFile(dirPath: string, extension: string): string | null {
  if (!fs.existsSync(dirPath)) {
    console.warn(`[ETL Warning] Directory not found: ${dirPath}`);
    return null;
  }
  const files = fs.readdirSync(dirPath);
  const match = files.find((f) => f.endsWith(extension) && !f.startsWith('.'));
  
  if (!match) {
    console.warn(`[ETL Warning] No ${extension} file found in ${dirPath}. Please place the raw dataset here.`);
    return null;
  }
  return path.join(dirPath, match);
}

/**
 * Orchestrates the full ETL extraction, deduplication, sanitization, and packaging pipeline.
 */
export async function runETL(options?: RunETLOptions): Promise<{
  catalog: CatalogPayload;
  meta: CatalogMetaPayload;
}> {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);

  const publicDir = options?.publicDir || path.resolve(currentDir, '../../webapp/public');
  const dataRawDir = options?.dataRawDir || path.resolve(currentDir, '../data/raw');

  console.log('[ETL Pipeline] Starting nutritional dataset ingestion...');
  console.log(`[ETL Pipeline] Looking for raw datasets in: ${dataRawDir}`);

  // 1. Convert built-in system seed ingredients
  const systemItems: RawIngredientItem[] = seedIngredients.map((item) => ({
    ...item,
    originSource: 'SYSTEM'
  }));
  console.log(`[ETL Pipeline] Loaded ${systemItems.length} foundational SYSTEM seed items.`);

  // 2. Parse ARGENFOODS
  console.log(`\n[ETL Pipeline] --- Processing ARGENFOODS ---`);
  const argenCsv = findDataFile(path.join(dataRawDir, 'argenfoods'), '.csv');
  const argenItems = argenCsv ? await parseArgenfoodsCSV(argenCsv) : [];
  if (argenCsv) {
    console.log(`[ETL Pipeline] Loaded ${argenItems.length} items from ARGENFOODS (${argenCsv})`);
  }

  // 3. Parse SARA 2
  console.log(`\n[ETL Pipeline] --- Processing SARA 2 ---`);
  const saraCsv = findDataFile(path.join(dataRawDir, 'sara2'), '.csv');
  const saraItems = saraCsv ? await parseSara2CSV(saraCsv) : [];
  if (saraCsv) {
    console.log(`[ETL Pipeline] Loaded ${saraItems.length} items from SARA 2 (${saraCsv})`);
  }

  // 4. Parse TBCA
  console.log(`\n[ETL Pipeline] --- Processing TBCA ---`);
  const tbcaCsv = findDataFile(path.join(dataRawDir, 'tbca'), '.csv');
  const tbcaItems = tbcaCsv ? await parseTbcaCSV(tbcaCsv) : [];
  if (tbcaCsv) {
    console.log(`[ETL Pipeline] Loaded ${tbcaItems.length} items from TBCA (${tbcaCsv})`);
  }

  // 5. Parse Open Food Facts
  console.log(`\n[ETL Pipeline] --- Processing Open Food Facts ---`);
  const offJsonlGz = findDataFile(path.join(dataRawDir, 'openfoodfacts'), '.jsonl.gz');
  const offItems = offJsonlGz ? await parseOpenFoodFactsJSONL(offJsonlGz) : [];
  if (offJsonlGz) {
    console.log(`[ETL Pipeline] Loaded ${offItems.length} items from Open Food Facts (${offJsonlGz})`);
  }

  // 6. Pool and resolve collisions according to source hierarchy
  console.log(`\n[ETL Pipeline] --- Deduplication & Resolution ---`);
  const rawPool: RawIngredientItem[] = [
    ...systemItems,
    ...argenItems,
    ...saraItems,
    ...tbcaItems,
    ...offItems
  ];

  console.log(`[ETL Pipeline] Total raw pooled items before deduplication: ${rawPool.length}`);
  const resolvedItems = resolveIngredients(rawPool);
  console.log(`[ETL Pipeline] Deduplicated and resolved catalog items: ${resolvedItems.length}`);

  // 7. Sanitize, hash, and build payloads
  const { catalog, meta } = buildCatalogPayload(resolvedItems);

  // 8. Output catalog.json and catalog_meta.json to webapp/public/
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  const catalogPath = path.join(publicDir, 'catalog.json');
  const metaPath = path.join(publicDir, 'catalog_meta.json');

  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf-8');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  console.log(`[ETL Pipeline] Generated versioned catalog (${catalog.catalogVersion}) at ${catalogPath}`);
  console.log(`[ETL Pipeline] Generated catalog metadata at ${metaPath}`);

  // 9. Generate _headers file for Cloudflare Pages to allow CORS from WebApp
  const headersContent = `/*\n  Access-Control-Allow-Origin: *\n  Access-Control-Allow-Methods: GET, HEAD, OPTIONS\n`;
  const headersPath = path.join(publicDir, '_headers');
  fs.writeFileSync(headersPath, headersContent, 'utf-8');
  console.log(`[ETL Pipeline] Generated CORS _headers for Cloudflare Pages at ${headersPath}`);

  return { catalog, meta };
}

// Auto-run if executed directly
const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('index.ts') || 
  process.argv[1].endsWith('index.js')
);

if (isDirectExecution) {
  runETL().catch((err) => {
    console.error('[ETL Pipeline] Fatal error:', err);
    process.exit(1);
  });
}
