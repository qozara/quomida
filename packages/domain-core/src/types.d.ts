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
}
export interface Portion {
    id: string;
    base_food_id: string;
    name: string;
    equivalent_weight_g: number;
}
export interface MacroSnapshot {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
}
export interface DailyLog {
    id: string;
    timestamp: string;
    date: string;
    meal_type: MealType;
    food_reference_id: string;
    quantity: number;
    portion_name: string;
    macros: MacroSnapshot;
}
export interface UserSettings {
    id: string;
    locale: string;
    theme: ThemeMode;
    daily_calorie_target: number;
    custom_macros: {
        protein: number;
        carbs: number;
        fats: number;
    };
}
//# sourceMappingURL=types.d.ts.map