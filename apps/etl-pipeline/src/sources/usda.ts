import fs from 'fs';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import type { RawIngredientItem } from '../types.js';

export async function parseUsdaCSV(csvPath: string, outNdjsonPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(csvPath)) {
      return resolve(0);
    }
    let count = 0;
    const writeStream = fs.createWriteStream(outNdjsonPath, { flags: 'w' });
    const parser = createReadStream(csvPath).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
      })
    );

    parser.on('readable', () => {
      let record;
      while ((record = parser.read()) !== null) {
        // Safe parsing logic for USDA FoodData Central schema
        const item: RawIngredientItem = {
          id: `usda-${record.fdc_id || Date.now()}-${count}`,
          name: record.description || 'Unknown USDA item',
          source: 'system',
          lang: 'en',
          calories_100g: parseFloat(record.energy) || 0,
          protein_100g: parseFloat(record.protein) || 0,
          carbs_100g: parseFloat(record.carbohydrate) || 0,
          fats_100g: parseFloat(record.lipid) || 0,
          originSource: 'USDA'
        };

        writeStream.write(JSON.stringify(item) + '\n');
        count++;
      }
    });

    parser.on('error', (err) => {
      writeStream.end();
      reject(err);
    });

    parser.on('end', () => {
      writeStream.end(() => {
        resolve(count);
      });
    });
  });
}
