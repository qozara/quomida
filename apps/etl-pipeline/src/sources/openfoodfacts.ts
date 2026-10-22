import fs from 'fs';
import zlib from 'zlib';
import readline from 'readline';
import { Transform } from 'stream';
import { parseFloatSafe, normalizeFoodName } from '../utils/parserUtils.js';
import type { StateTracker } from '../utils/StateTracker.js';

export const PRIMARY_COUNTRIES: Record<string, string> = {
  // Latin America & Spain (Tier 1 Priority: 100% kept, unique_scans_n gate bypassed)
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
  'spain': 'es-ES',
  'espana': 'es-ES',
};

export const SECONDARY_COUNTRIES: Record<string, string> = {
  // North America & Europe (Tier 2: Popularity gate unique_scans_n > 5 enforced)
  'usa': 'en-US',
  'united states': 'en-US',
  'united-states': 'en-US',
  'uk': 'en-GB',
  'united kingdom': 'en-GB',
  'united-kingdom': 'en-GB',
  'france': 'fr-FR',
  'germany': 'de-DE',
  'italy': 'it-IT',
};

export const ALLOWED_COUNTRIES: Record<string, string> = {
  ...PRIMARY_COUNTRIES,
  ...SECONDARY_COUNTRIES,
};

export interface OpenFoodFactsParseOptions {
  format: 'ndjson' | 'csv';
  outPath: string;
  outPortionsPath?: string;
  stateTracker?: StateTracker;
}

const GENERIC_BRANDS = new Set([
  'none', 'generic', 'sin marca', 'unknown', 'desconocido', 'marca blanca', 'no brand', 'sans marque', 'generic brand'
]);

/**
 * Strips inline package quantities and weights from food titles
 * (e.g., "Galleta María Dorada 200g" -> "Galleta María Dorada").
 */
export function stripInlineWeight(name: string): string {
  if (!name) return '';
  // Strip parenthesized weights e.g. (200g), ( 1.5 kg )
  let cleaned = name.replace(/\(\s*(?:\d+\s*[xX]\s*)?\d+(?:[.,]\d+)?\s*(?:k?g|grs?|mg|k?l|ml|cl|oz|fl\s*oz|lbs?)\.?\s*\)/gi, '');
  
  // Strip inline package quantities / weights preceded by boundary/punctuation
  cleaned = cleaned.replace(/(?:^|[\s,–—\-])(?:\d+\s*[xX]\s*)?\d+(?:[.,]\d+)?\s*(?:k?g|grs?|mg|k?l|ml|cl|oz|fl\s*oz|lbs?)\.?(?=[\s,–—\-]|$)/gi, ' ');
  
  cleaned = cleaned
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,–—\-]+/, '')
    .replace(/[\s,–—\-]+$/, '')
    .trim();

  return cleaned;
}

/**
 * Formats brand suffix:
 * - Omits brand suffix when any brand token is already inside the clean food name.
 * - Appends hyphenated suffix "- Brand" for other branded items.
 * - Returns cleanName unchanged for generic unbranded items.
 */
export function formatBrandSuffix(product: any, cleanName: string): { finalName: string; normBrandTag: string } {
  let rawBrandsStr = typeof product.brands === 'string' ? product.brands : '';
  if (!rawBrandsStr && Array.isArray(product.brands_tags)) {
    rawBrandsStr = product.brands_tags.map((t: unknown) => String(t).replace(/^[^:]+:/, '')).join(', ');
  }

  const tokens = rawBrandsStr
    .split(/[,;/]+/)
    .map((t: string) => t.trim())
    .filter((t: string) => t.length > 1 && !GENERIC_BRANDS.has(t.toLowerCase()));

  if (tokens.length === 0) {
    return {
      finalName: cleanName,
      normBrandTag: ''
    };
  }

  const cleanNameLower = cleanName.toLowerCase();
  const alreadyHasBrand = tokens.some((token: string) => {
    const tokenLower = token.toLowerCase();
    const regex = new RegExp(`(?:^|[^a-zA-Z0-9áéíóúñüÁÉÍÓÚÑÜãõç])${tokenLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-zA-Z0-9áéíóúñüÁÉÍÓÚÑÜãõç])`, 'i');
    return regex.test(cleanName) || cleanNameLower.includes(tokenLower);
  });

  const primaryBrand = tokens[0];
  const normBrandTag = normalizeFoodName(primaryBrand);

  if (alreadyHasBrand) {
    return {
      finalName: cleanName,
      normBrandTag
    };
  }

  return {
    finalName: `${cleanName} - ${primaryBrand}`,
    normBrandTag
  };
}

