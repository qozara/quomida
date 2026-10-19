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
  'You are a precise multilingual nutritional intake parser for Quomida (supporting Spanish, English, and other languages).\n' +
  'Analyze the user\'s natural language meal description and call the `log_meal` tool with each identified food item, quantity, unit, and detected meal type.\n' +
  'CRITICAL RULES:\n' +
  '1. Keep extracted `food_name` and `composite_dish_name` in the SAME language as the user\'s input (or matching `Available Catalog Candidates` if provided).\n' +
  '2. Separate main dishes and side items or accompaniments into distinct individual elements in the `food_items` array. For example:\n' +
  '   - ES: "una milanesa con puré de papas" -> item 1: { food_name: "milanesa", quantity: 1, unit: "unit" }, item 2: { food_name: "puré de papas", quantity: 1, unit: "portion" }\n' +
  '   - EN: "I ate mashed potatoes with a burger" -> item 1: { food_name: "mashed potatoes", quantity: 1, unit: "portion" }, item 2: { food_name: "burger", quantity: 1, unit: "unit" }\n' +
  '   Only preserve compound names if they represent an indivisible unitary recipe or beverage (e.g., "café con leche", "arroz con leche", "mac and cheese", "coffee with milk").\n' +
  '3. Extract individual food names in their canonical, base singular form (e.g., "dos hamburguesas" -> "hamburguesa", "two burgers" -> "burger"). Do not include quantities or conversational words in food_name.\n' +
  '4. Identify the meal category (breakfast, lunch, dinner, snack) if mentioned or implied (e.g., "desayuné" / "for breakfast" -> breakfast, "almorcé" / "for lunch" -> lunch, "cené" / "en la cena" / "for dinner" -> dinner, "merendé" / "for a snack" -> snack).\n' +
  '   If the user mentions multiple moments of the day in one sentence (e.g., "almorcé mora congelada y cené queso" or "I had frozen blackberries for lunch and ate cheese for dinner"), extract ALL items from ALL meals into `food_items` and set `meal_type` on each item. Do NOT set `composite_dish_name` when items belong to different meals or when the user is listing separate items eaten together (e.g., "queso, pan, hamburguesa y mora", "cheese, bread, burger and frozen blackberries", "barbecue snacks and 2 slices of pizza").\n' +
  '5. If an item has no explicit quantity, assume 1 unit or a standard portion. Carefully associate each quantity and unit with the exact food item it precedes (e.g., "caracolitos sabor asado y 2 porciones de pizza" or "barbecue snacks and 2 slices of pizza" -> item 1 has quantity 1; item 2 "pizza" has quantity 2).\n' +
  '6. If `Available Catalog Candidates` are provided in the user prompt, prefer selecting the matching candidate\'s exact `id` in `candidate_id` and its `name` in `canonical_name` or `food_name`.\n' +
  '7. Only set `composite_dish_name` when the user describes a single combined culinary dish (typically joined with "con" or "with", e.g. "milanesa con puré de papas", "mashed potatoes with burger") while still decomposing each constituent ingredient in `food_items`.\n' +
  '8. ALWAYS invoke the `log_meal` tool. Do not reply with plain conversational text.';

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
        description: "If the user described a combined dish or meal (e.g. 'milanesa con puré de papas', 'mashed potatoes with burger'), provide its clean canonical dish title in the user's language."
      },
      food_items: {
        type: 'array',
        description: 'List of individual food items found in the meal.',
        items: {
          type: 'object',
          properties: {
            food_name: {
              type: 'string',
              description: 'The canonical search term for the food item in its base singular form (e.g. "empanada", "manzana", "burger", "apple").'
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
            },
            meal_type: {
              type: 'string',
              enum: ['breakfast', 'lunch', 'dinner', 'snack'],
              description: 'Meal category for this specific item if the user mentioned multiple meals (e.g. lunch vs dinner).'
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
  'flan con dulce de leche',
  'coffee with milk',
  'tea with milk',
  'tea with lemon',
  'iced tea with lemon',
  'mac and cheese',
  'macaroni and cheese',
  'fish and chips',
  'peanut butter and jelly',
  'bread and butter',
  'ham and cheese',
  'bacon and eggs',
  'pork and beans',
  'rice and beans',
  'biscuits and gravy',
  'chips and salsa',
  'chips and guacamole',
  'strawberries and cream',
  'cookies and cream'
]);

export const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, one: 1, a: 1, an: 1,
  dos: 2, two: 2, couple: 2, par: 2,
  tres: 3, three: 3,
  cuatro: 4, four: 4,
  cinco: 5, five: 5,
  seis: 6, six: 6,
  siete: 7, seven: 7,
  ocho: 8, eight: 8,
  nueve: 9, nine: 9,
  diez: 10, ten: 10,
  medio: 0.5, media: 0.5, half: 0.5
};

export const CANONICAL_UNITS: Record<string, string> = {
  unidad: 'unit', unidades: 'unit', pieza: 'unit', piezas: 'unit', unit: 'unit', units: 'unit', piece: 'unit', pieces: 'unit', item: 'unit', items: 'unit',
  porcion: 'porción', porciones: 'porción', 'porción': 'porción', portion: 'portion', portions: 'portion', serving: 'portion', servings: 'portion',
  plato: 'plato', platos: 'plato', plate: 'plate', plates: 'plate', bowl: 'bowl', bowls: 'bowl', bol: 'bowl', cuenco: 'bowl',
  taza: 'taza', tazas: 'taza', cup: 'cup', cups: 'cup', vaso: 'vaso', vasos: 'vaso', glass: 'glass', glasses: 'glass',
  rebanada: 'rebanada', rebanadas: 'rebanada', rodaja: 'rodaja', rodajas: 'rodaja', feta: 'feta', fetas: 'feta', slice: 'slice', slices: 'slice',
  cucharada: 'tbsp', cucharadas: 'tbsp', tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  cucharadita: 'tsp', cucharaditas: 'tsp', tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  g: 'g', gramo: 'g', gramos: 'g', gram: 'g', grams: 'g',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  ml: 'ml'
};

function detectMealFromClause(clause: string): string | undefined {
  if (!clause) return undefined;
  if (/(?<=^|[^\p{L}\p{N}])(?:desayun[eéó]|desayuno|breakfast)(?=[^\p{L}\p{N}]|$)/iu.test(clause)) {
    return 'breakfast';
  }
  if (/(?<=^|[^\p{L}\p{N}])(?:almorc[eé]|almuerzo|lunch)(?=[^\p{L}\p{N}]|$)/iu.test(clause)) {
    return 'lunch';
  }
  if (/(?<=^|[^\p{L}\p{N}])(?:merend[eé]|merienda|snack|colaci[oó]n)(?=[^\p{L}\p{N}]|$)/iu.test(clause)) {
    return 'snack';
  }
  if (/(?<=^|[^\p{L}\p{N}])(?:cen[eéa]|dinner)(?=[^\p{L}\p{N}]|$)/iu.test(clause)) {
    return 'dinner';
  }
  return undefined;
}

export function parseClauseToMealItem(
  rawClause: string,
  defaultQty = 1,
  defaultUnit = 'unit',
  inheritedMealType?: string
): ParsedMealItem | null {
  if (!rawClause || !rawClause.trim()) return null;

  // 1. Detect meal category from clause
  const detectedMeal = detectMealFromClause(rawClause);
  const effectiveMealType = detectedMeal || inheritedMealType;

  // 2. Strip meal verbs and time phrases (Spanish + English)
  const mealVerbsAndTimeRegex =
    /(?<=^|[^\p{L}\p{N}])(?:en la cena|en el almuerzo|en el desayuno|en la merienda|para la cena|para el almuerzo|para el desayuno|para la merienda|para cenar|para almorzar|para desayunar|para merendar|for breakfast|for lunch|for dinner|for a snack|for snack|at breakfast|at lunch|at dinner|in the morning|in the afternoon|in the evening|at night|i ate|i had|i drank|i consumed|he comido|he cenado|he almorzado|he desayunado|desayun[eéó]|desayuno|almorc[eé]|almuerzo|cen[eé]|cena|merend[eé]|merienda|com[ií]|tom[eé]|beb[ií]|ate|had|drank|eaten|breakfast|lunch|dinner|snack|ayer|hoy|yesterday|today)(?=[^\p{L}\p{N}]|$)/giu;

  let cleaned = rawClause.replace(mealVerbsAndTimeRegex, ' ').replace(/\s+/g, ' ').trim();
  cleaned = cleaned
    .replace(/^(?:en|para|por|for|at|in|on)\s+/i, '')
    .replace(/\s+(?:en|para|por|for|at|in|on)$/i, '')
    .trim();

  if (!cleaned) {
    cleaned = rawClause.trim();
  }

  // 3. Parse leading quantities and units
  const numPattern = '(?:\\d+(?:[.,]\\d+)?|un|una|uno|one|a|an|dos|two|couple|par|tres|three|cuatro|four|cinco|five|seis|six|siete|seven|ocho|eight|nueve|nine|diez|ten|media|medio|half)';
  const unitPattern = '(?:unidad(?:es)?|pieza(?:s)?|porci[oó]n(?:es)?|plato(?:s)?|taza(?:s)?|rebanada(?:s)?|rodaja(?:s)?|feta(?:s)?|vaso(?:s)?|cucharada(?:s)?|cucharadita(?:s)?|gramos?|g|ml|oz|unit(?:s)?|piece(?:s)?|slice(?:s)?|portion(?:s)?|plate(?:s)?|bowl(?:s)?|cup(?:s)?|glass(?:es)?|serving(?:s)?|tbsp|tsp|tablespoon(?:s)?|teaspoon(?:s)?|grams?)';

  const qtyUnitRegex = new RegExp(`^(${numPattern})\\s+(${unitPattern})\\s*(?:de\\s+|of\\s+)?(.+)$`, 'i');
  const qtyOnlyRegex = new RegExp(`^(${numPattern})\\s*(?:de\\s+|of\\s+)?(.+)$`, 'i');

  let foodQuery = cleaned;
  let quantity = defaultQty;
  let unit = defaultUnit;

  const matchQtyUnit = cleaned.match(qtyUnitRegex);
  if (matchQtyUnit) {
    const rawNum = matchQtyUnit[1].toLowerCase();
    const rawUnit = matchQtyUnit[2].toLowerCase();
    const rest = matchQtyUnit[3].trim();

    if (rest) {
      if (rawNum in NUMBER_WORDS) {
        quantity = NUMBER_WORDS[rawNum];
      } else {
        const parsed = parseFloat(rawNum.replace(',', '.'));
        if (!isNaN(parsed) && parsed > 0) quantity = parsed;
      }
      unit = CANONICAL_UNITS[rawUnit] || rawUnit;
      foodQuery = rest;
    }
  } else {
    const matchQtyOnly = cleaned.match(qtyOnlyRegex);
    if (matchQtyOnly) {
      const rawNum = matchQtyOnly[1].toLowerCase();
      const rest = matchQtyOnly[2].trim();

      if (rest) {
        let parsedNum = 0;
        if (rawNum in NUMBER_WORDS) {
          parsedNum = NUMBER_WORDS[rawNum];
        } else {
          const parsed = parseFloat(rawNum.replace(',', '.'));
          if (!isNaN(parsed) && parsed > 0) parsedNum = parsed;
        }

        if (parsedNum > 0) {
          quantity = parsedNum;
          foodQuery = rest;
          unit = defaultUnit || 'unit';
        }
      }
    }
  }

  foodQuery = foodQuery.replace(/^(?:de|of)\s+/i, '').trim();
  if (!foodQuery) return null;

  const normFood = foodQuery.toLowerCase().trim();
  if (
    normFood in NUMBER_WORDS ||
    normFood in CANONICAL_UNITS ||
    /^(?:y|and|e|con|with|de|of|del|la|el|los|las|the|un|una|uno|medio|media|for|in|at|on)$/i.test(normFood)
  ) {
    return null;
  }

  return {
    foodQuery,
    quantity: quantity > 0 ? quantity : 1,
    unit: unit || 'unit',
    ...(effectiveMealType ? { mealType: effectiveMealType } : {})
  };
}

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

    // Check if food contains connectors or commas
    const hasDelimiters = /,|(?:\s+(?:y|e|and|\+|con|with)\s+)/i.test(rawFood);
    if (!hasDelimiters) {
      result.push(item);
      continue;
    }

    // Protect inseparable compounds and seasonings before splitting
    const placeholders: string[] = [];
    let masked = rawFood;

    // Mask inseparable compounds
    for (const compound of INSEPARABLE_COMPOUNDS) {
      const idx = masked.toLowerCase().indexOf(compound.toLowerCase());
      if (idx !== -1) {
        const originalText = masked.slice(idx, idx + compound.length);
        const placeholder = `__INSEP_${placeholders.length}__`;
        placeholders.push(originalText);
        masked = masked.slice(0, idx) + placeholder + masked.slice(idx + compound.length);
      }
    }

    // Mask seasonings following con/with (e.g., con sal, with salt, with sugar)
    const seasoningRegex = /\s+(?:con|with)\s+(?:sal|azucar|azúcar|edulcorante|edulcorantes|hielo|gas|salt|sugar|sweetener|sweeteners|stevia|ice|sparkling|lemon|pepper)\b/gi;
    masked = masked.replace(seasoningRegex, match => {
      const placeholder = `__SEASONING_${placeholders.length}__`;
      placeholders.push(match);
      return placeholder;
    });

    // Split across delimiters
    const delimiterRegex = /,\s*|\s+(?:y|e|and|\+|con|with)\s+/gi;
    const rawSegments = masked.split(delimiterRegex).map(s => s.trim()).filter(Boolean);

    if (rawSegments.length <= 1) {
      result.push(item);
      continue;
    }

    // Restore placeholders on all segments first and detect per-segment meal types
    const restoredSegments = rawSegments.map(seg => {
      let restored = seg;
      for (let pIdx = placeholders.length - 1; pIdx >= 0; pIdx--) {
        restored = restored.replace(new RegExp(`__INSEP_${pIdx}__|__SEASONING_${pIdx}__`, 'g'), placeholders[pIdx]);
      }
      return restored;
    });

    const segMeals = restoredSegments.map(seg => detectMealFromClause(seg));

    let runningMealType: string | undefined = undefined;

    for (let i = 0; i < restoredSegments.length; i++) {
      const segment = restoredSegments[i];
      if (segMeals[i]) {
        runningMealType = segMeals[i];
      }

      // If no meal type seen yet on or before segment i, look ahead to the next segment with an explicit meal marker
      // (Handles English suffix grammar: "I had toast and eggs for breakfast, and cheese for dinner"
      //  as well as trailing list meal markers: "comí queso, pan y mora en la cena")
      let lookaheadMealType: string | undefined = undefined;
      if (!runningMealType) {
        for (let j = i + 1; j < segMeals.length; j++) {
          if (segMeals[j]) {
            lookaheadMealType = segMeals[j];
            break;
          }
        }
      }

      const effectiveSegMeal = runningMealType || lookaheadMealType || item.mealType;

      const defaultQty = (i === 0 && item.quantity > 0) ? item.quantity : 1;
      let defaultUnit = item.unit || 'unit';
      if (i === 0) {
        if (/^(?:plato|plate|portion|porci[oó]n)$/i.test(item.unit)) {
          defaultUnit = 'unit';
        }
      } else {
        defaultUnit = 'portion';
      }

      const parsedSeg = parseClauseToMealItem(segment, defaultQty, defaultUnit, effectiveSegMeal);
      if (parsedSeg) {
        result.push(parsedSeg);
      }
    }
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

  // Handle plain string representation
  if (typeof raw === 'string') {
    return parseClauseToMealItem(raw, 1, 'unit');
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

  const rawMealType = raw.meal_type || raw.mealType;

  // Clean rawFood through parseClauseToMealItem to handle leading verbs or embedded quantities
  const parsedFood = parseClauseToMealItem(rawFood, quantity, unit, rawMealType);
  if (!parsedFood) {
    return null;
  }

  let finalQty = quantity;
  let finalUnit = unit;
  if (parsedFood.quantity > 1 && (rawQty === undefined || quantity <= 1)) {
    finalQty = parsedFood.quantity;
    finalUnit = parsedFood.unit;
  }

  const mealType = parsedFood.mealType || (typeof rawMealType === 'string' && rawMealType.trim() ? rawMealType.trim().toLowerCase() : undefined);

  return {
    foodQuery: parsedFood.foodQuery,
    quantity: finalQty,
    unit: finalUnit,
    ...(candidateId ? { candidateId } : {}),
    ...(mealType ? { mealType } : {})
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
    : rawLines.filter(
        l =>
          !/^(?:he\s+registrado|registrado|aqu[ií]\s+tienes|estos\s+son|i\s+have\s+logged|i\s+logged|logged|here\s+are|these\s+are)/i.test(l) &&
          !l.endsWith(':')
      );

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

    let finalItems: ParsedMealItem[] = [];

    if (rawItems.length > 0) {
      const normalizedItems: ParsedMealItem[] = rawItems
        .map(normalizeMealItem)
        .filter((item): item is ParsedMealItem => item !== null);
      finalItems = splitCompoundMealItems(normalizedItems);
    } else if (response.content && typeof response.content === 'string') {
      finalItems = extractItemsFromPlainText(response.content);
    }

    if (finalItems.length === 0 && input.trim()) {
      finalItems = extractItemsFromPlainText(input);
    }

    // Reconcile multi-clause inputs against deterministic clause extraction:
    // 1. Add any missing items if input contains multiple clauses that the LLM missed
    // 2. Backfill per-item mealType or explicit non-1 clause quantities if the LLM dropped them
    const inputExtractedItems = splitCompoundMealItems([{ foodQuery: input, quantity: 1, unit: 'unit' }]);
    if (inputExtractedItems.length >= 2) {
      const normalizeStr = (s: string) =>
        (s || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();

      const distinctInputMeals = new Set(inputExtractedItems.map(i => i.mealType).filter(Boolean));

      for (const inputItem of inputExtractedItems) {
        const normInputName = normalizeStr(inputItem.foodQuery);
        if (!normInputName) continue;

        const matchingItem = finalItems.find(it => {
          const existing = normalizeStr(it.foodQuery);
          return existing && (existing === normInputName || existing.includes(normInputName) || normInputName.includes(existing));
        });

        if (matchingItem) {
          if (distinctInputMeals.size > 1 && !matchingItem.mealType && inputItem.mealType) {
            matchingItem.mealType = inputItem.mealType;
          }
          if (inputItem.quantity !== 1 && matchingItem.quantity === 1) {
            matchingItem.quantity = inputItem.quantity;
            if (inputItem.unit && inputItem.unit !== 'unit') {
              matchingItem.unit = inputItem.unit;
            }
          }
        } else if (inputExtractedItems.length > finalItems.length) {
          finalItems.push(inputItem);
        }
      }
    }

    const itemMealTypes = new Set(finalItems.map(it => it.mealType).filter(Boolean));
    const isSingleMeal = itemMealTypes.size <= 1;
    const hasListSeparators = /,|;|\b(?:y|e|and|\+)\b/i.test(input);
    const hasConConnector = /\b(?:con|with)\b/i.test(input);
    const isCompositeDish = isSingleMeal && !hasListSeparators && (
      Boolean(compositeDishName && compositeDishName.trim().length > 0) ||
      (hasConConnector && finalItems.length > 1)
    );

    return {
      rawInput: input,
      items: finalItems,
      isCompositeDish,
      ...(detectedMealType ? { detectedMealType } : {}),
      ...(compositeDishName ? { compositeDishName } : {})
    };
  }
}
