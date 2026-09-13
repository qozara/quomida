# 0006. LLM Natural Language Meal Parser with Graceful Fallback

* Status: accepted
* Date: 2026-09-12

## Context and Problem Statement

Users frequently want to log meals using natural language text (e.g. *"I ate 2 baked beef empanadas"*). However, LLM providers (remote APIs, local Ollama, Chrome Nano) may suffer from network latency, rate limits, or offline unavailability.

## Decision Outcome

Chosen option: **Graceful Fallback Degradation Pattern in `@quomida/llm-engine`**.

The `parseNaturalLanguageLog` function wraps natural language provider execution in try-catch/timeout blocks. If the LLM provider fails or times out, it gracefully returns `null`, causing the UI to smoothly switch back to the traditional catalog search bar without throwing unhandled exceptions or blocking user interaction.

### Positive Consequences
- The application remains 100% usable even when LLM endpoints are completely offline or timing out.
- High resilience and non-blocking UX.