/**
 * Safely extracts a numeric nutrient value checking product.nutriments,
 * product.nutrition.aggregated_set.nutrients, or top-level product keys.
 */
function extractNutrient(product: any, keys: string[]): number | null {
  const nutriments = (product.nutriments && typeof product.nutriments === 'object') ? product.nutriments : {};
  const aggregated = (product.nutrition?.aggregated_set?.nutrients && typeof product.nutrition.aggregated_set.nutrients === 'object')
    ? product.nutrition.aggregated_set.nutrients
    : {};

  for (const key of keys) {
    if (nutriments[key] !== undefined && nutriments[key] !== null && nutriments[key] !== '') {
      const val = parseFloatSafe(nutriments[key], -1);
      if (val !== -1) return val;
    }
    if (aggregated[key] !== undefined && aggregated[key] !== null && aggregated[key] !== '') {
      const val = parseFloatSafe(aggregated[key], -1);
      if (val !== -1) return val;
    }
    if (product[key] !== undefined && product[key] !== null && product[key] !== '') {
      const val = parseFloatSafe(product[key], -1);
      if (val !== -1) return val;
    }
  }
  return null;
}

/**
 * Streams an Open Food Facts JSONL dump (compressed as .gz).
 * Applies 4-stage geographic prioritization, popularity gating, nutritional quality validation,
 * inline weight stripping, brand suffix formatting, and metadata generation.
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

  const minScansThreshold = process.env.OFF_US_EU_MIN_SCANS !== undefined
    ? Number(process.env.OFF_US_EU_MIN_SCANS)
    : 5;

  for await (const line of rl) {
    currentLine++;
    if (currentLine <= targetLine) {
      continue;
    }

    if (!line.trim()) continue;

    let product;
    try {
      product = JSON.parse(line);
    } catch {
      continue;
    }

    if (!product || typeof product !== 'object') {
      continue;
    }

    const rawCountryTags: string[] = Array.isArray(product.countries_tags)
      ? product.countries_tags.map((c: unknown) => String(c).toLowerCase())
      : typeof product.countries === 'string'
      ? product.countries.toLowerCase().split(',').map((c: string) => c.trim())
      : [];

    const cleanCountryTags = rawCountryTags.map(tag => tag.replace(/^[^:]+:/, '').trim());

    // Stage 1: Geographic Priority Check
    // Primary (LatAm + Spain) takes precedence over Secondary (US + EU)
    let matchedLang: string | null = null;
    let isLatAmOrSpain = false;

    for (const tag of cleanCountryTags) {
      if (PRIMARY_COUNTRIES[tag]) {
        matchedLang = PRIMARY_COUNTRIES[tag];
        isLatAmOrSpain = true;
        break;
      }
    }

    if (!matchedLang) {
      for (const tag of cleanCountryTags) {
        if (SECONDARY_COUNTRIES[tag]) {
          matchedLang = SECONDARY_COUNTRIES[tag];
          isLatAmOrSpain = false;
          break;
        }
      }
    }

    if (!matchedLang) {
      continue;
    }

    // Popularity Gate: US/EU items require unique_scans_n > 5
    const scansCount = parseFloatSafe(product.unique_scans_n, 0);
    if (!isLatAmOrSpain && scansCount <= minScansThreshold) {
      continue;
    }

    const code = String(product.code || product._id || '').trim();
    if (!code) {
      continue;
    }

    // Language-aware raw product name selection
    let rawName: string | undefined;
    if (matchedLang.startsWith('es')) {
      rawName = product.product_name_es || product.product_name || product.product_name_en;
    } else if (matchedLang.startsWith('pt')) {
      rawName = product.product_name_pt || product.product_name || product.product_name_es || product.product_name_en;
    } else {
      rawName = product.product_name_en || product.product_name || product.product_name_es;
    }

    if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
      continue;
    }

    // Stage 2: Category & Non-Food Quality Gate
    const categoriesTags: string[] = Array.isArray(product.categories_tags)
      ? product.categories_tags.map((c: unknown) => String(c).toLowerCase())
      : [];
    const pnnsGroup = String(product.pnns_groups_1 || '').toLowerCase();

    const isNonFood = categoriesTags.some(cat =>
      cat.includes('pet-food') || cat.includes('non-food-products')
    ) || pnnsGroup.includes('pet-food') || pnnsGroup.includes('non-food-products');

    if (isNonFood) {
      continue;
    }

    // Dual Nutrition Schema & kJ Fallback
    let calories = extractNutrient(product, ['energy-kcal_100g', 'energy-kcal', 'energy-kcal_value']);
    const energyKj = extractNutrient(product, ['energy-kj_100g', 'energy-kj', 'energy-kj_value']);

    if ((calories === null || calories <= 0) && energyKj !== null && energyKj > 0) {
      calories = Number((energyKj / 4.184).toFixed(1));
    }

    const protein = extractNutrient(product, ['proteins_100g', 'proteins', 'proteins_value']) ?? 0;
    const carbs = extractNutrient(product, ['carbohydrates_100g', 'carbohydrates', 'carbohydrates_value']) ?? 0;
    const fats = extractNutrient(product, ['fat_100g', 'fat', 'fat_value']) ?? 0;

    // Plausibility constraints
    if (calories === null || calories <= 0 || calories > 900) {
      continue;
    }

    if (protein < 0 || protein > 100 || carbs < 0 || carbs > 100 || fats < 0 || fats > 100) {
      continue;
    }

    const sumMacros = protein + carbs + fats;
    if (sumMacros <= 0 || sumMacros > 105) {
      continue;
    }

    // Atwater Consistency Check
    const atwaterCalories = 4 * protein + 4 * carbs + 9 * fats;
    const atwaterDiff = Math.abs(calories - atwaterCalories);
    const maxAllowedDiff = Math.max(75, 0.35 * calories);
    if (atwaterDiff > maxAllowedDiff) {
      continue;
    }

    // Stage 3: Inline Weight Stripping & Brand Suffix
    const cleanName = stripInlineWeight(rawName);
    const latinLetterMatches = cleanName.match(/[a-zA-ZáéíóúñüÁÉÍÓÚÑÜãõç]/g);
    if (cleanName.length < 3 || cleanName.length > 100 || !latinLetterMatches || latinLetterMatches.length < 2) {
      continue;
    }

    const { finalName, normBrandTag } = formatBrandSuffix(product, cleanName);

    // Leaf category tag for cross-language deduplication
    let leafCategoryTag = '';
    if (typeof product.compared_to_category === 'string' && product.compared_to_category.trim()) {
      leafCategoryTag = product.compared_to_category.trim().toLowerCase();
    } else if (categoriesTags.length > 0) {
      const enTags = categoriesTags.filter(c => c.startsWith('en:'));
      leafCategoryTag = enTags.length > 0 ? enTags[enTags.length - 1] : categoriesTags[categoriesTags.length - 1];
    }

    // Leader Election Quality Score
    const boundedScans = Math.min(Math.max(0, scansCount), 5000);
    const completeness = Math.max(0, parseFloatSafe(product.completeness, 0));
    const lastModified = parseFloatSafe(product.last_modified_t, 0) / 1e9;
    const qualityScore = (isLatAmOrSpain ? 10000 : 0) + boundedScans + (completeness * 100) + lastModified;

    const id = `ing-off-${code}`;

    // Portions
    let servingQty = parseFloatSafe(product.serving_quantity);
    let servingSize = typeof product.serving_size === 'string' ? product.serving_size.trim() : '';
    servingQty = Number(servingQty.toFixed(1));
    const hasPortion = servingQty >= 0.5 && servingQty <= 2500 && servingSize.length > 0;

    if (isCSV) {
      const escapedClean = finalName.replace(/[\r\n]+/g, ' ').trim();
      const csvName = escapedClean.includes(',') || escapedClean.includes('"')
        ? `"${escapedClean.replace(/"/g, '""')}"`
        : escapedClean;

      outStream.write(`${id},${csvName},system,${matchedLang},${calories},${protein},${carbs},${fats}\n`);

      if (portionsStream && hasPortion) {
        const csvPortionName = servingSize.includes(',') || servingSize.includes('"')
          ? `"${servingSize.replace(/"/g, '""')}"`
          : servingSize.trim();

        const portionId = `port-off-${code}-1`;
        portionsStream.write(`${portionId},${id},${csvPortionName},${servingQty}\n`);
      }
    } else {
      const item = {
        id,
        name: finalName,
        source: 'system',
        lang: matchedLang,
        calories_100g: calories,
        protein_100g: protein,
        carbs_100g: carbs,
        fats_100g: fats,
        originSource: 'OPENFOODFACTS',
        barcode: code,
        originalId: code,
        brandTag: normBrandTag,
        categoryTag: leafCategoryTag,
        cleanName,
        qualityScore
      };
      outStream.write(JSON.stringify(item) + '\n');

      if (hasPortion) {
        const portionId = `port-off-${code}-1`;
        const portionItem = {
          _type: 'portion',
          id: portionId,
          base_food_id: id,
          name: servingSize,
          equivalent_weight_g: servingQty,
          source: 'system',
          is_generic: false,
          originSource: 'OPENFOODFACTS'
        };
        outStream.write(JSON.stringify(portionItem) + '\n');
      }
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
