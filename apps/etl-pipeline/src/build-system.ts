import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

import './config/env.js';
import { parseSystemCSV } from './sources/system.js';
import { exportSystemCatalog } from './exporters/SystemExporter.js';

async function run() {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const scriptDir = path.resolve(currentDir, '../scripts');

  const dataRawDir = path.resolve(currentDir, '../data/raw');
  const tempDir = path.resolve(currentDir, '../data/temp');
  const dataDir = path.resolve(currentDir, '../../webapp/src/generated');

  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  console.log('[ETL Pipeline CLI] Running SYSTEM download script...');
  execSync(`bash "${path.join(scriptDir, 'download_system.sh')}"`, { stdio: 'inherit' });

  const systemOut = path.join(tempDir, 'system.ndjson');

  if (process.env.PREBUILT_SYSTEM_CATALOG_URL) {
    if (!fs.existsSync(systemOut)) {
      console.error('[ETL Pipeline] FATAL: Prebuilt system catalog was not downloaded successfully.');
      process.exit(1);
    }
  } else {
    const systemIngredientsCsv = path.join(dataRawDir, 'system/system_ingredients.csv');
    const systemPortionsCsv = path.join(dataRawDir, 'system/system_portions.csv');
    if (fs.existsSync(systemIngredientsCsv)) {
      const { ingredientsCount, portionsCount } = await parseSystemCSV(systemIngredientsCsv, systemPortionsCsv, systemOut);
      console.log(`[ETL Pipeline] Loaded ${ingredientsCount} ingredients and ${portionsCount} portions from SYSTEM`);
    } else {
      console.warn(`[ETL Pipeline] System dataset not found. Skipping...`);
      fs.writeFileSync(systemOut, ''); // Touch file to prevent resolver crash
    }
  }

  const systemCatalogPath = path.join(dataDir, 'catalog_system.ndjson');
  const systemMetaPath = path.join(dataDir, 'catalog_system_meta.json');

  await exportSystemCatalog(systemOut, systemCatalogPath, systemMetaPath);
  console.log('[ETL Pipeline] Success (System Catalog)!');
}

run().catch((err) => {
  console.error('[ETL Pipeline] Fatal error:', err);
  process.exit(1);
});
