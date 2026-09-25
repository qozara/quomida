import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseUsdaCSV } from '../src/sources/usda.js';
import { parseSara2CSV } from '../src/sources/sara2.js';
import { parseTbcaCSV } from '../src/sources/tbca.js';
import { parseOpenFoodFactsJSONL } from '../src/sources/openfoodfacts.js';
import { StateTracker } from '../src/utils/StateTracker.js';

function readNdjson(filePath: string) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  return raw.split('\n').filter(Boolean).map(l => JSON.parse(l));
}

describe('ETL Source Parsers [ETL-PARSERS]', () => {
  let tempDir: string;
  let tracker: StateTracker;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quomida-parsers-test-'));
    tracker = new StateTracker(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('USDA Parser', () => {
    it('returns empty array if file does not exist', async () => {
      const outPath = path.join(tempDir, 'out.ndjson');
      const count = await parseUsdaCSV(path.join(tempDir, 'nonexistent.csv'), outPath);
      expect(count).toBe(0);
      expect(readNdjson(outPath)).toEqual([]);
    });

    it('parses USDA CSV data correctly', async () => {
      const csvPath = path.join(tempDir, 'usda.csv');
      const outPath = path.join(tempDir, 'out.ndjson');
      const csvContent = `fdc_id,description,energy,protein,carbohydrate,lipid
1001,Butter,717,0.85,0.06,81.1
1002,Cheese,402,25.18,1.28,33.14
`;
      fs.writeFileSync(csvPath, csvContent, 'utf-8');

      const count = await parseUsdaCSV(csvPath, outPath);
      expect(count).toBe(2);

      const items = readNdjson(outPath);
      expect(items.length).toBe(2);

      const butter = items[0];
      expect(butter.name).toBe('Butter');
      expect(butter.lang).toBe('en');
      expect(butter.calories_100g).toBe(717);
      expect(butter.protein_100g).toBe(0.85);
      expect(butter.carbs_100g).toBe(0.06);
      expect(butter.fats_100g).toBe(81.1);
      expect(butter.originSource).toBe('USDA');
      expect(butter.id.startsWith('usda-1001')).toBe(true);
    });
  });

  describe('SARA 2 Parser', () => {
    it('handles CHO_disponibles mapping and trace values', async () => {
      const csvPath = path.join(tempDir, 'sara2.csv');
      const outPath = path.join(tempDir, 'out.ndjson');
      const csvContent = `id,nombre,energia_kcal,proteinas,cho_disponibles,lipidos
S100,Bife de chorizo,210,22.5,Tr,13.4
S101,Pan blanco,265,8.9,50.2,1.8
`;
      fs.writeFileSync(csvPath, csvContent, 'utf-8');

      const count = await parseSara2CSV(csvPath, outPath);
      expect(count).toBe(2);

      const items = readNdjson(outPath);
      expect(items.length).toBe(2);

      const bife = items[0];
      expect(bife.name).toBe('Bife de chorizo');
      expect(bife.lang).toBe('es-AR');
      expect(bife.calories_100g).toBe(210);
      expect(bife.protein_100g).toBe(22.5);
      expect(bife.carbs_100g).toBe(0); // Tr -> 0
      expect(bife.fats_100g).toBe(13.4);
      expect(bife.originSource).toBe('SARA2');
      expect(bife.id.startsWith('ing-sara-')).toBe(true);
    });
  });

  describe('TBCA Parser', () => {
    it('parses TBCA CSV data and sets lang to pt-BR', async () => {
      const csvPath = path.join(tempDir, 'tbca.csv');
      const outPath = path.join(tempDir, 'out.ndjson');
      const csvContent = `codigo,nome_alimento,energia_kcal,proteina_g,carboidrato_total_g,lipideos_g
TB01,Arroz integral cozido,124,2.6,25.8,1.0
TB02,Feijão carioca cozido,76,4.8,13.6,0.5
`;
      fs.writeFileSync(csvPath, csvContent, 'utf-8');

      const count = await parseTbcaCSV(csvPath, outPath);
      expect(count).toBe(2);
      
      const items = readNdjson(outPath);
      expect(items.length).toBe(2);

      const arroz = items[0];
      expect(arroz.name).toBe('Arroz integral cozido');
      expect(arroz.lang).toBe('pt-BR');
      expect(arroz.calories_100g).toBe(124);
      expect(arroz.protein_100g).toBe(2.6);
      expect(arroz.carbs_100g).toBe(25.8);
      expect(arroz.fats_100g).toBe(1.0);
      expect(arroz.originSource).toBe('TBCA');
      expect(arroz.id.startsWith('ing-tbca-')).toBe(true);
    });
  });

  describe('Open Food Facts Parser', () => {
    it('filters items by en:argentina or en:brazil and streams JSONL', async () => {
      const jsonlGzPath = path.join(tempDir, 'off.jsonl.gz');
      const outPath = path.join(tempDir, 'out.ndjson');
      const lines = [
        // Product 1: Argentina
        JSON.stringify({
          code: '7791234567890',
          product_name: 'Dulce de Leche Clásico',
          countries_tags: ['en:argentina'],
          nutriments: {
            'energy-kcal_100g': 315,
            'proteins_100g': 7.0,
            'carbohydrates_100g': 55.0,
            'fat_100g': 6.5
          }
        }),
        // Product 2: France
        JSON.stringify({
          code: '3017620422003',
          product_name: 'Nutella France',
          countries_tags: ['en:france'],
          nutriments: {
            'energy-kcal_100g': 539,
            'proteins_100g': 6.3,
            'carbohydrates_100g': 57.5,
            'fat_100g': 30.9
          }
        }),
        // Product 3: Brazil
        JSON.stringify({
          code: '7891000100103',
          product_name: 'Pão de Queijo Congelado',
          countries_tags: ['en:brazil'],
          nutriments: {
            'energy-kcal_100g': 280,
            'proteins_100g': 5.2,
            'carbohydrates_100g': 36.0,
            'fat_100g': 12.0
          }
        })
      ].join('\n') + '\n';

      const zlib = require('zlib');
      fs.writeFileSync(jsonlGzPath, zlib.gzipSync(lines));

      const count = await parseOpenFoodFactsJSONL(jsonlGzPath, {
        format: 'ndjson',
        outPath,
        stateTracker: tracker
      });
      expect(count).toBeGreaterThanOrEqual(2); 

      const items = readNdjson(outPath);
      expect(items.length).toBeGreaterThanOrEqual(2);

      const ddl = items.find((i: any) => i.barcode === '7791234567890');
      expect(ddl).toBeDefined();
      expect(ddl?.name).toBe('Dulce de Leche Clásico');
      expect(ddl?.lang).toBe('es-AR');
      expect(ddl?.calories_100g).toBe(315);
      expect(ddl?.protein_100g).toBe(7.0);
      expect(ddl?.carbs_100g).toBe(55.0);
      expect(ddl?.fats_100g).toBe(6.5);
      expect(ddl?.originSource).toBe('OPENFOODFACTS');
      expect(ddl?.id).toBe('ing-off-7791234567890');

      const pdq = items.find((i: any) => i.barcode === '7891000100103');
      expect(pdq).toBeDefined();
      expect(pdq?.lang).toBe('pt-BR');
      expect(pdq?.id).toBe('ing-off-7891000100103');
    });
  });
});
