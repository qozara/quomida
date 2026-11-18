import {
  createGenAiToolResolver,
  normalizeProviderPreference,
  LruMemoryCache,
  type AuthTokenGetter,
  type GenAiProviderPreference,
  type LegacyAiProviderPreference,
  type GenAiToolResolver
} from '@qozara/ai-client';
import type {
  IRecipeDecomposer,
  DecomposedDishResult,
  DecomposedDishIngredient,
  InferredPortion
} from '@quomida/domain-core';

export interface LlmRecipeDecomposerConfig {
  proxyUrl: string;
  provider?: GenAiProviderPreference | LegacyAiProviderPreference;
  ciphertext?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  enableLocalAi?: boolean;
  getAuthToken?: AuthTokenGetter;
  systemPrompt?: string;
  cache?: LruMemoryCache<string, DecomposedDishResult> | null;
}

interface DecomposeDishInput {
  dishName: string;
  portionContext: string;
  locale: string;
}

const defaultGlobalDecompositionCache = new LruMemoryCache<string, DecomposedDishResult>(50);

/**
 * Normalizes dish name, portion, and locale into a deterministic, case-insensitive cache key.
 */
export function normalizeDecompositionKey(dishName: string, portionContext: string, locale: string): string {
  const cleanDish = dishName.trim().toLowerCase().replace(/\s+/g, ' ');
  const cleanPortion = (portionContext || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const cleanLocale = (locale || '').trim().toLowerCase();
  return `${cleanDish}|${cleanPortion}|${cleanLocale}`;
}

export const DECOMPOSE_DISH_TOOL = {
  name: 'decompose_dish',
  description:
    'Infer nutritional data for an uncataloged base ingredient OR decompose a cultural/composite culinary dish into standard raw ingredients with estimated gram weights and fallback macros.',
  parameters: {
    type: 'object',
    properties: {
      dish_name: {
        type: 'string',
        description: 'Canonical name of the ingredient or dish in the user\'s language (e.g. "Rúcula", "Locro criollo", "Shepherd\'s pie").'
      },
      kind: {
        type: 'string',
        enum: ['ingredient', 'recipe'],
        description: '"ingredient" if the query is a single atomic/base food (e.g. "rúcula", "tofu", "quinoa"); "recipe" if it is a prepared or composite dish.'
      },
      estimated_total_weight_g: {
        type: 'number',
        description: 'Estimated total weight of this prepared portion in grams (e.g. 350 for a standard plate of stew, 100 for a single ingredient).'
      },
      rationale: {
        type: 'string',
        description: 'Brief 1-sentence nutritional or culinary rationale.'
      },
      ingredients: {
        type: 'array',
        description: 'For kind="ingredient": 1 element describing the single ingredient with per-100g macros and domestic portions. For kind="recipe": list of base ingredients that compose the dish.',
        items: {
          type: 'object',
          properties: {
            food_name: {
              type: 'string',
              description: 'Standard, unbranded base ingredient in the user\'s language (e.g. "rúcula", "maíz blanco partido", "zapallo", "white corn", "ground beef").'
            },
            search_alias: {
              type: 'string',
              description: 'Optional English translation or canonical USDA search alias if food_name is non-English.'
            },
            quantity: {
              type: 'number',
              description: 'Estimated weight or quantity for this single portion (typically in grams; 100 for standalone ingredient inference).'
            },
            unit: {
              type: 'string',
              description: 'Unit of measurement: usually "g" or "ml", or "unit".'
            },
            notes: {
              type: 'string',
              description: 'Optional note (e.g. "cocido", "hervido", "crudo").'
            },
            calories_100g: {
              type: 'number',
              description: 'Estimated calories (kcal) per 100g of this raw/base ingredient.'
            },
            protein_100g: {
              type: 'number',
              description: 'Estimated protein (g) per 100g.'
            },
            carbs_100g: {
              type: 'number',
              description: 'Estimated carbohydrates (g) per 100g.'
            },
            fats_100g: {
              type: 'number',
              description: 'Estimated total fats (g) per 100g.'
            },
            portions: {
              type: 'array',
              description: 'Optional 1-2 common domestic serving portions for a standalone ingredient (e.g. [{"name": "1 taza", "equivalent_weight_g": 20}]).',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  equivalent_weight_g: { type: 'number' }
                },
                required: ['name', 'equivalent_weight_g']
              }
            }
          },
          required: ['food_name', 'quantity', 'unit', 'calories_100g', 'protein_100g', 'carbs_100g', 'fats_100g']
        }
      }
    },
    required: ['dish_name', 'kind', 'ingredients']
  }
};

