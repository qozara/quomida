# 0034. Diacritic-Insensitive Catalog Search and Unified AI Ingredient & Recipe Inference

* Status: accepted
* Date: 2026-11-13

## Context and Problem Statement

Real-world catalog searches for accented uncataloged base ingredients (such as typing `"rúcula"` in a Spanish locale) exposed four compounding failure modes across the search and AI resolution pipeline:

1. **Diacritic-Sensitive SQLite FTS5 & Catalog Search**: Open Food Facts and regional catalog entries frequently store unaccented names (e.g., `"Sorrentinos Jamon Crudo Y Rucula - Coto"`). Because `SQLiteExporter` built FTS5 `trigram` indexes without `remove_diacritics 1` and `RemoteCatalogService.searchIngredients()` / `CatalogSearchManager.search()` queried using raw accented tokens only, typing `"rúcula"` returned empty initial dropdown results even when relevant dishes containing `"Rucula"` existed locally.
2. **False-Positive Secondary-Modifier Matches in `resolveAiMatch`**: While initial UI search missed accented matches, `CatalogSearchManager.resolveAiMatch("rúcula")` stripped accents internally, queried prefix `"rucul"`, matched `"Sorrentinos Jamon Crudo Y Rucula - Coto"`, and scored the single token past threshold (`85 >= 30`), resolving a request for plain raw arugula into branded stuffed pasta and bypassing AI inference.
3. **Lack of Explicit AI Escalation Intent from UI Buttons**: Clicking `"Find more with AI"` / `"Compose dish"` in `FoodLogger` or `CatalogManager` ran `MealService.processMeal()` without signaling that the user already inspected and rejected local search results.
4. **Missing Single-Ingredient Macro Inference and Sub-Ingredient Fallback Macros**: `IRecipeDecomposer` / `LlmRecipeDecomposer` treated every inferred item as a recipe decomposition without per-100g nutritional macros (`calories_100g`, `protein_100g`, `carbs_100g`, `fats_100g`), `kind: 'ingredient' | 'recipe'`, or domestic `portions`. Single uncataloged ingredients opened `IngredientBuilder` with zeroed macros, and composite dishes containing an uncataloged agricultural sub-ingredient dropped or misresolved that component.

## Decision Outcome

We evolve the catalog search and hybrid AI escalation pipeline (`@quomida/domain-core`, `@quomida/ai-services`, `@quomida/etl-pipeline`, `@quomida/webapp`) while keeping `@quomida/domain-core` 100% isomorphic and preserving historical macro immutability:

1. **Diacritic-Insensitive Catalog Search Across SQLite & Domain Search**:
   - `SQLiteExporter` configures `tokenize='trigram remove_diacritics 1'` on FTS5 virtual tables for newly generated catalogs.
   - `RemoteCatalogService.searchIngredients()` detects accented tokens via Unicode NFD normalization and automatically retries FTS5 AND, FTS5 OR, and `LIKE` queries with diacritic-stripped tokens when initial results are empty, remaining backward-compatible with existing SQLite artifacts.
   - `CatalogSearchManager.search()` falls back to normalized diacritic-free query tokens against `ICatalogProvider` when accented queries return no hits.

2. **Secondary-Modifier False-Positive Rejection in `CatalogSearchManager.resolveAiMatch()`**:
   - Single-token query matching checks `isSecondaryModifierMatch()` against the candidate prefix preceding the match (detecting Spanish/English connectors such as `de`, `con`, `y`, `e`, `al`, `sin`, `sabor`, `relleno`, `with`, `and`, `in`, `of`, `flavored`, punctuation delimiters, or >= 2 preceding words) and applies a `-100` score penalty while eliminating triple-counting on exact normalized inclusion.
   - Standalone ingredient queries (e.g., `"rúcula"`) reject composite dishes where the queried ingredient is merely a secondary component (`"Sorrentinos Jamon Crudo Y Rucula - Coto"`), surfacing them in initial interactive search while allowing AI escalation to run cleanly.

3. **Explicit UI AI Escalation (`forceAiEscalation`)**:
   - `ProcessMealOptions.forceAiEscalation?: boolean` enables UI triggers (`FoodLogger` and `CatalogManager` AI search/compose buttons) to escalate single-item queries to `IRecipeDecomposer` even when a partial local match exists, falling back cleanly to the local resolution if AI returns `null`.

4. **Unified Ingredient & Recipe Inference Schema (`IRecipeDecomposer`, `LlmRecipeDecomposer`, `MealService`)**:
   - Extended `DecomposedDishIngredient` with optional `calories_100g`, `protein_100g`, `carbs_100g`, `fats_100g`, and `portions?: InferredPortion[]`, and `DecomposedDishResult` with `kind?: 'ingredient' | 'recipe'`.
   - `LlmRecipeDecomposer` (`DECOMPOSE_DISH_TOOL` & `DEFAULT_DECOMPOSE_SYSTEM_PROMPT`) instructs the LLM to distinguish standalone base ingredients (`kind: 'ingredient'`) from composite dishes (`kind: 'recipe'`) and return per-100g fallback macros plus common household portions.
   - `MealService` synthesizes `source: 'ai'` `FoodItem` entries with estimated macros and portions both for standalone uncataloged ingredients (`defaultLoggingMode: 'batch'`, opening `IngredientBuilder` as a **New** unsaved ingredient with `id: undefined`) and as fallback macro entries when a sub-ingredient of a composite recipe is missing from the local catalog.

## Consequences

### Positive
- Users typing accented or regional food names immediately see unaccented catalog matches in the initial autocomplete dropdown without waiting for AI calls.
- Clicking `"Find more with AI"` for an uncataloged base ingredient accurately opens `IngredientBuilder` pre-filled with AI-estimated per-100g macros and domestic portions as a new custom ingredient, instead of silently auto-matching an unrelated compound product.
- Composite recipe decompositions no longer lose uncataloged sub-ingredients thanks to per-100g fallback macro synthesis.
- Full backward compatibility with existing `system.sqlite` files without mandatory immediate re-download.

### Negative / Trade-offs
- AI-synthesized nutritional values are LLM estimates labeled `source: 'ai'` and remain editable by the user in `IngredientBuilder` / `RecipeBuilder` prior to saving locally.
- Supporting `log_meal`-style `{ items: [{ foodQuery }] }` payloads in `LlmRecipeDecomposer` populates the shared in-memory LRU cache (`LlmRecipeDecomposer.clearCache()` should be called in integration test `beforeEach` hooks).
