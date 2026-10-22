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

    it('prioritizes LatAm/Spain over US/EU when both are in countries_tags and bypasses unique_scans_n gate', async () => {
      const jsonlGzPath = path.join(tempDir, 'off-latam-priority.jsonl.gz');
      const outPath = path.join(tempDir, 'out-latam-priority.ndjson');
      const lines = [
        JSON.stringify({
          code: '841000000001',
          product_name: 'Aceite de Oliva Virgen Extra',
          countries_tags: ['en:france', 'en:spain', 'en:united-states'],
          unique_scans_n: 0,
          nutriments: {
            'energy-kcal_100g': 824,
            'proteins_100g': 0,
            'carbohydrates_100g': 0,
            'fat_100g': 91.6
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
      expect(count).toBe(1);

      const items = readNdjson(outPath);
      expect(items.length).toBe(1);
      expect(items[0].lang).toBe('es-ES');
      expect(items[0].qualityScore).toBeGreaterThanOrEqual(10000);
    });

    it('enforces US/EU popularity gate (requires unique_scans_n > 5 for US/EU-only products)', async () => {
      const jsonlGzPath = path.join(tempDir, 'off-scans-gate.jsonl.gz');
      const outPath = path.join(tempDir, 'out-scans-gate.ndjson');
      const lines = [
        // US product with <= 5 scans (should be filtered out)
        JSON.stringify({
          code: '011111111111',
          product_name: 'Low Scans US Cereal',
          countries_tags: ['en:united-states'],
          unique_scans_n: 5,
          nutriments: {
            'energy-kcal_100g': 380,
            'proteins_100g': 8,
            'carbohydrates_100g': 75,
            'fat_100g': 3
          }
        }),
        // US product with > 5 scans (should be kept)
        JSON.stringify({
          code: '022222222222',
          product_name: 'High Scans US Cereal',
          countries_tags: ['en:united-states'],
          unique_scans_n: 6,
          nutriments: {
            'energy-kcal_100g': 380,
            'proteins_100g': 8,
            'carbohydrates_100g': 75,
            'fat_100g': 3
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
      expect(count).toBe(2);

      const items = readNdjson(outPath);
      expect(items.length).toBe(1);
      expect(items[0].barcode).toBe('022222222222');
      expect(items[0].name).toBe('High Scans US Cereal');
    });

    it('supports dual nutrition schema (aggregated_set.nutrients) and energy-kj fallback', async () => {
      const jsonlGzPath = path.join(tempDir, 'off-dual-schema.jsonl.gz');
      const outPath = path.join(tempDir, 'out-dual-schema.ndjson');
      const lines = [
        // Product 1: Uses nutrition.aggregated_set.nutrients
        JSON.stringify({
          code: '779000000001',
          product_name: 'Yogur Entero',
          countries_tags: ['en:argentina'],
          nutrition: {
            aggregated_set: {
              nutrients: {
                'energy-kcal_100g': 62,
                'proteins_100g': 3.5,
                'carbohydrates_100g': 4.7,
                'fat_100g': 3.2
              }
            }
          }
        }),
        // Product 2: energy-kcal missing, fallback to energy-kj / 4.184
        JSON.stringify({
          code: '779000000002',
          product_name: 'Avena Instantánea',
          countries_tags: ['en:argentina'],
          nutriments: {
            'energy-kj_100g': 1569, // 1569 / 4.184 = 375 kcal
            'proteins_100g': 13.0,
            'carbohydrates_100g': 67.0,
            'fat_100g': 6.0
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
      expect(count).toBe(2);

      const items = readNdjson(outPath);
      expect(items.length).toBe(2);
      
      const yogur = items.find((i: any) => i.barcode === '779000000001');
      expect(yogur.calories_100g).toBe(62);
      expect(yogur.protein_100g).toBe(3.5);

      const avena = items.find((i: any) => i.barcode === '779000000002');
      expect(Math.round(avena.calories_100g)).toBe(375);
    });

    it('enforces nutritional quality gate and filters invalid/non-food items', async () => {
      const jsonlGzPath = path.join(tempDir, 'off-quality-gate.jsonl.gz');
      const outPath = path.join(tempDir, 'out-quality-gate.ndjson');
      const lines = [
        // Reject calories > 900
        JSON.stringify({
          code: '900000000001',
          product_name: 'Hyper Calorie Item',
          countries_tags: ['en:argentina'],
          nutriments: { 'energy-kcal_100g': 950, 'proteins_100g': 10, 'carbohydrates_100g': 10, 'fat_100g': 90 }
        }),
        // Reject P+C+F > 105
        JSON.stringify({
          code: '900000000002',
          product_name: 'Impossible Macro Item',
          countries_tags: ['en:argentina'],
          nutriments: { 'energy-kcal_100g': 500, 'proteins_100g': 60, 'carbohydrates_100g': 40, 'fat_100g': 30 }
        }),
        // Reject Atwater failure (50 kcal but 30P + 30C + 10F = 330 kcal)
        JSON.stringify({
          code: '900000000003',
          product_name: 'Atwater Failure Item',
          countries_tags: ['en:argentina'],
          nutriments: { 'energy-kcal_100g': 50, 'proteins_100g': 30, 'carbohydrates_100g': 30, 'fat_100g': 10 }
        }),
        // Reject pet-food
        JSON.stringify({
          code: '900000000004',
          product_name: 'Dog Chow',
          countries_tags: ['en:argentina'],
          categories_tags: ['en:pet-food', 'en:dog-food'],
          nutriments: { 'energy-kcal_100g': 350, 'proteins_100g': 20, 'carbohydrates_100g': 40, 'fat_100g': 10 }
        }),
        // Reject non-food-products
        JSON.stringify({
          code: '900000000005',
          product_name: 'Kitchen Soap',
          countries_tags: ['en:argentina'],
          pnns_groups_1: 'non-food-products',
          nutriments: { 'energy-kcal_100g': 100, 'proteins_100g': 5, 'carbohydrates_100g': 10, 'fat_100g': 5 }
        }),
        // Valid food item
        JSON.stringify({
          code: '900000000006',
          product_name: 'Arroz Largo Fino',
          countries_tags: ['en:argentina'],
          nutriments: { 'energy-kcal_100g': 360, 'proteins_100g': 7.5, 'carbohydrates_100g': 78.0, 'fat_100g': 1.0 }
        })
      ].join('\n') + '\n';

      const zlib = require('zlib');
      fs.writeFileSync(jsonlGzPath, zlib.gzipSync(lines));

      const count = await parseOpenFoodFactsJSONL(jsonlGzPath, {
        format: 'ndjson',
        outPath,
        stateTracker: tracker
      });
      expect(count).toBe(6);

      const items = readNdjson(outPath);
      expect(items.length).toBe(1);
      expect(items[0].barcode).toBe('900000000006');
    });

    it('strips inline weights and formats brand suffix correctly', async () => {
      const jsonlGzPath = path.join(tempDir, 'off-brand-suffix.jsonl.gz');
      const outPath = path.join(tempDir, 'out-brand-suffix.ndjson');
      const lines = [
        // Case A: Strip weight and append brand suffix ("Galleta María Dorada 200g" + "Fontaneda" -> "Galleta María Dorada - Fontaneda")
        JSON.stringify({
          code: '841000000010',
          product_name: 'Galleta María Dorada 200g',
          brands: 'Fontaneda',
          countries_tags: ['en:spain'],
          nutriments: { 'energy-kcal_100g': 450, 'proteins_100g': 7, 'carbohydrates_100g': 72, 'fat_100g': 14 }
        }),
        // Case B: Append brand suffix to generic name ("Mayonesa" + "Danica" -> "Mayonesa - Danica")
        JSON.stringify({
          code: '779000000011',
          product_name: 'Mayonesa',
          brands: 'Danica',
          countries_tags: ['en:argentina'],
          nutriments: { 'energy-kcal_100g': 680, 'proteins_100g': 1, 'carbohydrates_100g': 2, 'fat_100g': 74 }
        }),
        // Case C: Omit brand suffix when brand token is already in name ("Galletitas Oreo Rellenas" + "Oreo, Mondelez" -> "Galletitas Oreo Rellenas")
        JSON.stringify({
          code: '779000000012',
          product_name: 'Galletitas Oreo Rellenas',
          brands: 'Oreo, Mondelez',
          countries_tags: ['en:argentina'],
          nutriments: { 'energy-kcal_100g': 480, 'proteins_100g': 5, 'carbohydrates_100g': 71, 'fat_100g': 20 }
        }),
        // Case D: Generic item with no brand -> keep cleanName
        JSON.stringify({
          code: '779000000013',
          product_name: 'Manzana Gala 1kg',
          brands: 'sin marca',
          countries_tags: ['en:argentina'],
          nutriments: { 'energy-kcal_100g': 52, 'proteins_100g': 0.3, 'carbohydrates_100g': 13.8, 'fat_100g': 0.2 }
        })
      ].join('\n') + '\n';

      const zlib = require('zlib');
      fs.writeFileSync(jsonlGzPath, zlib.gzipSync(lines));

      const count = await parseOpenFoodFactsJSONL(jsonlGzPath, {
        format: 'ndjson',
        outPath,
        stateTracker: tracker
      });
      expect(count).toBe(4);

      const items = readNdjson(outPath);
      expect(items.length).toBe(4);

      const maria = items.find((i: any) => i.barcode === '841000000010');
      expect(maria.name).toBe('Galleta María Dorada - Fontaneda');
      expect(maria.cleanName).toBe('Galleta María Dorada');
      expect(maria.brandTag).toBe('fontaneda');

      const mayo = items.find((i: any) => i.barcode === '779000000011');
      expect(mayo.name).toBe('Mayonesa - Danica');
      expect(mayo.cleanName).toBe('Mayonesa');
      expect(mayo.brandTag).toBe('danica');

      const oreo = items.find((i: any) => i.barcode === '779000000012');
      expect(oreo.name).toBe('Galletitas Oreo Rellenas');
      expect(oreo.cleanName).toBe('Galletitas Oreo Rellenas');
      expect(oreo.brandTag).toBe('oreo');

      const manzana = items.find((i: any) => i.barcode === '779000000013');
      expect(manzana.name).toBe('Manzana Gala');
      expect(manzana.cleanName).toBe('Manzana Gala');
    });
  });
});
