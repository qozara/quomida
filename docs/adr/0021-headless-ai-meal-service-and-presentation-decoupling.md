# 0021. Headless AI Meal Service & Presentation Layer Decoupling

* Status: accepted
* Date: 2026-10-18

## Context and Problem Statement

Initially, AI natural language meal logging was tightly coupled to the React presentation layer in `apps/webapp` (`FoodLogger.tsx` and `SettingsModal.tsx`). The React components directly handled:
1. Instantiation and configuration of low-level AI clients and parsers (`QozaraAiMealParser`, `AgentClient`).
2. Ad-hoc error parsing via regular expressions (e.g., detecting rate limits or disabled status).
3. Orchestration of catalog resolution, portion matching, and macro snapshot generation.

This made it impossible to reuse the AI meal logging logic across other consumers in the Quomida ecosystem, such as the command-line interface (`@quomida/cli`) or future headless backend/microservice APIs (`apps/api`).

## Decision Outcome

We decided to decouple all AI domain orchestration, error classification, and key encryption from the presentation layer and encapsulate them inside the isomorphic `@quomida/llm-engine` package:

1. **`AiMealService` Orchestrator**:
   - Encapsulates the end-to-end meal logging pipeline: natural language parsing via polymorphic `LLMProvider`, catalog query matching via `CatalogSearchManager`, portion selection via `PortionManager`, and macro computation via `BatchAiMealResolver`.
   - Exposes clean, high-level methods: `parseNaturalLanguage(input)` and `processMeal(options)`.
   - Reusable across any runtime: Webapp (React), Node.js CLI (`@quomida/cli`), or API servers.

2. **Standardized `AiMealError` Hierarchy**:
   - Replaced fragile string/regex checks in UI components with typed `AiErrorCode` (`RATE_LIMIT_EXCEEDED`, `AI_DISABLED`, `NO_ITEMS_PARSED`, `NETWORK_ERROR`, `AUTHENTICATION_REQUIRED`, `PARSE_FAILED`).
   - A single `classifyAiError()` utility inspects provider exceptions and maps them to typed domain errors.

3. **`AiKeyEncryptionService`**:
   - Encapsulates envelope KMS encryption of user Gemini API keys (`encryptApiKey`), isolating `@qozara/ai-client` within `llm-engine` and removing leaky dependencies from React components (`SettingsModal.tsx`).

4. **Pure Presentation Components**:
   - `FoodLogger.tsx` and `SettingsModal.tsx` now serve strictly as presentation and state-rendering layers, delegating all domain logic and error classification to `@quomida/llm-engine`.

## Consequences

### Positive
- **100% Reusable**: CLI tools, serverless functions, REST APIs, and the React webapp share the exact same meal parsing, portion matching, and error classification logic.
- **Maintainable & Testable**: Headless unit and integration tests run in milliseconds without mounting DOM or mocking React contexts.
- **Clean Dependency Graph**: Presentation apps (`apps/webapp`) no longer need direct access to low-level client SDKs (`@qozara/ai-client`), adhering to Clean Architecture principles.
