import type {
  NutrientDensity,
  BaseIngredient,
  Recipe,
  Portion,
  MacroSnapshot
} from '../types.js';

/**
 * Calculates nutritional macros for a specific food amount in grams based on 100g base values.
 */
export function calculateItemMacros(ingredient: NutrientDensity, weightGrams: number): MacroSnapshot {
  const factor = weightGrams / 100;
  return {
    calories: Math.round(ingredient.calories_100g * factor * 10) / 10,
    protein: Math.round(ingredient.protein_100g * factor * 10) / 10,
    carbs: Math.round(ingredient.carbs_100g * factor * 10) / 10,
    fats: Math.round(ingredient.fats_100g * factor * 10) / 10
  };
}

/**
 * Calculates nutritional macros for a portion and quantity of a base ingredient or food.
 */
export function calculatePortionMacros(
  food: NutrientDensity,
  portion: Partial<Portion>,
  quantity: number
): MacroSnapshot {
  const portionWeight = portion.equivalent_weight_g || 100;
  const totalWeightGrams = portionWeight * quantity;
  return calculateItemMacros(food, totalWeightGrams);
}

/**
 * Calculates total yield cooked weight and cumulative nutritional macros for a compound recipe
 * considering cooking yield factor (FAO/INFOODS standard).
 * Supports both copied component snapshots (RecipeComponent) and legacy external ingredient lookups.
 */
export function calculateRecipeMacros(
  recipe: Recipe,
  ingredientsMap?: Map<string, BaseIngredient>
): { cooked_weight_g: number; total_macros: MacroSnapshot } {
  let rawWeightTotal = 0;
  let caloriesSum = 0;
  let proteinSum = 0;
  let carbsSum = 0;
  let fatsSum = 0;

  for (const item of (recipe.ingredients || [])) {
    const rawWeight = item.weight_g ?? (item as any).raw_weight_g ?? 0;
    if (rawWeight <= 0) continue;

    if (item.calories_100g !== undefined) {
      // Modern copied component with embedded nutrient density
      rawWeightTotal += rawWeight;
      const itemMacros = calculateItemMacros(item, rawWeight);
      caloriesSum += itemMacros.calories;
      proteinSum += itemMacros.protein;
      carbsSum += itemMacros.carbs;
      fatsSum += itemMacros.fats;
    } else if (ingredientsMap) {
      // Legacy item referencing ingredient_id
      const refId = (item as any).food_id || (item as any).ingredient_id;
      const ing = ingredientsMap.get(refId);
      if (!ing) continue;
      rawWeightTotal += rawWeight;
      const itemMacros = calculateItemMacros(ing, rawWeight);
      caloriesSum += itemMacros.calories;
      proteinSum += itemMacros.protein;
      carbsSum += itemMacros.carbs;
      fatsSum += itemMacros.fats;
    }
  }

  const rawYield = recipe.yield_factor;
  if (rawYield !== undefined && (rawYield <= 0 || !Number.isFinite(rawYield))) {
    throw new Error('ERR_INVALID_YIELD_FACTOR: Yield factor must be a positive finite number');
  }
  const yieldFactor = rawYield ?? 1.0;
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
