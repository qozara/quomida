import { parseSystemCSV } from './src/sources/system.js';
import path from 'path';
import fs from 'fs';

async function run() {
  const currentDir = process.cwd();
  const systemOut = path.resolve(currentDir, '../webapp/public/system.sqlite');
  
  console.log('Building system.sqlite at:', systemOut);
  
  const ingredientsCsv = '/Users/diegodesogos/Library/CloudStorage/GoogleDrive-diegodesogos@gmail.com/Mi unidad/Projects/Qozara/Quomida/quomida-builtin-catalog/csv-content-generated-from-off/system_ingredients.csv';
  const portionsCsv = '/Users/diegodesogos/Library/CloudStorage/GoogleDrive-diegodesogos@gmail.com/Mi unidad/Projects/Qozara/Quomida/quomida-builtin-catalog/csv-content-generated-from-off/system_portions.csv';
  
  fs.copyFileSync(ingredientsCsv, path.resolve(currentDir, 'data/raw/system/system_ingredients.csv'));
  fs.copyFileSync(portionsCsv, path.resolve(currentDir, 'data/raw/system/system_portions.csv'));
  
  await parseSystemCSV(
    path.resolve(currentDir, 'data/raw/system/system_ingredients.csv'),
    path.resolve(currentDir, 'data/raw/system/system_portions.csv'),
    systemOut
  );
  console.log('Done building system.sqlite');
}

run().catch(console.error);
