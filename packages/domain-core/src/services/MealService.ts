import type {
  BaseIngredient,
  FoodItem,
  MealType,
  Portion,
  Recipe,
  RecipeFoodItem
} from '../types.js';
import type { ICatalogProvider } from '../catalog/CatalogSearchManager.js';
import { CatalogSearchManager } from '../catalog/CatalogSearchManager.js';
import {
  BatchMealResolver,
  matchPortionUnit,
  type ResolvedBatchMeal,
  type ResolvedMealItem
} from '../catalog/BatchMealResolver.js';
import type { TaggedPortion } from '../catalog/PortionManager.js';
import { calculateItemMacros, convertPortionToGrams, createMacroSnapshot } from '../calculations/index.js';
import { StandardMealParser } from '../parser/StandardMealParser.js';
import type { DecomposedDishIngredient, IRecipeDecomposer, ParsedNaturalLanguageMeal } from '../parser/types.js';

export interface MealServiceConfig {
  standardParser?: StandardMealParser;
  searchManager?: CatalogSearchManager;
  batchResolver?: BatchMealResolver;
  decomposer?: IRecipeDecomposer;
}

export interface ProcessMealOptions {
  input: string;
  customIngredients?: BaseIngredient[];
  customRecipes?: RecipeFoodItem[];
  customPortions?: Portion[];
  catalogProvider?: ICatalogProvider;
  currentHour?: number;
  explicitMealType?: MealType;
  existingRecipes?: Recipe[];
  locale?: string;
  aiEnabled?: boolean;
  forceAiEscalation?: boolean;
}

/**
 * Headless Domain Meal Service.
 * Orchestrates deterministic natural language meal parsing (< 1ms, 100% offline),
 * food catalog resolution, portion mapping, macro calculations, and optional JIT
 * culinary recipe decomposition via an injected IRecipeDecomposer port.
 */
export class MealService {
  private readonly standardParser: StandardMealParser;
  private readonly searchManager: CatalogSearchManager;
  private readonly batchResolver: BatchMealResolver;
  private readonly decomposer?: IRecipeDecomposer;

  constructor(config: MealServiceConfig = {}) {
    this.standardParser = config.standardParser ?? new StandardMealParser();
    this.searchManager = config.searchManager ?? new CatalogSearchManager();
    this.batchResolver = config.batchResolver ?? new BatchMealResolver(this.searchManager);
    this.decomposer = config.decomposer;
  }

  /**
   * Parses natural language text into structured food query items using the deterministic parser.
   */
  parseNaturalLanguage(input: string, options?: { locale?: string }): ParsedNaturalLanguageMeal {
    const trimmed = (input || '').trim();
    if (!trimmed) {
      throw new Error('Could not extract food items from empty description.');
    }

    const parsed = this.standardParser.parse(trimmed, options);
    if (!parsed || !parsed.items || parsed.items.length === 0) {
      throw new Error('Could not extract food items from description.');
    }
    return parsed;
  }

  /**
   * End-to-end meal processing pipeline:
   * 1. Deterministic Tier 1: Parses natural language meal text locally with StandardMealParser (0ms, 100% offline).
   * 2. Resolves food items against custom stores and SQLite catalog via BatchMealResolver.
   * 3. Multi-food queries automatically synthesize recipes locally (Zero AI needed).
   * 4. Single uncataloged items escalate to JIT IRecipeDecomposer if AI is enabled and decomposer is present.
   * 5. Synthesizes virtual recipes and returns fully resolved ResolvedBatchMeal.
   */
  async processMeal(options: ProcessMealOptions): Promise<ResolvedBatchMeal> {
    const {
      input,
      customIngredients = [],
      customRecipes = [],
      customPortions = [],
      catalogProvider,
      currentHour,
      explicitMealType,
      existingRecipes,
      locale,
      aiEnabled = true
    } = options;

    const parsed = this.parseNaturalLanguage(input, { locale });

    let resolved = await this.batchResolver.resolveBatch({
      rawInput: input,
      rawItems: parsed.items,
      customIngredients,
      customRecipes,
      customPortions,
      catalogProvider,
      currentHour,
      detectedMealType: explicitMealType || parsed.detectedMealType,
      compositeDishName: parsed.compositeDishName,
      existingRecipes,
      isCompositeDish: parsed.isCompositeDish,
      locale
    });

    // JIT Escalation: Escalate unmatched items or explicit single-item AI inference requests
    const hasUnmatched = resolved.items.some(it => it.unmatched);
    const shouldEscalate =
      hasUnmatched || Boolean(options.forceAiEscalation && resolved.items.length === 1);
    if (shouldEscalate && aiEnabled && this.decomposer) {
      resolved = await this.attemptDecompositionEscalation(resolved, options);
    }

    return resolved;
  }

