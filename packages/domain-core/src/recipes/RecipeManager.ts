import type {
  FoodItem,
  Recipe,
  RecipeComponent,
  RecipeFoodItem,
  Portion,
  MacroSnapshot,
  NutrientDensity
} from '../types.js';
import { calculateItemMacros, createMacroSnapshot } from '../calculations/index.js';

export interface ComponentContribution {
  component: RecipeComponent;
  macros: MacroSnapshot;
}

export interface RecipeNutritionCalculation {
  raw_weight_g: number;
  cooked_weight_g: number;
  yield_factor: number;
  total_macros: MacroSnapshot;
  density: NutrientDensity;
  contributions: ComponentContribution[];
}

export interface CreateRecipeInput {
  id?: string;
  name: string;
  ingredients: RecipeComponent[];
  yield_factor?: number;
}

export class RecipeManager {
  /**
   * Builds a copied, immutable RecipeComponent from any FoodItem (atomic ingredient or composite recipe).
   */
  buildComponent(
    food: FoodItem,
    weightGrams: number,
    opts?: { quantity?: number; portionName?: string }
  ): RecipeComponent {
    if (weightGrams <= 0 || !Number.isFinite(weightGrams)) {
      throw new Error('ERR_RECIPE_INVALID_WEIGHT: Component weight must be a positive finite number');
    }

    const roundedWeight = Math.round(weightGrams * 10) / 10;
    const isFromRecipe = food.kind === 'recipe';

    return {
      food_id: food.id,
      name: food.name,
      weight_g: roundedWeight,
      quantity: opts?.quantity,
      portion_name: opts?.portionName,
      calories_100g: Math.round(food.calories_100g * 100) / 100,
      protein_100g: Math.round(food.protein_100g * 100) / 100,
      carbs_100g: Math.round(food.carbs_100g * 100) / 100,
      fats_100g: Math.round(food.fats_100g * 100) / 100,
      from_recipe: isFromRecipe
    };
  }

