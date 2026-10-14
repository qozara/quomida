import type {
  BaseIngredient,
  Portion,
  FoodItem,
  RecipeFoodItem,
  FoodKind
} from '../types.js';

export interface ICatalogProvider {
  searchIngredients(query: string, limit?: number): Promise<BaseIngredient[]>;
  getPortionsForIngredient(baseFoodId: string): Promise<Portion[]>;
}

export interface FoodSearchOptions {
  query: string;
  customIngredients?: BaseIngredient[];
  customRecipes?: RecipeFoodItem[];
  kinds?: FoodKind[];
  limit?: number;
}

export interface UnifiedSearchResult {
  items: FoodItem[];
  recipeCount: number;
  customCount: number;
  catalogCount: number;
}

export function normalizeFoodName(name: string): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export class CatalogSearchManager {
  /**
   * Unifies and deduplicates searches across recipes, custom ingredients, and the system catalog provider.
   * Order of precedence: Recipes -> Custom Ingredients -> System Catalog.
   */
  async search(
    options: FoodSearchOptions,
    catalogProvider?: ICatalogProvider
  ): Promise<UnifiedSearchResult> {
    const rawQuery = options.query.trim();
    if (!rawQuery) {
      return { items: [], recipeCount: 0, customCount: 0, catalogCount: 0 };
    }
    const normQuery = normalizeFoodName(rawQuery);
    const limit = options.limit || 30;
    const allowedKinds = new Set<FoodKind>(options.kinds || ['ingredient', 'recipe']);

    // 1. Filter local custom recipes
    let recipeMatches: RecipeFoodItem[] = [];
    if (allowedKinds.has('recipe') && options.customRecipes) {
      recipeMatches = options.customRecipes.filter(r =>
        normalizeFoodName(r.name).includes(normQuery)
      );
    }

    // 2. Filter local custom in-memory ingredients
    let customMatches: BaseIngredient[] = [];
    if (allowedKinds.has('ingredient') && options.customIngredients) {
      customMatches = options.customIngredients.filter(item =>
        normalizeFoodName(item.name).includes(normQuery)
      );
    }

    // 3. Query catalog provider if allowed and provided
    let catalogMatches: BaseIngredient[] = [];
    if (allowedKinds.has('ingredient') && catalogProvider) {
      try {
        catalogMatches = await catalogProvider.searchIngredients(rawQuery, limit);
      } catch (err) {
        console.error('[CatalogSearchManager] Provider search failed:', err);
      }
    }

    // 4. Merge, prioritize, and deduplicate
    const merged = this.mergeAndDeduplicate(recipeMatches, customMatches, catalogMatches, limit);

    return {
      items: merged,
      recipeCount: recipeMatches.length,
      customCount: customMatches.length,
      catalogCount: catalogMatches.length
    };
  }

  /**
   * Resolves a natural-language AI food query by checking custom recipes first,
   * then custom ingredients, then querying the catalog provider.
   */
  async resolveAiMatch(
    foodQuery: string,
    customIngredients: BaseIngredient[],
    catalogProvider?: ICatalogProvider,
    customRecipes?: RecipeFoodItem[]
  ): Promise<FoodItem | null> {
    const normQuery = normalizeFoodName(foodQuery);
    if (!normQuery) return null;

    // 1. Check custom recipes
    if (customRecipes && customRecipes.length > 0) {
      const recipeMatch = customRecipes.find(r =>
        normalizeFoodName(r.name).includes(normQuery)
      );
      if (recipeMatch) return recipeMatch;
    }

    // 2. Check custom ingredients
    const customMatch = customIngredients.find(item =>
      normalizeFoodName(item.name).includes(normQuery)
    );
    if (customMatch) {
      return { ...customMatch, kind: 'ingredient' };
    }

    // 3. Query catalog provider
    if (catalogProvider) {
      try {
        const catalogResults = await catalogProvider.searchIngredients(foodQuery.trim(), 1);
        if (catalogResults.length > 0) {
          return { ...catalogResults[0], kind: 'ingredient' };
        }
      } catch (err) {
        console.error('[CatalogSearchManager] AI catalog fallback failed:', err);
      }
    }

    return null;
  }

  /**
   * Deduplicates food items while preserving order:
   * 1. Custom Recipes
   * 2. Custom Ingredients
   * 3. System Catalog Ingredients (suppressed on name collision with Custom Ingredients)
   */
  mergeAndDeduplicate(
    recipes: RecipeFoodItem[],
    customItems: BaseIngredient[],
    catalogItems: BaseIngredient[],
    limit: number = 30
  ): FoodItem[] {
    const seenIds = new Set<string>();
    const seenCustomIngredientNames = new Set<string>();
    const result: FoodItem[] = [];

    // 1. Recipes first
    for (const r of recipes) {
      if (!seenIds.has(r.id)) {
        seenIds.add(r.id);
        result.push(r);
      }
    }

    // 2. Custom ingredients second
    for (const item of customItems) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        const normName = normalizeFoodName(item.name);
        if (normName) {
          seenCustomIngredientNames.add(normName);
        }
        result.push({ ...item, kind: 'ingredient' });
      }
    }

    // 3. Catalog ingredients third (filtered by custom ingredient name collisions)
    for (const item of catalogItems) {
      const normName = normalizeFoodName(item.name);
      if (normName && seenCustomIngredientNames.has(normName)) {
        continue;
      }
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        result.push({ ...item, kind: 'ingredient' });
      }
    }

    return result.slice(0, limit);
  }
}