  private buildAiSynthesizedMealItem(
    subItem: ResolvedMealItem,
    ing: DecomposedDishIngredient,
    displayName: string,
    idx: number,
    itemMealType: MealType,
    locale?: string
  ): ResolvedMealItem {
    const foodId = `ai_inferred_${Date.now()}_${idx}`;
    const lang = locale && locale.toLowerCase().startsWith('en') ? 'en' : 'es';
    const customPortionsList = Array.isArray(ing.portions)
      ? ing.portions.filter(p => p && typeof p.name === 'string' && p.name.trim() && p.equivalent_weight_g > 0)
      : [];

    const availablePortions: TaggedPortion[] = customPortionsList.map((p, pIdx) => ({
      id: `port-ai-${foodId}-${pIdx}`,
      base_food_id: foodId,
      name: p.name.trim(),
      equivalent_weight_g: p.equivalent_weight_g,
      source: 'ai',
      tag: 'Custom'
    }));

    const hasUnitPortion = availablePortions.some(p =>
      /unit|unidad|pieza|medium|mediana|chica|grande|serving/i.test(p.name)
    );
    if (!hasUnitPortion) {
      availablePortions.push({
        id: `port-std-unit-${foodId}`,
        base_food_id: foodId,
        name: '1 unidad',
        equivalent_weight_g: 100,
        source: 'system',
        tag: 'Generic'
      });
    }

    const hasPortion = availablePortions.some(p => /portion|porci[oó]n|plato/i.test(p.name));
    if (!hasPortion) {
      availablePortions.push({
        id: `port-std-portion-${foodId}`,
        base_food_id: foodId,
        name: '1 porción',
        equivalent_weight_g: 150,
        source: 'system',
        tag: 'Generic'
      });
    }

    const synthesizedFood = {
      id: foodId,
      kind: 'ingredient' as const,
      name: displayName.trim() || ing.food_name.trim(),
      source: 'ai' as const,
      lang,
      calories_100g: Math.max(0, Number(ing.calories_100g) || 0),
      protein_100g: Math.max(0, Number(ing.protein_100g) || 0),
      carbs_100g: Math.max(0, Number(ing.carbs_100g) || 0),
      fats_100g: Math.max(0, Number(ing.fats_100g) || 0),
      ...(customPortionsList.length > 0 ? { portions: customPortionsList } : {})
    };

    const quantity = ing.quantity > 0 ? ing.quantity : 100;
    const selectedPortionName = matchPortionUnit(ing.unit || subItem.selectedPortionName, availablePortions);
    const calculatedWeightGrams = convertPortionToGrams(quantity, selectedPortionName, availablePortions);
    const macros = createMacroSnapshot(calculateItemMacros(synthesizedFood, calculatedWeightGrams));

    return {
      ...subItem,
      food: synthesizedFood,
      unmatched: false,
      availablePortions,
      selectedPortionName,
      quantity,
      calculatedWeightGrams,
      macros,
      mealType: itemMealType,
      isAiDecomposed: true
    };
  }

