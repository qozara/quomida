# ADR 003: Hybrid OPFS Catalog Strategy

## Status
Accepted

## Context
Quomida uses an extensive food catalog of ~1.1 million items derived from Open Food Facts. Initially, we explored inserting this massive dataset into the client-side IndexedDB using RxDB. This approach was deeply flawed because:
- The initial sync and hydration took gigabytes of RAM.
- IndexedDB write performance bottlenecked browser main and worker threads.
- Device storage on iOS aggressively evicted the uncompressed structures.

## Decision
We decided to adopt a **Zero-Memory Hybrid OPFS Strategy**:
1. **Physical Isolation**: We cleanly separated User Data (managed by RxDB in IndexedDB) from System Data (managed by SQLite in OPFS).
2. **Direct Streaming to OPFS**: Instead of loading the 200MB catalog into RAM to parse, we created a Web Worker (`downloadWorker.ts`) that fetches `catalog.sqlite.gz`, pipes it through `DecompressionStream('gzip')`, and writes the uncompressed binary bytes directly to a `FileSystemWritableFileStream` targeting the Origin Private File System (OPFS).
3. **HTTP Range Request Fallback**: If the user has not yet downloaded the full catalog over Wi-Fi, the app seamlessly falls back to `sqlite-wasm-http`. This VFS uses HTTP `Range` headers to execute SQLite queries against the remote `catalog.sqlite` file hosted on Cloudflare R2, fetching only the specific kilobytes needed to resolve Trigram fuzzy queries.
4. **Persistent Storage**: We prompt `navigator.storage.persist()` upon successful download to request protection against browser eviction algorithms.

## Consequences
- **Positive**: Near-instant fuzzy search against 1.1 million records locally with zero memory overhead.
- **Positive**: App can function immediately after load without forcing users to wait for a 200MB download on cellular connections.
- **Negative**: Adds architectural complexity, requiring developers to maintain both RxDB and SQLite-WASM integrations within the monorepo.
