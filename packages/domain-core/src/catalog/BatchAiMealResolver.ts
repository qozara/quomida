import type {
  BaseIngredient,
  Portion,
  FoodItem,
  RecipeFoodItem,
  MealType,
  MacroSnapshot,
  Recipe,
  RecipeComponent
} from '../types.js';
import { CatalogSearchManager, type ICatalogProvider } from './CatalogSearchManager.js';
import { PortionManager, type TaggedPortion } from './PortionManager.js';
import { RecipeManager } from '../recipes/RecipeManager.js';
import { convertPortionToGrams, calculateItemMacros, createMacroSnapshot } from '../calculations/index.js';

export interface RawParsedAiItem {
  foodQuery: string;
  quantity: number;
  unit: string;
  candidateId?: string;
  canonicalName?: string;
  name?: string;
  mealType?: MealType | string;
}

export interface SynthesizedCompositeRecipe {
  recipe: Recipe;
  foodItem: RecipeFoodItem;
  isExistingDuplicate: boolean;
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
  mealType?: MealType;
  isAiDecomposed?: boolean;
}

export interface ResolvedAiBatchMeal {
  rawInput: string;
  detectedMealType: MealType;
  items: ResolvedAiMealItem[];
  totalMacros: MacroSnapshot;
  compositeDishName?: string;
  synthesizedRecipe?: SynthesizedCompositeRecipe;
  defaultLoggingMode?: 'recipe' | 'batch';
  isMultiMeal?: boolean;
  isAiDecomposed?: boolean;
  sourceDishName?: string;
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
  compositeDishName?: string;
  existingRecipes?: Recipe[];
  isCompositeDish?: boolean;
  locale?: string;
}