  /**
   * Validates and creates a normalized Recipe document.
   */
  createRecipe(input: CreateRecipeInput): Recipe {
    const trimmedName = (input.name || '').trim();
    if (!trimmedName) {
      throw new Error('ERR_RECIPE_NAME_REQUIRED: Recipe name is required');
    }
    if (trimmedName.length > 100) {
      throw new Error('ERR_RECIPE_NAME_TOO_LONG: Recipe name cannot exceed 100 characters');
    }

    if (!Array.isArray(input.ingredients) || input.ingredients.length === 0) {
      throw new Error('ERR_RECIPE_INGREDIENTS_EMPTY: Recipe must contain at least one ingredient');
    }
    if (input.ingredients.length > 50) {
      throw new Error('ERR_RECIPE_TOO_MANY_INGREDIENTS: Recipe cannot contain more than 50 ingredients');
    }

    for (const item of input.ingredients) {
      if (!item.weight_g || item.weight_g <= 0 || !Number.isFinite(item.weight_g) || item.weight_g > 10000) {
        throw new Error('ERR_RECIPE_INVALID_WEIGHT: Component weight must be between 0.1g and 10000g');
      }
    }

    const yieldFactor = input.yield_factor ?? 1.0;
    if (!Number.isFinite(yieldFactor) || yieldFactor < 0.1 || yieldFactor > 5.0) {
      throw new Error('ERR_RECIPE_INVALID_YIELD: Yield factor must be between 0.1 and 5.0');
    }

    const id = input.id || `recipe-custom-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    return {
      id,
      name: trimmedName,
      ingredients: input.ingredients.map(item => ({
        food_id: item.food_id,
        name: item.name,
        weight_g: Math.round(item.weight_g * 10) / 10,
        quantity: item.quantity,
        portion_name: item.portion_name,
        calories_100g: Math.round(item.calories_100g * 100) / 100,
        protein_100g: Math.round(item.protein_100g * 100) / 100,
        carbs_100g: Math.round(item.carbs_100g * 100) / 100,
        fats_100g: Math.round(item.fats_100g * 100) / 100,
        from_recipe: Boolean(item.from_recipe)
      })),
      yield_factor: Math.round(yieldFactor * 100) / 100,
      updatedAt: Date.now()
    };
  }

  /**
   * Computes cooked weight, raw weight, total macros, and edible per-100g density for a recipe.
   */
  computeNutrition(recipe: Recipe): RecipeNutritionCalculation {
    let rawWeightTotal = 0;
    let caloriesSum = 0;
    let proteinSum = 0;
    let carbsSum = 0;
    let fatsSum = 0;
    const contributions: ComponentContribution[] = [];

    for (const comp of (recipe.ingredients || [])) {
      const weight = comp.weight_g || 0;
      rawWeightTotal += weight;
      const compMacros = calculateItemMacros(comp, weight);
      caloriesSum += compMacros.calories;
      proteinSum += compMacros.protein;
      carbsSum += compMacros.carbs;
      fatsSum += compMacros.fats;
      contributions.push({ component: comp, macros: compMacros });
    }

    const yieldFactor = recipe.yield_factor && recipe.yield_factor > 0 ? recipe.yield_factor : 1.0;
    const cookedWeight = Math.round(rawWeightTotal * yieldFactor * 10) / 10;
    const effectiveCookedWeight = cookedWeight > 0 ? cookedWeight : (rawWeightTotal > 0 ? rawWeightTotal : 100);

    const totalMacros: MacroSnapshot = {
      calories: Math.round(caloriesSum * 10) / 10,
      protein: Math.round(proteinSum * 10) / 10,
      carbs: Math.round(carbsSum * 10) / 10,
      fats: Math.round(fatsSum * 10) / 10
    };

    // Calculate per-100g density of cooked food with 2 decimal places precision (avoids portion drift)
    const factor100 = 100 / effectiveCookedWeight;
    const density: NutrientDensity = {
      calories_100g: Math.round(totalMacros.calories * factor100 * 100) / 100,
      protein_100g: Math.round(totalMacros.protein * factor100 * 100) / 100,
      carbs_100g: Math.round(totalMacros.carbs * factor100 * 100) / 100,
      fats_100g: Math.round(totalMacros.fats * factor100 * 100) / 100
    };

    return {
      raw_weight_g: Math.round(rawWeightTotal * 10) / 10,
      cooked_weight_g: cookedWeight,
      yield_factor: yieldFactor,
      total_macros: totalMacros,
      density,
      contributions
    };
  }

  /**
   * Adapts a Recipe domain entity into a FoodItem for unified polymorphic consumption.
   */
  toFoodItem(recipe: Recipe): RecipeFoodItem {
    const calc = this.computeNutrition(recipe);
    return {
      kind: 'recipe',
      id: recipe.id,
      name: recipe.name,
      source: 'custom',
      raw_weight_g: calc.raw_weight_g,
      cooked_weight_g: calc.cooked_weight_g,
      yield_factor: calc.yield_factor,
      total_macros: calc.total_macros,
      calories_100g: calc.density.calories_100g,
      protein_100g: calc.density.protein_100g,
      carbs_100g: calc.density.carbs_100g,
      fats_100g: calc.density.fats_100g,
      recipe,
      updatedAt: recipe.updatedAt
    };
  }

  /**
   * Normalizes stored recipes (from cloud sync or legacy version 0) defensively.
   */
  normalizeStoredRecipe(rawDoc: any): Recipe {
    if (!rawDoc || typeof rawDoc !== 'object') {
      throw new Error('Invalid recipe document');
    }

    const rawIngredients = Array.isArray(rawDoc.ingredients) ? rawDoc.ingredients : [];
    const normalizedIngredients: RecipeComponent[] = rawIngredients.map((item: any) => {
      const foodId = item.food_id || item.ingredient_id || 'unknown';
      const weight = Number(item.weight_g ?? item.raw_weight_g ?? 0);
      return {
        food_id: foodId,
        name: item.name || foodId,
        weight_g: Number.isFinite(weight) && weight > 0 ? weight : 0,
        quantity: item.quantity,
        portion_name: item.portion_name,
        calories_100g: Number(item.calories_100g) || 0,
        protein_100g: Number(item.protein_100g) || 0,
        carbs_100g: Number(item.carbs_100g) || 0,
        fats_100g: Number(item.fats_100g) || 0,
        from_recipe: Boolean(item.from_recipe)
      };
    }).filter((i: RecipeComponent) => i.weight_g > 0);

    return {
      id: rawDoc.id,
      name: rawDoc.name || 'Untitled Recipe',
      ingredients: normalizedIngredients,
      yield_factor: Number(rawDoc.yield_factor) || 1.0,
      updatedAt: rawDoc.updatedAt
    };
  }

  /**
   * Computes a virtual "Whole recipe" portion based on total cooked weight.
   */
  getWholeRecipePortion(foodItem: RecipeFoodItem): Portion {
    return {
      id: `port-whole-${foodItem.id}`,
      base_food_id: foodItem.id,
      name: 'Whole recipe',
      equivalent_weight_g: foodItem.cooked_weight_g,
      source: 'custom'
    };
  }

  /**
   * Splits a recipe's cooked weight into N equal portions.
   */
  splitIntoPortions(foodItem: RecipeFoodItem, servings: number): number {
    const n = Math.round(servings);
    if (!Number.isFinite(n) || n < 2 || n > 100) {
      throw new Error('Servings count must be an integer between 2 and 100');
    }
    return Math.round((foodItem.cooked_weight_g / n) * 10) / 10;
  }
}
