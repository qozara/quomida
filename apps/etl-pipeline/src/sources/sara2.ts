import fs from 'fs';
import { parse } from 'csv-parse';
import { parseFloatSafe, generateDeterministicId } from '../utils/parserUtils.js';
import type { RawIngredientItem } from '../types.js';

/**
 * Parses SARA 2 (Sistema de Análisis y Registro de Alimentos) dataset in CSV format.
 * Maps CHO_disponibles to carbs_100g and defaults missing values to 0.0.
 * Standardizes lang to 'es-AR'.
 */
export async function parseSara2CSV(filePath: string): Promise<RawIngredientItem[]> {
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
    const code = record['id'] || record['codigo'] || record['code'] || '';
    const name = record['nombre'] || record['alimento'] || record['descripcion'] || record['food_name'] || '';
    if (!name) continue;

    const calories = parseFloatSafe(record['energia_kcal'] || record['energia'] || record['calorias'] || record['energy_kcal']);
    const protein = parseFloatSafe(record['proteinas'] || record['proteina'] || record['protein']);
    // Prioritize CHO disponibles, then fallback to carbohidratos
    const carbs = parseFloatSafe(
      record['cho_disponibles'] ||
      record['cho_disp'] ||
      record['carbohidratos_disponibles'] ||
      record['carbohidratos'] ||
      record['carbohidratos_totales'] ||
      record['carbs']
    );
    const fats = parseFloatSafe(record['lipidos'] || record['lipidos_totales'] || record['grasas'] || record['fat']);

    const id = generateDeterministicId('sara', code || name);

    results.push({
      id,
      name: name.trim(),
      source: 'system',
      lang: 'es-AR',
      calories_100g: calories,
      protein_100g: protein,
      carbs_100g: carbs,
      fats_100g: fats,
      originSource: 'SARA2',
      originalId: code ? String(code).trim() : undefined
    });
  }

  return results;
}
