import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { BaseIngredient, Portion } from '@quomida/domain-core';
import type { RawIngredientItem } from './types.js';
import { resolveAndExportNDJSON } from './resolver.js';
import { parseSara2CSV } from './sources/sara2.js';
import { parseTbcaCSV } from './sources/tbca.js';
import { parseUsdaCSV } from './sources/usda.js';
import { parseOpenFoodFactsJSONL } from './sources/openfoodfacts.js';
import { parseSystemCSV } from './sources/system.js';
import { StateTracker } from './utils/StateTracker.js';

export * from './types.js';
export * from './resolver.js';
export * from './utils/parserUtils.js';
export * from './sources/sara2.js';
export * from './sources/tbca.js';
export * from './sources/usda.js';
export * from './sources/openfoodfacts.js';
export * from './sources/system.js';

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
  itemCount: number;
  sources: string[];
}



export interface RunETLOptions {
  publicDir?: string;
  assetsDir?: string;
  dataRawDir?: string;
  tempDir?: string;
  reset?: boolean;
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

const STAGES = ['INIT', 'SYSTEM', 'SARA2', 'TBCA', 'USDA', 'OPENFOODFACTS', 'RESOLVER', 'EXPORT', 'DONE'];

function hasCompleted(currentStage: string, targetStage: string): boolean {
  return STAGES.indexOf(currentStage) > STAGES.indexOf(targetStage);
}

export async function runETL(options?: RunETLOptions): Promise<void> {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  
  const publicDir = options?.publicDir || path.resolve(currentDir, '../../webapp/public');
  const dataRawDir = options?.dataRawDir || path.resolve(currentDir, '../data/raw');
  const tempDir = options?.tempDir || path.resolve(currentDir, '../data/temp');
  const dataDir = path.resolve(currentDir, '../data');

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const tracker = new StateTracker(tempDir);
  if (options?.reset || process.argv.includes('--reset')) {
    tracker.reset();
  }

  let state = tracker.getState();
  console.log(`[ETL Pipeline] Starting... Resuming from stage: ${state.stage}`);

  const intermediateFiles: string[] = [];
  const addIntermediate = (name: string) => {
    const f = path.join(tempDir, `${name}.ndjson`);
    intermediateFiles.push(f);
    return f;
  };

  const isSystemOnly = process.argv.includes('--system-only');

  // 1. SYSTEM
  const systemOut = addIntermediate('system');
  if (isSystemOnly || !hasCompleted(state.stage, 'SYSTEM')) {
    console.log('[ETL Pipeline] --- Processing SYSTEM seed ---');
    
    let prebuiltUrl = process.env.PREBUILT_SYSTEM_CATALOG_URL;
    if (prebuiltUrl) {
      if (prebuiltUrl.startsWith('http') && !prebuiltUrl.endsWith('.ndjson')) {
        prebuiltUrl = prebuiltUrl.endsWith('/') ? prebuiltUrl + 'catalog_system.ndjson' : prebuiltUrl + '/catalog_system.ndjson';
      }
      console.log(`[ETL Pipeline] PREBUILT_SYSTEM_CATALOG_URL detected: ${prebuiltUrl}`);
      try {
        if (prebuiltUrl.startsWith('http://') || prebuiltUrl.startsWith('https://')) {
          const res = await fetch(prebuiltUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = await res.text();
          fs.writeFileSync(systemOut, text);
        } else {
          const localPath = prebuiltUrl.startsWith('file://') ? prebuiltUrl.replace('file://', '') : prebuiltUrl;
          fs.copyFileSync(path.resolve(currentDir, '../../', localPath), systemOut);
        }
        console.log(`[ETL Pipeline] Successfully loaded prebuilt system catalog.`);
      } catch (e) {
        console.error(`[ETL Pipeline] Failed to load prebuilt system catalog:`, e);
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
    
    tracker.updateStage('SARA2');
    state = tracker.getState();
  } else {
    console.log('[ETL Pipeline] Skipped SYSTEM (already processed)');
  }

  if (process.argv.includes('--system-only')) {
    console.log('[ETL Pipeline] --system-only flag detected. Skipping remaining sources.');
    tracker.updateStage('RESOLVER');
    state = tracker.getState();
  }

  if (process.argv.includes('--generate-system-catalog')) {
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
    
    await parseOpenFoodFactsJSONL(offGzPath, {
      format: 'csv',
      outPath: ingredientsCsvPath,
      outPortionsPath: portionsCsvPath
    });
    
    console.log(`[ETL Pipeline] Successfully generated CSV templates in ${outDir}`);
    process.exit(0);
  }

  // 2. SARA 2
  const saraOut = addIntermediate('sara2');
  if (!hasCompleted(state.stage, 'SARA2')) {
    console.log(`\n[ETL Pipeline] --- Processing SARA 2 ---`);
    const saraCsv = findDataFile(path.join(dataRawDir, 'sara2'), '.csv');
    if (saraCsv) {
      const count = await parseSara2CSV(saraCsv, saraOut);
      console.log(`[ETL Pipeline] Loaded ${count} items from SARA 2`);
    }
    tracker.updateStage('TBCA');
    state = tracker.getState();
  }

  // 4. TBCA
  const tbcaOut = addIntermediate('tbca');
  if (!hasCompleted(state.stage, 'TBCA')) {
    console.log(`\n[ETL Pipeline] --- Processing TBCA ---`);
    const tbcaCsv = findDataFile(path.join(dataRawDir, 'tbca'), '.csv');
    if (tbcaCsv) {
      const count = await parseTbcaCSV(tbcaCsv, tbcaOut);
      console.log(`[ETL Pipeline] Loaded ${count} items from TBCA`);
    }
    tracker.updateStage('USDA');
    state = tracker.getState();
  }

  // 5. USDA
  const usdaOut = addIntermediate('usda');
  if (!hasCompleted(state.stage, 'USDA')) {
    console.log(`\n[ETL Pipeline] --- Processing USDA ---`);
    const usdaCsv = findDataFile(path.join(dataRawDir, 'usda'), '.csv');
    if (usdaCsv) {
      const count = await parseUsdaCSV(usdaCsv, usdaOut);
      console.log(`[ETL Pipeline] Loaded ${count} items from USDA`);
    }
    tracker.updateStage('OPENFOODFACTS');
    state = tracker.getState();
  }

  // 6. Open Food Facts
  const offOut = addIntermediate('openfoodfacts');
  if (!hasCompleted(state.stage, 'OPENFOODFACTS')) {
    console.log(`\n[ETL Pipeline] --- Processing Open Food Facts ---`);
    const offJsonlGz = findDataFile(path.join(dataRawDir, 'openfoodfacts'), '.jsonl.gz');
    if (offJsonlGz) {
      const count = await parseOpenFoodFactsJSONL(offJsonlGz, {
        format: 'ndjson',
        outPath: offOut,
        stateTracker: tracker
      });
      console.log(`[ETL Pipeline] Loaded ${count} items from Open Food Facts`);
    }
    tracker.updateStage('RESOLVER');
    state = tracker.getState();
  }

  // 6. Resolution & Export
  if (!hasCompleted(state.stage, 'RESOLVER')) {
    console.log(`\n[ETL Pipeline] --- Deduplication & Export ---`);
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    const catalogPath = path.join(publicDir, 'catalog.json');
    const metaPath = path.join(publicDir, 'catalog_meta.json');
    
    const dataDir = path.resolve(currentDir, '../../webapp/src/generated');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const systemCatalogPath = path.join(dataDir, 'catalog_system.ndjson');
    const systemMetaPath = path.join(dataDir, 'catalog_system_meta.json');
    
    await resolveAndExportNDJSON(intermediateFiles, catalogPath, metaPath, systemCatalogPath, systemMetaPath);

    // Generate _headers file for Cloudflare Pages
    const headersContent = `/*\n  Access-Control-Allow-Origin: *\n  Access-Control-Allow-Methods: GET, HEAD, OPTIONS\n`;
    const headersPath = path.join(publicDir, '_headers');
    fs.writeFileSync(headersPath, headersContent, 'utf-8');

    tracker.updateStage('DONE');
  }

  console.log('[ETL Pipeline] Success!');
}

// Auto-run if executed directly
const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('index.ts') || 
  process.argv[1].endsWith('index.js')
);

if (isDirectExecution) {
  import('child_process').then(({ execSync }) => {
    const currentFile = fileURLToPath(import.meta.url);
    const currentDir = path.dirname(currentFile);
    const scriptDir = path.resolve(currentDir, '../scripts');

    if (process.argv.includes('--with-sara2')) {
      console.log('[ETL Pipeline CLI] --with-sara2 flag detected. Running SARA2 download script...');
      execSync(`bash "${path.join(scriptDir, 'download_sara2.sh')}"`, { stdio: 'inherit' });
    }

    if (process.argv.includes('--with-tbca')) {
      console.log('[ETL Pipeline CLI] --with-tbca flag detected. Running TBCA download script...');
      execSync(`bash "${path.join(scriptDir, 'download_tbca.sh')}"`, { stdio: 'inherit' });
    }

    if (process.argv.includes('--with-usda')) {
      console.log('[ETL Pipeline CLI] --with-usda flag detected. Running USDA download script...');
      execSync(`bash "${path.join(scriptDir, 'download_usda.sh')}"`, { stdio: 'inherit' });
    }

    if (process.argv.includes('--with-off')) {
      console.log('[ETL Pipeline CLI] --with-off flag detected. Running Open Food Facts download script...');
      execSync(`bash "${path.join(scriptDir, 'download_off.sh')}"`, { stdio: 'inherit' });
    }

    if (process.argv.includes('--with-system') || process.argv.includes('--system-only')) {
      console.log('[ETL Pipeline CLI] Running SYSTEM download script...');
      execSync(`bash "${path.join(scriptDir, 'download_system.sh')}"`, { stdio: 'inherit' });
    }

    runETL().catch((err) => {
      console.error('[ETL Pipeline] Fatal error:', err);
      process.exit(1);
    });
  }).catch(err => {
    console.error('[ETL Pipeline] Fatal error importing child_process:', err);
    process.exit(1);
  });
}
