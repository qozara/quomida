import type {
  BaseIngredient,
  RecipeFoodItem,
  Portion,
  ResolvedAiBatchMeal,
  ICatalogProvider,
  MealType
} from '@quomida/domain-core';
import { CatalogSearchManager, BatchAiMealResolver } from '@quomida/domain-core';
import type { LLMProvider, ParsedNaturalLanguageMeal } from './types.js';
import { QozaraAiMealParser, type QozaraAiMealParserConfig } from './QozaraAiMealParser.js';
import { AiMealError, classifyAiError } from './errors.js';

export interface ProcessAiMealOptions {
  input: string;
  customIngredients?: BaseIngredient[];
  customRecipes?: RecipeFoodItem[];
  customPortions?: Portion[];
  catalogProvider?: ICatalogProvider;
  currentHour?: number;
  explicitMealType?: MealType | string;
}

export interface AiMealServiceConfig {
  provider?: LLMProvider;
  parserConfig?: QozaraAiMealParserConfig;
  searchManager?: CatalogSearchManager;
  batchResolver?: BatchAiMealResolver;
}

/**
 * Headless, framework-agnostic AI Meal Service.
 * Encapsulates natural language meal parsing, domain food resolution,
 * portion mapping, macro calculations, and unified error handling.
 *
 * Can be reused identically across:
 * 1. Webapp (FoodLogger presentation component)
 * 2. CLI commands (quomida cli)
 * 3. Server-side API endpoints (REST / RPC)
 */
export class AiMealService {
  private readonly provider: LLMProvider;
  private readonly batchResolver: BatchAiMealResolver;

  constructor(config: AiMealServiceConfig = {}) {
    if (config.provider) {
      this.provider = config.provider;
    } else if (config.parserConfig) {
      this.provider = new QozaraAiMealParser(config.parserConfig);
    } else {
      this.provider = new QozaraAiMealParser({ proxyUrl: '' });
    }

    const searchManager = config.searchManager ?? new CatalogSearchManager();
    this.batchResolver = config.batchResolver ?? new BatchAiMealResolver(searchManager);
  }

  /**
   * Parses natural language text into structured food query items.
   * Throws typed AiMealError on failure.
   */
  async parseNaturalLanguage(input: string): Promise<ParsedNaturalLanguageMeal> {
    const trimmed = (input || '').trim();
    if (!trimmed) {
      return { rawInput: '', items: [] };
    }

    try {
      const result = await this.provider.parse(trimmed);
      if (!result || !result.items || result.items.length === 0) {
        throw new AiMealError('NO_ITEMS_PARSED', 'Could not extract food items from description.');
      }
      return result;
    } catch (err: unknown) {
      throw classifyAiError(err);
    }
  }

  /**
   * End-to-end processing pipeline:
   * 1. Parses natural language meal text with LLM
   * 2. Resolves food items against custom stores and external catalog
   * 3. Matches portion sizes and computes exact macros
   * 4. Normalizes meal category
   *
   * Returns a fully resolved ResolvedAiBatchMeal ready for diary persistence.
   */
  async processMeal(options: ProcessAiMealOptions): Promise<ResolvedAiBatchMeal> {
    const {
      input,
      customIngredients = [],
      customRecipes = [],
      customPortions = [],
      catalogProvider,
      currentHour,
      explicitMealType
    } = options;

    const parsed = await this.parseNaturalLanguage(input);

    try {
      const resolved = await this.batchResolver.resolveBatch({
        rawInput: input,
        rawItems: parsed.items,
        customIngredients,
        customRecipes,
        customPortions,
        catalogProvider,
        currentHour,
        detectedMealType: explicitMealType || parsed.detectedMealType
      });

      return resolved;
    } catch (err: unknown) {
      throw classifyAiError(err);
    }
  }
}
