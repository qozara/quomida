import fs from 'fs';
import zlib from 'zlib';
import ndjson from 'ndjson';
import { parseFloatSafe } from '../utils/parserUtils.js';
import type { RawIngredientItem } from '../types.js';

/**
 * A mapping of supported Open Food Facts country tags (lowercase) to their target language codes.
 * To gradually include more countries, simply add them to this map.
 */
export const ALLOWED_COUNTRIES: Record<string, string> = {
  // Latin America
  'argentina': 'es-AR',
  'brazil': 'pt-BR',
  'brasil': 'pt-BR', // Alternative spelling
  'uruguay': 'es-UY',
  'chile': 'es-CL',
  'paraguay': 'es-PY',
  'bolivia': 'es-BO',
  'peru': 'es-PE',
  'colombia': 'es-CO',
  'venezuela': 'es-VE',
  'mexico': 'es-MX',
  
  // Europe
  'spain': 'es-ES',
  'espana': 'es-ES', // Tag variation
  'france': 'fr-FR',
  'uk': 'en-GB',
  'united kingdom': 'en-GB', // Tag variation
  'united-kingdom': 'en-GB', // Hyphenated tag
  'germany': 'de-DE',
  'italy': 'it-IT',
  
  // North America
  'usa': 'en-US',
  'united states': 'en-US', // Tag variation
  'united-states': 'en-US', // Hyphenated tag
};

/**
 * Streams an Open Food Facts JSONL dump (compressed as .gz).
 * Filters items whose countries_tags contain any of the ALLOWED_COUNTRIES.
 * Maps barcode / code directly into a unique identifier.
 */
export async function parseOpenFoodFactsJSONL(filePath: string): Promise<RawIngredientItem[]> {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const results: RawIngredientItem[] = [];
  
  // Directly stream the compressed .gz file to save ~15GB of disk space
  const stream = fs.createReadStream(filePath)
    .pipe(zlib.createGunzip())
    .pipe(ndjson.parse());

  for await (const product of stream) {
    if (!product || typeof product !== 'object') {
      continue;
    }

    // Filter by country tags
    const countries: string[] = Array.isArray(product.countries_tags)
      ? product.countries_tags.map((c: unknown) => String(c).toLowerCase())
      : typeof product.countries === 'string'
      ? product.countries.toLowerCase().split(',').map((c: string) => c.trim())
      : [];

    let matchedLang: string | null = null;
    
    // Check if the product has a tag that matches our ALLOWED_COUNTRIES mapping
    for (const tag of countries) {
      // Tags often look like 'en:argentina' or just 'argentina'
      const cleanTag = tag.replace(/^[^:]+:/, '').trim();
      if (ALLOWED_COUNTRIES[cleanTag]) {
        matchedLang = ALLOWED_COUNTRIES[cleanTag];
        break;
      }
    }

    if (!matchedLang) {
      continue;
    }

    const code = String(product.code || product._id || '').trim();
    if (!code) {
      continue;
    }

    const rawName =
      product.product_name ||
      product.product_name_es ||
      product.product_name_pt ||
      product.product_name_en;

    if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
      continue;
    }

    const nutriments = product.nutriments || {};
    const calories = parseFloatSafe(nutriments['energy-kcal_100g'] ?? product['energy-kcal_100g']);
    const protein = parseFloatSafe(nutriments['proteins_100g'] ?? product['proteins_100g']);
    const carbs = parseFloatSafe(nutriments['carbohydrates_100g'] ?? product['carbohydrates_100g']);
    const fats = parseFloatSafe(nutriments['fat_100g'] ?? product['fat_100g']);

    const id = `ing-off-${code}`;

    results.push({
      id,
      name: rawName.trim(),
      source: 'system',
      lang: matchedLang,
      calories_100g: calories,
      protein_100g: protein,
      carbs_100g: carbs,
      fats_100g: fats,
      originSource: 'OPENFOODFACTS',
      barcode: code,
      originalId: code
    });
  }

  return results;
}
