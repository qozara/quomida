# 🤖 AGENTS.md — AI Coding Agent Guidelines & Repository Invariants

This document contains operational guidelines, architectural constraints, and strict invariants for AI coding agents working on **Quomida**.

---

## 🚨 CRITICAL REPOSITORY INVARIANTS (DO NOT BREAK)

1. **Security-First Priority & Zero-Vulnerability Policy (NON-NEGOTIABLE)**:
   - Security is the HIGHEST priority for all code and configuration changes in Quomida.
   - AI coding agents MUST ALWAYS run `npm audit` and verify zero vulnerabilities exist before committing, pushing, or declaring a task complete.
   - Dependencies MUST be kept up-to-date with non-vulnerable, secure releases, adhering to modern secure coding standards.

2. **Strict Isomorphic Isolation of `@quomida/domain-core`**:
   - `packages/domain-core` MUST NOT import DOM APIs (`window`, `document`, `localStorage`), React, Vite, or database drivers.
   - It must remain 100% isomorphic TypeScript runnable in Node.js, Web Workers, and Browser engines.

3. **Historical Immutability of Daily Logs**:
   - `daily_logs` MUST snapshot hardcoded macro values (`{ calories, protein, carbs, fats }`) at creation time using `createMacroSnapshot()`.
   - Modifying a custom ingredient, recipe, or portion MUST NEVER retroactively recalculate or alter past `daily_logs` documents.

4. **BYOS Sync Adapter Isolation**:
   - Presentation logic in `apps/webapp` strictly communicates with the storage layer via the `SyncAdapter` interface (`packages/sync-adapters`).
   - Out-of-the-box local development MUST default to `MockSyncAdapter` so `npm run dev` works with zero initial cloud credential configuration.

5. **Test-Driven Development (TDD)**:
   - NEVER claim a task or bug fix is complete without running `npm run test` or `npx vitest run` to verify green test execution.
   - When introducing new domain logic, write unit tests in `packages/[package]/tests/` FIRST.

6. **Accessibility Requirements (WCAG 2.2)**:
   - Dynamic changes to sync status MUST be announced using `aria-live="polite"`.
   - All interactive touch buttons MUST maintain minimum touch target dimensions of 44x44 CSS pixels.
   - Root `<html lang="...">` attribute MUST update dynamically on language toggle.

7. **GitFlow Branching & PR Protection Policy**:
   - `main` is a PROTECTED production branch. Direct commits or direct pushes to `main` are STRICTLY FORBIDDEN.
   - All changes, features, and bug fixes MUST be implemented on dedicated branches (e.g. `feature/<name>`, `fix/<name>`).
   - Push feature branches to GitHub and allow the maintainer to review and merge PRs on the GitHub website.

8. **Ephemeral Implementation Plans (`implementation_plan.md`)**:
   - `implementation_plan.md` is a local, ephemeral file used strictly for tracking progress and guiding AI agents during feature development.
   - It is NOT intended to be persisted or committed to the repository.
   - Its content may change completely as features evolve. Official documentation should go in `docs/`, ADRs in `docs/adr/`, and tasks in GitHub issues.

9. **Local-First WebApp Security Posture**:
   - Content Security Policy (CSP): `apps/webapp/index.html` MUST maintain a strict CSP preventing `unsafe-eval` and unauthorized domains.
   - Subresource Integrity (SRI): Vite MUST build with `@small-tech/vite-plugin-sri` to generate script/style integrity hashes.
   - XSS Prevention: NEVER use `dangerouslySetInnerHTML` or raw DOM injection in React.
   - Cloud Credentials: Cloud provider tokens stored in IndexedDB (RxDB) MUST use minimal scopes (e.g., `drive.file`, `drive.appdata`) and short expirations to minimize local extraction blast radius.

---

## 📐 Mandatory Coding Principles & Feature Lifecycle Guidelines

AI coding agents MUST strictly adhere to the following 10 mandatory principles during any feature development, refactoring, or bug fix:

1. **Requirement Comparison & Scope Verification**:
   - Always compare requested feature specifications against implemented features to ensure 100% requirement coverage without missed specs.

