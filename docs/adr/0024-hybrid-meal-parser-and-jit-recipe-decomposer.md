# 0024. Hybrid Meal Parser and JIT Culinary Recipe Decomposer

* Status: accepted
* Date: 2026-10-20

## Context and Problem Statement

Quomida previously routed all natural language meal queries through an external Large Language Model (LLM) via `QozaraAiMealParser`. While functional, this architecture exhibited significant drawbacks:

1. **Unnecessary Latency and API Cost**: For standard inputs (e.g. *"2 bananas"*, *"1 café con leche y 2 medialunas"*, *"150g pechuga de pollo y ensalada para cenar"*), calling a remote LLM imposed 1.5–5.0 seconds of network latency and consumed API tokens for simple grammatical parsing of quantities, units, and meal markers.
2. **Offline Fragility**: Routing simple input queries through an LLM violated Quomida's Local-First invariant (Invariant #7) whenever the user was offline, possessed no API key, or exceeded provider quotas.
3. **Dead-End Uncataloged Foods**: When users entered regional or composite dishes missing from the base catalog (e.g. *"1 plato de locro"*, *"1 porción de pastel de papa"*, *"shepherd's pie"*), the catalog resolver returned `unmatched: true`, stranding the user with *"Alimento no encontrado en el catálogo"* and 0 kcal.
4. **Tight Coupling of Grammar and Catalog**: Language-specific grammar (Spanish/English number words, units, meal verbs) was ad-hoc and not cleanly decoupled from catalog resolution or future multi-language catalog extensions.

## Decision Outcome

We implement a **Hybrid Smart-Escalation Meal Architecture** that decouples linguistic syntax parsing from catalog resolution and re-allocates the LLM strictly as an optional culinary knowledge escalator:

1. **Modular Deterministic Parser (`StandardMealParser` with `ParserLocalePack`)**:
   - Executes 100% locally in `@quomida/domain-core` with zero network latency (< 1ms) and zero API cost.
   - Encapsulates language-specific grammar into modular `ParserLocalePack` interfaces (`esLocalePack`, `enLocalePack`).
   - Dynamically selects the active pack based on the user's configured language in App Settings (`userSettings.locale`), falling back cleanly to heuristic multi-pack detection if unconfigured.
   - Extracts quantities, canonical units, meal types, and clean food tokens offline.

2. **Deterministic Offline Multi-Food Recipe Decomposition (Zero LLM Required)**:
   - When a user query lists multiple foods or a composite meal (e.g., *"milanesa con puré de papas"*, *"arroz con atún y huevo"*), `StandardMealParser` segments each item and `BatchMealResolver` resolves each component against the catalog.
   - If multiple components resolve, `computeSynthesizedRecipe()` synthesizes an editable Virtual Recipe proposal 100% locally without calling any LLM.

3. **Master AI Toggle & Graceful Degradation**:
   - `userSettingsSchema` is extended with `ai_settings.enabled` (boolean toggle in App Settings).
   - When AI is disabled, the app is offline, or the provider quota is exhausted, meal parsing and multi-item recipe synthesis continue to work without interruption.
   - Uncataloged dishes gracefully fall back to the standard manual catalog picker with a non-blocking notification.

4. **Just-In-Time (JIT) Culinary LLM Decomposer (`LlmRecipeDecomposer`)**:
   - When a single food query yields no catalog match (e.g., *"locro"*), and AI is enabled and online, `LlmRecipeDecomposer` is triggered.
   - The LLM decomposes the unknown dish into typical base agricultural staples (e.g., white corn, beans, beef, squash) with realistic gram weights in the user's language.
   - These base ingredients are resolved against the catalog and synthesized into a virtual recipe proposal with exact calculated macronutrients.

5. **Decoupled Catalog Resolution and Future Multi-Language Aliases**:
   - The parser emits canonical food queries; matching those queries to catalog items is delegated to `CatalogSearchManager`.
   - Today's mixed-language catalogs (USDA English vs. Argenfoods/BEDCA Spanish) are bridged via token normalization and cross-language synonym mappings.
   - Future catalog schema updates with explicit `aliases` or `names_i18n` columns can be queried directly without modifying the query parser.

## Consequences

### Positive
- **Instant Response Time**: 80–90% of meal logs parse in < 1ms on the client.
- **100% Offline Capability**: Core meal parsing and multi-item composite recipe synthesis function offline with zero API dependencies.
- **Superior UX on Cultural Dishes**: Regional dishes missing from the catalog are automatically synthesized into real, editable recipes with calculated macros.
- **User Privacy & Control**: Users can completely disable AI features in Settings for a 100% private, local-first experience.
- **Clean Extensibility**: New languages (e.g., Portuguese, French) can be added simply by authoring a new `ParserLocalePack`.

### Negative / Trade-offs
- The LLM recipe decomposer requires network access and a configured AI provider to estimate unknown dishes. When offline, unknown dishes must be resolved manually.