  /**
   * Attempts JIT culinary recipe decomposition or single-ingredient inference for uncataloged foods.
   * If decomposition fails (offline, rate limit, provider error), catches gracefully
   * unless the error is a critical service error (e.g. rate limit / auth), or preserves
   * unmatched/existing items so the user is never blocked.
   */
  private async attemptDecompositionEscalation(
    resolved: ResolvedBatchMeal,
    options: ProcessMealOptions
  ): Promise<ResolvedBatchMeal> {
    if (!this.decomposer) return resolved;

    const {
      customIngredients = [],
      customRecipes = [],
      customPortions = [],
      catalogProvider,
      currentHour,
      existingRecipes,
      locale,
      forceAiEscalation
    } = options;

    const allExistingRecipes: Recipe[] =
      existingRecipes && existingRecipes.length > 0
        ? existingRecipes
        : customRecipes.map(
            r =>
              r.recipe || {
                id: r.id,
                name: r.name,
                ingredients: (r as any).ingredients || [],
                yield_factor: r.yield_factor ?? 1.0,
                updatedAt: r.updatedAt
              }
          );

    const updatedItems: ResolvedMealItem[] = [];
    let didDecomposeAny = false;
    let decomposedDishTitle: string | undefined = undefined;
    let sourceDishName: string | undefined = undefined;
    let newlySynthesizedRecipe = resolved.synthesizedRecipe;

    for (const item of resolved.items) {
      const shouldEscalateItem = item.unmatched || (Boolean(forceAiEscalation) && resolved.items.length === 1);
      if (!shouldEscalateItem) {
        updatedItems.push(item);
        continue;
      }

      try {
        const portionContext = `${item.quantity} ${item.selectedPortionName}`;
        const decomposed = await this.decomposer.decomposeDish(item.rawQuery, portionContext, locale);

        if (decomposed && decomposed.ingredients.length > 0) {
          const isSingleIngredientIntent =
            decomposed.kind === 'ingredient' ||
            (decomposed.ingredients.length === 1 && decomposed.kind !== 'recipe');

          const subResolved = await this.batchResolver.resolveBatch({
            rawInput: `${item.rawQuery} (${decomposed.dishName})`,
            rawItems: decomposed.ingredients.map(ing => ({
              foodQuery: ing.search_alias || ing.food_name,
              name: ing.food_name,
              quantity: ing.quantity,
              unit: ing.unit,
              mealType: item.mealType
            })),
            customIngredients,
            customRecipes,
            customPortions,
            catalogProvider,
            currentHour,
            detectedMealType: item.mealType || resolved.detectedMealType,
            compositeDishName: isSingleIngredientIntent ? undefined : decomposed.dishName,
            existingRecipes: allExistingRecipes,
            isCompositeDish: !isSingleIngredientIntent,
            locale
          });

          const itemMealType = item.mealType || resolved.detectedMealType;
          const hydratedSubItems: ResolvedMealItem[] = subResolved.items.map((subItem, idx) => {
            const ing = decomposed.ingredients[idx];
            const hasMacros = ing && typeof ing.calories_100g === 'number';
            const shouldSynthesizeAiIngredient =
              hasMacros &&
              (subItem.unmatched ||
                !subItem.food ||
                (Boolean(forceAiEscalation) && isSingleIngredientIntent));

            if (shouldSynthesizeAiIngredient) {
              const displayName =
                decomposed.ingredients.length === 1 && decomposed.dishName
                  ? decomposed.dishName
                  : ing.food_name;
              return this.buildAiSynthesizedMealItem(subItem, ing, displayName, idx, itemMealType, locale);
            }

            return {
              ...subItem,
              isAiDecomposed: true,
              mealType: itemMealType
            };
          });

          const validDecomposed = hydratedSubItems.filter(it => !it.unmatched && it.food);
          if (validDecomposed.length > 0) {
            didDecomposeAny = true;
            const isSingleIngredientResult =
              decomposed.kind === 'ingredient' ||
              (validDecomposed.length === 1 && decomposed.kind !== 'recipe');

            if (isSingleIngredientResult) {
              decomposedDishTitle = undefined;
              newlySynthesizedRecipe = undefined;
              sourceDishName = item.rawQuery;
            } else {
              decomposedDishTitle = decomposed.dishName;
              sourceDishName = item.rawQuery;
              if (validDecomposed.length >= 2) {
                newlySynthesizedRecipe =
                  this.batchResolver.computeSynthesizedRecipe(
                    hydratedSubItems,
                    decomposed.dishName,
                    allExistingRecipes,
                    locale
                  ) || subResolved.synthesizedRecipe;
              } else {
                newlySynthesizedRecipe = subResolved.synthesizedRecipe;
              }
            }

            for (const decItem of hydratedSubItems) {
              updatedItems.push(decItem);
            }
            continue;
          }
        }
      } catch (err: unknown) {
        // Re-throw critical provider errors (rate limit, quota, auth) if recognizable
        const msg = err instanceof Error ? err.message : String(err);
        if (/RATE_LIMIT|quota|Too Many Requests|429|AI is disabled|Unauthorized|401|403|expired Google token|Invalid.*token/i.test(msg)) {
          throw err;
        }
        console.warn('[MealService] JIT Decomposition escalation failed gracefully:', err);
      }

      // If decomposition failed or returned no valid items, keep original item
      updatedItems.push(item);
    }

    if (!didDecomposeAny) {
      return resolved;
    }

    // Recalculate total macros
    const newTotalMacros = updatedItems.reduce(
      (acc, it) => ({
        calories: acc.calories + (it.macros?.calories || 0),
        protein: acc.protein + (it.macros?.protein || 0),
        carbs: acc.carbs + (it.macros?.carbs || 0),
        fats: acc.fats + (it.macros?.fats || 0)
      }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );

    const isSingleAtomicResult =
      updatedItems.length === 1 &&
      !decomposedDishTitle &&
      !newlySynthesizedRecipe &&
      !resolved.compositeDishName;

    return {
      ...resolved,
      items: updatedItems,
      totalMacros: newTotalMacros,
      compositeDishName: isSingleAtomicResult
        ? undefined
        : decomposedDishTitle || resolved.compositeDishName,
      synthesizedRecipe: isSingleAtomicResult ? undefined : newlySynthesizedRecipe,
      defaultLoggingMode: isSingleAtomicResult ? 'batch' : 'recipe',
      isAiDecomposed: true,
      sourceDishName: sourceDishName
    };
  }
}
