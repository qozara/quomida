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
  type ResolvedBatchMeal,
  type ResolvedMealItem
} from '../catalog/BatchMealResolver.js';
import { StandardMealParser } from '../parser/StandardMealParser.js';
import type { IRecipeDecomposer, ParsedNaturalLanguageMeal } from '../parser/types.js';

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

    // JIT Escalation: If any items are unmatched, AI is enabled, and a decomposer is provided, attempt recipe decomposition
    const hasUnmatched = resolved.items.some(it => it.unmatched);
    if (hasUnmatched && aiEnabled && this.decomposer) {
      resolved = await this.attemptDecompositionEscalation(resolved, options);
    }

    return resolved;
  }

  /**
   * Attempts JIT culinary recipe decomposition for uncataloged dishes.
   * If decomposition fails (offline, rate limit, provider error), catches gracefully
   * unless the error is a critical service error (e.g. rate limit / auth), or preserves
   * unmatched items so the user is never blocked.
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
      locale
    } = options;

    const updatedItems: ResolvedMealItem[] = [];
    let didDecomposeAny = false;
    let decomposedDishTitle: string | undefined = undefined;
    let sourceDishName: string | undefined = undefined;
    let newlySynthesizedRecipe = resolved.synthesizedRecipe;

    for (const item of resolved.items) {
      if (!item.unmatched) {
        updatedItems.push(item);
        continue;
      }

      try {
        const portionContext = `${item.quantity} ${item.selectedPortionName}`;
        const decomposed = await this.decomposer.decomposeDish(item.rawQuery, portionContext, locale);

        if (decomposed && decomposed.ingredients.length > 0) {
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
            compositeDishName: decomposed.dishName,
            existingRecipes,
            isCompositeDish: true,
            locale
          });

          const validDecomposed = subResolved.items.filter(it => !it.unmatched && it.food);
          if (validDecomposed.length > 0) {
            didDecomposeAny = true;
            decomposedDishTitle = decomposed.dishName;
            sourceDishName = item.rawQuery;
            if (subResolved.synthesizedRecipe) {
              newlySynthesizedRecipe = subResolved.synthesizedRecipe;
            }

            for (const decItem of subResolved.items) {
              updatedItems.push({
                ...decItem,
                isAiDecomposed: true,
                mealType: item.mealType || resolved.detectedMealType
              });
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

      // If decomposition failed or returned no valid items, keep original unmatched item
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

    return {
      ...resolved,
      items: updatedItems,
      totalMacros: newTotalMacros,
      compositeDishName: decomposedDishTitle || resolved.compositeDishName,
      synthesizedRecipe: newlySynthesizedRecipe,
      defaultLoggingMode: 'recipe',
      isAiDecomposed: true,
      sourceDishName: sourceDishName
    };
  }
}