export type ResolveBatchOptions = BatchAiMealOptions;

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
  private readonly recipeManager: RecipeManager;

  constructor(
    searchManager: CatalogSearchManager = new CatalogSearchManager(),
    portionManager: PortionManager = new PortionManager(),
    recipeManager: RecipeManager = new RecipeManager()
  ) {
    this.searchManager = searchManager;
    this.portionManager = portionManager;
    this.recipeManager = recipeManager;
  }

  /**
   * Resolves a collection of parsed meal entities in parallel, matches portions,
   * computes individual and cumulative macro snapshots, and synthesizes composite recipes.
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
      detectedMealType: explicitMealType,
      compositeDishName,
      existingRecipes
    } = options;

    const detectedMealType =
      normalizeMealType(explicitMealType) || detectMealTypeFromText(rawInput, currentHour);

    const resolvedItems: ResolvedAiMealItem[] = await Promise.all(
      rawItems.map(async (item, idx) => {
        const itemId = `ai-item-${Date.now()}-${idx}`;
        const query = (item.foodQuery || '').trim();
        const itemMealType: MealType = normalizeMealType(item.mealType as string) || detectedMealType;

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
            unmatched: true,
            mealType: itemMealType
          };
        }

        let match: FoodItem | null = null;

        // 1. If candidateId is provided (grounded RAG), resolve directly against local sources or catalog provider
        if (item.candidateId) {
          const recipeMatch = customRecipes.find(r => r.id === item.candidateId);
          if (recipeMatch) {
            match = recipeMatch;
          } else {
            const customMatch = customIngredients.find(i => i.id === item.candidateId);
            if (customMatch) {
              match = { ...customMatch, kind: 'ingredient' };
            } else if (catalogProvider) {
              try {
                const searchStr = (item.canonicalName || item.name || query).trim();
                if (searchStr) {
                  const catalogResults = await catalogProvider.searchIngredients(searchStr, 10);
                  const found = catalogResults.find(c => c.id === item.candidateId);
                  if (found) {
                    match = { ...found, kind: 'ingredient' };
                  }
                }
              } catch (err) {
                console.error('[BatchAiMealResolver] Candidate provider lookup failed:', err);
              }
            }
          }
        }

        // 2. Fall back to fuzzy AI match resolution
        if (!match) {
          match = await this.searchManager.resolveAiMatch(
            query,
            customIngredients,
            catalogProvider,
            customRecipes
          );
        }

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
            unmatched: true,
            mealType: itemMealType
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

        const hasPortion = availablePortions.some(p =>
          /portion|porci[oó]n|plato/i.test(p.name)
        );
        if (!hasPortion) {
          availablePortions.push({
            id: `port-std-portion-${match.id}`,
            base_food_id: match.id,
            name: '1 porción',
            equivalent_weight_g: 150,
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
          unmatched: false,
          mealType: itemMealType
        };
      })
    );

    const totalMacros = this.computeTotalMacros(resolvedItems);

    const isMultiMeal = new Set(resolvedItems.map(i => i.mealType)).size > 1;

    const validItems = resolvedItems.filter(
      it => it.food !== null && !it.unmatched && it.calculatedWeightGrams > 0
    );

    const allExistingRecipes: Recipe[] =
      existingRecipes && existingRecipes.length > 0
        ? existingRecipes
        : customRecipes.map(r => r.recipe || {
            id: r.id,
            name: r.name,
            ingredients: (r as any).ingredients || [],
            yield_factor: r.yield_factor ?? 1.0,
            updatedAt: r.updatedAt
          });

    let synthesizedRecipe: SynthesizedCompositeRecipe | undefined;
    let defaultLoggingMode: 'recipe' | 'batch' = 'batch';

    if (isMultiMeal) {
      synthesizedRecipe = undefined;
      defaultLoggingMode = 'batch';
    } else if (validItems.length >= 2) {
      const effectiveLocale =
        options.locale ||
        (/\b(?:with|and|ate|had|for|breakfast|lunch|dinner|snack)\b/i.test(rawInput) ? 'en' : undefined);
      synthesizedRecipe = this.computeSynthesizedRecipe(
        resolvedItems,
        compositeDishName,
        allExistingRecipes,
        effectiveLocale
      );

      if (options.isCompositeDish !== undefined) {
        defaultLoggingMode = options.isCompositeDish ? 'recipe' : 'batch';
      } else if (compositeDishName && compositeDishName.trim().length > 0) {
        defaultLoggingMode = 'recipe';
      } else {
        const hasConWith = /\b(?:con|with)\b/i.test(rawInput);
        const hasSeparators = /,|\b(?:y|e|and|\+)\b/i.test(rawInput);
        const mealVerbsCount = (rawInput.match(/(?<=^|[^\p{L}\p{N}])(?:desayun[eéó]|desayuno|almorc[eé]|almuerzo|cen[eé]|cena|merend[eé]|merienda|breakfast|lunch|dinner|snack)(?=[^\p{L}\p{N}]|$)/giu) || []).length;
        if (hasConWith && !hasSeparators && mealVerbsCount <= 1) {
          defaultLoggingMode = 'recipe';
        } else {
          defaultLoggingMode = 'batch';
        }
      }
    } else {
      synthesizedRecipe = undefined;
      defaultLoggingMode = 'batch';
    }

    return {
      rawInput,
      detectedMealType,
      items: resolvedItems,
      totalMacros,
      compositeDishName,
      synthesizedRecipe,
      defaultLoggingMode,
      isMultiMeal
    };
  }

  /**
   * Synthesizes a composite Recipe proposal when >= 2 items resolve to valid foods,
   * checking existing recipes for nutritional and component equivalence.
   */
  computeSynthesizedRecipe(
    items: ResolvedAiMealItem[],
    compositeDishName?: string,
    existingRecipes: Recipe[] = [],
    locale?: string
  ): SynthesizedCompositeRecipe | undefined {
    const validItems = items.filter(
      it => it.food !== null && !it.unmatched && it.calculatedWeightGrams > 0
    );

    if (validItems.length < 2) {
      return undefined;
    }

    const isEn =
      (locale && locale.toLowerCase().startsWith('en')) ||
      (!locale && validItems.every(it => (it.food as any)?.lang === 'en'));

    let dishName = '';
    if (compositeDishName && compositeDishName.trim()) {
      const trimmed = compositeDishName.trim();
      dishName = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    } else {
      const foodNames = validItems.map(it => it.food!.name);
      const pairConnector = isEn ? ' with ' : ' con ';
      const listConnector = isEn ? ' and ' : ' y ';
      if (foodNames.length === 2) {
        dishName = `${foodNames[0]}${pairConnector}${foodNames[1]}`;
      } else {
        const allButLast = foodNames.slice(0, -1).join(', ');
        dishName = `${allButLast}${listConnector}${foodNames[foodNames.length - 1]}`;
      }
      dishName = dishName.charAt(0).toUpperCase() + dishName.slice(1);
    }

    const components: RecipeComponent[] = validItems.map(it =>
      this.recipeManager.buildComponent(
        it.food!,
        it.calculatedWeightGrams,
        { quantity: it.quantity, portionName: it.selectedPortionName }
      )
    );

    const candidateRecipe = this.recipeManager.createRecipe({
      name: dishName,
      ingredients: components
    });

    const existingMatch = this.recipeManager.findEquivalentRecipe(candidateRecipe, existingRecipes);
    if (existingMatch) {
      return {
        recipe: existingMatch,
        foodItem: this.recipeManager.toFoodItem(existingMatch),
        isExistingDuplicate: true
      };
    }

    return {
      recipe: candidateRecipe,
      foodItem: this.recipeManager.toFoodItem(candidateRecipe),
      isExistingDuplicate: false
    };
  }

  /**
   * Recalculates an item in a resolved batch and re-evaluates auto-recipe synthesis.
   */
  recalculateItem(
    meal: ResolvedAiBatchMeal,
    itemId: string,
    updates: { quantity?: number; portionName?: string },
    options?: {
      customRecipes?: RecipeFoodItem[];
      existingRecipes?: Recipe[];
      compositeDishName?: string;
    }
  ): ResolvedAiBatchMeal {
    const updatedItems = meal.items.map(it => {
      if (it.id !== itemId || it.unmatched || !it.food) return it;

      let targetQty = updates.quantity !== undefined ? updates.quantity : it.quantity;
      const newPortionName = updates.portionName || it.selectedPortionName;

      if (newPortionName === 'g' && targetQty === 1) {
        targetQty = 100;
      } else if (it.selectedPortionName === 'g' && newPortionName !== 'g' && targetQty >= 50) {
        targetQty = 1;
      }

      const weightGrams = convertPortionToGrams(
        targetQty,
        newPortionName,
        it.availablePortions
      );
      const rawMacros = calculateItemMacros(it.food, weightGrams);
      return {
        ...it,
        selectedPortionName: newPortionName,
        quantity: targetQty,
        calculatedWeightGrams: weightGrams,
        macros: createMacroSnapshot(rawMacros)
      };
    });

    const totalMacros = this.computeTotalMacros(updatedItems);

    const allExisting =
      options?.existingRecipes && options.existingRecipes.length > 0
        ? options.existingRecipes
        : (options?.customRecipes || []).map(r => r.recipe || {
            id: r.id,
            name: r.name,
            ingredients: (r as any).ingredients || [],
            yield_factor: r.yield_factor ?? 1.0,
            updatedAt: r.updatedAt
          });

    const compositeDishName = options?.compositeDishName ?? meal.compositeDishName;
    const synthesizedRecipe = meal.isMultiMeal
      ? undefined
      : this.computeSynthesizedRecipe(
          updatedItems,
          compositeDishName,
          allExisting
        );

    return {
      ...meal,
      items: updatedItems,
      totalMacros,
      compositeDishName,
      synthesizedRecipe
    };
  }

  /**
   * Swaps the food of an item in a resolved batch and re-evaluates auto-recipe synthesis.
   */
  swapItemFood(
    meal: ResolvedAiBatchMeal,
    itemId: string,
    newFood: FoodItem | BaseIngredient,
    availablePortions: TaggedPortion[] = [],
    options?: {
      quantity?: number;
      portionName?: string;
      customRecipes?: RecipeFoodItem[];
      existingRecipes?: Recipe[];
      compositeDishName?: string;
    }
  ): ResolvedAiBatchMeal {
    const normalizedFood: FoodItem = 'kind' in newFood ? newFood : { ...newFood, kind: 'ingredient' };

    const updatedItems = meal.items.map(it => {
      if (it.id !== itemId) return it;

      const portions = availablePortions.length > 0 ? availablePortions : it.availablePortions;
      const selectedPortionName = matchPortionUnit(
        options?.portionName ?? it.selectedPortionName,
        portions
      );
      const quantity =
        options?.quantity !== undefined && options.quantity > 0
          ? options.quantity
          : it.quantity > 0
            ? it.quantity
            : 1;

      const weightGrams = convertPortionToGrams(quantity, selectedPortionName, portions);
      const rawMacros = calculateItemMacros(normalizedFood, weightGrams);

      return {
        ...it,
        food: normalizedFood,
        unmatched: false,
        availablePortions: portions,
        selectedPortionName,
        quantity,
        calculatedWeightGrams: weightGrams,
        macros: createMacroSnapshot(rawMacros)
      };
    });

    const totalMacros = this.computeTotalMacros(updatedItems);

    const allExisting =
      options?.existingRecipes && options.existingRecipes.length > 0
        ? options.existingRecipes
        : (options?.customRecipes || []).map(r => r.recipe || {
            id: r.id,
            name: r.name,
            ingredients: (r as any).ingredients || [],
            yield_factor: r.yield_factor ?? 1.0,
            updatedAt: r.updatedAt
          });

    const compositeDishName = options?.compositeDishName ?? meal.compositeDishName;
    const synthesizedRecipe = meal.isMultiMeal
      ? undefined
      : this.computeSynthesizedRecipe(
          updatedItems,
          compositeDishName,
          allExisting
        );

    return {
      ...meal,
      items: updatedItems,
      totalMacros,
      compositeDishName,
      synthesizedRecipe
    };
  }

  private computeTotalMacros(items: ResolvedAiMealItem[]): MacroSnapshot {
    let totalCals = 0;
    let totalProt = 0;
    let totalCarbs = 0;
    let totalFats = 0;

    for (const item of items) {
      if (!item.unmatched) {
        totalCals += item.macros.calories;
        totalProt += item.macros.protein;
        totalCarbs += item.macros.carbs;
        totalFats += item.macros.fats;
      }
    }

    return {
      calories: Math.round(totalCals * 10) / 10,
      protein: Math.round(totalProt * 10) / 10,
      carbs: Math.round(totalCarbs * 10) / 10,
      fats: Math.round(totalFats * 10) / 10
    };
  }
}
