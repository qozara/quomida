import { AiProviderFactory, type AuthTokenGetter, type AiFactoryConfig } from '@qozara/ai-client';
import type { LLMProvider, ParsedNaturalLanguageMeal, ParsedMealItem } from './types.js';

export interface QozaraAiMealParserConfig {
  proxyUrl: string;
  provider?: 'qozara-intelligence' | 'byok' | 'ollama' | 'window.ai';
  ciphertext?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  getAuthToken?: AuthTokenGetter;
  systemPrompt?: string;
}

export const DEFAULT_LOG_MEAL_SYSTEM_PROMPT =
  'You are a precise nutritional intake parser for Quomida.\n' +
  'Analyze the user\'s natural language meal description and call the `log_meal` tool with each identified food item, quantity, unit, and detected meal type.\n' +
  'Normalize food names to their canonical, base form in Spanish or English matching nutritional catalogs.\n' +
  'If an item has no explicit quantity, assume 1 unit or a standard portion.';

export const LOG_MEAL_TOOL = {
  name: 'log_meal',
  description: 'Extract and structure food items, quantities, units, and meal category from natural language meal descriptions in Spanish or English.',
  parameters: {
    type: 'object',
    properties: {
      meal_type: {
        type: 'string',
        enum: ['breakfast', 'lunch', 'dinner', 'snack'],
        description: 'The meal category (breakfast/desayuno, lunch/almuerzo, dinner/cena, snack/merienda).'
      },
      food_items: {
        type: 'array',
        description: 'List of individual food items found in the meal.',
        items: {
          type: 'object',
          properties: {
            food_name: {
              type: 'string',
              description: 'The canonical search term for the food item in its base singular form (e.g. "empanada", "manzana", "arroz").'
            },
            quantity: {
              type: 'number',
              description: 'Numeric quantity or portion size (e.g. 2, 1.5, 250).'
            },
            unit: {
              type: 'string',
              description: 'Unit of measurement: "unit", "g", "ml", "cup", "slice", "portion", or "plate".'
            }
          },
          required: ['food_name', 'quantity', 'unit']
        }
      }
    },
    required: ['food_items']
  }
};

function extractRawData(argsOrContent: any): any {
  if (!argsOrContent) return null;
  let data = argsOrContent;
  if (typeof data === 'string') {
    const trimmed = data.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }
  return data;
}

function extractRawItems(data: any): any[] {
  if (!data) return [];

  if (Array.isArray(data)) {
    return data;
  }

  if (typeof data === 'object' && data !== null) {
    if (Array.isArray(data.food_items)) return data.food_items;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.foods)) return data.foods;
    if (Array.isArray(data.ingredients)) return data.ingredients;
    if (Array.isArray(data.meal_items)) return data.meal_items;
    if (Array.isArray(data.parsed_items)) return data.parsed_items;
    if (Array.isArray(data.alimentos)) return data.alimentos;

    // Check if the object itself is a single food item
    const singleFood =
      data.foodQuery ||
      data.food_name ||
      data.foodName ||
      data.food ||
      data.name ||
      data.item ||
      data.ingredient ||
      data.alimento;
    if (singleFood && typeof singleFood === 'string') {
      return [data];
    }
  }

  return [];
}

function normalizeMealItem(raw: any): ParsedMealItem | null {
  if (!raw || typeof raw !== 'object') return null;

  const rawFood =
    raw.foodQuery ||
    raw.food_query ||
    raw.food_name ||
    raw.foodName ||
    raw.food ||
    raw.name ||
    raw.item ||
    raw.ingredient ||
    raw.alimento ||
    raw.nombre ||
    raw.query ||
    raw.description;

  if (typeof rawFood !== 'string' || !rawFood.trim()) {
    return null;
  }

  const rawQty =
    raw.quantity ??
    raw.amount ??
    raw.qty ??
    raw.count ??
    raw.cantidad ??
    raw.porcion ??
    raw.portion_size ??
    raw.portionSize;

  let quantity = 1;
  if (typeof rawQty === 'number' && !isNaN(rawQty) && rawQty > 0) {
    quantity = rawQty;
  } else if (typeof rawQty === 'string') {
    const parsed = parseFloat(rawQty.replace(',', '.'));
    if (!isNaN(parsed) && parsed > 0) {
      quantity = parsed;
    }
  }

  const rawUnit =
    raw.unit ||
    raw.unit_of_measure ||
    raw.unitOfMeasure ||
    raw.medida ||
    raw.unidad ||
    raw.portion ||
    raw.serving ||
    raw.measure;

  const unit = typeof rawUnit === 'string' && rawUnit.trim().length > 0
    ? rawUnit.trim()
    : 'unit';

  return {
    foodQuery: rawFood.trim(),
    quantity,
    unit
  };
}

function extractMealType(data: any): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const rawMeal = data.meal_type || data.mealType || data.meal || data.tipo_comida || data.tipoComida;
  if (typeof rawMeal === 'string' && rawMeal.trim()) {
    return rawMeal.trim().toLowerCase();
  }
  return undefined;
}

export class QozaraAiMealParser implements LLMProvider {
  constructor(private readonly config: QozaraAiMealParserConfig) {}

  private mapPreference(provider?: string): AiFactoryConfig['providerPreference'] {
    switch (provider) {
      case 'byok':
        return 'byok';
      case 'ollama':
        return 'local';
      case 'window.ai':
        return 'local-browser';
      case 'qozara-intelligence':
      default:
        return 'cloud';
    }
  }

  async parse(input: string): Promise<ParsedNaturalLanguageMeal> {
    if (!input || !input.trim()) {
      return { rawInput: input || '', items: [] };
    }

    const factoryConfig: AiFactoryConfig = {
      providerPreference: this.mapPreference(this.config.provider),
      proxyUrl: this.config.proxyUrl,
      encryptedApiKey: this.config.ciphertext,
      baseUrl: this.config.ollamaBaseUrl,
      ollamaModel: this.config.ollamaModel,
    };

    const provider = await AiProviderFactory.createProvider(factoryConfig, this.config.getAuthToken);

    const response = await provider.chat({
      messages: [{ role: 'user', content: input.trim() }],
      tools: [LOG_MEAL_TOOL],
      systemPrompt: this.config.systemPrompt || DEFAULT_LOG_MEAL_SYSTEM_PROMPT,
    });

    if (response.error) {
      throw new Error(`AI Provider returned error: ${response.error}`);
    }

    let parsedData: any = null;

    if (response.type === 'tool_call' && response.arguments) {
      parsedData = extractRawData(response.arguments);
    } else if (response.type === 'text' && response.content) {
      parsedData = extractRawData(response.content);
    }

    const rawItems = extractRawItems(parsedData);
    const items: ParsedMealItem[] = rawItems
      .map(normalizeMealItem)
      .filter((item): item is ParsedMealItem => item !== null);

    const detectedMealType = extractMealType(parsedData);

    return {
      rawInput: input,
      items,
      ...(detectedMealType ? { detectedMealType } : {})
    };
  }
}
