import fs from 'fs';
import { parse } from 'csv-parse';
import { parseFloatSafe } from '../utils/parserUtils.js';

export async function parseSystemCSV(
  ingredientsPath: string,
  portionsPath: string,
  outPath: string
): Promise<{ ingredientsCount: number; portionsCount: number }> {
  let ingredientsCount = 0;
  let portionsCount = 0;
  
  const outStream = fs.createWriteStream(outPath, { flags: 'w' });

  // Parse Ingredients
  if (fs.existsSync(ingredientsPath)) {
    const ingredientsParser = fs.createReadStream(ingredientsPath).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true
      })
    );

    for await (const record of ingredientsParser) {
      const id = record['id'];
      const name = record['name'];
      if (!id || !name) continue;

      const item = {
        id,
        name: name.trim(),
        source: record['source'] || 'system',
        lang: record['lang'] || 'es',
        calories_100g: parseFloatSafe(record['calories_100g']),
        protein_100g: parseFloatSafe(record['protein_100g']),
        carbs_100g: parseFloatSafe(record['carbs_100g']),
        fats_100g: parseFloatSafe(record['fats_100g']),
        originSource: 'SYSTEM'
      };

      outStream.write(JSON.stringify(item) + '\n');
      ingredientsCount++;
    }
  } else {
    console.warn(`[SYSTEM] Ingredients CSV not found at ${ingredientsPath}`);
  }

  // Parse Portions if exists
  if (fs.existsSync(portionsPath)) {
    const portionsParser = fs.createReadStream(portionsPath).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true
      })
    );

    for await (const record of portionsParser) {
      const id = record['id'];
      const base_food_id = record['base_food_id'];
      const name = record['name'];
      if (!id || !base_food_id || !name) continue;

      const portion = {
        _type: 'portion', // special marker to distinguish from ingredients in the resolver
        id,
        base_food_id,
        name: name.trim(),
        equivalent_weight_g: parseFloatSafe(record['equivalent_weight_g'])
      };

      outStream.write(JSON.stringify(portion) + '\n');
      portionsCount++;
    }
  } else {
    console.warn(`[SYSTEM] Portions CSV not found at ${portionsPath}`);
  }

  return new Promise((resolve) => {
    outStream.end(() => resolve({ ingredientsCount, portionsCount }));
  });
}
