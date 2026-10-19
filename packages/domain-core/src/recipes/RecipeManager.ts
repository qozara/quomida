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

export interface RecipeEquivalenceOptions {
  /** Relative calorie tolerance (default: 0.08 = 8%) */
  calorieToleranceRatio?: number;
  /** Maximum L1 distance (g) across protein + carbs + fats per 100g (default: 10g) */
  macroDeltaToleranceG?: number;
  /** Minimum token overlap ratio for name similarity (default: 0.75) */
  minTokenSimilarity?: number;
  /** Minimum Jaccard similarity for component food_id sets (default: 0.8) */
  minComponentJaccard?: number;
}

const CULINARY_STOP_WORDS = new Set([
  'de', 'del', 'con', 'en', 'la', 'el', 'los', 'las', 'al',
  'un', 'una', 'unos', 'unas', 'y', 'e', 'a', 'para', 'por', 'sin',
  'with', 'without', 'and', 'the', 'of', 'in', 'to', 'an', 'some', 'for', 'on', 'at', 'by', 'from'
]);

export function singularizeWord(token: string): string {
  const lower = token.toLowerCase();
  if (lower.length <= 3) return token;

  // Invariant singular culinary words ending in 's'
  if (/^(?:hummus|couscous|asparagus|molasses|an[ií]s|anan[aá]s|gas)$/i.test(lower)) {
    return token;
  }

  // English words ending in -ies (except -ie+s like cookie, brownie, smoothie, veggie, pie, calorie)
  if (/[^aeiou]ies$/i.test(lower) && !/(?:cookie|brownie|smoothie|veggie|calorie|pie)s$/i.test(lower)) {
    return token.slice(0, -3) + 'y';
  }

  // English -oes plurals (potatoes, tomatoes)
  if (/(?:potat|tomat|her|torped|vet)oes$/i.test(lower)) {
    return token.slice(0, -2);
  }

  // English -(ch|sh|x|ss|zz)es plurals (sandwiches, dishes, peaches, boxes, glasses)
  if (/(?:ch|sh|x|ss|zz)es$/i.test(lower)) {
    return token.slice(0, -2);
  }

  // Spanish -ces -> -z (nueces -> nuez, arroces -> arroz), excluding English -ce+s (slices, pieces, sauces, juices, spices, rices, ices, lettuces)
  if (/ces$/i.test(lower) && !/(?:slice|piece|sauce|juice|spice|rice|ice|lettuce)s$/i.test(lower)) {
    return token.slice(0, -3) + 'z';
  }

  // Spanish consonant + -es plurals (panes, limones, frijoles, porciones, unidades, alfajores, tallarines)
  // Excluding English silent-e + s words (apples, oranges, cheeses, cakes, pancakes, grapes, olives, noodles, vegetables, sardines, tangerines, nectarines, prunes)
  if (
    /(?:[rndlj]es)$/i.test(lower) &&
    !/(?:apple|orange|cheese|cake|grape|olive|noodle|vegetable|pickle|waffle|truffle|sardine|tangerine|nectarine|prune|pine|wine|bone|cone|scone|date|plate|bite|casserole|guacamole|mole)s$/i.test(lower)
  ) {
    return token.slice(0, -2);
  }

  // General English & Spanish -s plurals (eggs -> egg, burgers -> burger, papas -> papa, apples -> apple, cheeses -> cheese)
  if (/[^su]s$/i.test(lower)) {
    return token.slice(0, -1);
  }

  return token;
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

  /**
   * Normalizes, strips stop words, singularizes plurals, and returns sorted unique tokens.
   */
  extractCanonicalTokens(name: string): string[] {
    if (!name || typeof name !== 'string') return [];

    const normalized = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ');

    const rawTokens = normalized
      .split(/\s+/)
      .map(t => t.trim())
      .filter(t => t.length > 0 && !CULINARY_STOP_WORDS.has(t));

    const singularized = rawTokens
      .map(singularizeWord)
      .filter(t => t.length > 0 && !CULINARY_STOP_WORDS.has(t));

    return Array.from(new Set(singularized)).sort();
  }

  /**
   * Computes Jaccard similarity (|A ∩ B| / |A ∪ B|) over canonical tokens of two names.
   */
  computeTokenSimilarity(nameA: string, nameB: string): number {
    const tokensA = this.extractCanonicalTokens(nameA);
    const tokensB = this.extractCanonicalTokens(nameB);

    if (tokensA.length === 0 || tokensB.length === 0) return 0;

    const setA = new Set(tokensA);
    const setB = new Set(tokensB);

    let intersectionCount = 0;
    for (const t of setA) {
      if (setB.has(t)) intersectionCount++;
    }

    const unionCount = new Set([...tokensA, ...tokensB]).size;
    return unionCount > 0 ? intersectionCount / unionCount : 0;
  }

  /**
   * Computes Jaccard similarity (|A ∩ B| / |A ∪ B|) over unique food_id sets of components.
   */
  computeComponentJaccard(a: RecipeComponent[], b: RecipeComponent[]): number {
    const setA = new Set((a || []).map(c => c.food_id).filter(Boolean));
    const setB = new Set((b || []).map(c => c.food_id).filter(Boolean));

    if (setA.size === 0 || setB.size === 0) return 0;

    let intersectionCount = 0;
    for (const id of setA) {
      if (setB.has(id)) intersectionCount++;
    }

    const unionSize = new Set([...setA, ...setB]).size;
    return unionSize > 0 ? intersectionCount / unionSize : 0;
  }

  /**
   * Evaluates nutritional equivalence within calorie tolerance ratio and macro L1 distance.
   */
  isNutritionallyEquivalent(
    a: NutrientDensity,
    b: NutrientDensity,
    opts?: RecipeEquivalenceOptions
  ): boolean {
    const calTol = opts?.calorieToleranceRatio ?? 0.08;
    const macroTol = opts?.macroDeltaToleranceG ?? 10;

    const calDiff = Math.abs(a.calories_100g - b.calories_100g) / Math.max(b.calories_100g, 1);
    const macroDiff =
      Math.abs(a.protein_100g - b.protein_100g) +
      Math.abs(a.carbs_100g - b.carbs_100g) +
      Math.abs(a.fats_100g - b.fats_100g);

    return calDiff <= calTol && macroDiff <= macroTol;
  }

  /**
   * Finds an equivalent existing recipe based on exact tokens, high component Jaccard + nutrition,
   * or high token similarity + nutrition.
   */
  findEquivalentRecipe(
    candidate: Recipe | CreateRecipeInput,
    existingRecipes: Recipe[],
    opts?: RecipeEquivalenceOptions
  ): Recipe | null {
    if (!existingRecipes || existingRecipes.length === 0) return null;

    const candidateTokens = this.extractCanonicalTokens(candidate.name);
    const candidateDensity: NutrientDensity =
      (candidate as any).calories_100g !== undefined
        ? (candidate as unknown as NutrientDensity)
        : this.computeNutrition(candidate as Recipe).density;

    const minTokenSim = opts?.minTokenSimilarity ?? 0.75;
    const minCompJaccard = opts?.minComponentJaccard ?? 0.8;

    for (const existing of existingRecipes) {
      if ((existing as any)._deleted) continue;

      const existingTokens = this.extractCanonicalTokens(existing.name);

      // Signal 1: Canonical token arrays are non-empty and identical (tokenSim === 1.0)
      const tokenSim = this.computeTokenSimilarity(candidate.name, existing.name);
      if (candidateTokens.length > 0 && existingTokens.length > 0 && tokenSim === 1.0) {
        return existing;
      }

      const existingDensity: NutrientDensity =
        (existing as any).calories_100g !== undefined
          ? (existing as unknown as NutrientDensity)
          : this.computeNutrition(existing).density;

      // Signal 2: componentJaccard >= minComponentJaccard AND isNutritionallyEquivalent
      const compJaccard = this.computeComponentJaccard(candidate.ingredients, existing.ingredients);
      if (compJaccard >= minCompJaccard && this.isNutritionallyEquivalent(candidateDensity, existingDensity, opts)) {
        return existing;
      }

      // Signal 3: tokenSim >= minTokenSimilarity AND isNutritionallyEquivalent
      if (tokenSim >= minTokenSim && this.isNutritionallyEquivalent(candidateDensity, existingDensity, opts)) {
        return existing;
      }
    }

    return null;
  }
}
