import fs from 'fs';
import zlib from 'zlib';
import ndjson from 'ndjson';
import { Transform } from 'stream';
import { parseFloatSafe } from '../utils/parserUtils.js';
import type { StateTracker } from '../utils/StateTracker.js';

export const ALLOWED_COUNTRIES: Record<string, string> = {
  // Latin America
  'argentina': 'es-AR',
  'brazil': 'pt-BR',
  'brasil': 'pt-BR',
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
  'espana': 'es-ES',
  'france': 'fr-FR',
  'uk': 'en-GB',
  'united kingdom': 'en-GB',
  'united-kingdom': 'en-GB',
  'germany': 'de-DE',
  'italy': 'it-IT',
  
  // North America
  'usa': 'en-US',
  'united states': 'en-US',
  'united-states': 'en-US',
};

/**
 * Streams an Open Food Facts JSONL dump (compressed as .gz).
 * Tracks bytes read and skips lines based on state for resumability.
 */
export async function parseOpenFoodFactsJSONL(
  filePath: string,
  outPath: string,
  stateTracker: StateTracker
): Promise<number> {
  if (!fs.existsSync(filePath)) {
    return 0;
  }

  const fileStats = fs.statSync(filePath);
  const totalBytes = fileStats.size;

  const state = stateTracker.getState();
  let linesProcessed = state.processedLines['OPENFOODFACTS'] || 0;
  let linesSkipped = 0;
  
  const outStream = fs.createWriteStream(outPath, { flags: linesProcessed > 0 ? 'a' : 'w' });

  let bytesRead = 0;
  const progressStream = new Transform({
    transform(chunk, encoding, callback) {
      bytesRead += chunk.length;
      callback(null, chunk);
    }
  });

  // Log progress periodically
  const logInterval = setInterval(() => {
    const percentage = ((bytesRead / totalBytes) * 100).toFixed(2);
    const mbRead = (bytesRead / (1024 * 1024)).toFixed(1);
    const mbTotal = (totalBytes / (1024 * 1024)).toFixed(1);
    console.log(`[ETL Pipeline] [OPENFOODFACTS] ${percentage}% (${mbRead}MB / ${mbTotal}MB) | Processed: ${linesProcessed} lines`);
    stateTracker.updateMetrics('OPENFOODFACTS', { lines: linesProcessed, bytes: bytesRead });
  }, 5000);

  const stream = fs.createReadStream(filePath)
    .pipe(progressStream)
    .pipe(zlib.createGunzip())
    .pipe(ndjson.parse());

  for await (const product of stream) {
    if (linesSkipped < linesProcessed) {
      linesSkipped++;
      continue;
    }

    linesProcessed++;

    if (!product || typeof product !== 'object') {
      continue;
    }

    const countries: string[] = Array.isArray(product.countries_tags)
      ? product.countries_tags.map((c: unknown) => String(c).toLowerCase())
      : typeof product.countries === 'string'
      ? product.countries.toLowerCase().split(',').map((c: string) => c.trim())
      : [];

    let matchedLang: string | null = null;
    
    for (const tag of countries) {
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

    const item = {
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
    };

    outStream.write(JSON.stringify(item) + '\n');
  }

  clearInterval(logInterval);
  stateTracker.updateMetrics('OPENFOODFACTS', { lines: linesProcessed, bytes: bytesRead });
  
  return new Promise((resolve) => {
    outStream.end(() => resolve(linesProcessed));
  });
}
