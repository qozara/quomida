# 🤖 AGENTS.md — AI Coding Agent Guidelines & Repository Invariants

This document contains operational guidelines, architectural constraints, and strict invariants for AI coding agents working on **Quomida**.

---

## 🚨 CRITICAL REPOSITORY INVARIANTS (DO NOT BREAK)

1. **Strict Isomorphic Isolation of `@quomida/domain-core`**:
   - `packages/domain-core` MUST NOT import DOM APIs (`window`, `document`, `localStorage`), React, Vite, or database drivers.
   - It must remain 100% isomorphic TypeScript runnable in Node.js, Web Workers, and Browser engines.

2. **Historical Immutability of Daily Logs**:
   - `daily_logs` MUST snapshot hardcoded macro values (`{ calories, protein, carbs, fats }`) at creation time using `createMacroSnapshot()`.
   - Modifying a custom ingredient, recipe, or portion MUST NEVER retroactively recalculate or alter past `daily_logs` documents.

3. **BYOS Sync Adapter Isolation**:
   - Presentation logic in `apps/webapp` strictly communicates with the storage layer via the `SyncAdapter` interface (`packages/sync-adapters`).
   - Out-of-the-box local development MUST default to `MockSyncAdapter` so `npm run dev` works with zero initial cloud credential configuration.

4. **Test-Driven Development (TDD)**:
   - NEVER claim a task or bug fix is complete without running `npm run test` or `npx vitest run` to verify green test execution.
   - When introducing new domain logic, write unit tests in `packages/[package]/tests/` FIRST.

5. **Accessibility Requirements (WCAG 2.2)**:
   - Dynamic changes to sync status MUST be announced using `aria-live="polite"`.
   - All interactive touch buttons MUST maintain minimum touch target dimensions of 44x44 CSS pixels.
   - Root `<html lang="...">` attribute MUST update dynamically on language toggle.

---

## 🛠️ Verification Command Registry

```bash
# Run unit & domain tests (Vitest)
npm run test

# Run ETL pipeline (Seed catalog generator)
npm run etl

# Run CLI admin demo
npm run cli

# Build all monorepo packages
npm run build
```

---

## 📁 Key File Map

| System Component | File Path |
| :--- | :--- |
| RxDB Schemas | `packages/domain-core/src/schemas/index.ts` |
| Macro Calculations & Formulas | `packages/domain-core/src/calculations/index.ts` |
| Sync Adapter Interface | `packages/sync-adapters/src/types.ts` |
| Mock Sync Adapter | `packages/sync-adapters/src/MockSyncAdapter.ts` |
| LLM Natural Log Parser | `packages/llm-engine/src/LLMParser.ts` |
| React App Context & DB Provider | `apps/webapp/src/context/AppContext.tsx` |
| RxDB Database Hydration | `apps/webapp/src/db/rxdb.ts` |
| Portion Selection Bottom Sheet | `apps/webapp/src/components/PortionBottomSheet.tsx` |
| Macro Progress Rings | `apps/webapp/src/components/MacroRings.tsx` |
