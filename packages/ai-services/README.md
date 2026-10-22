# @quomida/ai-services

Optional external AI adapters for Quomida, encapsulating edge KMS API key encryption and Just-In-Time (JIT) culinary recipe decomposition.

## Architectural Boundary

`@quomida/ai-services` contains strictly external AI infrastructure adapters that depend on `@qozara/ai-client`:
- **`LlmRecipeDecomposer`**: Implements the `IRecipeDecomposer` domain port declared in `@quomida/domain-core`. Decomposes unknown cultural dishes into base agricultural staples when queries yield no catalog match. Includes an in-memory LRU cache (`LruMemoryCache`, capacity 50) that transparently caches valid responses for 0ms repeat lookups.
- **`LruMemoryCache`**: Generic, zero-dependency in-memory LRU cache backed by native JavaScript `Map` insertion order.
- **`AiKeyEncryptionService`**: Encrypts user Gemini API keys using Quomida's edge KMS proxy for safe storage in RxDB and cloud spreadsheets.
- **`AiMealError` & `classifyAiError`**: Error normalization classifying provider status codes (`RATE_LIMIT_EXCEEDED`, `AI_DISABLED`, `AUTHENTICATION_REQUIRED`).

## In-Memory LLM Response Cache

`LlmRecipeDecomposer` transparently caches successful decompositions in memory:
- **Capacity**: 50 entries (LRU eviction).
- **Key Normalization**: Case-insensitive and whitespace-normalized (`normalizeDecompositionKey`).
- **Error Bypass**: Transient errors (500, 503, 429 quota, timeouts) are never cached, allowing subsequent retries to succeed.
- **Testing**: Cache can be cleared via `LlmRecipeDecomposer.clearCache()` or disabled via `{ cache: null }`.

Deterministic natural language meal parsing and core meal logging workflow orchestration live 100% offline in `@quomida/domain-core` (`MealService`, `StandardMealParser`, `BatchMealResolver`).
