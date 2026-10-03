import type { BaseIngredient, Portion } from '../types.js';
import type { ICatalogProvider } from './CatalogSearchManager.js';

export interface TaggedPortion extends Portion {
  tag: 'Standard' | 'Custom' | 'Generic';
}

export interface PortionResolutionOptions {
  ingredient: BaseIngredient;
  customPortions?: Portion[];
  catalogProvider?: ICatalogProvider;
}

export class PortionManager {
  /**
   * Resolves, aggregates, and tags portions for a given ingredient.
   * Handles:
   * 1. Ingredient-specific custom portions.
   * 2. Catalog standard portions (if ingredient.source === 'system').
   * 3. Generic fallback portions (from custom store or catalog).
   */
  async resolvePortions(options: PortionResolutionOptions): Promise<TaggedPortion[]> {
    const { ingredient, customPortions = [], catalogProvider } = options;
    const result: TaggedPortion[] = [];
    const seenIds = new Set<string>();

    // 1. Fetch specific custom portions from custom store
    const specificCustom = customPortions.filter(p => p.base_food_id === ingredient.id);
    for (const p of specificCustom) {
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id);
        result.push({ ...p, tag: 'Custom' });
      }
    }

    // 2. If ingredient is from system catalog, fetch portions from catalog provider
    if (ingredient.source === 'system' && catalogProvider) {
      try {
        const catalogDocs = await catalogProvider.getPortionsForIngredient(ingredient.id);
        for (const p of catalogDocs) {
          if (!seenIds.has(p.id)) {
            seenIds.add(p.id);
            result.push({ ...p, tag: 'Standard' });
          }
        }
      } catch (err) {
        console.error('[PortionManager] Failed to fetch catalog portions:', err);
      }
    }

    // 3. Gather generic fallback portions
    const genericCustom = customPortions.filter(p => p.base_food_id === 'generic');
    for (const p of genericCustom) {
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id);
        result.push({ ...p, tag: 'Generic' });
      }
    }

    // 4. If no generic portions found in custom store, query catalog provider for generic portions
    const hasGeneric = result.some(p => p.base_food_id === 'generic');
    if (!hasGeneric && catalogProvider) {
      try {
        const genericCatalogDocs = await catalogProvider.getPortionsForIngredient('generic');
        for (const p of genericCatalogDocs) {
          if (!seenIds.has(p.id)) {
            seenIds.add(p.id);
            result.push({ ...p, tag: 'Generic' });
          }
        }
      } catch (err) {
        console.error('[PortionManager] Failed to fetch catalog generic portions:', err);
      }
    }

    return result;
  }
}
