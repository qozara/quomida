# ADR 0035: Composite Symbolic + GenAI Resolver, Unified Settings Schema & Shared AI Client

## Status
Accepted (2026-11-17)

## Context
Quomida previously duplicated utility classes (`LruMemoryCache`, `AiMealError`/`classifyAiError`, `AiKeyEncryptionService`) inside `packages/ai-services` alongside raw tool-call extraction loops in `LlmRecipeDecomposer.ts`, while `FoodLogger.tsx`, `CatalogManager.tsx`, and `BatchAiMealReviewModal.tsx` each repeated OAuth token extraction and `LlmRecipeDecomposer` instantiation.

At the same time:
1. `@qozara/ai-client@1.1.0` introduced shared primitives (`createGenAiToolResolver`, `createCompositeAiResolver`, `extractToolCallData`, `LruMemoryCache`, `AiError`, `AiKeyEncryptionService`, `normalizeProviderPreference`, `isGenAiEnabled`) and made `AiProviderFactory` support `'auto'` cascading with strict opt-in (`enableLocalAi`) before probing localhost Ollama endpoints.
2. Quomida's built-in offline parsing (`StandardMealParser`, `BatchMealResolver`, OPFS SQLite search) is Symbolic AI that operates offline at zero cost, whereas optional Generative AI (`GenAI`) should enhance uncataloged dishes and missing ingredients behind the scenes without requiring end users to decide when or how to invoke AI.

## Decision
1. **Adopt `@qozara/ai-client@^1.1.0` in `@quomida/ai-services`**:
   - Delete duplicate `LruMemoryCache.ts`, `errors.ts`, and `AiKeyEncryptionService.ts` from `packages/ai-services/src/` and re-export the shared implementations (`AiMealError` alias, `AiError`, `classifyAiError`, `LruMemoryCache`, `AiKeyEncryptionService`, `normalizeProviderPreference`, `isGenAiEnabled`, `AiProviderFactory`, `createGenAiToolResolver`, `createCompositeAiResolver`, `extractToolCallData`) from `@quomida/ai-services`.
   - Refactor `LlmRecipeDecomposer` to delegate caching, provider factory resolution, error classification, and tool-call/JSON extraction to `createGenAiToolResolver`, preserving domain-specific prompt design (`DECOMPOSE_DISH_TOOL`, single-ingredient vs composite-recipe inference, fallback per-100g macro extraction).
2. **Unify `UserAiSettings` (`user_settings` Schema v2)**:
   - Extend `AiProviderType` to include unified preferences (`'auto'`, `'cloud'`, `'byok'`, `'local'`, `'local-browser'`, `'disabled'`) while preserving legacy values (`'qozara-intelligence'`, `'ollama'`, `'window.ai'`) for seamless multi-device cloud sync and RxDB upgrades.
   - Add `enable_local_ai?: boolean` to `UserAiSettings` and bump `userSettingsSchema` in `packages/domain-core` to `version: 2` with migration strategy `2` in `apps/webapp/src/db/rxdb.ts`.
   - Add `genAiEnabled?: boolean` to `MealService.processMeal` (`ProcessMealOptions`), preserving `aiEnabled` as a compatible alias.
3. **Centralize Composition & Clear GenAI Controls**:
   - Introduce `apps/webapp/src/hooks/useMealAiService.ts` (`extractGoogleOAuthToken`, `useMealAiService`) as the shared composition hook used by `FoodLogger`, `CatalogManager`, and `BatchAiMealReviewModal`.
   - Update Settings UX (`SettingsModal.tsx` and `@quomida/i18n-locales` `en.json`/`es.json`) to add `'auto'` (Recommended) as the default GenAI mode, add an explicit `"Allow Local Network AI (Ollama)"` opt-in toggle (`toggle-local-ai-enabled`), and clearly distinguish **Generative AI (GenAI)** from always-on deterministic offline parsing.

## Consequences
- **Positive**: Eliminates duplicated client boilerplate across `quozen` and `quomida`; prevents unintended localhost network probes unless explicitly opted in; ensures consistent `'auto'` cascade behavior and transparent fallback to deterministic catalog resolution.
- **Migration**: Existing IndexedDB `user_settings` v1 documents automatically upgrade to v2 on startup via `migrationStrategies[2]` in `apps/webapp/src/db/rxdb.ts`, preserving prior `'qozara-intelligence'` and `'ollama'` configurations.
