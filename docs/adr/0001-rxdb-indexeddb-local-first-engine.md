# 0001. RxDB + IndexedDB Local-First Client Engine

* Status: accepted
* Date: 2026-09-12

## Context and Problem Statement

Nutritional and calorie tracking applications require instantaneous feedback (zero latency) when searching foods, logging portions, and updating daily progress rings. Traditional SaaS apps suffer from 300–800ms API latency, network drops, and server dependency. How should Quomida manage data persistence and client reactivity?

## Decision Drivers

* Zero-latency read/write operations for instant UI responsiveness.
* Robust offline-first execution with full functionality without an internet connection.
* Native reactive observables to drive UI state seamlessly without complex boilerplate.
* Built-in JSON Schema enforcement and silent migration capabilities.

## Considered Options

* Option 1: Direct REST API calls to a centralized backend database (PostgreSQL/Supabase).
* Option 2: Pure LocalStorage / SessionStorage key-value pairs.
* Option 3: **RxDB with IndexedDB storage engine**.

## Decision Outcome

Chosen option: **Option 3 (RxDB + IndexedDB)**.

### Positive Consequences
- Writes and reads occur immediately on client IndexedDB, providing instant UX.
- Native RxDB observables push state changes directly to React UI components.
- JSON schema validation enforces structural integrity locally before synchronization.
- Works 100% offline out of the box.

### Negative Consequences / Tradeoffs
- Requires hydration strategy for initial seed catalog on first launch.
- Schema version bumps require explicit migration logic in `packages/domain-core`.
