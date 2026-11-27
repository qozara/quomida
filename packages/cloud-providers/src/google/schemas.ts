import type { SchemaDefinition, TabDefinition, ColumnDefinition } from '@qozara/cloud-sync-google';
export type { SchemaDefinition, TabDefinition, ColumnDefinition };

export const QuomidaDailyLogsSpreadsheetSchema: SchemaDefinition = {
  version: 2,
  identity: {
    appId: 'quomida',
    docType: 'daily_logs',
    legacyMetaSheetNames: ['_quomida_meta'],
    legacyPropertyMatchers: [{ key: 'quomida_doc_type', value: 'daily_logs' }],
    legacyRequiredTabs: ['daily_logs'],
  },
  tabs: [
    {
      name: 'daily_logs',
      columns: [
        { name: 'id', type: 'string', required: true },
        { name: 'timestamp', type: 'string', required: true },
        { name: 'date', type: 'string', required: true },
        { name: 'meal_type', type: 'string', required: true },
        { name: 'food_reference_id', type: 'string', required: true },
        { name: 'food_name', type: 'string' },
        { name: 'quantity', type: 'number', required: true },
        { name: 'portion_name', type: 'string', required: true },
        { name: 'calories', type: 'number', required: true },
        { name: 'protein', type: 'number', required: true },
        { name: 'carbs', type: 'number', required: true },
        { name: 'fats', type: 'number', required: true },
        { name: 'food_details_readonly', type: 'string' },
        { name: 'updatedAt', type: 'number' },
        { name: '_deleted', type: 'boolean' }
      ]
    },
    {
      name: 'weight_logs',
      columns: [
        { name: 'id', type: 'string', required: true },
        { name: 'date', type: 'string', required: true },
        { name: 'timestamp', type: 'string', required: true },
        { name: 'weight_kg', type: 'number', required: true },
        { name: 'trend_weight_kg', type: 'number', required: true },
        { name: 'note', type: 'string' },
        { name: 'updatedAt', type: 'number', required: true },
        { name: '_deleted', type: 'boolean' }
      ]
    },
    {
      name: '_meta',
      columns: [
        { name: 'key', type: 'string', required: true },
        { name: 'value', type: 'string', required: true },
        { name: 'updatedAt', type: 'string', required: true }
      ]
    }
  ]
};

export const QuomidaFoodCatalogSpreadsheetSchema: SchemaDefinition = {
  version: 2,
  identity: {
    appId: 'quomida',
    docType: 'food_catalog',
    legacyMetaSheetNames: ['_quomida_meta'],
    legacyPropertyMatchers: [{ key: 'quomida_doc_type', value: 'food_catalog' }],
    legacyRequiredTabs: ['base_ingredients'],
  },
  tabs: [
    {
      name: 'base_ingredients',
      columns: [
        { name: 'id', type: 'string', required: true },
        { name: 'name', type: 'string', required: true },
        { name: 'source', type: 'string' },
        { name: 'lang', type: 'string' },
        { name: 'calories_100g', type: 'number' },
        { name: 'protein_100g', type: 'number' },
        { name: 'carbs_100g', type: 'number' },
        { name: 'fats_100g', type: 'number' },
        { name: 'updatedAt', type: 'number' },
        { name: '_deleted', type: 'boolean' }
      ]
    },
    {
      name: 'recipes',
      columns: [
        { name: 'id', type: 'string', required: true },
        { name: 'name', type: 'string', required: true },
        { name: 'ingredients', type: 'string' },
        { name: 'yield_factor', type: 'number' },
        { name: 'updatedAt', type: 'number' },
        { name: '_deleted', type: 'boolean' }
      ]
    },
    {
      name: 'portions',
      columns: [
        { name: 'id', type: 'string', required: true },
        { name: 'base_food_id', type: 'string', required: true },
        { name: 'name', type: 'string', required: true },
        { name: 'equivalent_weight_g', type: 'number' },
        { name: 'updatedAt', type: 'number' },
        { name: '_deleted', type: 'boolean' }
      ]
    },
    {
      name: '_meta',
      columns: [
        { name: 'key', type: 'string', required: true },
        { name: 'value', type: 'string', required: true },
        { name: 'updatedAt', type: 'string', required: true }
      ]
    }
  ]
};

export const SPREADSHEET_SCHEMAS: Record<string, SchemaDefinition> = {
  quomida_daily_logs: QuomidaDailyLogsSpreadsheetSchema,
  'Quomida Daily Logs': QuomidaDailyLogsSpreadsheetSchema,
  quomida_food_catalog: QuomidaFoodCatalogSpreadsheetSchema,
  'Quomida Food Catalog': QuomidaFoodCatalogSpreadsheetSchema
};
