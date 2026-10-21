import { AiProviderFactory, type AuthTokenGetter, type AiFactoryConfig } from '@qozara/ai-client';
import type { IRecipeDecomposer, DecomposedDishResult, DecomposedDishIngredient } from '@quomida/domain-core';

export interface LlmRecipeDecomposerConfig {
  proxyUrl: string;
  provider?: 'qozara-intelligence' | 'byok' | 'ollama' | 'window.ai';
  ciphertext?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  getAuthToken?: AuthTokenGetter;
  systemPrompt?: string;
}

export const DECOMPOSE_DISH_TOOL = {
  name: 'decompose_dish',
  description:
    'Decompose an uncataloged, cultural, or composite culinary dish into standard raw ingredients with estimated gram weights.',
  parameters: {
    type: 'object',
    properties: {
      dish_name: {
        type: 'string',
        description: 'Canonical name of the dish in the user\'s language (e.g. "Locro criollo", "Shepherd\'s pie").'
      },
      estimated_total_weight_g: {
        type: 'number',
        description: 'Estimated total weight of this prepared portion in grams (e.g. 350 for a standard plate of stew).'
      },
      rationale: {
        type: 'string',
        description: 'Brief 1-sentence culinary rationale of standard preparation.'
      },
      ingredients: {
        type: 'array',
        description: 'List of standard base agricultural ingredients that compose this dish.',
        items: {
          type: 'object',
          properties: {
            food_name: {
              type: 'string',
              description: 'Standard, unbranded base ingredient in the user\'s language (e.g. "maíz blanco partido", "zapallo", "white corn", "ground beef").'
            },
            search_alias: {
              type: 'string',
              description: 'Optional English translation or canonical USDA search alias if food_name is non-English.'
            },
            quantity: {
              type: 'number',
              description: 'Estimated weight or quantity for this single portion (typically in grams).'
            },
            unit: {
              type: 'string',
              description: 'Unit of measurement: usually "g" or "ml", or "unit".'
            },
            notes: {
              type: 'string',
              description: 'Optional note (e.g. "cocido", "hervido", "crudo").'
            }
          },
          required: ['food_name', 'quantity', 'unit']
        }
      }
    },
    required: ['dish_name', 'ingredients']
  }
};

export const DEFAULT_DECOMPOSE_SYSTEM_PROMPT =
  'You are an expert culinary and nutritional recipe decomposer for Quomida.\n' +
  'When given a dish name and portion context, call the `decompose_dish` tool to break down the dish into its standard constituent raw ingredients.\n' +
  'CRITICAL RULES:\n' +
  '1. Decompose into simple, basic unbranded agricultural staples (e.g., "maíz blanco partido", "poroto alubia", "carne vacuna", "zapallo", "chorizo colorado", "onion", "egg") that exist in standard nutritional databases (USDA, BEDCA, Argenfoods).\n' +
  '2. Avoid composite sub-recipes (e.g., instead of "bolognese sauce", specify ground beef, crushed tomatoes, onion, and olive oil).\n' +
  '3. Provide realistic portion weights in grams (`g`). A typical main dish plate is ~300-400g; a side or soup bowl is ~200-250g; a pastry slice is ~100-150g.\n' +
  '4. Use the user\'s requested language for `food_name` (e.g., Spanish for Spanish queries). If food_name is in Spanish, provide a canonical English alias in `search_alias` when helpful.\n' +
  '5. ALWAYS call the `decompose_dish` tool. Never return plain text.';

export class LlmRecipeDecomposer implements IRecipeDecomposer {
  constructor(private readonly config: LlmRecipeDecomposerConfig) {}

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

  async decomposeDish(
    dishName: string,
    portionContext = '1 portion',
    locale = 'es'
  ): Promise<DecomposedDishResult | null> {
    if (!dishName || !dishName.trim()) return null;

    const trimmedDish = dishName.trim();
    const prompt = `Decompose standard single portion of this dish into base ingredients:\nDish: "${trimmedDish}"\nPortion Context: "${portionContext}"\nPreferred Language: ${locale}`;

    const factoryConfig: AiFactoryConfig = {
      providerPreference: this.mapPreference(this.config.provider),
      proxyUrl: this.config.proxyUrl,
      encryptedApiKey: this.config.ciphertext,
      baseUrl: this.config.ollamaBaseUrl,
      ollamaModel: this.config.ollamaModel
    };

    const provider = await AiProviderFactory.createProvider(factoryConfig, this.config.getAuthToken);

    const response = await provider.chat({
      messages: [{ role: 'user', content: prompt }],
      tools: [DECOMPOSE_DISH_TOOL],
      systemPrompt: this.config.systemPrompt || DEFAULT_DECOMPOSE_SYSTEM_PROMPT
    });

    if (!response) {
      return null;
    }

    if (response.error) {
      throw new Error(`AI Provider returned error: ${response.error}`);
    }

    let parsedData: any = null;

    if (response.type === 'tool_call' && response.arguments) {
      parsedData = this.extractData(response.arguments);
    } else if (response.arguments) {
      parsedData = this.extractData(response.arguments);
    } else if (Array.isArray((response as any).tool_calls) && (response as any).tool_calls.length > 0) {
      const call = (response as any).tool_calls[0];
      const callArgs = call.function?.arguments || call.arguments || call;
      parsedData = this.extractData(callArgs);
    } else if ((response as any).choices?.[0]?.message) {
      const msg = (response as any).choices[0].message;
      if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        const callArgs = msg.tool_calls[0].function?.arguments || msg.tool_calls[0].arguments;
        parsedData = this.extractData(callArgs);
      } else if (msg.content) {
        parsedData = this.extractData(msg.content);
      }
    } else if (response.content) {
      parsedData = this.extractData(response.content);
    }

    if (!parsedData || typeof parsedData !== 'object') {
      return null;
    }

    const rawIngredients = Array.isArray(parsedData.ingredients)
      ? parsedData.ingredients
      : Array.isArray(parsedData.food_items)
      ? parsedData.food_items
      : [];

    if (rawIngredients.length === 0) {
      return null;
    }

    const ingredients: DecomposedDishIngredient[] = [];
    for (const raw of rawIngredients) {
      const name = raw.food_name || raw.name || raw.food || raw.ingredient;
      if (!name || typeof name !== 'string') continue;

      const qty = typeof raw.quantity === 'number' ? raw.quantity : parseFloat(raw.quantity) || 50;
      const unit = typeof raw.unit === 'string' && raw.unit.trim() ? raw.unit.trim() : 'g';
      const alias = typeof raw.search_alias === 'string' && raw.search_alias.trim() ? raw.search_alias.trim() : undefined;
      const notes = typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim() : undefined;

      ingredients.push({
        food_name: name.trim(),
        quantity: qty > 0 ? qty : 50,
        unit,
        ...(alias ? { search_alias: alias } : {}),
        ...(notes ? { notes } : {})
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

    return {
      dishName: dish,
      rationale: parsedData.rationale || `AI culinary decomposition for ${dish}`,
      estimatedTotalWeightGrams: totalWeight,
      ingredients
    };
  }

  private extractData(raw: any): any {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      try {
        return JSON.parse(trimmed);
      } catch {
        const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || trimmed.match(/(\{[\s\S]*\})/);
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
    return null;
  }
}
