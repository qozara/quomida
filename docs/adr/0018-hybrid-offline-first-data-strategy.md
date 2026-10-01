# 18. Hybrid Offline-First Data Strategy (WASM SQLite VFS)

Date: 2026-09-27

## Status

Accepted (Supersedes ADR 0015 regarding the External Remote Tier bulk download strategy)

## Context

The Quomida application utilizes an ETL pipeline to aggregate regional food data (e.g., ARGENFOODS, SARA) into a unified JSON catalog. Previously, this external `catalog.json` (which scales up to 900MB when fully integrating Open Food Facts and global datasets) was downloaded directly by the client and streamed into the local RxDB (IndexedDB). 

Forcing a full client-side download via CDN severely degrades the mobile experience on cellular networks, causes browser memory eviction on low-end devices, and violates the immediate-onboarding UX pillar. 

However, introducing a traditional backend API for search violates the project's strict serverless, privacy-first, and local-first BYOS (Bring Your Own Storage) architecture. We need a way to query large remote datasets dynamically without downloading them entirely and without managing active backend servers.

## Decision

We will transition to a **Hybrid Offline-First Data Strategy** utilizing a WebAssembly (WASM) Virtual File System (VFS) to query a remote `.sqlite` database via HTTP Range Requests.

### 1. The VFS Engine
We will implement `sqlite-wasm-http` to intercept database reads in the webapp and issue targeted HTTP `Range` headers to the CDN. This fetches only the specific 4KB B-tree pages necessary to resolve a query, rather than downloading the entire file.

### 2. The Local Seed
The client will continue to ship with the existing `catalog_system.ndjson` seed containing foundational Latin American foods. This guarantees instant offline capabilities upon initial load.

### 3. Just-In-Time (JIT) Caching
When a user executes a search, the UI will query both the local RxDB and the remote WASM VFS concurrently. If a remote item is selected, the full `BaseIngredient` object is instantly cloned into the local RxDB `base_ingredients` collection with `source: 'system'`.

### 4. Sync Isolation
To prevent bloating the user's personal cloud storage (e.g., Google Drive), the sync adapter framework will explicitly filter out these cached remote items. Only custom-made ingredients (`source: 'custom'`) and AI-generated items (`source: 'ai'`) will be pushed to the cloud connector.

## Consequences

- **Positive:** Immediate onboarding time (zero bulk downloading required for the external catalog).
- **Positive:** Zero server maintenance. We remain fully static (CDN-hosted).
- **Positive:** Reduced memory footprint on low-end devices since we avoid hydrating millions of items into IndexedDB.
- **Positive:** Lean cloud sync payload; users only back up what they create.
- **Negative:** Search over the external catalog requires an active internet connection (though the built-in system seed and all cached items are available offline).
- **Negative:** Increased complexity in the client-side search architecture (querying two separate engines and merging results).
- **Negative:** Stricter Content Security Policy (CSP) requirements to allow WASM execution.
