import type {
  BaseIngredient,
  Portion,
  FoodItem,
  RecipeFoodItem,
  MealType,
  MacroSnapshot
} from '../types.js';
import { CatalogSearchManager, type ICatalogProvider } from './CatalogSearchManager.js';
import { PortionManager, type TaggedPortion } from './PortionManager.js';
import { convertPortionToGrams, calculateItemMacros, createMacroSnapshot } from '../calculations/index.js';

export interface RawParsedAiItem {
  foodQuery: string;
  quantity: number;
  unit: string;
}

export interface ResolvedAiMealItem {
  id: string;
  rawQuery: string;
  food: FoodItem | null;
  quantity: number;
  selectedPortionName: string;
  availablePortions: TaggedPortion[];
  calculatedWeightGrams: number;
  macros: MacroSnapshot;
  unmatched: boolean;
}

export interface ResolvedAiBatchMeal {
  rawInput: string;
  detectedMealType: MealType;
  items: ResolvedAiMealItem[];
  totalMacros: MacroSnapshot;
}

export interface BatchAiMealOptions {
  rawInput: string;
  rawItems: RawParsedAiItem[];
  customIngredients: BaseIngredient[];
  customRecipes?: RecipeFoodItem[];
  customPortions?: Portion[];
  catalogProvider?: ICatalogProvider;
  currentHour?: number;
  detectedMealType?: MealType | string;
}

/**
 * Normalizes an explicit LLM-detected meal string into a typed MealType.
 */
export function normalizeMealType(raw?: string): MealType | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (/breakfast|desayun/i.test(lower)) return 'meal_breakfast';
  if (/lunch|almuerz|almorc/i.test(lower)) return 'meal_lunch';
  if (/dinner|cen/i.test(lower)) return 'meal_dinner';
  if (/snack|meriend|merend|colaci[oó]n/i.test(lower)) return 'meal_snack';
  if (lower === 'meal_breakfast' || lower === 'meal_lunch' || lower === 'meal_dinner' || lower === 'meal_snack') {
    return lower as MealType;
  }
  return null;
}

/**
 * Detects target meal type from natural language keywords or falls back to time of day.
 */
export function detectMealTypeFromText(text: string, currentHour?: number): MealType {
  const lower = (text || '').toLowerCase();

  if (/(desayun|breakfast)/i.test(lower)) return 'meal_breakfast';
  if (/(almuerz|almorc|lunch)/i.test(lower)) return 'meal_lunch';
  if (/(meriend|merend|snack|colaci[oó]n|t[eé])/i.test(lower)) return 'meal_snack';
  if (/(cen[aáeé]|dinner)/i.test(lower)) return 'meal_dinner';

  const hour = currentHour !== undefined ? currentHour : new Date().getHours();
  if (hour >= 5 && hour < 12) return 'meal_breakfast';
  if (hour >= 12 && hour < 17) return 'meal_lunch';
  if (hour >= 17 && hour < 20) return 'meal_snack';
  return 'meal_dinner';
}

/**
 * Intelligently matches an LLM-extracted unit name against domestic portion definitions.
 */
export function matchPortionUnit(unit: string, availablePortions: TaggedPortion[]): string {
  const norm = (unit || '').trim().toLowerCase();
  if (!norm || norm === 'g' || norm === 'gram' || norm === 'grams' || norm === 'gramo' || norm === 'gramos') {
    return 'g';
  }

  // Unit / piece / item
  if (
    norm === 'unit' ||
    norm === 'unidad' ||
    norm === 'unidades' ||
    norm === 'pieza' ||
    norm === 'piezas' ||
    norm === 'item' ||
    norm === 'items'
  ) {
    const match = availablePortions.find(p =>
      /unit|unidad|pieza|medium|mediana|chica|grande/i.test(p.name)
    );
    if (match) return match.name;
  }

  // Slice / feta / rodaja
  if (
    norm === 'slice' ||
    norm === 'rebanada' ||
    norm === 'rebanadas' ||
    norm === 'feta' ||
    norm === 'fetas' ||
    norm === 'rodaja' ||
    norm === 'rodajas'
  ) {
    const match = availablePortions.find(p =>
      /slice|rebanada|feta|rodaja/i.test(p.name)
    );
    if (match) return match.name;
  }

  // Cup / taza
  if (norm === 'cup' || norm === 'taza' || norm === 'tazas') {
    const match = availablePortions.find(p => /cup|taza/i.test(p.name));
    if (match) return match.name;
  }

  // Portion / plate / serving / plato
  if (
    norm === 'portion' ||
    norm === 'porción' ||
    norm === 'porcion' ||
    norm === 'plato' ||
    norm === 'plate' ||
    norm === 'serving'
  ) {
    const match = availablePortions.find(p =>
      /portion|porci[oó]n|plato|serving/i.test(p.name)
    );
    if (match) return match.name;
  }

  // Exact or partial name match in available portions
  const directMatch = availablePortions.find(
    p => p.name.toLowerCase().includes(norm) || norm.includes(p.name.toLowerCase())
  );
  if (directMatch) return directMatch.name;

  // Fallback: first domestic portion if available, else grams
  return availablePortions.length > 0 ? availablePortions[0].name : 'g';
}

