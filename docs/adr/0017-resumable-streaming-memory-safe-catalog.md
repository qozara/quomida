# 17. Resumable Streaming & Memory-Safe Catalog Architecture

* Status: accepted
* Date: 2026-09-22

## Context and Problem Statement

Following the initial release of the decoupled catalog hydration (ADR 0015), Quomida began integrating the massive Open Food Facts (OFF) database, causing the `catalog.json` file to swell from kilobytes to over 50MB (millions of rows).

The original client-side delta diffing strategy pulled the entire `source: 'system'` RxDB collection into memory to compare against the incoming stream. As the database grew, this caused:
1. **Out-of-Memory (OOM) Crashes:** Mobile Safari and lower-end Android devices crashed when attempting to hold hundreds of thousands of RxDB documents in RAM simultaneously.
2. **UI Thread Freezes:** Running `bulkUpsert` synchronously on thousands of items caused the React UI to stutter or lock up entirely.
3. **Fragile Network Transfers:** Downloading a 50MB file on an unstable mobile connection meant any interruption forced a full restart from 0 bytes, creating infinite retry loops.
4. **Search Performance Degradation:** The Food Logger's search input originally subscribed to the *entire* `base_ingredients` collection in a global React state array, running `Array.filter()` on every keystroke. For millions of rows, this locked the main thread for seconds.

## Decision

We have overhauled the Catalog Hydration Service and the UI search patterns to implement a **Resumable, Memory-Safe Streaming Architecture**:

1. **CDN-Level Compression with Uncompressed Fallback (Brotli/GZIP)**:
   - The ETL pipeline outputs standard uncompressed `catalog.json`.
   - We rely exclusively on Cloudflare/GitHub Pages edge nodes to apply `Content-Encoding: br` (Brotli) or `gzip` natively on the wire.
   - The browser automatically decompresses it, reducing the 50MB payload to ~5MB for the initial download.

2. **Resumable HTTP `Range` Streaming**:
   - The frontend's `fetch` operation reads the stream chunk-by-chunk using `TextDecoder`.
   - If the network drops, the application captures the error, waits via exponential backoff (e.g., 5s, 10s, 30s), and re-issues the `fetch` request utilizing the `Range: bytes=${uncompressedBytesRead}-` HTTP header.
   - The CDN responds with `206 Partial Content`, and the stream seamlessly resumes parsing JSON lines from the exact interruption point.

3. **Memory-Safe Chunked Diffing & Upserting**:
   - The `CatalogHydrationService` no longer loads existing database items into memory at the start.
   - Incoming JSON lines are buffered into micro-batches (5,000 items). 
   - For each batch, a targeted RxDB query (`db.base_ingredients.find({ selector: { id: { $in: batchIds } } })`) fetches only the relevant documents.
   - The diff is performed, changes are `bulkUpsert`ed, and the memory buffer is cleared. **RAM utilization remains completely flat** regardless of total catalog size.

4. **Event-Loop Yielding**:
   - After processing each 5,000-item batch, the async loop explicitly yields control back to the browser via `await new Promise(resolve => setTimeout(resolve, 0))`, ensuring CSS animations and React renders remain completely fluid during massive updates.

5. **Dynamic RxDB Search Indexing**:
   - The `AppContext` now strictly limits its global observer to `source: 'custom'` items.
   - The `FoodLogger` and LLM parser have been refactored to query RxDB directly using limited Mango `$regex` queries (`limit: 20`). This completely eliminates the bottleneck of loading and filtering millions of items in React state.

6. **AbortController Mutex & UI Tracking**:
   - Hydration jobs expose an `AbortSignal` to stop the parser and close database transactions instantly.
   - The UI surfaces a granular progress bar detailing percentage and total bytes, complete with a manual "Cancel" button.

## Consequences

- **Pros**:
  - **Infinite Scalability:** Memory consumption remains constant (~5MB for buffers) whether processing 10 thousand or 10 million items.
  - **UI Responsiveness:** Searching is blazing fast (sub-10ms), and background updates never stutter the interface.
  - **Network Resilience:** Flaky mobile connections can download massive updates incrementally without wasting bandwidth on restarts.
  - **Zero CI Overhead:** By relying on edge-node compression, the ETL pipeline remains simple and agnostic to compression dictionaries.
- **Cons**:
  - Resuming a failed stream with `Range` forces the CDN to serve the remainder of the payload *uncompressed* (as CDNs cannot slice compressed LZ77 streams on the fly). This is an acceptable tradeoff, as the remaining bandwidth is still less than restarting the download from 0.
