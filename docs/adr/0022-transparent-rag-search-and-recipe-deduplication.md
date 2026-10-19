# 0022. Transparent Grounded RAG Search & Nutritional Recipe Deduplication

* Status: accepted
* Date: 2026-10-18

## Context and Problem Statement

Quomida previously separated food discovery into two distinct UI modes: a lexical FTS5 search bar and a natural language AI text box. This required users to consciously choose between searching the database and invoking AI. Furthermore:
1. When the LLM parsed natural language in a vacuum (without knowing what items exist in the user's local SQLite catalog), it could emit canonical terms that differed from catalog naming conventions.
2. When users logged compound dishes (e.g., "milanesa con puré de papas"), the system either split them into disconnected daily log rows or failed to save the combined dish for future reuse.
3. Automatically saving AI-synthesized composite dishes into the user's `recipes` collection risks library pollution if similar phrasings (e.g., "Milanesa con puré" vs. "Milanesa con puré de papas") generate duplicate recipes.
4. Full-catalog client-side vector embedding over 1.1M+ Open Food Facts records would require ~55 MB of binary vectors plus a ~50–110 MB local ONNX embedding model (~250 MB WASM RAM), violating ADR 0018's <30 MB mobile RAM ceiling.

## Decision Outcome

We adopt a **Two-Stage Local FTS5 Pre-Retrieval + Grounded LLM RAG Architecture** with **Nutritional & Component Fingerprint Deduplication**:

1. **Unified Search Bar with Progressive Escalation**:
   - Every keystroke runs local search (`CatalogSearchManager.search`) across `recipes` -> `base_ingredients` -> `catalog.sqlite` (FTS5 trigram/BM25) in `< 5ms`.
   - An explicit non-logging footer action ("Find more / Compose dish") and `Enter` / Spark icon escalate the query to `AiMealService`.

2. **Pre-LLM Local Candidate Retrieval (Grounded RAG)**:
   - Before invoking the LLM, `CatalogSearchManager.retrieveRagCandidates(input)` extracts content tokens and queries local storage to gather up to 25 candidate `FoodItem`s (`{ id, name, kind, calories_100g, protein_100g, carbs_100g, fats_100g }`).
   - Candidates are passed in the LLM system/user context so the model selects exact `candidate_id` references whenever available and proposes a `composite_dish_name` when multiple ingredients form a single dish.

3. **Multi-Signal Recipe Deduplication (`RecipeManager.findEquivalentRecipe`)**:
   - Before persisting a synthesized composite recipe, `RecipeManager` checks existing recipes using three invariants:
     - **Signal 1 (Lexical Token Set)**: Accent-stripped, stop-word-filtered token overlap >= 0.75.
     - **Signal 2 (Component `food_id` Jaccard)**: Order-independent ingredient ID overlap >= 0.80.
     - **Signal 3 (Nutritional Fingerprint)**: Per-100g density (`calories_100g`, `protein_100g`, `carbs_100g`, `fats_100g`) within +/- 8% calorie tolerance and <= 10g L1 macro delta per 100g.
   - A synthesized dish matching **(Exact Normalized Name)** OR **(Signal 2 AND Signal 3)** OR **(Signal 1 AND Signal 3)** resolves to the existing `Recipe` without writing a duplicate document.

4. **Single-Entry Composite Logging & Zero-Schema-Change Persistence**:
   - Synthesized recipes are stored as standard `Recipe` documents in RxDB (`recipes` v1 schema, ADR 0020) and logged as a single `DailyLog` entry referencing `food_reference_id = recipe.id`.

## Consequences

### Positive
- **Frictionless UX**: Users use a single input for both fast catalog lookups and AI-powered meal composition.
- **Accurate Grounding**: RAG candidate injection aligns LLM entity extraction with local catalog IDs and nutritional density.
- **Library Hygiene**: Prevents duplicate recipes when logging identical or near-identical dishes with varying natural language descriptions.
- **Zero Heavy Vector Models**: Keeps client-side memory usage strictly under 30 MB by leveraging existing SQLite FTS5 trigram indexing and RxDB collections.
- **Offline Immutability**: All synthesized recipes copy component macro densities, preserving nutritional integrity regardless of future catalog changes (ADR 0003, ADR 0020).

### Negative / Risks
- **Heuristic Tokenization**: Slang or regional culinary terms not covered in the local stop-word dictionary may slightly alter lexical token similarity, though nutritional fingerprinting (Signal 3) and component Jaccard (Signal 2) safeguard against false positives/negatives.