/**
 * High-performance batch resolver for multi-item AI meal logs.
 */
export class BatchAiMealResolver {
  private readonly searchManager: CatalogSearchManager;
  private readonly portionManager: PortionManager;

  constructor(
    searchManager: CatalogSearchManager = new CatalogSearchManager(),
    portionManager: PortionManager = new PortionManager()
  ) {
    this.searchManager = searchManager;
    this.portionManager = portionManager;
  }

  /**
   * Resolves a collection of parsed meal entities in parallel, matches portions,
   * and computes individual and cumulative macro snapshots.
   */
  async resolveBatch(options: BatchAiMealOptions): Promise<ResolvedAiBatchMeal> {
    const {
      rawInput,
      rawItems,
      customIngredients,
      customRecipes = [],
      customPortions = [],
      catalogProvider,
      currentHour,
      detectedMealType: explicitMealType
    } = options;

    const detectedMealType =
      normalizeMealType(explicitMealType) || detectMealTypeFromText(rawInput, currentHour);

    const resolvedItems: ResolvedAiMealItem[] = await Promise.all(
      rawItems.map(async (item, idx) => {
        const itemId = `ai-item-${Date.now()}-${idx}`;
        const query = (item.foodQuery || '').trim();

        if (!query) {
          return {
            id: itemId,
            rawQuery: query,
            food: null,
            quantity: item.quantity > 0 ? item.quantity : 1,
            selectedPortionName: 'g',
            availablePortions: [],
            calculatedWeightGrams: 0,
            macros: { calories: 0, protein: 0, carbs: 0, fats: 0 },
            unmatched: true
          };
        }

        const match = await this.searchManager.resolveAiMatch(
          query,
          customIngredients,
          catalogProvider,
          customRecipes
        );

        if (!match) {
          return {
            id: itemId,
            rawQuery: query,
            food: null,
            quantity: item.quantity > 0 ? item.quantity : 1,
            selectedPortionName: item.unit || 'g',
            availablePortions: [],
            calculatedWeightGrams: 0,
            macros: { calories: 0, protein: 0, carbs: 0, fats: 0 },
            unmatched: true
          };
        }

        // Resolve portions for this matched food
        const availablePortions = await this.portionManager.resolvePortions({
          ingredient: match,
          customPortions,
          catalogProvider
        });

        // Ensure a unit/piece portion exists for discrete foods
        const hasUnitPortion = availablePortions.some(p =>
          /unit|unidad|pieza|medium|mediana|chica|grande|serving/i.test(p.name)
        );
        if (!hasUnitPortion) {
          availablePortions.unshift({
            id: `port-std-unit-${match.id}`,
            base_food_id: match.id,
            name: '1 unidad',
            equivalent_weight_g: 100,
            source: 'system',
            tag: 'Generic'
          });
        }

        const selectedPortionName = matchPortionUnit(item.unit, availablePortions);
        const quantity = item.quantity > 0 ? item.quantity : 1;
        const calculatedWeightGrams = convertPortionToGrams(
          quantity,
          selectedPortionName,
          availablePortions
        );
        const rawMacros = calculateItemMacros(match, calculatedWeightGrams);
        const macros = createMacroSnapshot(rawMacros);

        return {
          id: itemId,
          rawQuery: query,
          food: match,
          quantity,
          selectedPortionName,
          availablePortions,
          calculatedWeightGrams,
          macros,
          unmatched: false
        };
      })
    );

    // Compute cumulative total macros across all matched items
    let totalCals = 0;
    let totalProt = 0;
    let totalCarbs = 0;
    let totalFats = 0;

    for (const item of resolvedItems) {
      if (!item.unmatched) {
        totalCals += item.macros.calories;
        totalProt += item.macros.protein;
        totalCarbs += item.macros.carbs;
        totalFats += item.macros.fats;
      }
    }

    const totalMacros: MacroSnapshot = {
      calories: Math.round(totalCals * 10) / 10,
      protein: Math.round(totalProt * 10) / 10,
      carbs: Math.round(totalCarbs * 10) / 10,
      fats: Math.round(totalFats * 10) / 10
    };

    return {
      rawInput,
      detectedMealType,
      items: resolvedItems,
      totalMacros
    };
  }
}
