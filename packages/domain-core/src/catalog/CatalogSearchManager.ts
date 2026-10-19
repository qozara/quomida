import type {
  BaseIngredient,
  Portion,
  FoodItem,
  RecipeFoodItem,
  FoodKind,
  RagCatalogCandidate
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
      const recipeMatch = customRecipes.find(r => {
        const normName = normalizeFoodName(r.name);
        return (
          normName === normQuery ||
          normName.includes(normQuery) ||
          (normName.length >= 3 && normQuery.includes(normName))
        );
      });
      if (recipeMatch) return recipeMatch;
    }

    // 2. Check custom ingredients
    const customMatch = customIngredients.find(item => {
      const normName = normalizeFoodName(item.name);
      return (
        normName === normQuery ||
        normName.includes(normQuery) ||
        (normName.length >= 3 && normQuery.includes(normName))
      );
    });
    if (customMatch) {
      return { ...customMatch, kind: 'ingredient' };
    }

    // 3. Query catalog provider
    if (catalogProvider) {
      try {
        let catalogResults = await catalogProvider.searchIngredients(foodQuery.trim(), 10);
        const queryTokens = normQuery.split(/\s+/).filter(t => !/^(de|del|con|en|la|el|los|las|un|una|y|al|a|para|por|of|with|and|the|in)$/i.test(t));
        const primaryToken = queryTokens[0] || normQuery;

        if (catalogResults.length === 0 && queryTokens.length > 1) {
          catalogResults = await catalogProvider.searchIngredients(primaryToken, 10);
        }

        if (catalogResults.length > 0) {
          const queryHasDough = /tapa|masa|disco|wrap/i.test(normQuery);
          const scored = catalogResults.map(item => {
            const normName = normalizeFoodName(item.name);
            let score = 0;

            if (normName === normQuery) score += 100;
            else if (normName.startsWith(normQuery)) score += 60;
            else if (normName.includes(normQuery)) score += 40;

            if (normName.startsWith(primaryToken)) score += 50;
            else if (normName.includes(primaryToken)) score += 30;

            for (const token of queryTokens) {
              if (normName.includes(token)) score += 15;
            }

            if (!queryHasDough && /^(tapa|tapas|masa|masas|disco|discos)\b/i.test(normName)) {
              score -= 50;
            }

            return { item, score };
          });

          scored.sort((a, b) => b.score - a.score);
          return { ...scored[0].item, kind: 'ingredient' };
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

  /**
   * Builds focused candidate search queries from raw natural language meal descriptions.
   * Strips meal verbs, time markers, quantities, and culinary connectors.
   */
  buildRagQueries(rawInput: string): string[] {
    if (!rawInput || !rawInput.trim()) return [];

    const mealVerbsAndTimeRegex =
      /\b(?:desayuné|desayune|almorcé|almorce|cené|cene|merendé|merende|comí|comi|tomé|tome|desayuno|almuerzo|cena|merienda|hoy|ayer|ate|had|for|breakfast|lunch|dinner|snack)\b/gi;

    const numbersAndQuantitiesRegex =
      /\b(?:\d+|un|una|dos|tres|cuatro|cinco|medio|media)\b/gi;

    const dishConnectorSplitRegex = /\b(?:con|y|with|and)\b|,/gi;

    const stripConnectorsRegex = /\b(?:con|y|de|del|en|la|el|al|los|las|the|of|in|to|with|and)\b/gi;

    const queries: string[] = [];
    const seenQueries = new Set<string>();

    const addQuery = (q: string) => {
      const clean = q.trim();
      const norm = normalizeFoodName(clean);
      if (clean.length >= 2 && norm && !seenQueries.has(norm)) {
        seenQueries.add(norm);
        queries.push(clean);
      }
    };

    // 1. Connector-separated phrases
    const segments = rawInput.split(dishConnectorSplitRegex);
    for (const seg of segments) {
      const phrase = seg
        .replace(mealVerbsAndTimeRegex, ' ')
        .replace(numbersAndQuantitiesRegex, ' ')
        .replace(/[^\w\sáéíóúÁÉÍÓÚñÑüÜ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (phrase.length >= 2) {
        addQuery(phrase);
      }
    }

    // 2. Individual content tokens >= 3 chars (+ singularized variants)
    const strippedInput = rawInput
      .replace(mealVerbsAndTimeRegex, ' ')
      .replace(numbersAndQuantitiesRegex, ' ')
      .replace(stripConnectorsRegex, ' ')
      .replace(/[^\w\sáéíóúÁÉÍÓÚñÑüÜ]/g, ' ');

    const tokens = strippedInput
      .split(/\s+/)
      .map(t => t.trim())
      .filter(t => t.length >= 3);

    for (const token of tokens) {
      addQuery(token);
      if (token.length > 3) {
        if (/[bcdfghjklmnñpqrstvwxyz]es$/i.test(token)) {
          addQuery(token.slice(0, -2));
        } else if (/[aeiou]s$/i.test(token)) {
          addQuery(token.slice(0, -1));
        }
      }
    }

    return queries;
  }

  /**
   * Gathers Top-K candidate foods (custom recipes -> custom ingredients -> catalog ingredients)
   * for grounding natural language LLM parsing and dish synthesis.
   */
  async retrieveRagCandidates(
    rawInput: string,
    customIngredients: BaseIngredient[] = [],
    catalogProvider?: ICatalogProvider,
    customRecipes: RecipeFoodItem[] = [],
    maxCandidates: number = 20
  ): Promise<RagCatalogCandidate[]> {
    const queries = this.buildRagQueries(rawInput);
    if (queries.length === 0) {
      return [];
    }

    const seenIds = new Set<string>();
    const candidates: RagCatalogCandidate[] = [];

    const addCandidate = (cand: RagCatalogCandidate) => {
      if (!seenIds.has(cand.id) && candidates.length < maxCandidates) {
        seenIds.add(cand.id);
        candidates.push(cand);
      }
    };

    const toRecipeCandidate = (r: RecipeFoodItem): RagCatalogCandidate => ({
      id: r.id,
      name: r.name,
      kind: 'recipe',
      calories_100g: r.calories_100g,
      protein_100g: r.protein_100g,
      carbs_100g: r.carbs_100g,
      fats_100g: r.fats_100g
    });

    const toIngredientCandidate = (i: BaseIngredient): RagCatalogCandidate => ({
      id: i.id,
      name: i.name,
      kind: 'ingredient',
      calories_100g: i.calories_100g,
      protein_100g: i.protein_100g,
      carbs_100g: i.carbs_100g,
      fats_100g: i.fats_100g
    });

    // 1. Check custom recipes first across all queries
    for (const q of queries) {
      if (candidates.length >= maxCandidates) break;
      const normQ = normalizeFoodName(q);
      for (const r of customRecipes) {
        if (normalizeFoodName(r.name).includes(normQ)) {
          addCandidate(toRecipeCandidate(r));
        }
      }
    }

    // 2. Check custom ingredients second across all queries
    for (const q of queries) {
      if (candidates.length >= maxCandidates) break;
      const normQ = normalizeFoodName(q);
      for (const ing of customIngredients) {
        if (normalizeFoodName(ing.name).includes(normQ)) {
          addCandidate(toIngredientCandidate(ing));
        }
      }
    }

    // 3. Search catalogProvider for queries
    if (catalogProvider && candidates.length < maxCandidates) {
      const providerSearches = queries.map(q =>
        catalogProvider.searchIngredients(q, 10).catch(() => [])
      );
      const results = await Promise.allSettled(providerSearches);

      for (const res of results) {
        if (candidates.length >= maxCandidates) break;
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          for (const item of res.value) {
            addCandidate(toIngredientCandidate(item));
            if (candidates.length >= maxCandidates) break;
          }
        }
      }
    }

    return candidates;
  }
}

