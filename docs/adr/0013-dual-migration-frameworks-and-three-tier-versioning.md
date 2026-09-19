# 0013. Dual-Layer Migration Engines and Three-Tier Version Tracking Architecture

* Status: accepted
* Date: 2026-09-18

## Context and Problem Statement

Quomida is a privacy-first, local-first application built upon the Bring Your Own Storage (BYOS) architectural model. Unlike traditional SaaS applications with a single centralized database and unified migration pipeline, Quomida must manage data across two completely decoupled storage environments:
1. **Local Client Persistence**: In-browser storage via RxDB on IndexedDB.
2. **User-Owned Remote Storage**: Personal cloud drives and spreadsheets (such as Google Drive/Sheets, and future OneDrive/Box workbooks).

These two persistence targets have fundamentally different storage representations (document-relational IndexedDB vs tabular spreadsheets and JSON blobs) and independent operational lifecycles. Furthermore, users may run the app completely offline, connect to an existing spreadsheet created by an older version of the app, or manually edit spreadsheet columns in Google Sheets.

How should Quomida track versions, coordinate schema migrations across both storage targets, and prevent data loss or silent corruption when schema evolutions occur?

## Decision Drivers

* **Local-First Independence (Pillar 7):** The local database must initialize instantly and execute local migrations without requiring internet access or cloud provider tokens.
* **BYOS Isolation (Repository Invariant 4):** Presentation logic must communicate with cloud storage strictly via the `CloudSyncProvider` interface; local persistence must not depend on cloud persistence schemas.
* **Zero Data Loss Guarantee:** Both local and remote migrations must provide safety backups before applying schema mutations.
* **Zero Silent Corruption:** Structural mismatches or outdated remote schemas must halt auto-sync and require explicit, non-destructive remediation.
* **Developer Clarity:** Clear boundaries and documentation must enable future developers and AI coding agents to add schema fields or migrations without breaking either layer.

## Architecture: The Three-Tier Version Tracking Model

Quomida establishes three distinct, explicitly tracked version artifacts:

```
┌───────────────────────────────────────────────────────────────────┐
│ Tier 1: Application Version                                       │
│ • SemVer Release (e.g. 1.0.0) + Git Commit SHA                    │
│ • Defines active code, schemas, and migration scripts in bundle   │
└─────────────────────────────────┬─────────────────────────────────┘
                                  │
         ┌────────────────────────┴────────────────────────┐
         ▼                                                 ▼
┌───────────────────────────────────┐     ┌───────────────────────────────────┐
│ Tier 2: Local DB Version (RxDB)   │     │ Tier 3: Cloud Store Version       │
│ • RxDB collection schema version  │     │ • Google Drive appProperties      │
│ • Tracked in IndexedDB &          │     │   (quomida_schema_version)        │
│   localStorage schema hashes      │     │ • Google Sheets _migrations tab   │
│ • Runs independently offline      │     │ • Managed per connected provider  │
└───────────────────────────────────┘     └───────────────────────────────────┘
```

### 1. Tier 1 — Application Version (Release & Git Hash)
- **What it is**: The software release version (`package.json` SemVer) combined with the Git commit hash (e.g., `v1.0.0 (51628d8)`).
- **Where it is tracked**: Embedded into the build bundle via Vite environment variables and displayed in Settings/Diagnostics.
- **Role**: Serves as the single source of truth for the codebase's expectations for both Tier 2 and Tier 3 schemas.

