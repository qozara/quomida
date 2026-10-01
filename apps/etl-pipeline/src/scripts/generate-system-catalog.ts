import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '../config/env.js';
import { parseOpenFoodFactsJSONL } from '../sources/openfoodfacts.js';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const dataRawDir = path.resolve(currentDir, '../../data/raw');
const dataDir = path.resolve(currentDir, '../../data');

const offGzPath = path.join(dataRawDir, 'openfoodfacts/openfoodfacts-products.jsonl.gz');
if (!fs.existsSync(offGzPath)) {
  console.error('[ETL Pipeline] ERROR: OpenFoodFacts raw data not found.');
  console.error('  Please run `npm run start -- --with-off` first to download the 13GB dataset.');
  process.exit(1);
}

console.log('[ETL Pipeline] --generate-system-catalog flag detected. Scanning OpenFoodFacts...');
const outDir = path.join(dataDir, 'generated');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const ingredientsCsvPath = path.join(outDir, 'system_ingredients.csv');
const portionsCsvPath = path.join(outDir, 'system_portions.csv');

parseOpenFoodFactsJSONL(offGzPath, {
  format: 'csv',
  outPath: ingredientsCsvPath,
  outPortionsPath: portionsCsvPath
}).then(() => {
  console.log(`[ETL Pipeline] Successfully generated CSV templates in ${outDir}`);
  process.exit(0);
}).catch(err => {
  console.error('[ETL Pipeline] Fatal error:', err);
  process.exit(1);
});
