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

export function normalizeFoodName(name: string): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export class CatalogSearchManager {
  /**
   * Unifies and deduplicates searches across custom in-memory ingredients and the catalog provider.
   * Custom user ingredients are always prioritized first and override system items on name collisions.
   */
  async search(
    options: FoodSearchOptions,
    catalogProvider?: ICatalogProvider
  ): Promise<UnifiedSearchResult> {
    const rawQuery = options.query.trim();
    if (!rawQuery) {
      return { items: [], customCount: 0, catalogCount: 0 };
    }
    const normQuery = normalizeFoodName(rawQuery);

    const limit = options.limit || 30;

    // 1. Filter local custom in-memory ingredients (accent & case-insensitive)
    const customMatches = (options.customIngredients || []).filter(item =>
      normalizeFoodName(item.name).includes(normQuery)
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

    // 3. Merge, prioritize custom, and deduplicate by ID and normalized name
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
    const normQuery = normalizeFoodName(foodQuery);
    if (!normQuery) return null;

    // 1. Check custom ingredients
    const customMatch = customIngredients.find(item =>
      normalizeFoodName(item.name).includes(normQuery)
    );
    if (customMatch) return customMatch;

    // 2. Query catalog provider
    if (catalogProvider) {
      try {
        const catalogResults = await catalogProvider.searchIngredients(foodQuery.trim(), 1);
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
   * User-created custom ingredients override system ingredients on naming collision.
   */
  mergeAndDeduplicate(
    customItems: BaseIngredient[],
    catalogItems: BaseIngredient[],
    limit: number = 30
  ): BaseIngredient[] {
    const seenIds = new Set<string>();
    const seenCustomNames = new Set<string>();
    const result: BaseIngredient[] = [];

    for (const item of customItems) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        const normName = normalizeFoodName(item.name);
        if (normName) {
          seenCustomNames.add(normName);
        }
        result.push(item);
      }
    }

    for (const item of catalogItems) {
      const normName = normalizeFoodName(item.name);
      // Custom ingredients natively override system ingredients on naming collision (PRODUCT_SPEC §2.B)
      if (normName && seenCustomNames.has(normName)) {
        continue;
      }
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        result.push(item);
      }
    }

    return result.slice(0, limit);
  }
}

