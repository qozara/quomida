# 15. Decoupled Catalog Hydration & Two-File Delta Synchronization

* Status: accepted
* Date: 2026-09-20

## Context and Problem Statement

Quomida relies on a rich, built-in catalog of nutritional items (ARGENFOODS, LATINFOODS, USDA). In previous iterations (ADR 0005), this catalog was compiled directly into a static bundle file (`seed_v1.json`) within the web application source tree. 

As the food database scales to tens of thousands of items:
1. Re-deploying the entire web application bundle simply to deliver incremental food catalog corrections or regional additions is inefficient.
2. Downloading multi-megabyte payloads on every client application start wastes mobile bandwidth and slows down startup.
3. Pure HTTP caching (ETag/If-None-Match) is susceptible to cache invalidation or browser storage flushes, forcing redundant downloads even when the local RxDB database already holds the data.
4. User-created custom foods (`source: 'custom'`) must remain strictly isolated and never overwritten by automated catalog updates.
5. Ingestion of untrusted or malformed remote catalog data could introduce XSS or data integrity issues into client databases.

## Decision

We have implemented a **Decoupled Catalog Hydration Architecture** using a **Two-File Delta Synchronization Pattern**:

1. **Two-File Distribution Strategy**:
   - The ETL pipeline (`apps/etl-pipeline`) outputs two separate assets:
     - `catalog_meta.json`: A lightweight manifest (~50 bytes) containing `{ "catalogVersion": "...", "generatedAt": "..." }`.
     - `catalog.ndjson`: The complete, versioned payload containing all validated food items.
   - The client `CatalogHydrationService` always checks `catalog_meta.json` first (with cache-busting). It **only** downloads the larger `catalog.ndjson` if the remote version differs from the version stored in the local `system_metadata` RxDB collection.

2. **Client-Side In-Memory Delta Upsert**:
   - When a new catalog is downloaded, `CatalogHydrationService` queries RxDB for existing items with `source: 'system'` only.
   - It performs an in-memory diff against existing items and executes `bulkUpsert` only for new or modified records.
   - Custom ingredients created by the user (`source: 'custom'`) are strictly excluded from comparison and updates, guaranteeing zero data loss or collision.

3. **Shift-Left Security Boundary**:
   - Sanitization (HTML/script tag stripping) and nutritional value validation (finite, non-negative numbers) are enforced directly within the ETL pipeline build step.
   - The client browser is spared the overhead of heavy runtime schema compilation, treating the static catalog as pre-validated data.

4. **Infrastructure-Agnostic Hosting**:
   - The web application consumes the catalog via an environment variable: `VITE_CATALOG_BASE_URL`.
   - In local development and CI: `VITE_CATALOG_BASE_URL=""` (served directly from `apps/webapp/public/` with graceful 404 degradation).
   - In production: `VITE_CATALOG_BASE_URL` can point to any static host (GitHub Pages, AWS S3, Cloudflare R2, Vercel Blob) without requiring webapp code changes or redeployments.

5. **User Feedback & Manual Trigger**:
   - Background hydration runs asynchronously and silently on application boot without blocking the initial UI render.
   - A manual "Check for Catalog Updates" trigger is provided in `SettingsModal` with loading states, touch-target compliance (>=44x44px), and `aria-live="polite"` status announcements.

## Consequences

- **Pros**:
  - **Bandwidth Efficiency**: Zero megabytes downloaded unless catalog version changes.
  - **Fast Ingestion**: Only modified/new items are written to IndexedDB.
  - **Isolation**: 100% guarantee that custom user recipes and ingredients are never touched.
  - **Infrastructure Portability**: Can switch static hosting providers simply by updating `VITE_CATALOG_BASE_URL`.
  - **Offline Resilience**: Web application functions completely offline using existing RxDB records or initial bundled seeds.
- **Cons**:
  - Requires maintaining two files (`catalog_meta.json` and `catalog.ndjson`) in the ETL pipeline output.
