import fs from 'fs';
import zlib from 'zlib';
import ndjson from 'ndjson';
import readline from 'readline';
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

export interface OpenFoodFactsParseOptions {
  format: 'ndjson' | 'csv';
  outPath: string;
  outPortionsPath?: string;
  stateTracker?: StateTracker;
}

/**
 * Streams an Open Food Facts JSONL dump (compressed as .gz).
 * Tracks bytes read and skips lines based on state for resumability.
 */
export async function parseOpenFoodFactsJSONL(
  filePath: string,
  options: OpenFoodFactsParseOptions
): Promise<number> {
  if (!fs.existsSync(filePath)) {
    return 0;
  }

  const { format, outPath, outPortionsPath, stateTracker } = options;
  const isCSV = format === 'csv';

  const fileStats = fs.statSync(filePath);
  const totalBytes = fileStats.size;

  let state, targetLine = 0;
  if (stateTracker && !isCSV) {
    state = stateTracker.getState();
    targetLine = state.processedLines['OPENFOODFACTS'] || 0;
  }
  let currentLine = 0;
  
  const flags = targetLine > 0 ? 'a' : 'w';
  const outStream = fs.createWriteStream(outPath, { flags });
  const portionsStream = (isCSV && outPortionsPath) ? fs.createWriteStream(outPortionsPath, { flags }) : null;

  if (isCSV && targetLine === 0) {
    outStream.write('id,name,source,lang,calories_100g,protein_100g,carbs_100g,fats_100g\n');
    if (portionsStream) {
      portionsStream.write('id,base_food_id,name,equivalent_weight_g\n');
    }
  }

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
    
    if (currentLine < targetLine) {
      console.log(`[ETL Pipeline] [OPENFOODFACTS] ⏩ Fast-Forwarding... ${percentage}% (${mbRead}MB / ${mbTotal}MB) | Checkpoint: ${targetLine} lines`);
    } else {
      console.log(`[ETL Pipeline] [OPENFOODFACTS] ${percentage}% (${mbRead}MB / ${mbTotal}MB) | Processed: ${currentLine} lines`);
      if (stateTracker) {
        stateTracker.updateMetrics('OPENFOODFACTS', { lines: currentLine, bytes: bytesRead });
      }
    }
  }, 5000);

  const stream = fs.createReadStream(filePath)
    .pipe(progressStream)
    .pipe(zlib.createGunzip());

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    currentLine++;
    if (currentLine <= targetLine) {
      continue;
    }

    if (!line.trim()) continue;

    let product;
    try {
      product = JSON.parse(line);
    } catch (e) {
      continue;
    }

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

    if (calories === 0 && protein === 0 && carbs === 0 && fats === 0) {
      continue;
    }

    const id = `ing-off-${code}`;

    if (isCSV) {
      // Escape commas and quotes for CSV
      const csvName = rawName.includes(',') || rawName.includes('"') 
        ? `"${rawName.replace(/"/g, '""')}"` 
        : rawName.trim();
      
      outStream.write(`${id},${csvName},system,${matchedLang},${calories},${protein},${carbs},${fats}\n`);

      // Try to parse serving size for portions
      if (portionsStream) {
        let servingQty = parseFloatSafe(product.serving_quantity);
        let servingSize = product.serving_size;
        
        if (servingQty > 0 && typeof servingSize === 'string' && servingSize.trim().length > 0) {
          const csvPortionName = servingSize.includes(',') || servingSize.includes('"')
            ? `"${servingSize.replace(/"/g, '""')}"`
            : servingSize.trim();
            
          const portionId = `port-off-${code}-1`;
          portionsStream.write(`${portionId},${id},${csvPortionName},${servingQty}\n`);
        }
      }
    } else {
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
  }

  clearInterval(logInterval);
  if (stateTracker && !isCSV) {
    stateTracker.updateMetrics('OPENFOODFACTS', { lines: currentLine, bytes: bytesRead });
  }
  
  return new Promise((resolve) => {
    outStream.end(() => {
      if (portionsStream) portionsStream.end(() => resolve(currentLine));
      else resolve(currentLine);
    });
  });
}
