# @quomida/ai-services

Optional Generative AI (GenAI) infrastructure adapters for Quomida, built on `@qozara/ai-client` (`>=1.1.0`). Built-in deterministic natural language parsing (`StandardMealParser`, `BatchMealResolver`, OPFS SQLite search) runs 100% offline in `@quomida/domain-core` and always stays enabled even when GenAI is disabled.

## Architectural Boundary

`@quomida/ai-services` adapts Quomida's domain ports to `@qozara/ai-client`:
- **`LlmRecipeDecomposer`**: Implements `IRecipeDecomposer` from `@quomida/domain-core` using `createGenAiToolResolver` from `@qozara/ai-client`. Supports `'auto'` cascading (`byok` -> `local-browser` -> opt-in `local` -> `cloud`), single-ingredient macro inference (`kind: 'ingredient'`), and composite recipe decomposition (`kind: 'recipe'`).
- **Shared Primitives Re-exported from `@qozara/ai-client`**: `LruMemoryCache`, `AiKeyEncryptionService`, `AiError` (aliased as `AiMealError`), `classifyAiError`, `normalizeProviderPreference`, `isGenAiEnabled`, `AiProviderFactory`, `createGenAiToolResolver`, and `createCompositeAiResolver`.
- **Webapp Composition Root**: `apps/webapp/src/hooks/useMealAiService.ts` reads `userSettings.ai_settings` (via `isGenAiEnabled`) and OAuth tokens to wire `LlmRecipeDecomposer` into `MealService` cleanly across components.

## In-Memory LLM Response Cache

`LlmRecipeDecomposer` passes a shared `LruMemoryCache<string, DecomposedDishResult>` (capacity 50) to `createGenAiToolResolver`:
- **Key Normalization**: Case-insensitive and whitespace-normalized (`normalizeDecompositionKey`).
- **Error Bypass**: Transient errors (500, 503, 429 quota, timeouts) throw normalized `AiError` (`AiMealError`) instances without caching so subsequent retries can succeed.
- **Testing**: Cache can be cleared via `LlmRecipeDecomposer.clearCache()` or disabled via `{ cache: null }`.
