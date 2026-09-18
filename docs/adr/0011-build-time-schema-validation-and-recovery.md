# 0011. Build-Time Schema Validation & Database Recovery UX

* Status: accepted
* Date: 2026-09-17

## Context and Problem Statement

Quomida relies on RxDB and IndexedDB for local-first data persistence. If a developer mutates an RxDB schema without bumping the version or providing a migration strategy, RxDB fails to initialize at runtime with a `DB6` error. Because Quomida handles migrations natively in RxDB, failed migrations or corrupted local states can result in application crashes on startup, leading to a poor user experience and potential data loss if users are forced to manually clear site data.

How should Quomida guard against schema evolution errors during development and gracefully recover from initialization failures or database corruption in production?

## Decision Drivers

* **Zero Regressions:** Developers must be prevented from committing invalid schema mutations that could cause `DB6` exceptions or break local storage.
* **No Data Loss Guarantee:** Users must have the ability to export their local database state if a migration or initialization fails, before resetting.
* **Graceful Degradation:** The application should never throw an unhandled white-screen-of-death (WSOD) on database failures.
* **TDD & Invariants:** Adherence to Quomida's AGENTS.md invariant regarding schema updates and migrations.

## Considered Options

* Option 1: Handle DB errors globally and automatically purge user data.
* Option 2: Rely on Vite dev server warnings.
* Option 3: **Strict build-time Node script validation coupled with pre-migration Dexie/IndexedDB raw backups.**

## Decision Outcome

Chosen option: **Option 3 (Strict build-time Node script validation and pre-migration Dexie/IndexedDB raw backups)**.

### Positive Consequences
- **Build Guard:** A `validate-schemas.js` script statically enforces schema invariants during the build step (`npm run build`). It prevents deployment of code where schemas change without a version bump, or where versions > 0 lack a migration strategy.
- **Fail-Safe Export:** If `initDatabase` catches a failure (`SCHEMA_MISMATCH`, `MIGRATION_FAILED`, or `CORRUPTION`), a raw fallback using the browser's native `indexedDB` API dumps the entire database into a JSON format.
- **Recovery UI:** Users are presented with a dedicated `DatabaseRecoveryScreen` allowing them to securely download their unmigrated data backup before executing `clearLocalDatabase()`, ensuring zero data loss.

### Negative Consequences / Tradeoffs
- The build script manually analyzes AST/Code (or checks for keyword strings like `migrationStrategies`), which is slightly brittle compared to a full TypeScript compiler plugin.
- The raw Dexie fallback JSON format is untyped and may require a separate manual tool for the user to re-import or salvage the data into the cloud.
