import type { RxJsonSchema } from 'rxdb';
import type {
  BaseIngredient,
  Recipe,
  Portion,
  DailyLog,
  UserSettings
} from '../types.js';

export const baseIngredientsSchema: RxJsonSchema<BaseIngredient> = {
  title: 'base_ingredients',
  version: 0,
  description: 'Normalized 100g base ingredients and regional meat cuts',
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
    source: { type: 'string', enum: ['system', 'custom'] },
    lang: { type: 'string' },
    calories_100g: { type: 'number', minimum: 0 },
    protein_100g: { type: 'number', minimum: 0 },
    carbs_100g: { type: 'number', minimum: 0 },
    fats_100g: { type: 'number', minimum: 0 },
    updatedAt: { type: 'number', minimum: 0 }
  },
  required: ['id', 'name', 'source', 'lang', 'calories_100g', 'protein_100g', 'carbs_100g', 'fats_100g']
};

export const recipesSchema: RxJsonSchema<Recipe> = {
  title: 'recipes',
  version: 0,
  description: 'Compound recipes with cooking yield factors',
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ingredient_id: { type: 'string' },
          raw_weight_g: { type: 'number', minimum: 0 }
        },
        required: ['ingredient_id', 'raw_weight_g']
      }
    },
    yield_factor: { type: 'number', minimum: 0.1, default: 1.0 },
    updatedAt: { type: 'number', minimum: 0 }
  },
  required: ['id', 'name', 'ingredients', 'yield_factor']
};

export const portionsSchema: RxJsonSchema<Portion> = {
  title: 'portions',
  version: 0,
  description: 'Domestic household portion mappings to absolute gram weights',
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    base_food_id: { type: 'string' },
    name: { type: 'string' },
    equivalent_weight_g: { type: 'number', minimum: 0.1 },
    updatedAt: { type: 'number', minimum: 0 }
  },
  required: ['id', 'base_food_id', 'name', 'equivalent_weight_g']
};

export const dailyLogsSchema: RxJsonSchema<DailyLog> = {
  title: 'daily_logs',
  version: 0,
  description: 'Historical transactional log of food consumption',
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    timestamp: { type: 'string' },
    date: { type: 'string', maxLength: 10 }, // YYYY-MM-DD
    meal_type: {
      type: 'string',
      enum: ['meal_breakfast', 'meal_lunch', 'meal_dinner', 'meal_snack']
    },
    food_reference_id: { type: 'string' },
    food_name: { type: 'string' },
    quantity: { type: 'number', minimum: 0.01 },
    portion_name: { type: 'string' },
    macros: {
      type: 'object',
      properties: {
        calories: { type: 'number' },
        protein: { type: 'number' },
        carbs: { type: 'number' },
        fats: { type: 'number' }
      },
      required: ['calories', 'protein', 'carbs', 'fats']
    },
    updatedAt: { type: 'number', minimum: 0 }
  },
  required: ['id', 'timestamp', 'date', 'meal_type', 'food_reference_id', 'quantity', 'portion_name', 'macros']
};

export const userSettingsSchema: RxJsonSchema<UserSettings> = {
  title: 'user_settings',
  version: 1,
  description: 'Global application preferences and nutritional targets',
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 50 },
    locale: { type: 'string' },
    theme: { type: 'string', enum: ['light', 'dark', 'system'] },
    daily_calorie_target: { type: 'number', minimum: 500 },
    custom_macros: {
      type: 'object',
      properties: {
        protein: { type: 'number' },
        carbs: { type: 'number' },
        fats: { type: 'number' }
      },
      required: ['protein', 'carbs', 'fats']
    },
    cloud_providers: {
      type: 'object',
      properties: {
        google: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            expiresAt: { type: 'number' }
          }
        }
      }
    },
    updatedAt: { type: 'number', minimum: 0 }
  },
  required: ['id', 'locale', 'theme', 'daily_calorie_target', 'custom_macros']
};