### 2. Tier 2 — Local Database Schema Version (RxDB on IndexedDB)
- **What it is**: The integer version of each RxDB collection schema (`daily_logs: 0`, `base_ingredients: 0`, `recipes: 0`, `portions: 0`, `user_settings: 0`).
- **Where it is tracked**: Maintained by RxDB internally in IndexedDB metadata, plus tracked by `APP-DB6-GUARD` in `localStorage` (`rxdb_schema_hashes`).
- **Migration Engine**: Native **RxDB Migration Strategies** defined in `packages/domain-core/src/schemas/index.ts`.
- **Execution**: Runs automatically during client startup in `initDatabase()` (`apps/webapp/src/db/rxdb.ts`).
- **Safety Mechanism**: If a developer changes a schema without bumping version or providing a migration strategy, `APP-DB6-GUARD` prevents a fatal crash, performs an emergency raw IndexedDB JSON export, and renders `DatabaseRecoveryScreen`.

### 3. Tier 3 — Cloud Connected Store Version (Remote BYOS)
- **What it is**: The schema version of the user's remote cloud storage artifacts (e.g., Google Drive spreadsheets and JSON blobs).
- **Where it is tracked**:
  - Google Drive metadata: `appProperties.quomida_schema_version` (e.g. `"1"`).
  - Google Sheets: Hidden `_migrations` tab recording `[version, migrated_at]`.
  - In-memory mock version for `MockCloudSyncProvider`.
- **Migration Engine**: **`@qozara/gdocs-schema`** (`MigrationManager`, `SchemaValidator`, `GoogleSheetsFetchClient`), encapsulated within `packages/sync-adapters/src/google/ValidationService.ts`.
- **Execution**: Triggered when connecting or syncing via `CompositeCloudSyncProvider.repair()` and `migrate()`.
- **Safety Mechanism**: Prior to any remote migration or column repair, `createBackup()` creates a full Google Drive copy (`Backup of <id> - <timestamp>`). Missing columns are appended non-destructively.

## Decision Outcome

Chosen option: **Explicit Dual Migration Engines coordinated by CompositeCloudSyncProvider**.

### How the Two Engines Coexist

1. **Local Boot**: The application always boots locally first. Local RxDB migrations run synchronously. The app is fully interactive immediately, regardless of connectivity.
2. **Cloud Handshake**: When the cloud adapter initializes or initiates a sync:
   - It performs a health check against Tier 3 (`ValidationService.checkHealth()`).
   - If `remoteVersion < expectedVersion`: The adapter status enters `'upgrade_required'`.
   - If columns or tabs are missing: The adapter status enters `'corrupted'`.
3. **Automatic Suspension**: `CompositeCloudSyncProvider` intercepts `'upgrade_required'` and `'corrupted'` statuses and immediately suspends all background `pull()` and `push()` operations to protect both local and remote data.
4. **Remediation UX**: The presentation layer renders `SchemaRemediationModal`, informing the user that:
   - A backup will be generated automatically.
   - Existing data will be preserved.
   - Clicking "Repair" or "Upgrade" invokes `activeProvider.repair()` or `activeProvider.migrate()`.
5. **Resumption**: Once remote remediation succeeds, Tier 3 version updates to match Tier 1/2 expectations, the adapter transitions to `'idle'`, and synchronization resumes seamlessly.

### Positive Consequences
* **Complete Decoupling**: RxDB knows nothing about Google Sheets; `@qozara/gdocs-schema` knows nothing about RxDB or IndexedDB.
* **Offline Resilience**: Users can stay offline indefinitely; local schema migrations execute cleanly without cloud credentials.
* **Tamper Resilience**: Users editing columns in their personal Google Sheets do not corrupt local data; dynamic header mapping keeps sync functioning, and non-destructive repairs restore missing fields.
* **Auditability & Traceability**: Each layer maintains its own audit trail (RxDB internal versions, `_migrations` tab in Sheets, Git commit hash in UI).

### Negative Consequences / Tradeoffs
* Developers adding a new domain field to both local and remote storage must write migrations for **both** engines:
  1. RxDB migration strategy in `packages/domain-core`.
  2. Google Sheets column definition / `@qozara/gdocs-schema` migration in `packages/sync-adapters`.
* Comprehensive documentation and automated build guards (`validate-schemas.js`) are required to prevent developer oversight.