export const DEFAULT_DECOMPOSE_SYSTEM_PROMPT =
  'You are an expert culinary and nutritional food inference assistant for Quomida.\n' +
  'When given a food or dish query and portion context, call the `decompose_dish` tool.\n' +
  'CRITICAL RULES:\n' +
  '1. SINGLE ATOMIC INGREDIENT vs COMPOSITE RECIPE:\n' +
  '   - If the query is a single raw/base ingredient or atomic food (e.g., "rúcula", "quinoa", "tofu", "salmón"), set `kind: "ingredient"` and return exactly 1 item in `ingredients` with accurate per-100g macros (`calories_100g`, `protein_100g`, `carbs_100g`, `fats_100g`) and 1-2 common domestic `portions` (e.g. "1 taza", "1 porción").\n' +
  '   - If the query is a prepared or composite dish (e.g., "locro", "pastel de papa", "sorrentinos de jamón y rúcula"), set `kind: "recipe"` and decompose it into simple, unbranded agricultural staples that exist in standard nutritional databases (USDA, BEDCA, Argenfoods).\n' +
  '2. Avoid composite sub-recipes (e.g., instead of "bolognese sauce", specify ground beef, crushed tomatoes, onion, and olive oil).\n' +
  '3. Always provide realistic fallback per-100g macros (`calories_100g`, `protein_100g`, `carbs_100g`, `fats_100g`) for every ingredient in case it is missing from the local database.\n' +
  '4. Provide realistic portion weights in grams (`g`). A typical main dish plate is ~300-400g; a side or soup bowl is ~200-250g; a pastry slice is ~100-150g.\n' +
  '5. Use the user\'s requested language for `dish_name`, `food_name`, and portion names (e.g., Spanish for Spanish queries). If `food_name` is in Spanish, provide a canonical English alias in `search_alias` when helpful.\n' +
  '6. ALWAYS call the `decompose_dish` tool. Never return plain text.';

