import { describe, it, expect } from 'vitest';
import {
  baseIngredientsSchema,
  recipesSchema,
  portionsSchema,
  dailyLogsSchema,
  userSettingsSchema
} from '../src/index.js';

/**
 * Baseline Property Fingerprints for Version 0 schemas.
 * 
 * IMPORTANT FOR DEVELOPERS:
 * When adding or changing properties in any RxDB schema:
 * 1. You CANNOT mutate the properties of an existing version in-place, because
 *    existing client databases (IndexedDB) will throw RxDB Error DB6 (Schema Hash Mismatch).
 * 2. You MUST increment the schema's `version` (e.g. from 0 to 1).
 * 3. You MUST provide a corresponding `migrationStrategies` entry in `apps/webapp/src/db/rxdb.ts`.
 */
const V0_BASELINE: Record<string, { version: number; properties: string[]; required: string[] }> = {
  base_ingredients: {
    version: 0,
    properties: ['id', 'name', 'source', 'lang', 'calories_100g', 'protein_100g', 'carbs_100g', 'fats_100g', 'updatedAt'],
    required: ['id', 'name', 'source', 'lang', 'calories_100g', 'protein_100g', 'carbs_100g', 'fats_100g']
  },
  recipes: {
    version: 0,
    properties: ['id', 'name', 'ingredients', 'yield_factor', 'updatedAt'],
    required: ['id', 'name', 'ingredients', 'yield_factor']
  },
  portions: {
    version: 0,
    properties: ['id', 'base_food_id', 'name', 'equivalent_weight_g', 'updatedAt'],
    required: ['id', 'base_food_id', 'name', 'equivalent_weight_g']
  },
  daily_logs: {
    version: 0,
    properties: [
      'id',
      'timestamp',
      'date',
      'meal_type',
      'food_reference_id',
      'food_name',
      'quantity',
      'portion_name',
      'macros',
      'updatedAt'
    ],
    required: ['id', 'timestamp', 'date', 'meal_type', 'food_reference_id', 'quantity', 'portion_name', 'macros']
  },
  user_settings: {
    version: 0,
    properties: [
      'id',
      'locale',
      'theme',
      'daily_calorie_target',
      'custom_macros',
      'cloud_providers',
      'updatedAt'
    ],
    required: ['id', 'locale', 'theme', 'daily_calorie_target', 'custom_macros']
  }
};

describe('Schema Version & Evolution Guard (Prevents Un-bumped Schema Mutations & DB6)', () => {
  const schemas = [
    baseIngredientsSchema,
    recipesSchema,
    portionsSchema,
    dailyLogsSchema,
    userSettingsSchema
  ];

  it('verifies all schemas have a valid non-negative integer version', () => {
    for (const schema of schemas) {
      expect(Number.isInteger(schema.version)).toBe(true);
      expect(schema.version).toBeGreaterThanOrEqual(0);
    }
  });

  it('guards against un-bumped schema modifications that cause RxDB Error DB6', () => {
    for (const schema of schemas) {
      const baseline = V0_BASELINE[schema.title];
      expect(baseline).toBeDefined();

      if (schema.version === 0) {
        const currentProperties = Object.keys(schema.properties).sort();
        const baselineProperties = [...baseline.properties].sort();

        // If properties were changed without bumping version, fail with an explanatory message
        const missingInCurrent = baselineProperties.filter((p) => !currentProperties.includes(p));
        const addedWithoutBump = currentProperties.filter((p) => !baselineProperties.includes(p));

        if (missingInCurrent.length > 0 || addedWithoutBump.length > 0) {
          throw new Error(
            `[SCHEMA EVOLUTION ERROR] Schema "${schema.title}" version was NOT bumped, but properties were modified!\n` +
            `Added without version bump: ${JSON.stringify(addedWithoutBump)}\n` +
            `Removed without version bump: ${JSON.stringify(missingInCurrent)}\n` +
            `Modifying an existing schema version triggers RxDB Error DB6 (Schema Hash Mismatch) on client databases.\n` +
            `To fix this:\n` +
            `1. Bump "${schema.title}" version to ${schema.version + 1}.\n` +
            `2. Add a migration strategy in apps/webapp/src/db/rxdb.ts.`
          );
        }

        expect(currentProperties).toEqual(baselineProperties);
      }
    }
  });
});
