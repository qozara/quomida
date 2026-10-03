import type { BaseIngredient, Portion } from '../types.js';

export interface ICatalogProvider {
  searchIngredients(query: string, limit?: number): Promise<BaseIngredient[]>;
  getPortionsForIngredient(baseFoodId: string): Promise<Portion[]>;
}

export interface FoodSearchOptions {
  query: string;
  customIngredients?: BaseIngredient[];
  limit?: number;
}

export interface UnifiedSearchResult {
  items: BaseIngredient[];
  customCount: number;
  catalogCount: number;
}

export class CatalogSearchManager {
  /**
   * Unifies and deduplicates searches across custom in-memory ingredients and the catalog provider.
   * Custom user ingredients are always prioritized first.
   */
  async search(
    options: FoodSearchOptions,
    catalogProvider?: ICatalogProvider
  ): Promise<UnifiedSearchResult> {
    const rawQuery = options.query.trim().toLowerCase();
    if (!rawQuery) {
      return { items: [], customCount: 0, catalogCount: 0 };
    }

    const limit = options.limit || 30;

    // 1. Filter local custom in-memory ingredients
    const customMatches = (options.customIngredients || []).filter(item =>
      item.name.toLowerCase().includes(rawQuery)
    );

    // 2. Query catalog provider if provided
    let catalogMatches: BaseIngredient[] = [];
    if (catalogProvider) {
      try {
        catalogMatches = await catalogProvider.searchIngredients(rawQuery, limit);
      } catch (err) {
        console.error('[CatalogSearchManager] Provider search failed:', err);
      }
    }

    // 3. Merge, prioritize custom, and deduplicate by ID
    const merged = this.mergeAndDeduplicate(customMatches, catalogMatches, limit);

    return {
      items: merged,
      customCount: customMatches.length,
      catalogCount: catalogMatches.length
    };
  }

  /**
   * Resolves a natural-language AI food query by checking custom foods first,
   * then querying the catalog provider.
   */
  async resolveAiMatch(
    foodQuery: string,
    customIngredients: BaseIngredient[],
    catalogProvider?: ICatalogProvider
  ): Promise<BaseIngredient | null> {
    const normalized = foodQuery.trim().toLowerCase();
    if (!normalized) return null;

    // 1. Check custom ingredients
    const customMatch = customIngredients.find(item =>
      item.name.toLowerCase().includes(normalized)
    );
    if (customMatch) return customMatch;

    // 2. Query catalog provider
    if (catalogProvider) {
      try {
        const catalogResults = await catalogProvider.searchIngredients(normalized, 1);
        if (catalogResults.length > 0) {
          return catalogResults[0];
        }
      } catch (err) {
        console.error('[CatalogSearchManager] AI catalog fallback failed:', err);
      }
    }

    return null;
  }

  /**
   * Deduplicates ingredients while preserving order (custom first).
   */
  mergeAndDeduplicate(
    customItems: BaseIngredient[],
    catalogItems: BaseIngredient[],
    limit: number = 30
  ): BaseIngredient[] {
    const seenIds = new Set<string>();
    const result: BaseIngredient[] = [];

    for (const item of customItems) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        result.push(item);
      }
    }

    for (const item of catalogItems) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        result.push(item);
      }
    }

    return result.slice(0, limit);
  }
}
