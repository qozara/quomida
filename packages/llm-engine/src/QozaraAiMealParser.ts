import { AiProviderFactory, type AuthTokenGetter, type AiFactoryConfig } from '@qozara/ai-client';
import type { LLMProvider, ParsedNaturalLanguageMeal, ParsedMealItem, LLMParseContext } from './types.js';

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
  'CRITICAL RULES:\n' +
  '1. Separate main dishes and side items or accompaniments into distinct individual elements in the `food_items` array. For example:\n' +
  '   - "una milanesa con puré de papas" -> item 1: { food_name: "milanesa", quantity: 1, unit: "unit" }, item 2: { food_name: "puré de papas", quantity: 1, unit: "portion" }\n' +
  '   - "dos huevos revueltos con tostadas y café" -> item 1: { food_name: "huevo revuelto", quantity: 2, unit: "unit" }, item 2: { food_name: "tostada", quantity: 2, unit: "unit" }, item 3: { food_name: "café", quantity: 1, unit: "cup" }\n' +
  '   - "pollo al horno con ensalada rusa" -> item 1: { food_name: "pollo al horno", quantity: 1, unit: "portion" }, item 2: { food_name: "ensalada rusa", quantity: 1, unit: "portion" }\n' +
  '   Only preserve compound names if they represent an indivisible unitary recipe or beverage (e.g., "café con leche", "arroz con leche", "chile con carne").\n' +
  '2. Extract individual food names in their canonical, base singular form (e.g., "dos hamburguesas de carne" -> food_name: "hamburguesa", "dos empanadas" -> food_name: "empanada"). Do not include quantities or conversational words in food_name.\n' +
  '3. Identify the meal category (breakfast, lunch, dinner, snack) if mentioned or implied (e.g., "desayuné" -> breakfast, "cené" / "en la cena" -> dinner, "almorcé" -> lunch, "merendé" -> snack).\n' +
  '4. If an item has no explicit quantity, assume 1 unit or a standard portion.\n' +
  '5. If `Available Catalog Candidates` are provided in the user prompt, prefer selecting the matching candidate\'s exact `id` in `candidate_id` and its `name` in `canonical_name` or `food_name`.\n' +
  '6. If the user described a composite dish combining 2 or more ingredients (e.g., "milanesa con puré de papas"), populate `composite_dish_name` with the clean dish title (e.g., "Milanesa con puré de papas") while still decomposing each constituent ingredient in `food_items`.\n' +
  '7. ALWAYS invoke the `log_meal` tool. Do not reply with plain conversational text.';

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
      composite_dish_name: {
        type: 'string',
        description: "If the user described a combined dish or meal (e.g. 'milanesa con puré de papas', 'arroz con pollo'), provide its clean canonical dish title (e.g. 'Milanesa con puré de papas')."
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
            candidate_id: {
              type: 'string',
              description: "If one of the provided catalog candidates matches this food item, set its exact id here."
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

export const INSEPARABLE_COMPOUNDS = new Set([
  'cafe con leche', 'café con leche',
  'arroz con leche',
  'dulce de leche',
  'te con limon', 'té con limón',
  'te con leche', 'té con leche',
  'mate con leche',
  'chile con carne',
  'chocolate con mani', 'chocolate con maní',
  'arepas con queso', 'arepa con queso',
  'panchos con queso', 'pancho con queso',
  'gnocchis con papa', 'gnocchi con papa',
  'tallarin con huevo', 'tallarines con huevo',
  'mortadela con pistacho',
  'wrap con salvado',
  'tostadas con manteca', 'tostada con manteca',
  'pan con manteca',
  'flan con dulce de leche'
]);

export function splitCompoundMealItems(items: ParsedMealItem[]): ParsedMealItem[] {
  const result: ParsedMealItem[] = [];

  for (const item of items) {
    const rawFood = (item.foodQuery || '').trim();
    const normalized = rawFood
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    // Preserve inseparable single recipes
    if (INSEPARABLE_COMPOUNDS.has(normalized)) {
      result.push(item);
      continue;
    }

    // Check for " con " / " with "
    const conMatch = rawFood.match(/^(.+?)\s+(?:con|with)\s+(.+)$/i);
    if (conMatch && conMatch[1].trim() && conMatch[2].trim()) {
      const mainPart = conMatch[1].trim();
      const sidePart = conMatch[2].trim();

      // Avoid splitting seasonings/additions
      if (!/^(sal|azucar|azúcar|edulcorante|edulcorantes|hielo|gas|limon|limón)$/i.test(sidePart)) {
        result.push({
          foodQuery: mainPart,
          quantity: item.quantity > 0 ? item.quantity : 1,
          unit: item.unit && !/^(plato|plate|portion|porci[oó]n)$/i.test(item.unit) ? item.unit : 'unit'
        });
        result.push({
          foodQuery: sidePart,
          quantity: 1,
          unit: 'portion'
        });
        continue;
      }
    }

    // Check for " y " / " and "
    const yMatch = rawFood.match(/^(.+?)\s+(?:y|and|\+)\s+(.+)$/i);
    if (yMatch && yMatch[1].trim() && yMatch[2].trim()) {
      const first = yMatch[1].trim();
      const second = yMatch[2].trim();
      if (first.length >= 3 && second.length >= 3) {
        result.push({
          foodQuery: first,
          quantity: item.quantity > 0 ? item.quantity : 1,
          unit: item.unit || 'unit'
        });
        result.push({
          foodQuery: second,
          quantity: 1,
          unit: 'portion'
        });
        continue;
      }
    }

    result.push(item);
  }

  return result;
}

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
    if (Array.isArray(data.foodItems)) return data.foodItems;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.foods)) return data.foods;
    if (Array.isArray(data.ingredients)) return data.ingredients;
    if (Array.isArray(data.meal_items)) return data.meal_items;
    if (Array.isArray(data.mealItems)) return data.mealItems;
    if (Array.isArray(data.parsed_items)) return data.parsed_items;
    if (Array.isArray(data.parsedItems)) return data.parsedItems;
    if (Array.isArray(data.alimentos)) return data.alimentos;
    if (Array.isArray(data.platos)) return data.platos;
    if (Array.isArray(data.dishes)) return data.dishes;
    if (Array.isArray(data.comidas)) return data.comidas;
    if (Array.isArray(data.elements)) return data.elements;
    if (Array.isArray(data.products)) return data.products;
    if (Array.isArray(data.productos)) return data.productos;
    if (Array.isArray(data.results)) return data.results;

    // Check nested container objects
    if (data.log_meal && typeof data.log_meal === 'object') {
      const nested = extractRawItems(data.log_meal);
      if (nested.length > 0) return nested;
    }
    if (data.parameters && typeof data.parameters === 'object') {
      const nested = extractRawItems(data.parameters);
      if (nested.length > 0) return nested;
    }
    if (data.arguments && typeof data.arguments === 'object') {
      const nested = extractRawItems(data.arguments);
      if (nested.length > 0) return nested;
    }

    // Check if the object itself is a single food item
    const singleFood =
      data.food_name ||
      data.foodName ||
      data.food_item ||
      data.foodItem ||
      data.foodQuery ||
      data.food_query ||
      data.food ||
      data.name ||
      data.item ||
      data.ingredient ||
      data.alimento ||
      data.plato ||
      data.comida;
    if (singleFood && typeof singleFood === 'string') {
      return [data];
    }
  }

  return [];
}

