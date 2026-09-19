import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// We import from the built dist output
import * as schemas from '../dist/index.js';

const V0_BASELINE = {
  base_ingredients: {
    version: 0,
    properties: ['id', 'name', 'source', 'lang', 'calories_100g', 'protein_100g', 'carbs_100g', 'fats_100g', 'updatedAt']
  },
  recipes: {
    version: 0,
    properties: ['id', 'name', 'ingredients', 'yield_factor', 'updatedAt']
  },
  portions: {
    version: 0,
    properties: ['id', 'base_food_id', 'name', 'equivalent_weight_g', 'updatedAt']
  },
  daily_logs: {
    version: 0,
    properties: [
      'id', 'timestamp', 'date', 'meal_type', 'food_reference_id', 'food_name', 'quantity', 'portion_name', 'macros', 'updatedAt'
    ]
  },
  user_settings: {
    version: 0,
    properties: [
      'id', 'locale', 'theme', 'daily_calorie_target', 'custom_macros', 'cloud_providers', 'updatedAt'
    ]
  }
};

const allSchemas = [
  schemas.baseIngredientsSchema,
  schemas.recipesSchema,
  schemas.portionsSchema,
  schemas.dailyLogsSchema,
  schemas.userSettingsSchema
];

console.log('[Schema Validation] Starting build-time schema checks...');

let hasError = false;

// 1. Check un-bumped mutations against V0 baseline
for (const schema of allSchemas) {
  if (!schema) {
    console.error('[Schema Validation] FATAL: Schema export missing or dist/ not built properly.');
    process.exit(1);
  }
  const baseline = V0_BASELINE[schema.title];
  if (!baseline) {
    console.error(`[Schema Validation] FATAL: No baseline found for schema ${schema.title}.`);
    process.exit(1);
  }

  if (schema.version === 0) {
    const currentProperties = Object.keys(schema.properties).sort();
    const baselineProperties = [...baseline.properties].sort();

    const missingInCurrent = baselineProperties.filter((p) => !currentProperties.includes(p));
    const addedWithoutBump = currentProperties.filter((p) => !baselineProperties.includes(p));

    if (missingInCurrent.length > 0 || addedWithoutBump.length > 0) {
      console.error(
        `\n[SCHEMA EVOLUTION ERROR] Schema "${schema.title}" version was NOT bumped, but properties were modified!\n` +
        `Added without version bump: ${JSON.stringify(addedWithoutBump)}\n` +
        `Removed without version bump: ${JSON.stringify(missingInCurrent)}\n` +
        `Modifying an existing schema version triggers RxDB Error DB6 (Schema Hash Mismatch) on client databases.\n` +
        `To fix this:\n` +
        `1. Bump "${schema.title}" version to ${schema.version + 1}.\n` +
        `2. Add a migration strategy in apps/webapp/src/db/rxdb.ts.\n`
      );
      hasError = true;
    }
  }
}

// 2. Check apps/webapp/src/db/rxdb.ts for migrationStrategies if version > 0
const rxdbFilePath = path.resolve(__dirname, '../../../apps/webapp/src/db/rxdb.ts');
if (fs.existsSync(rxdbFilePath)) {
  const rxdbContent = fs.readFileSync(rxdbFilePath, 'utf-8');
  for (const schema of allSchemas) {
    if (schema.version > 0) {
      // Very basic static check to ensure developer didn't forget `migrationStrategies` in the addCollections call
      if (!rxdbContent.includes('migrationStrategies')) {
        console.error(
          `\n[MIGRATION ERROR] Schema "${schema.title}" is at version ${schema.version}, but no 'migrationStrategies' found in rxdb.ts.\n` +
          `You must provide migration strategies when version > 0.\n`
        );
        hasError = true;
      }
    }
  }
}

if (hasError) {
  console.error('[Schema Validation] Build failed due to schema validation errors.');
  process.exit(1);
} else {
  console.log('[Schema Validation] All schemas and migrations look good.');
}
