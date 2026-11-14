import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// We import from the built dist output
import * as schemas from '../dist/index.js';

const SCHEMA_BASELINES = {
  base_ingredients: {
    version: 0,
    properties: ['id', 'name', 'source', 'lang', 'calories_100g', 'protein_100g', 'carbs_100g', 'fats_100g', 'updatedAt']
  },
  recipes: {
    version: 1,
    properties: ['id', 'name', 'ingredients', 'yield_factor', 'updatedAt']
  },
  portions: {
    version: 1,
    properties: ['id', 'base_food_id', 'name', 'equivalent_weight_g', 'source', 'is_generic', 'updatedAt']
  },
  daily_logs: {
    version: 0,
    properties: [
      'id', 'timestamp', 'date', 'meal_type', 'food_reference_id', 'food_name', 'quantity', 'portion_name', 'macros', 'updatedAt'
    ]
  },
  user_settings: {
    version: 1,
    properties: [
      'id', 'locale', 'theme', 'daily_calorie_target', 'custom_macros', 'active_cloud_provider', 'ai_settings',
      'target_mode', 'biometrics', 'goal_config', 'adaptive_state', 'updatedAt'
    ]
  },
  system_metadata: {
    version: 0,
    properties: ['key', 'value', 'updatedAt']
  },
  weight_logs: {
    version: 0,
    properties: [
      'id', 'date', 'timestamp', 'weight_kg', 'trend_weight_kg', 'note', 'updatedAt'
    ]
  }
};

const allSchemas = [
  schemas.baseIngredientsSchema,
  schemas.recipesSchema,
  schemas.portionsSchema,
  schemas.dailyLogsSchema,
  schemas.userSettingsSchema,
  schemas.systemMetadataSchema,
  schemas.weightLogsSchema
];

console.log('[Schema Validation] Starting build-time schema checks...');

let hasError = false;

// 1. Check un-bumped mutations and disallowed version downgrades against baselines
for (const schema of allSchemas) {
  if (!schema) {
    console.error('[Schema Validation] FATAL: Schema export missing or dist/ not built properly.');
    process.exit(1);
  }
  const baseline = SCHEMA_BASELINES[schema.title];
  if (!baseline) {
    console.error(`[Schema Validation] FATAL: No baseline found for schema ${schema.title}.`);
    process.exit(1);
  }

  if (schema.version < baseline.version) {
    console.error(
      `\n[SCHEMA EVOLUTION ERROR] Schema "${schema.title}" version ${schema.version} is lower than baseline version ${baseline.version}!\n` +
      `Downgrading a schema version breaks existing client databases.\n`
    );
    hasError = true;
    continue;
  }

  if (schema.version === baseline.version) {
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

// 2. Check apps/webapp/src/db/rxdb.ts for per-collection migrationStrategies if version > 0
const rxdbFilePath = path.resolve(__dirname, '../../../apps/webapp/src/db/rxdb.ts');
if (fs.existsSync(rxdbFilePath)) {
  const rxdbContent = fs.readFileSync(rxdbFilePath, 'utf-8');
  const addCollectionsStart = rxdbContent.indexOf('await db.addCollections(');
  const addCollectionsSection = addCollectionsStart !== -1 ? rxdbContent.slice(addCollectionsStart) : rxdbContent;
  const allTitlesPattern = Object.keys(SCHEMA_BASELINES).join('|');

  for (const schema of allSchemas) {
    if (schema.version > 0) {
      const collectionBlockRegex = new RegExp(
        `\\b${schema.title}\\s*:\\s*\\{[\\s\\S]*?(?=\\n\\s*(?:${allTitlesPattern})\\s*:|\\n\\s*\\}\\);)`
      );
      const collectionMatch = addCollectionsSection.match(collectionBlockRegex);

      if (!collectionMatch || !collectionMatch[0].includes('migrationStrategies')) {
        console.error(
          `\n[MIGRATION ERROR] Schema "${schema.title}" is at version ${schema.version}, but no 'migrationStrategies' found for it in rxdb.ts.\n` +
          `You must provide migration strategies when version > 0.\n`
        );
        hasError = true;
        continue;
      }

      for (let v = 1; v <= schema.version; v++) {
        const versionEntryRegex = new RegExp(`\\b${v}\\s*:`);
        if (!versionEntryRegex.test(collectionMatch[0])) {
          console.error(
            `\n[MIGRATION ERROR] Schema "${schema.title}" is at version ${schema.version}, but migrationStrategies[${v}] is missing in rxdb.ts.\n`
          );
          hasError = true;
        }
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
