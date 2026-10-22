# 26. In-Memory LRU Cache for AI Recipe Decomposition

Date: 2026-10-21

## Status

Accepted

## Context

Quomida uses Just-In-Time (JIT) culinary recipe decomposition (`LlmRecipeDecomposer` in `@quomida/ai-services`) to estimate the raw ingredients and realistic gram weights of uncataloged cultural dishes (e.g. *"locro"*, *"shepherd's pie"*, *"pastel de papa"*).

In everyday user journeys, users frequently repeat the same query within a session:
1. **Accidental Double-Submits**: User presses `Enter` twice or double-clicks "Parse Meal".
2. **UI Navigation**: User searches for a dish, navigates away to check past logs or settings without saving, and searches for the same dish again.
3. **Portion Re-evaluation**: User tests different meal logging options for the same dish.

Without caching, every repeated search for an uncataloged dish issues a remote HTTP request to the edge AI proxy and upstream LLM (e.g. Gemini). This incurs unnecessary network latency (~1–3s), consumes daily request quotas, increases cloud proxy costs, and exposes users to transient upstream availability spikes (such as Gemini 503 high demand).

## Decision

We introduced a **transparent, in-memory LRU (Least Recently Used) cache** positioned at the final decision boundary of the meal processing pipeline in `@quomida/ai-services`:

1. **Pipeline Placement**:
   - The cache sits directly inside `LlmRecipeDecomposer.decomposeDish()`.
   - It is 100% transparent to `MealService`, `BatchMealResolver`, `StandardMealParser`, and React presentation components (`FoodLogger.tsx`).
   - The cache is checked only after local string parsing, local SQLite/IndexedDB catalog search, and the master AI toggle checks have concluded that remote escalation is required.

2. **Cache Sizing & Eviction Policy**:
   - **Capacity**: 50 entries.
   - **Memory Footprint**: ~20 KB total RAM footprint (negligible in browser and Node.js).
   - **Eviction**: O(1) LRU eviction backed by native JavaScript `Map` insertion ordering (`LruMemoryCache`). Accessed keys are promoted to the most recently used position; when size reaches 50, the oldest entry is evicted.

3. **Deterministic Key Normalization**:
   - Keys are normalized to be case-insensitive and resilient to extra whitespace:
     ```ts
     normalizeDecompositionKey(dishName, portionContext, locale)
     // e.g. "  LOCRO  " -> "locro|1 portion|es"
     ```

4. **Cache Admission Rules**:
   - **Cached**: Valid decompositions returning at least 1 constituent ingredient (`ingredients.length > 0`).
   - **Bypassed / Not Cached**: Upstream errors (500, 503, 429 quota, network timeouts) and empty responses. Transient failures are never cached so subsequent retries can succeed immediately once the upstream service recovers.

5. **Lifecycle & Testing Isolation**:
   - Default global cache is module-scoped, persisting across React re-renders and route navigation within the browser tab session.
   - Consumers can bypass the cache by passing `{ cache: null }` in `LlmRecipeDecomposerConfig`.
   - Testing harnesses can clear cache state via `LlmRecipeDecomposer.clearCache()`.

## Consequences

### Positive
- **Instant Response Times (0ms)**: Repeat searches for uncataloged cultural dishes resolve instantly in memory.
- **Zero Cost & Quota Protection**: Prevents burning daily anonymous/authenticated quotas on identical repeated queries.
- **Resilience to Transient Errors**: Re-submits during upstream 503 spikes do not poison the cache, while successful resolutions protect against future transient errors.
- **Zero Architectural Leakage**: `packages/domain-core` remains purely decoupled and unaware of the cache.

### Negative / Trade-offs
- In-memory cache is ephemeral to the active browser tab session (not persisted to IndexedDB or localStorage across browser restarts).
