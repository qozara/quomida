import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { BaseIngredient, Portion } from '@quomida/domain-core';
import type { RawIngredientItem } from './types.js';
import { resolveAndExportNDJSON } from './resolver.js';
import { parseArgenfoodsCSV } from './sources/argenfoods.js';
import { parseSara2CSV } from './sources/sara2.js';
import { parseTbcaCSV } from './sources/tbca.js';
import { parseOpenFoodFactsJSONL } from './sources/openfoodfacts.js';
import { StateTracker } from './utils/StateTracker.js';

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

const STAGES = ['INIT', 'SYSTEM', 'ARGENFOODS', 'SARA2', 'TBCA', 'OPENFOODFACTS', 'RESOLVER', 'EXPORT', 'DONE'];

function hasCompleted(currentStage: string, targetStage: string): boolean {
  return STAGES.indexOf(currentStage) > STAGES.indexOf(targetStage);
}

export async function runETL(options?: RunETLOptions): Promise<void> {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  
  const publicDir = options?.publicDir || path.resolve(currentDir, '../../webapp/public');
  const dataRawDir = options?.dataRawDir || path.resolve(currentDir, '../data/raw');
  const tempDir = options?.tempDir || path.resolve(currentDir, '../data/temp');

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

  // 1. SYSTEM
  const systemOut = addIntermediate('system');
  if (!hasCompleted(state.stage, 'SYSTEM')) {
    console.log('[ETL Pipeline] --- Processing SYSTEM seed ---');
    const systemItems: RawIngredientItem[] = seedIngredients.map((item) => ({
      ...item,
      originSource: 'SYSTEM'
    }));
    fs.writeFileSync(systemOut, systemItems.map(i => JSON.stringify(i)).join('\n') + '\n');
    tracker.updateStage('ARGENFOODS');
    state = tracker.getState();
  } else {
    console.log('[ETL Pipeline] Skipped SYSTEM (already processed)');
  }

  // 2. ARGENFOODS
  const argenOut = addIntermediate('argenfoods');
  if (!hasCompleted(state.stage, 'ARGENFOODS')) {
    console.log(`\n[ETL Pipeline] --- Processing ARGENFOODS ---`);
    const argenCsv = findDataFile(path.join(dataRawDir, 'argenfoods'), '.csv');
    if (argenCsv) {
      const count = await parseArgenfoodsCSV(argenCsv, argenOut);
      console.log(`[ETL Pipeline] Loaded ${count} items from ARGENFOODS`);
    }
    tracker.updateStage('SARA2');
    state = tracker.getState();
  }

  // 3. SARA 2
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
    tracker.updateStage('OPENFOODFACTS');
    state = tracker.getState();
  }

  // 5. Open Food Facts
  const offOut = addIntermediate('openfoodfacts');
  if (!hasCompleted(state.stage, 'OPENFOODFACTS')) {
    console.log(`\n[ETL Pipeline] --- Processing Open Food Facts ---`);
    const offJsonlGz = findDataFile(path.join(dataRawDir, 'openfoodfacts'), '.jsonl.gz');
    if (offJsonlGz) {
      const count = await parseOpenFoodFactsJSONL(offJsonlGz, offOut, tracker);
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
    
    await resolveAndExportNDJSON(intermediateFiles, catalogPath, metaPath);

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

    if (process.argv.includes('--with-regional')) {
      console.log('[ETL Pipeline CLI] --with-regional flag detected. Running regional download script...');
      execSync(`bash "${path.join(scriptDir, 'download_regional_csvs.sh')}"`, { stdio: 'inherit' });
    }

    if (process.argv.includes('--with-off')) {
      console.log('[ETL Pipeline CLI] --with-off flag detected. Running Open Food Facts download script...');
      execSync(`bash "${path.join(scriptDir, 'download_off.sh')}"`, { stdio: 'inherit' });
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