function normalizeMealItem(raw: any): ParsedMealItem | null {
  if (!raw) return null;

  // Handle plain string representation (e.g. "2 empanadas", "1 porción de puré de papas", "milanesa")
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const qtyUnitMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(unidad(?:es)?|pieza(?:s)?|porci[oó]n(?:es)?|plato(?:s)?|taza(?:s)?|rebanada(?:s)?|rodaja(?:s)?|feta(?:s)?|gramos?|g|ml|kg|litros?|l|unit|slice|portion|plate|cup|serving|glass|vaso(?:s)?)\s*(?:de\s+)?(.+)$/i);
    if (qtyUnitMatch) {
      const qty = parseFloat(qtyUnitMatch[1].replace(',', '.'));
      const parsedUnit = qtyUnitMatch[2].trim().toLowerCase();
      const food = qtyUnitMatch[3].trim();
      return {
        foodQuery: food,
        quantity: !isNaN(qty) && qty > 0 ? qty : 1,
        unit: parsedUnit
      };
    }

    const qtyMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(?:de\s+)?(.+)$/i);
    if (qtyMatch) {
      const qty = parseFloat(qtyMatch[1].replace(',', '.'));
      const food = qtyMatch[2].trim();
      return {
        foodQuery: food,
        quantity: !isNaN(qty) && qty > 0 ? qty : 1,
        unit: 'unit'
      };
    }

    return {
      foodQuery: trimmed,
      quantity: 1,
      unit: 'unit'
    };
  }

  if (typeof raw !== 'object') return null;

  const rawFood =
    raw.food_name ||
    raw.foodName ||
    raw.food_item ||
    raw.foodItem ||
    raw.foodQuery ||
    raw.food_query ||
    raw.food ||
    raw.name ||
    raw.item ||
    raw.ingredient ||
    raw.alimento ||
    raw.nombre ||
    raw.plato ||
    raw.comida ||
    raw.dish ||
    raw.query ||
    raw.description ||
    raw.title ||
    raw.titulo;

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

  const rawCandidateId = raw.candidate_id ?? raw.candidateId;
  const candidateId = typeof rawCandidateId === 'string' && rawCandidateId.trim().length > 0
    ? rawCandidateId.trim()
    : undefined;

  return {
    foodQuery: rawFood.trim(),
    quantity,
    unit,
    ...(candidateId ? { candidateId } : {})
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

function extractCompositeDishName(data: any): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const rawDish =
    data.composite_dish_name ||
    data.compositeDishName ||
    data.composite_dish ||
    data.compositeDish;
  if (typeof rawDish === 'string' && rawDish.trim()) {
    return rawDish.trim();
  }
  if (data.log_meal && typeof data.log_meal === 'object') {
    const nested = extractCompositeDishName(data.log_meal);
    if (nested) return nested;
  }
  if (data.parameters && typeof data.parameters === 'object') {
    const nested = extractCompositeDishName(data.parameters);
    if (nested) return nested;
  }
  if (data.arguments && typeof data.arguments === 'object') {
    const nested = extractCompositeDishName(data.arguments);
    if (nested) return nested;
  }
  return undefined;
}

