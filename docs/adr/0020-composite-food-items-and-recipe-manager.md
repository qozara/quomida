# 0020. Composite Food Items and Recipe Manager Architecture

* Status: accepted
* Date: 2026-10-11

## Context and Problem Statement

Quomida initially defined the `recipes` RxDB collection and Google Sheet tab with an abstract schema (`{ id, name, ingredients: [{ ingredient_id, raw_weight_g }], yield_factor }`) following the FAO/INFOODS standard (ADR 0004). However, recipes were not exposed in the presentation layer, could not be searched alongside ingredients, and had no unified manager in `@quomida/domain-core`.

Furthermore, users frequently prepare dishes made not only of raw ingredients, but also of previously prepared recipes (e.g. assembling lasagna from tomato sauce, cooked meat, and pasta). If recipes rely strictly on foreign key pointers to ingredients:
1. System ingredients reside in read-only local SQLite/OPFS files and cannot be easily joined on remote multi-device sync or when catalogs are not yet downloaded.
2. If a referenced ingredient or base recipe is edited or deleted, child recipes could break or silently alter historical nutritional counts.
3. Hierarchical recursive calculation across nested recipe trees adds cyclomatic complexity, cycle-detection overhead, and latency during keystroke searches.

How should Quomida model recipes, allow composing foods from other foods, and integrate them into search, catalog management, and daily logging while preserving historical immutability (ADR 0003) and storage boundary invariants (ADR 0010, ADR 0012)?

## Decision Drivers

* **KISS & Flat Simplicity**: Avoid multi-level recursive tree resolutions and cycle graph overhead.
* **Historical Immutability & Offline Resilience**: A recipe must remain 100% computable offline, even if a constituent food or sub-recipe is later deleted or the system catalog is absent.
* **Unified Food Domain Model (Composite Pattern)**: Atomic ingredients and composite recipes must share a common typed nutritional contract (`FoodItem` / `NutrientDensity`), making search and daily logging polymorphic and identical.
* **Zero-Remediation Storage Invariant**: Multi-device users synchronizing with Google Sheets must not experience schema-repair popups. The serialized representation must remain compatible with existing Google Sheets tabular columns (`id`, `name`, `ingredients`, `yield_factor`, `updatedAt`, `_deleted`).

## Decision Outcome

We adopted the **Flat Composite Food Model with Copied Nutrient Densities and Unified FoodItem Contract**:

1. **Unified `FoodItem` Polymorphic Contract**:
   - Both atomic foods (`BaseIngredient`) and composite foods (`RecipeFoodItem`) implement `NutrientDensity` (`calories_100g`, `protein_100g`, `carbs_100g`, `fats_100g`).
   - Standard domain functions like `calculateItemMacros(food, weightGrams)` operate transparently across both atomic and composite foods.

2. **Flat Single-Depth Composition with Snapshot Copying**:
   - When creating a composite food from ingredients or existing recipes, constituent items are snapshot-copied into `RecipeComponent`:
     ```ts
     export interface RecipeComponent {
       food_id: string;
       name: string;
       weight_g: number;
       quantity?: number;
       portion_name?: string;
       calories_100g: number;
       protein_100g: number;
       carbs_100g: number;
       fats_100g: number;
       from_recipe?: boolean;
     }
     ```
   - If a recipe is composed of another recipe, the sub-recipe's calculated cooked nutrient density is copied as a flat item into the new recipe.
   - There is no nested tree hierarchy, no recursion, and no cycle hazard.

3. **FAO/INFOODS Yield & Cooked Weight Model (ADR 0004 Extension)**:
   - Total macros sum all raw component macros: $M_{total} = \sum_i (w_i \cdot d_{i,M} / 100)$.
   - Cooked weight applies the cooking yield factor: $W_{cooked} = W_{raw} \times \text{yield}$.
   - The recipe's 100g density represents the edible, cooked dish: $d_{recipe,M} = (M_{total} / W_{cooked}) \times 100$.

4. **Portions and Servings Unification**:
   - Servings are stored as standard `Portion` documents referencing `base_food_id = recipe.id`.
   - The UI includes a "Split into N portions" calculator that sets domestic portion grams to $W_{cooked} / N$.
   - A dynamic "Whole recipe" portion is computed on the fly for logging without requiring a database record.

5. **Identical `DailyLog` Output**:
   - Logging a recipe creates a `DailyLog` document identical in schema, properties, and macro snapshots to an ingredient entry (`food_reference_id = recipe.id`).

6. **Storage Schema Evolution (RxDB v0 → v1)**:
   - RxDB `recipes` collection schema is bumped to version 1 with a migration strategy that defaults missing snapshot macros in legacy documents.
   - The remote Google Sheets tabular schema retains the `ingredients` column as a serialized JSON string, requiring zero column changes and avoiding schema remediation popups.

## Consequences

### Positive
- **Extreme Performance**: Keystroke search and macro calculations run in $O(1)$ without database joins or recursive graph traversals.
- **Robust Offline Availability**: Recipes retain all nutritional data locally even if source catalog items are removed or altered.
- **Consistent UX**: Users search for "Food" in a single autocomplete bar and manage atomic products and home-cooked recipes in a unified catalog interface.
- **Strict Immutability**: Full alignment with Quomida's Core Invariant 3 (Historical Immutability).

### Negative / Trade-offs
- If a user modifies an atomic ingredient's macros, existing recipes containing that ingredient do not automatically recalculate unless the user intentionally edits and re-saves the recipe. (This matches real-world cooking behavior, where existing baked dishes do not change retroactively).
