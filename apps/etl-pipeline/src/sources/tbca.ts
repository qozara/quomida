import fs from 'fs';
import { parse } from 'csv-parse';
import { parseFloatSafe, generateDeterministicId } from '../utils/parserUtils.js';

/**
 * Parses TBCA (Tabela Brasileira de Composição de Alimentos) dataset in CSV format
 * and writes the extracted items as an NDJSON stream to outPath.
 */
export async function parseTbcaCSV(filePath: string, outPath: string): Promise<number> {
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
    const code = record['codigo'] || record['cod'] || record['id'] || '';
    const name = record['nome_alimento'] || record['alimento'] || record['descricao'] || record['nome'] || '';
    if (!name) continue;

    const calories = parseFloatSafe(record['energia_kcal'] || record['valor_energetico_kcal'] || record['energia']);
    const protein = parseFloatSafe(record['proteina_g'] || record['proteinas'] || record['proteina']);
    const carbs = parseFloatSafe(
      record['carboidrato_disponivel_g'] ||
      record['carboidrato_total_g'] ||
      record['carboidratos'] ||
      record['carboidrato']
    );
    const fats = parseFloatSafe(
      record['lipideos_g'] ||
      record['lipideos'] ||
      record['lipidios'] ||
      record['gorduras_totais']
    );

    const id = generateDeterministicId('tbca', code || name);

    const item = {
      id,
      name: name.trim(),
      source: 'system',
      lang: 'pt-BR',
      calories_100g: calories,
      protein_100g: protein,
      carbs_100g: carbs,
      fats_100g: fats,
      originSource: 'TBCA',
      originalId: code ? String(code).trim() : undefined
    };

    outStream.write(JSON.stringify(item) + '\n');
    count++;
  }

  return new Promise((resolve) => {
    outStream.end(() => resolve(count));
  });
}