function extractItemsFromPlainText(text: string): ParsedMealItem[] {
  if (!text || !text.trim()) return [];
  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // If there are bullet lines, only extract from bullet lines
  const hasBullets = rawLines.some(l => /^[-*•\d+.]\s+/.test(l));
  const candidateLines = hasBullets
    ? rawLines.filter(l => /^[-*•\d+.]\s+/.test(l)).map(l => l.replace(/^[-*•\d+.]\s+/, '').trim())
    : rawLines.filter(l => !/^(he\s+registrado|registrado|para\s+tu|alimentos?|ingredientes?|platos?|comida|comí|cené|desayuné|merendé)/i.test(l) && !l.endsWith(':'));

  const items: ParsedMealItem[] = [];
  for (const line of candidateLines) {
    const normalized = normalizeMealItem(line);
    if (normalized) {
      items.push(normalized);
    }
  }

  return splitCompoundMealItems(items);
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

  async parse(input: string, context?: LLMParseContext): Promise<ParsedNaturalLanguageMeal> {
    if (!input || !input.trim()) {
      return { rawInput: input || '', items: [] };
    }

    const trimmed = (input || '').trim();

    let userMessageContent = trimmed;
    if (context?.candidates && context.candidates.length > 0) {
      const candidatesBlock = context.candidates
        .map(c => `- id: "${c.id}" | name: "${c.name}" (${Math.round(c.calories_100g)} kcal/100g, P:${c.protein_100g}g, C:${c.carbs_100g}g, F:${c.fats_100g}g)`)
        .join('\n');
      userMessageContent = `User description: "${trimmed}"\n\nAvailable Catalog Candidates (use exact \`id\` in \`candidate_id\` if applicable):\n${candidatesBlock}`;
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
      messages: [{ role: 'user', content: userMessageContent }],
      tools: [LOG_MEAL_TOOL],
      systemPrompt: this.config.systemPrompt || DEFAULT_LOG_MEAL_SYSTEM_PROMPT,
    });

    if (response.error) {
      throw new Error(`AI Provider returned error: ${response.error}`);
    }

    let parsedData: any = null;
    let detectedMealType: string | undefined;
    let compositeDishName: string | undefined;

    // 1. Tool call(s) extraction
    if (response.type === 'tool_call' && response.arguments) {
      parsedData = extractRawData(response.arguments);
    } else if (response.arguments) {
      parsedData = extractRawData(response.arguments);
    } else if (Array.isArray((response as any).tool_calls) && (response as any).tool_calls.length > 0) {
      const aggregated: any[] = [];
      for (const call of (response as any).tool_calls) {
        const callArgs = call.function?.arguments || call.arguments || call;
        const callData = extractRawData(callArgs);
        if (callData) {
          if (!detectedMealType) detectedMealType = extractMealType(callData);
          if (!compositeDishName) compositeDishName = extractCompositeDishName(callData);
          aggregated.push(...extractRawItems(callData));
        }
      }
      parsedData = aggregated;
    } else if ((response as any).choices?.[0]?.message) {
      const msg = (response as any).choices[0].message;
      if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        const aggregated: any[] = [];
        for (const call of msg.tool_calls) {
          const callArgs = call.function?.arguments || call.arguments || call;
          const callData = extractRawData(callArgs);
          if (callData) {
            if (!detectedMealType) detectedMealType = extractMealType(callData);
            if (!compositeDishName) compositeDishName = extractCompositeDishName(callData);
            aggregated.push(...extractRawItems(callData));
          }
        }
        parsedData = aggregated;
      } else if (msg.content) {
        parsedData = extractRawData(msg.content);
      }
    } else if (response.type === 'text' && response.content) {
      parsedData = extractRawData(response.content);
    } else if (response.content) {
      parsedData = extractRawData(response.content);
    }

    if (!detectedMealType && parsedData) {
      detectedMealType = extractMealType(parsedData);
    }
    if (!compositeDishName && parsedData) {
      compositeDishName = extractCompositeDishName(parsedData);
    }

    let rawItems = extractRawItems(parsedData);

    // Fallback 1: Extract plain text items from response.content if JSON extraction yielded nothing
    if (rawItems.length === 0 && response.content && typeof response.content === 'string') {
      const fallbackItems = extractItemsFromPlainText(response.content);
      if (fallbackItems.length > 0) {
        return {
          rawInput: input,
          items: fallbackItems,
          ...(detectedMealType ? { detectedMealType } : {}),
          ...(compositeDishName ? { compositeDishName } : {})
        };
      }
    }

    // Fallback 2: Extract from user input if response yielded 0 items
    if (rawItems.length === 0 && input.trim()) {
      const fallbackFromInput = extractItemsFromPlainText(input);
      if (fallbackFromInput.length > 0) {
        return {
          rawInput: input,
          items: fallbackFromInput,
          ...(detectedMealType ? { detectedMealType } : {}),
          ...(compositeDishName ? { compositeDishName } : {})
        };
      }
    }

    const normalizedItems: ParsedMealItem[] = rawItems
      .map(normalizeMealItem)
      .filter((item): item is ParsedMealItem => item !== null);

    const items = splitCompoundMealItems(normalizedItems);

    return {
      rawInput: input,
      items,
      ...(detectedMealType ? { detectedMealType } : {}),
      ...(compositeDishName ? { compositeDishName } : {})
    };
  }
}