2. **Strict TDD & Isolation of Domain vs Webapp Tests**:
   - Follow Test-Driven Development (TDD). Strictly isolate domain model unit tests (`packages/domain-core/tests/`) from presentation/webapp tests (`apps/webapp/`).

3. **Test-First Development & Pre-Code Security/NFR Analysis**:
   - Write failing unit/integration tests BEFORE writing implementation code.
   - Design and analyze security constraints, privacy requirements, and non-functional requirements (NFRs) before writing code to pass the tests.

4. **Full Regression Verification Before Completion**:
   - Before declaring any feature or refactoring complete, execute the full regression test suite (`npm run test`) and monorepo build (`npm run build`) to guarantee zero regressions.

5. **Clean Code & Best Design Practices**:
   - Prefer clean code, SOLID principles, clear domain abstractions, and robust software engineering practices over quick hacks or cutting corners.

6. **KISS & No Over-Engineering**:
   - Avoid over-engineering; favor the simplest, most elegant solution that satisfies all functional and non-functional requirements while maintaining high design standards.

7. **Pillars: Security-First, Local-First, Privacy-First**:
   - **Security-First**: Zero vulnerabilities (`npm audit`), input sanitization, zero hardcoded secrets.
   - **Local-First**: Primary data persistence and business logic run locally in IndexedDB via RxDB.
   - **Privacy-First**: No unexpected data collection or remote sync without user configuration; user data stays local by default.

8. **ADR Documentation**:
   - Document all major architectural, design, or feature decisions in Architectural Decision Records under `docs/adr/` following standard Markdown ADR formats.

9. **Pre-Feature ADR Review & Conflict Resolution**:
   - Before starting any new feature or refactoring, review ALL existing ADRs in `docs/adr/` to identify potential architectural conflicts or required refactorings. Ask the maintainer for confirmation before proceeding if conflicts exist.

10. **Dual-Language i18n Sync (English & Spanish)**:
    - Always implement and maintain complete internationalization in `@quomida/i18n-locales`. English (`en`) and Spanish (`es`) dictionary keys MUST be kept in 100% sync at all times.

---

## 🛠️ Verification Command Registry

```bash
# Run unit & domain tests (Vitest)
npm run test

# Run ETL pipeline (Seed catalog generator)
npm run etl

# Run CLI admin demo
npm run cli

# Run CLI Google OAuth login
npm run login --workspace=@quomida/cli

# Run live Google Drive & Sheets E2E sync test
npm run test:e2e --workspace=@quomida/cli

# Build all monorepo packages
npm run build
```

---

## 📁 Key File Map

| System Component | File Path |
| :--- | :--- |
| RxDB Schemas (Local Tier 2) | `packages/domain-core/src/schemas/index.ts` |
| Cloud Spreadsheet Schemas (Remote Tier 3) | `packages/sync-adapters/src/google/schemas.ts` |
| Google Validation & Remediation Service | `packages/sync-adapters/src/google/ValidationService.ts` |
| Serializers & Dynamic Header Mapping | `packages/sync-adapters/src/strategy/serializers.ts` |
| Composite Sync Adapter Orchestrator | `packages/sync-adapters/src/strategy/CompositeSyncAdapter.ts` |
| Sync Adapter Interface & Types | `packages/sync-adapters/src/types.ts` |
| Mock Sync Adapter | `packages/sync-adapters/src/MockSyncAdapter.ts` |
| Google Drive Sheets Sync Adapter | `packages/sync-adapters/src/GoogleDriveSheetsSyncAdapter.ts` |
| Macro Calculations & Formulas | `packages/domain-core/src/calculations/index.ts` |
| LLM Natural Log Parser | `packages/llm-engine/src/LLMParser.ts` |
| React App Context & DB Provider | `apps/webapp/src/context/AppContext.tsx` |
| RxDB Database Hydration & DB6 Guard | `apps/webapp/src/db/rxdb.ts` |
| Schema Remediation Modal | `apps/webapp/src/components/sync/SchemaRemediationModal.tsx` |
| Portion Selection Bottom Sheet | `apps/webapp/src/components/PortionBottomSheet.tsx` |
| Macro Progress Rings | `apps/webapp/src/components/MacroRings.tsx` |
| Persistence & Migrations Guide | `docs/persistence-and-migrations.md` |

