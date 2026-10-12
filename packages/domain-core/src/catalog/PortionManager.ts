import type { BaseIngredient, Portion, FoodItem } from '../types.js';
import type { ICatalogProvider } from './CatalogSearchManager.js';

export interface TaggedPortion extends Portion {
  tag: 'Standard' | 'Custom' | 'Generic';
}

export interface PortionResolutionOptions {
  ingredient: FoodItem | BaseIngredient;
  customPortions?: Portion[];
  catalogProvider?: ICatalogProvider;
}

export class PortionManager {
  /**
   * Resolves, aggregates, and tags portions for a given food item (ingredient or recipe).
   * Handles:
   * 1. Food-specific custom portions (servings).
   * 2. Virtual "Whole recipe" portion if item is a recipe.
   * 3. Catalog standard portions (if ingredient.source === 'system').
   * 4. Generic fallback portions (from custom store or catalog).
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

    // 2. If item is a recipe, inject virtual "Whole recipe" portion based on cooked weight
    const isRecipe = (ingredient as any).kind === 'recipe';
    if (isRecipe) {
      const cookedWeight = (ingredient as any).cooked_weight_g;
      if (cookedWeight && cookedWeight > 0) {
        const wholeId = `port-whole-${ingredient.id}`;
        if (!seenIds.has(wholeId)) {
          seenIds.add(wholeId);
          result.push({
            id: wholeId,
            base_food_id: ingredient.id,
            name: 'Whole recipe',
            equivalent_weight_g: cookedWeight,
            source: 'custom',
            tag: 'Custom'
          });
        }
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
