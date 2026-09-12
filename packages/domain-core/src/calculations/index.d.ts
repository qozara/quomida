import type { BaseIngredient, Recipe, Portion, MacroSnapshot } from '../types.js';
/**
 * Calculates nutritional macros for a specific ingredient amount in grams based on 100g base values.
 */
export declare function calculateItemMacros(ingredient: BaseIngredient, weightGrams: number): MacroSnapshot;
/**
 * Calculates total yield cooked weight and cumulative nutritional macros for a compound recipe
 * considering cooking yield factor (FAO/INFOODS standard).
 */
export declare function calculateRecipeMacros(recipe: Recipe, ingredientsMap: Map<string, BaseIngredient>): {
    cooked_weight_g: number;
    total_macros: MacroSnapshot;
};
/**
 * Converts quantity + portion selection string into raw/cooked weight in grams.
 */
export declare function convertPortionToGrams(quantity: number, portionName: string, availablePortions: Partial<Portion>[]): number;
/**
 * Creates a rounded, immutably snapshotted macro object for logging in daily_logs collection.
 */
export declare function createMacroSnapshot(macros: MacroSnapshot): MacroSnapshot;
//# sourceMappingURL=index.d.ts.map