function parseMacro(val: unknown): number | undefined {
  if (typeof val === 'number' && Number.isFinite(val) && val >= 0) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const parsed = parseFloat(val);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

function parseDecomposedDishPayload(
  parsedData: any,
  trimmedDish: string
): DecomposedDishResult | null {
  if (!parsedData || typeof parsedData !== 'object') {
    return null;
  }

  const rawIngredients = Array.isArray(parsedData.ingredients)
    ? parsedData.ingredients
    : Array.isArray(parsedData.food_items)
    ? parsedData.food_items
    : Array.isArray(parsedData.items)
    ? parsedData.items
    : [];

  if (rawIngredients.length === 0) {
    return null;
  }

  const ingredients: DecomposedDishIngredient[] = [];
  for (const raw of rawIngredients) {
    const name = raw.food_name || raw.name || raw.food || raw.ingredient || raw.foodQuery;
    if (!name || typeof name !== 'string') continue;

    const qty = typeof raw.quantity === 'number' ? raw.quantity : parseFloat(raw.quantity) || 50;
    const unit = typeof raw.unit === 'string' && raw.unit.trim() ? raw.unit.trim() : 'g';
    const alias = typeof raw.search_alias === 'string' && raw.search_alias.trim() ? raw.search_alias.trim() : undefined;
    const notes = typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim() : undefined;

    const calories100g = parseMacro(raw.calories_100g);
    const protein100g = parseMacro(raw.protein_100g);
    const carbs100g = parseMacro(raw.carbs_100g);
    const fats100g = parseMacro(raw.fats_100g);

    const portions: InferredPortion[] | undefined = Array.isArray(raw.portions)
      ? raw.portions
          .filter(
            (p: any) =>
              p &&
              typeof p.name === 'string' &&
              p.name.trim() &&
              typeof p.equivalent_weight_g === 'number' &&
              Number.isFinite(p.equivalent_weight_g) &&
              p.equivalent_weight_g > 0
          )
          .map((p: any) => ({
            name: p.name.trim(),
            equivalent_weight_g: p.equivalent_weight_g
          }))
      : undefined;

    ingredients.push({
      food_name: name.trim(),
      quantity: qty > 0 ? qty : 50,
      unit,
      ...(alias ? { search_alias: alias } : {}),
      ...(notes ? { notes } : {}),
      ...(calories100g !== undefined ? { calories_100g: calories100g } : {}),
      ...(protein100g !== undefined ? { protein_100g: protein100g } : {}),
      ...(carbs100g !== undefined ? { carbs_100g: carbs100g } : {}),
      ...(fats100g !== undefined ? { fats_100g: fats100g } : {}),
      ...(portions && portions.length > 0 ? { portions } : {})
    });
  }

  if (ingredients.length === 0) {
    return null;
  }

  const dish = parsedData.dish_name || parsedData.dishName || trimmedDish;
  const totalWeight =
    typeof parsedData.estimated_total_weight_g === 'number'
      ? parsedData.estimated_total_weight_g
      : ingredients.reduce((sum, ing) => sum + (ing.unit === 'g' || ing.unit === 'ml' ? ing.quantity : 100), 0);

  const kind =
    parsedData.kind === 'ingredient' || parsedData.kind === 'recipe'
      ? (parsedData.kind as 'ingredient' | 'recipe')
      : undefined;

  return {
    dishName: dish,
    ...(kind ? { kind } : {}),
    rationale: parsedData.rationale || `AI culinary decomposition for ${dish}`,
    estimatedTotalWeightGrams: totalWeight,
    ingredients
  };
}

export class LlmRecipeDecomposer implements IRecipeDecomposer {
  private readonly cache: LruMemoryCache<string, DecomposedDishResult> | null;
  private readonly resolver: GenAiToolResolver<DecomposeDishInput, DecomposedDishResult>;

  constructor(private readonly config: LlmRecipeDecomposerConfig) {
    this.cache = config.cache === null ? null : (config.cache ?? defaultGlobalDecompositionCache);
    const providerPreference = normalizeProviderPreference(this.config.provider);
    const enableLocalAi = Boolean(
      this.config.enableLocalAi ||
      this.config.provider === 'ollama' ||
      this.config.provider === 'local'
    );

    this.resolver = createGenAiToolResolver<DecomposeDishInput, DecomposedDishResult>({
      factoryConfig: {
        providerPreference,
        proxyUrl: this.config.proxyUrl,
        encryptedApiKey: this.config.ciphertext,
        baseUrl: this.config.ollamaBaseUrl,
        ollamaModel: this.config.ollamaModel,
        enableLocalAi
      },
      getAuthToken: this.config.getAuthToken,
      cache: this.cache,
      getCacheKey: ({ dishName, portionContext, locale }) =>
        normalizeDecompositionKey(dishName, portionContext, locale),
      buildRequest: ({ dishName, portionContext, locale }) => ({
        messages: [
          {
            role: 'user',
            content: `Decompose standard single portion of this dish into base ingredients:\nDish: "${dishName}"\nPortion Context: "${portionContext}"\nPreferred Language: ${locale}`
          }
        ],
        tools: [DECOMPOSE_DISH_TOOL],
        systemPrompt: this.config.systemPrompt || DEFAULT_DECOMPOSE_SYSTEM_PROMPT
      }),
      parseResponse: (extracted, _rawResponse, { dishName }) =>
        parseDecomposedDishPayload(extracted?.args, dishName)
    });
  }

  /**
   * Clears the default shared in-memory decomposition cache.
   */
  static clearCache(): void {
    defaultGlobalDecompositionCache.clear();
  }

  /**
   * Clears the instance's cache.
   */
  clearCache(): void {
    this.cache?.clear();
  }

  async decomposeDish(
    dishName: string,
    portionContext = '1 portion',
    locale = 'es'
  ): Promise<DecomposedDishResult | null> {
    if (!dishName || !dishName.trim()) return null;

    return this.resolver.resolve({
      dishName: dishName.trim(),
      portionContext,
      locale
    });
  }
}
