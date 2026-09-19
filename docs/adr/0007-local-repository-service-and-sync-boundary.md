# 0007. LocalDBService Repository Pattern and Unified BYOS Sync Boundary

* Status: accepted
* Date: 2026-09-13

## Context and Problem Statement

Quomida operates as a local-first application where user settings, food logs, and custom catalog items persist in-browser using RxDB and IndexedDB. React UI components require immediate reactive state updates while simultaneously pushing delta updates to a Bring Your Own Storage (BYOS) backend. Direct component interaction with RxDB instances creates tight coupling and leads to duplicated sync logic. How should Quomida structure data mutations, reactive subscriptions, and BYOS sync dispatch?

## Decision Drivers

* Strict separation of concerns between presentation components and local persistence logic.
* Guaranteed synchronization of all local collections (`user_settings`, `base_ingredients`, `daily_logs`) to the same active `CloudSyncProvider`.
* Native RxJS observable subscriptions driving reactive UI updates on local writes or remote pull merges.
* Centralized domain validation (such as `validateMacroAlignment`) preventing invalid document insertion.

## Decision Outcome

Chosen option: **`LocalDBService` Repository Pattern with Unified Sync Boundary**.

### Implementation Details

1. **Storage Adapter Selection**: Initializes RxDB using `getRxStorageDexie()` in browser environments with automatic fallback to memory storage during Vitest unit testing.
2. **Unified BYOS Sync Boundary**: All write operations (`saveSettings`, `saveCustomFood`, `logFood`, `deleteLogItem`) mutate RxDB and automatically dispatch payload deltas to the configured `CloudSyncProvider`.
3. **Reactive Stream Subscriptions**: Exposes `observeLogsByDate()` and `observeIngredients()` streams, allowing React components in `apps/webapp` to re-render automatically when local database updates occur.

### Positive Consequences

- UI components consume simple, typed async methods without directly invoking RxDB queries.
- User configuration and app settings automatically sync to the same BYOS backend as nutritional logs.
- Test suites can mock storage engines and sync adapters easily using standard dependency injection.
