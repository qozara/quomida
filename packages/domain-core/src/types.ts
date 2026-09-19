export type IngredientSource = 'system' | 'custom';
export type ThemeMode = 'light' | 'dark' | 'system';
export type MealType = 'meal_breakfast' | 'meal_lunch' | 'meal_dinner' | 'meal_snack';

export interface BaseIngredient {
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

export interface RecipeIngredientItem {
  ingredient_id: string;
  raw_weight_g: number;
}

export interface Recipe {
  id: string;
  name: string;
  ingredients: RecipeIngredientItem[];
  yield_factor: number;
  updatedAt?: number;
}

export interface Portion {
  id: string;
  base_food_id: string;
  name: string;
  equivalent_weight_g: number;
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
  updatedAt?: number;
}
