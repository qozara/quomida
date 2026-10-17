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
  'Analyze the user\'s natural language meal description and call the `log_meal` tool with each identified food item, quantity, and unit.\n' +
  'Normalize food names to their canonical, base form in Spanish or English matching nutritional catalogs.\n' +
  'If an item has no explicit quantity, assume 1 unit or a standard portion.';

export const LOG_MEAL_TOOL = {
  name: 'log_meal',
  description: 'Extract and structure food items, quantities, and units from natural language descriptions of meals in Spanish or English.',
  parameters: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            foodQuery: {
              type: 'string',
              description: 'The search term for the food item in its base singular form (e.g. "empanada de carne", "manzana", "arroz blanco").'
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
          required: ['foodQuery', 'quantity', 'unit']
        }
      }
    },
    required: ['items']
  }
};

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

    let parsedItems: any[] = [];

    if (response.type === 'tool_call' && response.arguments) {
      if (Array.isArray(response.arguments.items)) {
        parsedItems = response.arguments.items;
      } else if (Array.isArray(response.arguments)) {
        parsedItems = response.arguments;
      }
    } else if (response.type === 'text' && response.content) {
      // Fallback: extract json array or object from text response if tool call wasn't invoked
      const jsonMatch = response.content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || response.content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          if (Array.isArray(parsed)) {
            parsedItems = parsed;
          } else if (Array.isArray(parsed?.items)) {
            parsedItems = parsed.items;
          }
        } catch {
          // Ignore JSON parse errors on free-text fallback
        }
      }
    }

    const items: ParsedMealItem[] = parsedItems
      .filter((item) => item && typeof item.foodQuery === 'string' && item.foodQuery.trim().length > 0)
      .map((item) => ({
        foodQuery: String(item.foodQuery).trim(),
        quantity: typeof item.quantity === 'number' && !isNaN(item.quantity) && item.quantity > 0 ? item.quantity : 1,
        unit: typeof item.unit === 'string' && item.unit.trim().length > 0 ? item.unit.trim() : 'unit',
      }));

    return {
      rawInput: input,
      items,
    };
  }
}
