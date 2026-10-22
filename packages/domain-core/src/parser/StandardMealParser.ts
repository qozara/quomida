import type {
  ParserLocalePack,
  ParsedMealItem,
  ParsedNaturalLanguageMeal,
  MealParserOptions
} from './types.js';
import { esLocalePack } from './locales/es.js';
import { enLocalePack } from './locales/en.js';

export class StandardMealParser {
  private readonly packs = new Map<string, ParserLocalePack>();

  constructor(defaultPacks: ParserLocalePack[] = [esLocalePack, enLocalePack]) {
    for (const pack of defaultPacks) {
      this.registerLocalePack(pack);
    }
  }

  registerLocalePack(pack: ParserLocalePack): void {
    const key = pack.locale.toLowerCase().split('-')[0];
    this.packs.set(key, pack);
  }

  private resolvePack(input: string, options?: MealParserOptions): ParserLocalePack {
    const reqKey = (options?.locale || options?.fallbackLocale || 'es').toLowerCase().split('-')[0];
    const configuredPack = this.packs.get(reqKey) || this.packs.get('es') || esLocalePack;

    // Heuristic detection: if user input clearly belongs to another registered language
    // (e.g. user has app in Spanish but logs "2 slices of pizza for dinner")
    const lower = input.toLowerCase();
    for (const [key, pack] of this.packs.entries()) {
      if (key === reqKey) continue;
      // Check if English keywords appear in Spanish setting
      if (key === 'en' && /\b(?:for\s+(?:breakfast|lunch|dinner|snack)|slices?\s+of|i\s+ate|i\s+had|with|and)\b/i.test(lower)) {
        return pack;
      }
      // Check if Spanish keywords appear in English setting
      if (key === 'es' && /\b(?:para\s+(?:el\s+almuerzo|la\s+cena|el\s+desayuno)|platos?\s+de|porci[oó]n|cen[eé]|almorc[eé]|desayun[eé]|con|y)\b/i.test(lower)) {
        return pack;
      }
    }

    return configuredPack;
  }

  parse(rawInput: string, options?: MealParserOptions): ParsedNaturalLanguageMeal {
    if (!rawInput || !rawInput.trim()) {
      return { rawInput: rawInput || '', items: [] };
    }

    const trimmed = rawInput.trim();
    const pack = this.resolvePack(trimmed, options);

    // 1. Inseparable compounds masking
    const placeholders: string[] = [];
    let masked = trimmed;

    // Check all registered inseparable compounds (union for safety)
    const allInseparables: string[] = [];
    for (const p of this.packs.values()) {
      for (const item of p.inseparableCompounds) {
        allInseparables.push(item);
      }
    }

    // Sort descending by length to mask longer phrases first
    allInseparables.sort((a, b) => b.length - a.length);

    for (const compound of allInseparables) {
      const idx = masked.toLowerCase().indexOf(compound.toLowerCase());
      if (idx !== -1) {
        const originalText = masked.slice(idx, idx + compound.length);
        const placeholder = `__INSEP_${placeholders.length}__`;
        placeholders.push(originalText);
        masked = masked.slice(0, idx) + placeholder + masked.slice(idx + compound.length);
      }
    }

    // 2. Seasoning masking (e.g., "con sal", "with salt")
    const seasoningRegex = /\s+(?:con|with)\s+(?:sal|azucar|azúcar|edulcorante|edulcorantes|hielo|gas|salt|sugar|sweetener|sweeteners|stevia|ice|sparkling|lemon|pepper)\b/gi;
    masked = masked.replace(seasoningRegex, match => {
      const placeholder = `__SEASONING_${placeholders.length}__`;
      placeholders.push(match);
      return placeholder;
    });

    // 3. Detect overall meal type
    const detectedMealType = pack.detectMealFromClause(trimmed);

    // 4. Split by delimiters
    // Delimiter regex covers commas, "y", "and", "e", "+", "con", "with"
    const delimiterRegex = /,\s*|\s+(?:y|e|and|\+|con|with)\s+/gi;
    const rawSegments = masked.split(delimiterRegex).map(s => s.trim()).filter(Boolean);

    // Restore placeholders helper
    const restore = (text: string): string => {
      let res = text;
      for (let i = placeholders.length - 1; i >= 0; i--) {
        res = res.replace(new RegExp(`__INSEP_${i}__|__SEASONING_${i}__`, 'g'), placeholders[i]);
      }
      return res;
    };

    const restoredSegments = rawSegments.map(restore);
    const segMeals = restoredSegments.map(seg => pack.detectMealFromClause(seg));

    const items: ParsedMealItem[] = [];
    let runningMealType = detectedMealType;

    for (let i = 0; i < restoredSegments.length; i++) {
      const segment = restoredSegments[i];
      if (segMeals[i]) {
        runningMealType = segMeals[i];
      }

      // Lookahead if needed
      let lookaheadMealType: string | undefined = undefined;
      if (!runningMealType) {
        for (let j = i + 1; j < segMeals.length; j++) {
          if (segMeals[j]) {
            lookaheadMealType = segMeals[j];
            break;
          }
        }
      }

      const effectiveMealType = runningMealType || lookaheadMealType || detectedMealType;
      const defaultQty = 1;
      const defaultUnit = i === 0 ? 'unit' : 'portion';

      const parsedItem = this.parseSegment(segment, pack, defaultQty, defaultUnit, effectiveMealType);
      if (parsedItem) {
        items.push(parsedItem);
      }
    }

    // 5. Determine if composite dish (e.g. "milanesa con puré")
    const itemMealTypes = new Set(items.map(it => it.mealType).filter(Boolean));
    const isSingleMeal = itemMealTypes.size <= 1;
    const hasConConnector = /\b(?:con|with)\b/i.test(trimmed);
    const hasListSeparators = /[,;]|\b(?:y|e|and|\+)\b/i.test(trimmed);

    const isCompositeDish = isSingleMeal && hasConConnector && !hasListSeparators && items.length > 1;

    return {
      rawInput: rawInput,
      items,
      isCompositeDish,
      ...(detectedMealType ? { detectedMealType } : {})
    };
  }

