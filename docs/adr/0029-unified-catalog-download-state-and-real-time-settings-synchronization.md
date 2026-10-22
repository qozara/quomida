# 29. Unified Catalog Download State and Real-Time Settings Synchronization

Date: 2026-10-22

## Status

Accepted

## Context

Following the implementation of adaptive background catalog downloading (ADR 0028), production testing revealed three UI/UX inconsistencies and state synchronization issues:

1. **Disconnected Hook State between AppContext and SettingsModal**:
   - `useCatalogDownload` maintained isolated component-local React state (`useState`).
   - When `AppContext` initiated a background auto-download on app launch, `downloadWorker.ts` downloaded and staged the catalog in OPFS. However, when the user opened `SettingsModal`, its separate hook instance was initialized with `idle` ("Not Downloaded") and never received updates from the worker running in `AppContext`.
   - Opening Settings after a background download completed showed "Not Downloaded" despite the full catalog already residing in OPFS and active in `RemoteCatalogService`.

2. **Opaque Background Network & File Operations**:
   - Neither `downloadWorker.ts`, `useCatalogDownload.ts`, nor `DatabaseBootstrapper.ts` emitted diagnostic `console.log` messages for storage persistence, fetch responses, decompression progress, SQLite header validation, or OPFS entries removal/reseeding.
   - Deletion of the downloaded catalog was so fast (<5ms for atomic OPFS file removal and reseeding from `system.sqlite`) that without feedback or UI state transition, users were uncertain if anything happened.

3. **Incoherent Catalog Cards and the "0 alimentos" Bug**:
   - Settings displayed two adjacent cards for the same catalog:
     - Card 1: "Food Catalog & Ingredients" (`catalogTitle`) with "Check for Catalog Updates" (`handleCheckCatalogUpdates`).
     - Card 2: "Offline Food Database" (`offlineDbTitle`) with download/delete buttons.
   - `CatalogHydrationService.hydrate()` hardcoded `itemsUpserted: 0` because it previously hydrated RxDB documents rather than SQLite. As a result, Card 1 displayed `Catálogo actualizado a <version_hash> (0 alimentos)`.
   - Deleting the downloaded catalog in Card 2 left Card 1 unchanged (showing the remote version hash instead of the active base system catalog), creating contradictory UI information.

## Decision

We unified the catalog download architecture into a reactive shared store and synchronized the Settings UI across both sections:

### 1. Shared Reactive Store in `useCatalogDownload`
- Implemented a module-level reactive state (`sharedState`) and listener set in `useCatalogDownload.ts`.
- All consumers (`AppContext`, `SettingsModal`, background sync tasks) share the exact same live state (`status`, `progress`, `error`, `isDeleting`).
- When a background auto-download starts or completes, all mounted UI components receive state transitions in real time.
- Registered an automatic listener on `RemoteCatalogService.onCatalogDownloaded` and exported `refreshCatalogDownloadStatus()` which dynamically inspects OPFS `catalog.sqlite` file size (>1MB indicates full catalog, $\le$1MB indicates system catalog).
- Hook consumers automatically refresh disk status when opened (`isSettingsOpen` transition).

### 2. Comprehensive Diagnostic Logging
- Added standardized console logs across all catalog lifecycles:
  - `[CatalogDownload] Starting download from: <url>`
  - `[downloadWorker] Archive response OK. Content-Length: <bytes>. Streaming & decompressing...`
  - `[downloadWorker] Stream finished. Decompressed file size: <bytes>. Verifying SQLite header...`
  - `[downloadWorker] Header verified: SQLite format 3 OK. Performing atomic swap in OPFS to catalog.sqlite...`
  - `[CatalogDownload] Download complete! Catalog is ready in OPFS.`
  - `[DatabaseBootstrapper] Removing downloaded catalog.sqlite from OPFS...`
  - `[DatabaseBootstrapper] Reseeding OPFS with built-in system.sqlite...`
  - `[RemoteCatalogService] Initialized local catalog with <count> items (OPFS VFS / Memory byteArray mode).`

### 3. Resolution of "0 alimentos" and Metadata Coherence
- Updated `CatalogHydrationService.hydrate()` to read `itemCount` from `catalog_meta.json` and persist `lastIngestedCatalogItemCount` into RxDB metadata.
- `hydrate()` returns `itemCount` and `itemsUpserted` matching the actual catalog item count from the manifest, eliminating `(0 alimentos)`.
- Exposed `catalogItemCount` via `AppContext` for immediate display across the app.

### 4. Harmonized Settings Catalog Cards
- **Card 1 ("Food Catalog & Ingredients")**:
  - Dynamically reflects active catalog tier:
    - If full catalog is installed: displays dynamic item count and dynamic version badge from remote metadata.
    - If built-in catalog is active: displays built-in item count and base version badge from `system_meta.json`.
  - When "Check for Catalog Updates" runs: displays updated version and item count dynamically formatted.
- **Card 2 ("Offline Food Database")**:
  - Shows real-time synchronization with Card 1:
    - Deleting the database resets status to `idle`, reseeds `system.sqlite`, and immediately switches Card 1 to built-in catalog status.
    - Downloading updates progress bar in real-time and switches both cards to full catalog state upon completion.

## Consequences

### Positive
- **100% UI Consistency**: Settings accurately reflects real OPFS disk state and background downloads without page reloads.
- **Accurate Item Metrics**: The catalog count dynamically reflects reality (parsed item count from remote metadata when installed, or `system_meta.json` when built-in) instead of misleading `(0 alimentos)`.
- **Full Observability**: Developers and power users can observe network fetch, worker decompression, atomic swap, and reseed operations in browser devtools.
- **Backward Compatibility**: `useCatalogDownload` maintains its existing call signature while guaranteeing multi-consumer reactivity.

### Negative / Trade-offs
- Slight increase in console verbosity in production (scoped to clear `[CatalogDownload]` and `[downloadWorker]` log prefixes).
