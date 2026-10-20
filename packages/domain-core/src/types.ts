export type IngredientSource = 'system' | 'custom' | 'ai';
export type ThemeMode = 'light' | 'dark' | 'system';
export type MealType = 'meal_breakfast' | 'meal_lunch' | 'meal_dinner' | 'meal_snack';

export interface NutrientDensity {
  calories_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fats_100g: number;
}

export interface BaseIngredient extends NutrientDensity {
  id: string;
  name: string;
  source: IngredientSource;
  lang: string;
  calories_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fats_100g: number;
  updatedAt?: number;
}

export interface RecipeComponent extends NutrientDensity {
  food_id: string;
  name: string;
  weight_g: number;
  quantity?: number;
  portion_name?: string;
  calories_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fats_100g: number;
  from_recipe?: boolean;
}

export interface RecipeIngredientItem {
  ingredient_id: string;
  raw_weight_g: number;
}

export interface Recipe {
  id: string;
  name: string;
  ingredients: RecipeComponent[];
  yield_factor: number;
  updatedAt?: number;
}

export type FoodKind = 'ingredient' | 'recipe';

export interface IngredientFoodItem extends BaseIngredient {
  kind: 'ingredient';
}

export interface RecipeFoodItem extends NutrientDensity {
  kind: 'recipe';
  id: string;
  name: string;
  source: 'custom';
  lang?: string;
  raw_weight_g: number;
  cooked_weight_g: number;
  yield_factor: number;
  total_macros: MacroSnapshot;
  recipe: Recipe;
  updatedAt?: number;
}

export type FoodItem = IngredientFoodItem | RecipeFoodItem;

export interface RagCatalogCandidate {
  id: string;
  name: string;
  kind: FoodKind;
  calories_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fats_100g: number;
}

export interface Portion {
  id: string;
  base_food_id: string;
  name: string;
  equivalent_weight_g: number;
  source?: IngredientSource;
  is_generic?: boolean;
  updatedAt?: number;
}

export interface MacroSnapshot {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface DailyLog {
  id: string;
  timestamp: string; // ISO 8601 UTC
  date: string; // YYYY-MM-DD
  meal_type: MealType;
  food_reference_id: string;
  food_name?: string;
  quantity: number;
  portion_name: string;
  macros: MacroSnapshot;
  updatedAt?: number;
}

export type AiProviderType = 'qozara-intelligence' | 'byok' | 'ollama' | 'window.ai';

export interface UserAiSettings {
  provider: AiProviderType;
  ciphertext?: string;
  ollama_base_url?: string;
  ollama_model?: string;
}

export type TargetMode = 'manual' | 'deterministic_seed' | 'adaptive';
export type UserSex = 'male' | 'female';
export type GoalType = 'lose' | 'maintain' | 'gain';
export type CalibrationStatus = 'collecting_data' | 'ready' | 'insufficient_logs';

export interface UserBiometrics {
  sex: UserSex;
  birth_date: string;
  height_cm: number;
  activity_multiplier: number;
}

export interface UserGoalConfig {
  goal_type: GoalType;
  weekly_rate_pct: number;
  protein_g_per_kg: number;
  fat_calorie_pct: number;
}

export interface UserAdaptiveState {
  estimated_tdee: number;
  prior_tdee?: number;
  last_calibrated_date?: string;
  calibration_status?: CalibrationStatus;
}

export interface WeightLog {
  id: string; // 'weight_YYYY-MM-DD'
  date: string; // 'YYYY-MM-DD'
  timestamp: string; // ISO 8601 UTC
  weight_kg: number; // min 20, max 500
  trend_weight_kg: number; // min 20, max 500
  note?: string; // maxLength 250
  updatedAt: number; // min 0
}

export interface UserSettings {
  id: string; // 'global_settings'
  locale: string; // e.g., 'es-AR', 'en-US'
  theme: ThemeMode;
  daily_calorie_target: number;
  custom_macros: {
    protein: number; // target grams or %
    carbs: number;
    fats: number;
  };
  active_cloud_provider?: {
    id: string;
    credentials?: any;
  };
  ai_settings?: UserAiSettings;
  target_mode?: TargetMode;
  biometrics?: UserBiometrics;
  goal_config?: UserGoalConfig;
  adaptive_state?: UserAdaptiveState;
  updatedAt?: number;
}

export interface SystemMetadata {
  key: string;
  value: string;
  updatedAt: number;
}
