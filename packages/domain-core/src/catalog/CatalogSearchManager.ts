import type {
  BaseIngredient,
  Portion,
  FoodItem,
  RecipeFoodItem,
  FoodKind,
  RagCatalogCandidate
} from '../types.js';
import { singularizeWord } from '../recipes/RecipeManager.js';

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

export function sanitizeFoodQuery(foodQuery: string): string {
  if (!foodQuery || !foodQuery.trim()) return '';

  const mealVerbsAndTimePhrases =
    /(?<=^|[^\p{L}\p{N}])(?:en el desayuno|en el almuerzo|en la cena|en la merienda|para el desayuno|para el almuerzo|para la cena|para la merienda|para desayunar|para almorzar|para cenar|para merendar|for breakfast|for lunch|for dinner|for a snack|for snack|at breakfast|at lunch|at dinner|in the morning|in the afternoon|in the evening|at night|i ate|i had|i drank|i consumed|desayun[eéó]|desayuno|almorc[eé]|almuerzo|cen[eé]|cena|merend[eé]|merienda|com[ií]|tom[eé]|beb[ií]|ate|had|drank|eaten|breakfast|lunch|dinner|snack|ayer|hoy|yesterday|today)(?=[^\p{L}\p{N}]|$)/giu;

  const leadingQuantitiesAndUnits =
    /^\s*(?:\d+(?:[.,]\d+)?|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|medio|media|one|two|three|four|five|six|seven|eight|nine|ten|a|an|half|couple)\s*(?:(?:unidad(?:es)?|pieza(?:s)?|porci[oó]n(?:es)?|plato(?:s)?|taza(?:s)?|rebanada(?:s)?|rodaja(?:s)?|feta(?:s)?|vaso(?:s)?|cucharada(?:s)?|cucharadita(?:s)?|gramos?|g|ml|oz|unit(?:s)?|piece(?:s)?|portion(?:s)?|serving(?:s)?|plate(?:s)?|bowl(?:s)?|cup(?:s)?|slice(?:s)?|glass(?:es)?|tbsp|tsp|tablespoon(?:s)?|teaspoon(?:s)?|grams?)\s+(?:de\s+|of\s+)?)?/i;

  const leadingPrepositions = /^\s*(?:de|of|for|in|at|en|para)\s+/i;
  const trailingPrepositions = /\s+(?:de|of|for|in|at|en|para)\s*$/i;

  let cleaned = foodQuery.trim();
  cleaned = cleaned.replace(mealVerbsAndTimePhrases, ' ').replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(leadingQuantitiesAndUnits, '').trim();
  cleaned = cleaned.replace(leadingPrepositions, '').replace(trailingPrepositions, '').trim();

  return cleaned.length > 0 ? cleaned : foodQuery.trim();
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
    const effectiveQuery = sanitizeFoodQuery(foodQuery);
    const normQuery = normalizeFoodName(effectiveQuery);
    if (!normQuery) return null;

    const singularQuery = effectiveQuery
      .split(/\s+/)
      .map(t => singularizeWord(t))
      .join(' ');
    const normSingularQuery = normalizeFoodName(singularQuery);

    // 1. Check custom recipes
    if (customRecipes && customRecipes.length > 0) {
      const recipeMatch = customRecipes.find(r => {
        const normName = normalizeFoodName(r.name);
        return (
          normName === normQuery ||
          normName === normSingularQuery ||
          normName.includes(normQuery) ||
          normName.includes(normSingularQuery) ||
          (normName.length >= 3 && (normQuery.includes(normName) || normSingularQuery.includes(normName)))
        );
      });
      if (recipeMatch) return recipeMatch;
    }

    // 2. Check custom ingredients
    const customMatch = customIngredients.find(item => {
      const normName = normalizeFoodName(item.name);
      return (
        normName === normQuery ||
        normName === normSingularQuery ||
        normName.includes(normQuery) ||
        normName.includes(normSingularQuery) ||
        (normName.length >= 3 && (normQuery.includes(normName) || normSingularQuery.includes(normName)))
      );
    });
    if (customMatch) {
      return { ...customMatch, kind: 'ingredient' };
    }

    // 3. Query catalog provider
    if (catalogProvider) {
      try {
        let catalogResults = await catalogProvider.searchIngredients(effectiveQuery, 10);
        if (catalogResults.length === 0 && singularQuery !== effectiveQuery) {
          catalogResults = await catalogProvider.searchIngredients(singularQuery, 10);
        }
        if (catalogResults.length === 0 && effectiveQuery.length >= 6) {
          catalogResults = await catalogProvider.searchIngredients(effectiveQuery.slice(0, 5), 10);
        }

        const queryTokens = normQuery
          .split(/\s+/)
          .filter(t => !/^(de|del|con|en|la|el|los|las|un|una|y|e|al|a|para|por|of|with|and|the|in|for|at|on)$/i.test(t));
        const primaryToken = queryTokens[0] || normQuery;

        if (catalogResults.length === 0 && queryTokens.length > 1) {
          catalogResults = await catalogProvider.searchIngredients(primaryToken, 10);
          if (catalogResults.length === 0) {
            const singPrimary = singularizeWord(primaryToken);
            if (singPrimary !== primaryToken) {
              catalogResults = await catalogProvider.searchIngredients(singPrimary, 10);
            }
          }
          if (catalogResults.length === 0 && primaryToken.length >= 6) {
            catalogResults = await catalogProvider.searchIngredients(primaryToken.slice(0, 5), 10);
          }
        }

        if (catalogResults.length === 0) {
          for (const token of queryTokens) {
            const singToken = singularizeWord(token);
            if (singToken !== token) {
              const singResults = await catalogProvider.searchIngredients(singToken, 10);
              if (singResults.length > 0) {
                catalogResults = singResults;
                break;
              }
            }
            if (token.length >= 6) {
              const tokenResults = await catalogProvider.searchIngredients(token.slice(0, 5), 10);
              if (tokenResults.length > 0) {
                catalogResults = tokenResults;
                break;
              }
            }
          }
        }

        if (catalogResults.length > 0) {
          const queryHasDough = /tapa|masa|disco|wrap|dough|crust|shell|sheet/i.test(normQuery);
          const scored = catalogResults.map(item => {
            const normName = normalizeFoodName(item.name);
            let score = 0;

            if (normName === normQuery || normName === normSingularQuery) score += 100;
            else if (normName.startsWith(normQuery) || normName.startsWith(normSingularQuery)) score += 60;
            else if (normName.includes(normQuery) || normName.includes(normSingularQuery)) score += 40;

            if (normName.startsWith(primaryToken)) score += 50;
            else if (primaryToken.length >= 6 && normName.startsWith(primaryToken.slice(0, 5))) score += 30;
            else if (normName.includes(primaryToken)) score += 30;

            for (const token of queryTokens) {
              const singToken = singularizeWord(token);
              if (normName.includes(token) || normName.includes(singToken)) {
                score += 15;
              } else if (token.length >= 6 && normName.startsWith(token.slice(0, 5))) {
                score += 25;
              }
            }

            if (!queryHasDough && /^(tapa|tapas|masa|masas|disco|discos|dough|crust|pie crust)\b/i.test(normName)) {
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
      /(?<=^|[^\p{L}\p{N}])(?:en el desayuno|en el almuerzo|en la cena|en la merienda|for breakfast|for lunch|for dinner|for a snack|for snack|in the morning|in the afternoon|in the evening|at night|i ate|i had|i drank|desayun[eéó]|desayuno|almorc[eé]|almuerzo|cen[eé]|cena|merend[eé]|merienda|com[ií]|tom[eé]|beb[ií]|hoy|ayer|ate|had|drank|eaten|for|breakfast|lunch|dinner|snack|today|yesterday)(?=[^\p{L}\p{N}]|$)/giu;

    const numbersAndQuantitiesRegex =
      /(?<=^|[^\p{L}\p{N}])(?:\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|medio|media|one|two|three|four|five|six|seven|eight|nine|ten|a|an|half|couple|porci[oó]n(?:es)?|unidad(?:es)?|pieza(?:s)?|rebanada(?:s)?|rodaja(?:s)?|feta(?:s)?|taza(?:s)?|plato(?:s)?|vaso(?:s)?|gramos?|portion(?:s)?|serving(?:s)?|unit(?:s)?|piece(?:s)?|slice(?:s)?|cup(?:s)?|plate(?:s)?|bowl(?:s)?|glass(?:es)?|grams?)(?=[^\p{L}\p{N}]|$)/giu;

    const dishConnectorSplitRegex = /\b(?:con|y|e|with|and)\b|,/gi;

    const stripConnectorsRegex = /\b(?:con|y|e|de|del|en|la|el|al|los|las|para|por|the|of|in|to|with|and|for|on|at)\b/gi;

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
        .replace(/^(?:de|of)\s+/i, ' ')
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
        const sing = singularizeWord(token);
        if (sing !== token) {
          addQuery(sing);
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
      const providerSearches = queries.map(async q => {
        let items = await catalogProvider.searchIngredients(q, 10).catch(() => []);
        if (items.length === 0 && q.length >= 6) {
          items = await catalogProvider.searchIngredients(q.slice(0, 5), 10).catch(() => []);
        }
        return items;
      });
      const results = await Promise.allSettled(providerSearches);

      const resultArrays: BaseIngredient[][] = [];
      for (const res of results) {
        if (res.status === 'fulfilled' && Array.isArray(res.value) && res.value.length > 0) {
          resultArrays.push(res.value);
        }
      }

      // Round-robin interleaving across fulfilled query results
      let maxLen = 0;
      for (const arr of resultArrays) {
        if (arr.length > maxLen) maxLen = arr.length;
      }

      for (let i = 0; i < maxLen; i++) {
        for (const arr of resultArrays) {
          if (candidates.length >= maxCandidates) break;
          if (i < arr.length) {
            addCandidate(toIngredientCandidate(arr[i]));
          }
        }
        if (candidates.length >= maxCandidates) break;
      }
    }

    return candidates;
  }
}

