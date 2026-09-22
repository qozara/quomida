import fs from 'fs';
import { parse } from 'csv-parse';
import { parseFloatSafe, generateDeterministicId } from '../utils/parserUtils.js';

/**
 * Parses ARGENFOODS nutritional composition dataset in CSV format
 * and writes the extracted items as an NDJSON stream to outPath.
 */
export async function parseArgenfoodsCSV(filePath: string, outPath: string): Promise<number> {
  if (!fs.existsSync(filePath)) {
    return 0;
  }

  let count = 0;
  const outStream = fs.createWriteStream(outPath, { flags: 'w' });
  
  const parser = fs.createReadStream(filePath).pipe(
    parse({
      columns: (header: string[]) => header.map((h: string) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true
    })
  );

  for await (const record of parser) {
    const code = record['codigo'] || record['id'] || record['code'] || record['num'] || '';
    const name = record['alimento'] || record['nombre'] || record['descripcion'] || record['food_name'] || '';
    if (!name) continue;

    const calories = parseFloatSafe(record['energia_kcal'] || record['energia'] || record['calorias'] || record['energy_kcal']);
    const protein = parseFloatSafe(record['proteina'] || record['proteinas'] || record['protein']);
    const carbs = parseFloatSafe(record['carbohidratos'] || record['carbohidratos_totales'] || record['h_carbono'] || record['carbs']);
    const fats = parseFloatSafe(record['lipidos'] || record['lipidos_totales'] || record['grasas'] || record['fat']);

    const id = generateDeterministicId('argen', code || name);

    const item = {
      id,
      name: name.trim(),
      source: 'system',
      lang: 'es-AR',
      calories_100g: calories,
      protein_100g: protein,
      carbs_100g: carbs,
      fats_100g: fats,
      originSource: 'ARGENFOODS',
      originalId: code ? String(code).trim() : undefined
    };

    outStream.write(JSON.stringify(item) + '\n');
    count++;
  }

  return new Promise((resolve) => {
    outStream.end(() => resolve(count));
  });
}
