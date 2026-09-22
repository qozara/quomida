import fs from 'fs';
import { parse } from 'csv-parse';
import { parseFloatSafe, generateDeterministicId } from '../utils/parserUtils.js';
import type { RawIngredientItem } from '../types.js';

/**
 * Parses ARGENFOODS nutritional composition dataset in CSV format.
 * Maps values directly to macros and standardizes lang to 'es-AR'.
 */
export async function parseArgenfoodsCSV(filePath: string): Promise<RawIngredientItem[]> {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const results: RawIngredientItem[] = [];
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

    results.push({
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
    });
  }

  return results;
}
