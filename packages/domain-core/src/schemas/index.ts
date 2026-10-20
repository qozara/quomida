import type { RxJsonSchema } from 'rxdb';
import type {
  BaseIngredient,
  Recipe,
  Portion,
  DailyLog,
  UserSettings,
  SystemMetadata,
  WeightLog
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
    source: { type: 'string', enum: ['system', 'custom', 'ai'] },
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
  version: 1,
  description: 'Compound recipes with cooking yield factors and copied nutrient density',
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
          food_id: { type: 'string' },
          name: { type: 'string' },
          weight_g: { type: 'number', minimum: 0.1 },
          quantity: { type: 'number' },
          portion_name: { type: 'string' },
          calories_100g: { type: 'number', minimum: 0 },
          protein_100g: { type: 'number', minimum: 0 },
          carbs_100g: { type: 'number', minimum: 0 },
          fats_100g: { type: 'number', minimum: 0 },
          from_recipe: { type: 'boolean' }
        },
        required: ['food_id', 'name', 'weight_g', 'calories_100g', 'protein_100g', 'carbs_100g', 'fats_100g']
      }
    },
    yield_factor: { type: 'number', minimum: 0.1, default: 1.0 },
    updatedAt: { type: 'number', minimum: 0 }
  },
  required: ['id', 'name', 'ingredients', 'yield_factor']
};

export const portionsSchema: RxJsonSchema<Portion> = {
  title: 'portions',
  version: 1,
  description: 'Domestic household portion mappings to absolute gram weights',
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    base_food_id: { type: 'string' },
    name: { type: 'string' },
    equivalent_weight_g: { type: 'number', minimum: 0.1 },
    source: { type: 'string', enum: ['system', 'custom', 'ai'] },
    is_generic: { type: 'boolean' },
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
  version: 0,
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
    active_cloud_provider: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        credentials: { type: 'object' }
      },
      required: ['id']
    },
    ai_settings: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['qozara-intelligence', 'byok', 'ollama', 'window.ai'] },
        ciphertext: { type: 'string' },
        ollama_base_url: { type: 'string' },
        ollama_model: { type: 'string' }
      },
      required: ['provider']
    },
    target_mode: {
      type: 'string',
      enum: ['manual', 'deterministic_seed', 'adaptive']
    },
    biometrics: {
      type: 'object',
      properties: {
        sex: { type: 'string', enum: ['male', 'female'] },
        birth_date: { type: 'string', maxLength: 10 },
        height_cm: { type: 'number', minimum: 50, maximum: 260 },
        activity_multiplier: { type: 'number', minimum: 1.2, maximum: 1.9 }
      },
      required: ['sex', 'birth_date', 'height_cm', 'activity_multiplier']
    },
    goal_config: {
      type: 'object',
      properties: {
        goal_type: { type: 'string', enum: ['lose', 'maintain', 'gain'] },
        weekly_rate_pct: { type: 'number' },
        protein_g_per_kg: { type: 'number', minimum: 0 },
        fat_calorie_pct: { type: 'number', minimum: 0, maximum: 1 }
      },
      required: ['goal_type', 'weekly_rate_pct', 'protein_g_per_kg', 'fat_calorie_pct']
    },
    adaptive_state: {
      type: 'object',
      properties: {
        estimated_tdee: { type: 'number', minimum: 500 },
        last_calibrated_date: { type: 'string', maxLength: 10 },
        calibration_status: { type: 'string', enum: ['collecting_data', 'ready', 'insufficient_logs'] }
      },
      required: ['estimated_tdee']
    },
    updatedAt: { type: 'number', minimum: 0 }
  },
  required: ['id', 'locale', 'theme', 'daily_calorie_target', 'custom_macros']
};

export const weightLogsSchema: RxJsonSchema<WeightLog> = {
  title: 'weight_logs',
  version: 0,
  description: 'Daily weight logs with EWMA trend weight tracking',
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 50 },
    date: { type: 'string', maxLength: 10 },
    timestamp: { type: 'string' },
    weight_kg: { type: 'number', minimum: 20, maximum: 500 },
    trend_weight_kg: { type: 'number', minimum: 20, maximum: 500 },
    note: { type: 'string', maxLength: 250 },
    updatedAt: { type: 'number', minimum: 0 }
  },
  required: ['id', 'date', 'timestamp', 'weight_kg', 'trend_weight_kg', 'updatedAt']
};

export const systemMetadataSchema: RxJsonSchema<SystemMetadata> = {
  title: 'system_metadata',
  version: 0,
  description: 'Lightweight key-value store for application and catalog state',
  primaryKey: 'key',
  type: 'object',
  properties: {
    key: { type: 'string', maxLength: 50 },
    value: { type: 'string' },
    updatedAt: { type: 'number', minimum: 0 }
  },
  required: ['key', 'value', 'updatedAt']
};
