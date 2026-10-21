# 25. Pure Domain MealService and Hexagonal AI Services Architecture

Date: 2026-10-21

## Status

Accepted (Refines and supersedes ADR 0021)

## Context

In ADR 0021, `AiMealService` was introduced in `@quomida/llm-engine` to orchestrate meal logging, RAG catalog lookups, and AI parsing. With the introduction of the hybrid meal architecture (ADR 0024), the initial remote LLM call was eliminated in favor of the local, deterministic `StandardMealParser` running in `< 1ms` offline.

However, keeping `MealService` inside `@quomida/llm-engine` created significant architectural and cognitive dissonance:
1. **Cognitive Mismatch**: Developers imported `MealService` from `@quomida/llm-engine` to log ordinary foods (e.g. `"2 bananas"`), even though 90% of requests use zero AI.
2. **Residual Domain "AI" Artifacts**: Core domain entities retained legacy AI prefixes (`BatchAiMealResolver`, `ResolvedAiBatchMeal`, `ResolvedAiMealItem`) despite performing deterministic SQLite/IndexedDB fuzzy queries and portion math.
3. **Muddled Boundaries**: `@quomida/llm-engine` was acting as both an application workflow service and an external AI client adapter.

## Decision

We restructured the architecture according to **Clean Hexagonal Architecture (Ports & Adapters)** and **Dependency Inversion**:

1. **Move `MealService` to `@quomida/domain-core`**:
   - `MealService` is a pure domain workflow orchestrator (`packages/domain-core/src/services/MealService.ts`).
   - It coordinates deterministic parsing (`StandardMealParser`), catalog matching (`CatalogSearchManager`), and batch resolution (`BatchMealResolver`).
   - It remains 100% isomorphic and offline, with **zero external AI SDK dependencies** (`AGENTS.md` Invariant #2).

2. **Define `IRecipeDecomposer` Domain Port**:
   - `@quomida/domain-core` declares the `IRecipeDecomposer` interface (`packages/domain-core/src/parser/types.ts`).
   - `MealService` accepts an optional `decomposer?: IRecipeDecomposer` via constructor injection.
   - If a decomposer is provided and AI is enabled, uncataloged cultural dishes escalate to it; otherwise, the workflow executes purely locally.

3. **Repurpose `@quomida/llm-engine` to `@quomida/ai-services`**:
   - Renamed package to `@quomida/ai-services`.
   - Houses strictly external AI infrastructure adapters:
     - `LlmRecipeDecomposer`: Implements `IRecipeDecomposer` using `@qozara/ai-client`.
     - `AiKeyEncryptionService`: Encrypts user Gemini API keys using the edge KMS proxy.
   - Deleted dead legacy code: `QozaraAiMealParser.ts`, `LLMParser.ts`, and temporary compatibility alias shims (`AiMealService.ts`).

4. **Clean Domain Naming (No Residual "AI" Prefixes)**:
   - `BatchAiMealResolver` $\rightarrow$ `BatchMealResolver`
   - `ResolvedAiBatchMeal` $\rightarrow$ `ResolvedBatchMeal`
   - `ResolvedAiMealItem` $\rightarrow$ `ResolvedMealItem`
   - `RawParsedAiItem` $\rightarrow$ `RawParsedMealItem`

## Consequences

### Positive
- **Architectural Clarity**: Clear separation between pure domain workflow logic (`@quomida/domain-core`) and external AI adapters (`@quomida/ai-services`).
- **Zero Cognitive Dissonance**: Developers import `MealService` from `domain-core` for standard meal logging, and only import `@quomida/ai-services` when configuring AI adapters.
- **Strict Domain Isolation**: `@quomida/domain-core` has zero network or AI SDK dependencies, ensuring 100% offline testability and bundle efficiency.
- **Beta Cleanliness**: Removed all temporary backward-compatibility aliases and legacy shims.

### Negative / Trade-offs
- Presentation layer (`apps/webapp`) must explicitly instantiate and inject `LlmRecipeDecomposer` into `MealService` when AI is enabled.
