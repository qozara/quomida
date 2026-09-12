/**
 * Calculates nutritional macros for a specific ingredient amount in grams based on 100g base values.
 */
export function calculateItemMacros(ingredient, weightGrams) {
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
export function calculateRecipeMacros(recipe, ingredientsMap) {
    let rawWeightTotal = 0;
    let caloriesSum = 0;
    let proteinSum = 0;
    let carbsSum = 0;
    let fatsSum = 0;
    for (const item of recipe.ingredients) {
        const ing = ingredientsMap.get(item.ingredient_id);
        if (!ing)
            continue;
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
export function convertPortionToGrams(quantity, portionName, availablePortions) {
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
export function createMacroSnapshot(macros) {
    return {
        calories: Math.round(macros.calories * 10) / 10,
        protein: Math.round(macros.protein * 10) / 10,
        carbs: Math.round(macros.carbs * 10) / 10,
        fats: Math.round(macros.fats * 10) / 10
    };
}
//# sourceMappingURL=index.js.map