import type {
  BaseIngredient,
  Recipe,
  Portion,
  MacroSnapshot
} from '../types.js';

/**
 * Calculates nutritional macros for a specific ingredient amount in grams based on 100g base values.
 */
export function calculateItemMacros(ingredient: BaseIngredient, weightGrams: number): MacroSnapshot {
  const factor = weightGrams / 100;
  return {
    calories: Math.round(ingredient.calories_100g * factor * 10) / 10,
    protein: Math.round(ingredient.protein_100g * factor * 10) / 10,
    carbs: Math.round(ingredient.carbs_100g * factor * 10) / 10,
    fats: Math.round(ingredient.fats_100g * factor * 10) / 10
  };
}

/**
 * Calculates total yield cooked weight and cumulative nutritional macros for a compound recipe
 * considering cooking yield factor (FAO/INFOODS standard).
 */
export function calculateRecipeMacros(
  recipe: Recipe,
  ingredientsMap: Map<string, BaseIngredient>
): { cooked_weight_g: number; total_macros: MacroSnapshot } {
  let rawWeightTotal = 0;
  let caloriesSum = 0;
  let proteinSum = 0;
  let carbsSum = 0;
  let fatsSum = 0;

  for (const item of recipe.ingredients) {
    const ing = ingredientsMap.get(item.ingredient_id);
    if (!ing) continue;
    rawWeightTotal += item.raw_weight_g;
    const itemMacros = calculateItemMacros(ing, item.raw_weight_g);
    caloriesSum += itemMacros.calories;
    proteinSum += itemMacros.protein;
    carbsSum += itemMacros.carbs;
    fatsSum += itemMacros.fats;
  }

  const yieldFactor = recipe.yield_factor || 1.0;
  const cookedWeight = Math.round(rawWeightTotal * yieldFactor * 10) / 10;

  return {
    cooked_weight_g: cookedWeight,
    total_macros: {
      calories: Math.round(caloriesSum * 10) / 10,
      protein: Math.round(proteinSum * 10) / 10,
      carbs: Math.round(carbsSum * 10) / 10,
      fats: Math.round(fatsSum * 10) / 10
    }
  };
}

/**
 * Converts quantity + portion selection string into raw/cooked weight in grams.
 */
export function convertPortionToGrams(
  quantity: number,
  portionName: string,
  availablePortions: Partial<Portion>[]
): number {
  if (!portionName || portionName.toLowerCase() === 'g' || portionName.toLowerCase() === 'grams') {
    return quantity;
  }

  const matched = availablePortions.find(p => p.name === portionName);
  if (matched && matched.equivalent_weight_g) {
    return Math.round(quantity * matched.equivalent_weight_g * 10) / 10;
  }

  return quantity;
}

/**
 * Creates a rounded, immutably snapshotted macro object for logging in daily_logs collection.
 */
export function createMacroSnapshot(macros: MacroSnapshot): MacroSnapshot {
  return {
    calories: Math.round(macros.calories * 10) / 10,
    protein: Math.round(macros.protein * 10) / 10,
    carbs: Math.round(macros.carbs * 10) / 10,
    fats: Math.round(macros.fats * 10) / 10
  };
}

/**
 * Validates macro and calorie alignment for 100g base ingredients.
 */
export function validateMacroAlignment(
  calories: number,
  protein: number,
  carbs: number,
  fats: number
): { valid: boolean; reason?: string } {
  if (calories < 0 || protein < 0 || carbs < 0 || fats < 0) {
    return { valid: false, reason: 'Nutritional values cannot be negative' };
  }
  const totalMacroWeight = protein + carbs + fats;
  if (totalMacroWeight > 100) {
    return { valid: false, reason: 'Total macro weight (protein + carbs + fats) cannot exceed 100g per 100g base' };
  }
  const expectedCalories = protein * 4 + carbs * 4 + fats * 9;
  if (calories > 0 && expectedCalories > 0 && Math.abs(calories - expectedCalories) > expectedCalories * 1.5 + 100) {
    return { valid: false, reason: 'Declared calories differ significantly from macro calculation' };
  }
  return { valid: true };
}
