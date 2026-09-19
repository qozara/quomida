# 0010. Storage Strategy Pattern & Composite Multi-Format Cloud Sync Connectors

* Status: accepted
* Date: 2026-09-15

## Context and Problem Statement

Quomida uses Bring Your Own Storage (BYOS) to give users full ownership of their synchronized data. However, cloud storage requirements differ fundamentally across domain boundaries:
1. **User Settings (`user_settings`)**: Internal application configuration that should reside in hidden, tamper-resistant application storage (e.g. Google Drive `appDataFolder`) as JSON blobs.
2. **Transactional Meal Logs (`daily_logs`)**: Highly private user data that users often want to inspect, chart, or analyze in standard spreadsheet programs (Google Sheets, Microsoft Excel) without exposing them to others.
3. **Food & Ingredient Catalog (`base_ingredients`, `recipes`, `portions`)**: Master data that users frequently wish to share with friends, family, or coaches without disclosing their personal daily meal logs.

Directly coupling the app to Google Drive/Sheets APIs would contaminate domain and presentation layers, preventing future connectors for Microsoft OneDrive, Box, or Dropbox.

## Decision Drivers

* **Zero Vendor Contamination**: Presentation logic in `apps/webapp` and domain models in `@quomida/domain-core` must remain 100% agnostic of Google Drive, Sheets, OneDrive, or Box APIs.
* **Storage Strategy Pattern**: Clear architectural separation between blob persistence (`BlobStorageDriver`) and tabular spreadsheet persistence (`TabularStorageDriver`).
* **Granular Privacy & Sharing Boundary**: Food catalog and daily meal logs MUST be persisted as separate files/documents, enabling native cloud sharing of recipes and foods without leaking private consumption ledgers.
* **Write-Only Denormalization**: Logs written to spreadsheets generate a redundant, human-readable summary column (`food_details_readonly`) on the fly for standalone pivot tables and charts, while pull replication structurally ignores this column.
* **Minimal OAuth Scope Footprint**: Restricted only to non-sensitive scopes (`drive.file` and `drive.appdata`), bypassing complex verification processes and security risks.

## Decision Outcome

Chosen option: **Storage Strategy Pattern with `CompositeCloudSyncProvider`, Abstract Storage Drivers, and Document-Based Collection Routing**.

### Architectural Blueprint

```
                     ┌────────────────────────┐
                     │   RxDB Database Layer  │
                     └───────────┬────────────┘
                                 │ SyncDeltaPayload
                                 ▼
                     ┌────────────────────────┐
                     │  CompositeCloudSyncProvider  │
                     └─────┬────────────┬─────┘
                           │            │
             Collection    │            │ Collection
            user_settings  │            │ daily_logs, base_ingredients,
                           ▼            │ recipes, portions
            ┌─────────────────────┐     ▼
            │  BlobStorageDriver  │ ┌────────────────────────┐
            └──────────┬──────────┘ │  TabularStorageDriver  │
                       │            └───────────┬────────────┘
         Google Drive  │                        │ Google Sheets
         appDataFolder │                        │ (Separate Spreadsheets)
                       ▼                        ▼
               settings.json         ┌───────────────────────────┐
                                     │ Quomida Food Catalog      │ (Shareable)
                                     │  ├── base_ingredients    │
                                     │  ├── recipes              │
                                     │  └── portions             │
                                     ├───────────────────────────┤
                                     │ Quomida Daily Logs        │ (Private)
                                     │  └── daily_logs           │
                                     └───────────────────────────┘
```

### Core Abstractions (`packages/sync-adapters`)

1. **`BlobStorageDriver`**:
   - Contract for key/value file persistence: `readBlob<T>(filename)`, `writeBlob<T>(filename, data)`, `deleteBlob(filename)`.
   - Google implementation: `GoogleDriveBlobDriver` targets `spaces=appDataFolder` using multipart upload/patch.

2. **`TabularStorageDriver`**:
   - Contract for structured multi-sheet documents: `ensureDocument(title, tabs)`, `readTable(documentId, tabName)`, `writeTable(documentId, tabName, headers, rows)`.
   - Google implementation: `GoogleSheetsTabularDriver` manages spreadsheet creation and `values:batchUpdate` calls.

3. **`CompositeCloudSyncProvider`**:
   - Extensible base class implementing `CloudSyncProvider`.
   - Dispatches collections according to declarative routing:
     - `user_settings` ➔ Blob driver (`settings.json`).
     - `daily_logs` ➔ Tabular driver (Document: `Quomida Daily Logs`, Tab: `daily_logs`).
     - `base_ingredients`, `recipes`, `portions` ➔ Tabular driver (Document: `Quomida Food Catalog`, Tabs: `base_ingredients`, `recipes`, `portions`).

4. **Synchronous Denormalization via Schema Snapshotting**:
   - Following *Invariant 3* (macro snapshotting), `daily_logs` now also snapshots `food_name`.
   - The tabular serializer generates `food_details_readonly` (e.g., `"Pechuga de Pollo | 247kcal | 46g P, 0g C, 5g F"`) purely from snapshot data without triggering asynchronous lookups during sync replication.

## Positive Consequences

* **Future Provider Readiness**: Implementing Microsoft OneDrive with Excel Online or Box requires only creating `OneDriveBlobDriver` and `ExcelOnlineTabularDriver`, plugging directly into `CompositeCloudSyncProvider`.
* **Zero Cross-Contamination**: Neither `apps/webapp` nor `@quomida/domain-core` import or reference Google SDKs.
* **Full Data Sovereignty**: Users can share their `Quomida Food Catalog` Google Sheet with anyone using Google Drive's native sharing dialog, while their calorie consumption logs stay strictly private in `Quomida Daily Logs`.
* **Isolated Testing**: All drivers and composite routing are covered by comprehensive unit tests using mocked HTTP interfaces without network calls or third-party credentials.
