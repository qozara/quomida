import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import type { BaseIngredient, Portion } from '@quomida/domain-core';

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

const seedIngredients: BaseIngredient[] = [
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

const seedPortions: Portion[] = [
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
 * Builds the full versioned catalog payload.
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
}

export function runETL(options?: RunETLOptions) {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);

  const publicDir = options?.publicDir || path.resolve(currentDir, '../../webapp/public');
  const assetsDir = options?.assetsDir || path.resolve(currentDir, '../../webapp/src/assets');

  console.log('[ETL Pipeline] Transforming regional food datasets (ARGENFOODS/LATINFOODS/USDA)...');

  const { catalog, meta } = buildCatalogPayload(seedIngredients);

  // 1. Output catalog.json and catalog_meta.json to webapp/public/
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  const catalogPath = path.join(publicDir, 'catalog.json');
  const metaPath = path.join(publicDir, 'catalog_meta.json');

  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf-8');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  console.log(`[ETL Pipeline] Generated versioned catalog (${catalog.catalogVersion}) at ${catalogPath}`);
  console.log(`[ETL Pipeline] Generated catalog metadata at ${metaPath}`);

  // 2. Output legacy seed_v1.json to public for offline bundle fallback
  const seedPayload = {
    version: 'seed_v1.0.0',
    catalogVersion: catalog.catalogVersion,
    generatedAt: catalog.generatedAt,
    base_ingredients: catalog.items,
    portions: seedPortions
  };
  const seedPath = path.join(publicDir, 'seed_v1.json');
  fs.writeFileSync(seedPath, JSON.stringify(seedPayload, null, 2), 'utf-8');
  console.log(`[ETL Pipeline] Generated offline seed bundle at ${seedPath}`);
}

// Auto-run if executed directly
const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('index.ts') || 
  process.argv[1].endsWith('index.js')
);

if (isDirectExecution) {
  runETL();
}
