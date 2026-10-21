import type {
  BaseIngredient,
  RecipeFoodItem,
  Portion,
  ResolvedAiBatchMeal,
  ResolvedAiMealItem,
  ICatalogProvider,
  MealType,
  RagCatalogCandidate,
  Recipe
} from '@quomida/domain-core';
import { CatalogSearchManager, BatchAiMealResolver, StandardMealParser } from '@quomida/domain-core';
import type { LLMProvider, ParsedNaturalLanguageMeal, LLMParseContext } from './types.js';
import { QozaraAiMealParser, type QozaraAiMealParserConfig } from './QozaraAiMealParser.js';
import { LlmRecipeDecomposer, type LlmRecipeDecomposerConfig } from './LlmRecipeDecomposer.js';
import { AiMealError, classifyAiError } from './errors.js';

export interface ProcessAiMealOptions {
  input: string;
  customIngredients?: BaseIngredient[];
  customRecipes?: RecipeFoodItem[];
  customPortions?: Portion[];
  catalogProvider?: ICatalogProvider;
  currentHour?: number;
  explicitMealType?: MealType | string;
  existingRecipes?: Recipe[];
  locale?: string;
  aiEnabled?: boolean;
}

export interface AiMealServiceConfig {
  provider?: LLMProvider;
  parserConfig?: QozaraAiMealParserConfig;
  decomposer?: LlmRecipeDecomposer;
  decomposerConfig?: LlmRecipeDecomposerConfig;
  standardParser?: StandardMealParser;
  searchManager?: CatalogSearchManager;
  batchResolver?: BatchAiMealResolver;
}

/**
 * Headless, framework-agnostic AI Meal Service.
 * Encapsulates natural language meal parsing, domain food resolution,
 * portion mapping, macro calculations, JIT LLM recipe decomposition, and unified error handling.
 */
export class AiMealService {
  private readonly provider?: LLMProvider;
  private readonly standardParser: StandardMealParser;
  private readonly decomposer?: LlmRecipeDecomposer;
  private readonly searchManager: CatalogSearchManager;
  private readonly batchResolver: BatchAiMealResolver;

  constructor(config: AiMealServiceConfig = {}) {
    if (config.provider) {
      this.provider = config.provider;
    } else if (config.parserConfig) {
      this.provider = new QozaraAiMealParser(config.parserConfig);
    }

    this.standardParser = config.standardParser ?? new StandardMealParser();

    if (config.decomposer) {
      this.decomposer = config.decomposer;
    } else if (config.decomposerConfig) {
      this.decomposer = new LlmRecipeDecomposer(config.decomposerConfig);
    } else if (config.parserConfig) {
      this.decomposer = new LlmRecipeDecomposer(config.parserConfig);
    }

    this.searchManager = config.searchManager ?? new CatalogSearchManager();
    this.batchResolver = config.batchResolver ?? new BatchAiMealResolver(this.searchManager);
  }

  /**
   * Parses natural language text into structured food query items.
   * If an explicit LLMProvider was passed in config, uses it.
   * Otherwise, executes the high-speed local StandardMealParser (< 1ms, 100% offline).
   */
  async parseNaturalLanguage(input: string, context?: LLMParseContext): Promise<ParsedNaturalLanguageMeal> {
    const trimmed = (input || '').trim();
    if (!trimmed) {
      return { rawInput: '', items: [] };
    }

    try {
      if (this.provider) {
        const result = await this.provider.parse(trimmed, context);
        if (!result || !result.items || result.items.length === 0) {
          throw new AiMealError('NO_ITEMS_PARSED', 'Could not extract food items from description.');
        }
        return result;
      }

      const parsed = this.standardParser.parse(trimmed, { locale: context?.locale });
      if (!parsed || !parsed.items || parsed.items.length === 0) {
        throw new AiMealError('NO_ITEMS_PARSED', 'Could not extract food items from description.');
      }
      return parsed;
    } catch (err: unknown) {
      throw classifyAiError(err);
    }
  }

  /**
   * End-to-end processing pipeline:
   * 1. Parses natural language meal text locally with StandardMealParser (0ms, offline)
   * 2. Resolves food items against custom stores and external catalog
   * 3. Multi-food queries automatically synthesize recipes locally (Zero LLM needed)
   * 4. Single uncataloged items escalate to JIT LlmRecipeDecomposer if AI is enabled
   * 5. Synthesizes virtual recipes and returns fully resolved ResolvedAiBatchMeal
   */
  async processMeal(options: ProcessAiMealOptions): Promise<ResolvedAiBatchMeal> {
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

    let ragCandidates: RagCatalogCandidate[] = [];
    try {
      ragCandidates = await this.searchManager.retrieveRagCandidates(
        input,
        customIngredients,
        catalogProvider,
        customRecipes
      );
    } catch {
      ragCandidates = [];
    }

    const parseContext: LLMParseContext | undefined =
      ragCandidates.length > 0 || locale
        ? {
            ...(ragCandidates.length > 0 ? { candidates: ragCandidates } : {}),
            ...(locale ? { locale } : {})
          }
        : undefined;

    let parsed: ParsedNaturalLanguageMeal;
    if (aiEnabled === false || !this.provider) {
      parsed = this.standardParser.parse(input, { locale: parseContext?.locale });
    } else {
      try {
        parsed = await this.parseNaturalLanguage(input, parseContext);
      } catch (err) {
        const classified = classifyAiError(err);
        if (
          classified.code === 'RATE_LIMIT_EXCEEDED' ||
          classified.code === 'AUTHENTICATION_REQUIRED' ||
          classified.code === 'AI_DISABLED'
        ) {
          throw classified;
        }
        console.warn('[AiMealService] Provider parse failed. Degrading to StandardMealParser.', err);
        parsed = this.standardParser.parse(input, { locale: parseContext?.locale });
      }
    }

    try {
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

      // JIT Escalation: If any items are unmatched and AI is enabled, attempt recipe decomposition
      const hasUnmatched = resolved.items.some(it => it.unmatched);
      if (hasUnmatched && aiEnabled && this.decomposer) {
        resolved = await this.attemptDecompositionEscalation(resolved, options);
      }

      return resolved;
    } catch (err: unknown) {
      throw classifyAiError(err);
    }
  }

  /**
   * Attempts JIT culinary recipe decomposition for uncataloged dishes.
   * If decomposition fails (offline, rate limit, timeout), catches gracefully
   * and preserves the unmatched item state so the user is never blocked.
   */
  private async attemptDecompositionEscalation(
    resolved: ResolvedAiBatchMeal,
    options: ProcessAiMealOptions
  ): Promise<ResolvedAiBatchMeal> {
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

    const updatedItems: ResolvedAiMealItem[] = [];
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
      } catch (err) {
        console.warn('[AiMealService] JIT Decomposition escalation failed gracefully:', err);
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
