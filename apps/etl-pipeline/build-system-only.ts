import { parseSystemCSV } from './src/sources/system.js';
import path from 'path';
import fs from 'fs';

async function run() {
  const currentDir = process.cwd();
  const systemOut = path.resolve(currentDir, '../webapp/public/system.sqlite');
  
  console.log('Building system.sqlite at:', systemOut);
  
  const ingredientsCsv = process.env.SYSTEM_INGREDIENTS_PATH || path.resolve(currentDir, 'data/examples/system_ingredients.csv');
  const portionsCsv = process.env.SYSTEM_PORTIONS_PATH || path.resolve(currentDir, 'data/examples/system_portions.csv');

  const rawSystemDir = path.resolve(currentDir, 'data/raw/system');
  fs.mkdirSync(rawSystemDir, { recursive: true });
  fs.copyFileSync(ingredientsCsv, path.resolve(rawSystemDir, 'system_ingredients.csv'));
  fs.copyFileSync(portionsCsv, path.resolve(rawSystemDir, 'system_portions.csv'));

  await parseSystemCSV(
    path.resolve(rawSystemDir, 'system_ingredients.csv'),
    path.resolve(rawSystemDir, 'system_portions.csv'),
    systemOut
  );
  console.log('Done building system.sqlite');
}

run().catch(console.error);
