import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { BaseIngredient, Portion } from '@quomida/domain-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedIngredients: BaseIngredient[] = [
  // Local cuts & preparations (ARGENFOODS / LATINFOODS)
  { id: 'ing-vacambre', name: 'Vacío vacuno (crudo)', source: 'system', lang: 'es', calories_100g: 175, protein_100g: 20.5, carbs_100g: 0, fats_100g: 10.5 },
  { id: 'ing-asado-tira', name: 'Asado de tira (crudo)', source: 'system', lang: 'es', calories_100g: 250, protein_100g: 18.0, carbs_100g: 0, fats_100g: 19.5 },
  { id: 'ing-peceto', name: 'Peceto vacuno (crudo)', source: 'system', lang: 'es', calories_100g: 120, protein_100g: 22.0, carbs_100g: 0, fats_100g: 3.5 },
  { id: 'ing-matambre', name: 'Matambre vacuno (crudo)', source: 'system', lang: 'es', calories_100g: 210, protein_100g: 19.0, carbs_100g: 0, fats_100g: 14.8 },
  { id: 'ing-entranha', name: 'Entraña vacuna (cruda)', source: 'system', lang: 'es', calories_100g: 190, protein_100g: 21.0, carbs_100g: 0, fats_100g: 11.5 },
  { id: 'ing-milanesa-carne', name: 'Milanesa de carne vacuna (al horno)', source: 'system', lang: 'es', calories_100g: 215, protein_100g: 23.5, carbs_100g: 12.0, fats_100g: 8.0 },
  { id: 'ing-empanada-carne', name: 'Empanada de carne (al horno)', source: 'system', lang: 'es', calories_100g: 260, protein_100g: 11.0, carbs_100g: 24.0, fats_100g: 13.5 },
  { id: 'ing-palta', name: 'Palta / Aguacate', source: 'system', lang: 'es', calories_100g: 160, protein_100g: 2.0, carbs_100g: 8.5, fats_100g: 14.7 },
  { id: 'ing-frutilla', name: 'Frutilla / Fresa', source: 'system', lang: 'es', calories_100g: 32, protein_100g: 0.7, carbs_100g: 7.7, fats_100g: 0.3 },
  { id: 'ing-choclo', name: 'Choclo / Elote amarillo', source: 'system', lang: 'es', calories_100g: 86, protein_100g: 3.2, carbs_100g: 19.0, fats_100g: 1.2 },

  // Base Universal Ingredients (USDA FoodData Central)
  { id: 'ing-aceite-oliva', name: 'Aceite de oliva virgen extra', source: 'system', lang: 'es', calories_100g: 884, protein_100g: 0, carbs_100g: 0, fats_100g: 100 },
  { id: 'ing-pechuga-pollo', name: 'Pechuga de pollo (cruda)', source: 'system', lang: 'es', calories_100g: 165, protein_100g: 31.0, carbs_100g: 0, fats_100g: 3.6 },
  { id: 'ing-arroz-blanco', name: 'Arroz blanco (crudo)', source: 'system', lang: 'es', calories_100g: 365, protein_100g: 7.1, carbs_100g: 80.0, fats_100g: 0.7 },
  { id: 'ing-huevo', name: 'Huevo entero (fresco)', source: 'system', lang: 'es', calories_100g: 155, protein_100g: 12.6, carbs_100g: 1.1, fats_100g: 10.6 },
  { id: 'ing-pan-masa-madre', name: 'Pan de masa madre', source: 'system', lang: 'es', calories_100g: 245, protein_100g: 9.0, carbs_100g: 48.0, fats_100g: 1.5 }
];

const seedPortions: Portion[] = [
  { id: 'port-vacambre-1', base_food_id: 'ing-vacambre', name: '1 porción mediana', equivalent_weight_g: 200 },
  { id: 'port-milanesa-1', base_food_id: 'ing-milanesa-carne', name: '1 unidad (120g)', equivalent_weight_g: 120 },
  { id: 'port-empanada-1', base_food_id: 'ing-empanada-carne', name: '1 unidad (90g)', equivalent_weight_g: 90 },
  { id: 'port-palta-1', base_food_id: 'ing-palta', name: '1/2 unidad mediana', equivalent_weight_g: 80 },
  { id: 'port-huevo-1', base_food_id: 'ing-huevo', name: '1 huevo mediano (50g)', equivalent_weight_g: 50 },
  { id: 'port-aceite-1', base_food_id: 'ing-aceite-oliva', name: '1 cucharada (15ml)', equivalent_weight_g: 14 }
];

export function runETL() {
  console.log('[ETL Pipeline] Transforming regional food datasets (ARGENFOODS/LATINFOODS/USDA)...');
  
  const seedPayload = {
    version: 'seed_v1.0.0',
    generatedAt: new Date().toISOString(),
    base_ingredients: seedIngredients,
    portions: seedPortions
  };

  const outputDir = path.resolve(__dirname, '../../webapp/src/assets');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'seed_v1.json');
  fs.writeFileSync(outputPath, JSON.stringify(seedPayload, null, 2), 'utf-8');
  console.log(`[ETL Pipeline] Success! Generated versioned seed catalog at ${outputPath}`);
}

runETL();