  private parseSegment(
    rawClause: string,
    pack: ParserLocalePack,
    defaultQty: number,
    defaultUnit: string,
    mealType?: string
  ): ParsedMealItem | null {
    if (!rawClause || !rawClause.trim()) return null;

    // Strip meal verbs and time markers
    let cleaned = rawClause.replace(pack.mealVerbsAndTimeRegex, ' ').replace(/\s+/g, ' ').trim();
    cleaned = cleaned
      .replace(/^(?:en|para|por|for|at|in|on)\s+/i, '')
      .replace(/\s+(?:en|para|por|for|at|in|on)$/i, '')
      .trim();

    if (!cleaned) {
      cleaned = rawClause.trim();
    }

    // Handle phrases like "half an apple", "media de una manzana"
    cleaned = cleaned.replace(/^(?:half\s+(?:an?|the)|media\s+(?:una?|la)|medio\s+(?:un?|el))\s+/i, match => {
      return match.toLowerCase().startsWith('half') ? 'half ' : (match.toLowerCase().startsWith('media') ? 'media ' : 'medio ');
    });

    // Build regex patterns from pack dictionaries sorted descending by length
    const numWords = Object.keys(pack.numberWords)
      .sort((a, b) => b.length - a.length)
      .join('|');
    const numPattern = `(?:\\d+(?:[.,]\\d+)?|${numWords})`;

    // Unit patterns from canonicalUnits sorted descending by length
    const unitWords = Object.keys(pack.canonicalUnits)
      .sort((a, b) => b.length - a.length)
      .join('|');
    const unitPattern = `(?:${unitWords})`;

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
        if (rawNum in pack.numberWords) {
          quantity = pack.numberWords[rawNum];
        } else {
          const parsed = parseFloat(rawNum.replace(',', '.'));
          if (!isNaN(parsed) && parsed > 0) quantity = parsed;
        }
        unit = pack.canonicalUnits[rawUnit] || rawUnit;
        foodQuery = rest;
      }
    } else {
      const matchQtyOnly = cleaned.match(qtyOnlyRegex);
      if (matchQtyOnly) {
        const rawNum = matchQtyOnly[1].toLowerCase();
        const rest = matchQtyOnly[2].trim();

        if (rest) {
          let parsedNum = 0;
          if (rawNum in pack.numberWords) {
            parsedNum = pack.numberWords[rawNum];
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

    foodQuery = foodQuery.replace(/^(?:de|of|a|an|the|el|la|los|las|un|una|uno)\s+/i, '').trim();
    if (!foodQuery) return null;

    const normFood = foodQuery.toLowerCase().trim();
    if (
      normFood in pack.numberWords ||
      normFood in pack.canonicalUnits ||
      pack.stopWords.has(normFood)
    ) {
      return null;
    }

    return {
      foodQuery,
      quantity: quantity > 0 ? quantity : 1,
      unit: unit || 'unit',
      ...(mealType ? { mealType } : {})
    };
  }
}
