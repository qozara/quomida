# 💾 Quomida Persistence, Versioning & Dual Migration Architecture

This document provides a comprehensive technical guide to Quomida's persistence layer, the three-tier version tracking system, and the two independent schema migration frameworks running in the application.

---

## 🏛️ System Overview

Quomida follows a **Local-First, Bring Your Own Storage (BYOS)** architecture. Unlike typical client-server applications backed by a single centralized relational database, Quomida data lives across two completely decoupled persistence boundaries:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           QUOMIDA APPLICATION                               │
│                                                                             │
│  ┌─────────────────────────────┐           ┌─────────────────────────────┐  │
│  │   LOCAL PERSISTENCE LAYER   │           │   REMOTE PERSISTENCE LAYER  │  │
│  │  • RxDB on IndexedDB        │           │  • Google Sheets (Tabular)  │  │
│  │  • Pure offline operation   │◄─────────►│  • Google Drive (JSON Blob) │  │
│  │  • Instant UI reactivity    │   Sync    │  • Future Box / OneDrive    │  │
│  │  • RxDB Migration Framework │  Adapter  │  • @qozara/gdocs-schema     │  │
│  └─────────────────────────────┘           └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

Because both environments have distinct storage paradigms (relational JSON documents in IndexedDB vs flat rows in spreadsheets and JSON blobs) and independent lifecycles, **Quomida runs two distinct schema migration frameworks** and tracks **three separate version artifacts**.

---

## 🔢 The Three-Tier Version Tracking Model

| Version Tier | Target / Artifact | Where Tracked | How It Is Updated | Can Run Offline? |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1: App Version** | Codebase release bundle | `package.json` SemVer + Git commit SHA | Automated during build / release tagging | N/A (code artifact) |
| **Tier 2: Local DB Version** | Local RxDB collections in IndexedDB | RxDB internal metadata + `localStorage['rxdb_schema_hashes']` | Incremented in `packages/domain-core/src/schemas/index.ts` with an RxDB migration strategy | **Yes (100% offline)** |
| **Tier 3: Cloud Store Version** | Remote user-owned cloud files | Google Drive `appProperties.quomida_schema_version` + `_migrations` spreadsheet tab | Incremented via `@qozara/gdocs-schema` migrations when running `activeAdapter.migrate()` | No (requires cloud connectivity) |

```mermaid
graph TD
    T1[Tier 1: Application Version<br/>Git Commit SHA + SemVer] -->|Defines expected schemas| T2[Tier 2: Local RxDB Database<br/>IndexedDB Version 0..N]
    T1 -->|Defines expected schemas| T3[Tier 3: Cloud BYOS Storage<br/>Google Drive appProperties & _migrations]

    subgraph "Local Execution Engine"
        T2 -->|Synchronous on boot| LME[RxDB Migration Engine<br/>packages/domain-core/schemas]
        LME -->|Mismatch Guard| LMG[APP-DB6-GUARD & Dexie Export<br/>DatabaseRecoveryScreen]
    end

    subgraph "Cloud Execution Engine"
        T3 -->|Handshake on sync| CME[@qozara/gdocs-schema<br/>ValidationService.ts]
        CME -->|Health Check| CMG[Suspension Guard<br/>SchemaRemediationModal]
    end

    LME -.->|SyncAdapter Boundary| CME
```

---

## ⚙️ Framework 1: Local RxDB Migration Engine

### Purpose
Manages migrations for user data stored in the browser's IndexedDB. Guarantees that opening a newer application release upgrades local client records instantly without network requests.

### Key Components
* **Schemas Location**: `packages/domain-core/src/schemas/index.ts`
* **Collection Schemas**:
  - `dailyLogsSchema` (version integer, properties, indexes)
  - `baseIngredientsSchema`
  - `recipesSchema`
  - `portionsSchema`
  - `userSettingsSchema`
* **Bootstrap Location**: `apps/webapp/src/db/rxdb.ts` (`initDatabase()`)

### Migration Implementation Pattern
When bumping an RxDB schema version (e.g. from `0` to `1`):
```typescript
// packages/domain-core/src/schemas/index.ts
export const dailyLogsSchema = {
  version: 1, // bumped from 0
  primaryKey: 'id',
  type: 'object',
  properties: {
    // ... schema definition
    new_field: { type: 'string' }
  },
  migrationStrategies: {
    // Strategy to upgrade document from version 0 to 1
    1: function(oldDoc: any) {
      oldDoc.new_field = 'default_value';
      return oldDoc;
    }
  }
};
```

### Invariants & Safety Mechanisms
1. **Build-Time Validation (`validate-schemas.js`)**:
   Runs during `npm run build`. Inspects all exported schemas. Fails the build immediately if any schema with `version > 0` lacks a corresponding function in `migrationStrategies`.
2. **Schema Hash Guard (`APP-DB6-GUARD`)**:
   In `apps/webapp/src/db/rxdb.ts`, hashes of all schemas are compared with `localStorage['rxdb_schema_hashes']`. If an unversioned schema mutation occurs (which causes RxDB `DB6` initialization crashes):
   - It prevents application crash / white-screen-of-death.
   - Executes an emergency raw IndexedDB export to JSON.
   - Renders the `DatabaseRecoveryScreen` allowing the user to download their unmigrated data before performing `clearLocalDatabase()`.

---

## ☁️ Framework 2: Remote Cloud Migration & Remediation Engine

### Purpose
Manages schema health, column structure, safety backups, and version migrations for user-owned spreadsheets and cloud documents (Google Drive/Sheets, and future Box/OneDrive connectors).

### Key Components
* **Package**: `@qozara/gdocs-schema` (integrated exclusively in `@quomida/sync-adapters`)
* **Schemas Location**: `packages/sync-adapters/src/google/schemas.ts`
  - `QuomidaDailyLogsSpreadsheetSchema` (tab: `daily_logs`)
  - `QuomidaFoodCatalogSpreadsheetSchema` (tabs: `base_ingredients`, `recipes`, `portions`)
* **Service**: `packages/sync-adapters/src/google/ValidationService.ts`
* **Driver**: `packages/sync-adapters/src/google/GoogleSheetsTabularDriver.ts`
* **UI Trigger**: `apps/webapp/src/components/sync/SchemaRemediationModal.tsx`

### How Versioning & State are Stored in Google Drive
1. **Drive Metadata (`appProperties`)**:
   - `quomida_schema_version`: e.g. `"1"`
   - `quomida_validation_status`: `"READY"`, `"CORRUPTED"`, or `"UPGRADE_REQUIRED"`
   - `quomida_validation_time`: ISO timestamp of the last health check
2. **Spreadsheet Tab (`_migrations`)**:
   A hidden sheet in the workbook storing records:
   `| version | migrated_at |`

### Key Architectural Invariants for Remote Storage
1. **Dynamic Header Mapping (Resilience to User Edits)**:
   Users can manually edit their personal Google Sheets. If a user reorders columns (e.g. moves `calories` to column A), Quomida **does not rely on fixed array indices** (`values[6]`). Deserializers in `packages/sync-adapters/src/strategy/serializers.ts` dynamically look up column positions using `row.headers` (fetched from row 1 of the sheet).
2. **Automated Safety Backups**:
   Before modifying any spreadsheet during a repair or migration, `ValidationService.repairFile()` and `migrateFile()` call `client.createBackup()`, producing an automated Google Drive duplicate copy named `Backup of <spreadsheetId> - <ISO timestamp>`.
3. **Non-Destructive Repairs**:
   If a user accidentally deletes a column (e.g. `calories`), `repairFile()` does NOT overwrite the sheet. It issues Google Sheets API `appendDimension` and `updateCells` calls to append the missing column to the end of the sheet, preserving user rows and manual structural customizations.
4. **Optimistic Concurrency Control (OCC)**:
   `expectedLastModified` is checked against Google Drive file metadata before applying modifications. If another client or manual edit occurred in the interim, a `ConflictError` is raised.

---

## 🔄 Runtime Coordination & Synchronization State Flow

When both layers run together in the web application, `CompositeSyncAdapter` acts as the bridge:

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant WebApp as WebApp (AppContext)
    participant RxDB as Local RxDB (IndexedDB)
    participant Adapter as CompositeSyncAdapter
    participant GDrive as Google Drive / Sheets

    Note over WebApp,RxDB: 1. BOOT (Offline-Ready)
    WebApp->>RxDB: initDatabase()
    RxDB->>RxDB: Execute local RxDB migrationStrategies
    RxDB-->>WebApp: Database Ready (Tier 2 active)

    Note over WebApp,GDrive: 2. CLOUD HANDSHAKE
    WebApp->>Adapter: pull() / push()
    Adapter->>GDrive: ValidationService.checkHealth(docId)
    
    alt Schema Version Outdated (Tier 3 < Tier 1)
        GDrive-->>Adapter: status = UPGRADE_REQUIRED
        Adapter->>Adapter: Suspend auto-sync; setStatus('upgrade_required')
        Adapter-->>WebApp: SyncStatus: upgrade_required
        WebApp->>User: Display SchemaRemediationModal ("Upgrade Required")
        User->>WebApp: Click "Upgrade Spreadsheet"
        WebApp->>Adapter: adapter.migrate()
        Adapter->>GDrive: 1. createBackup() -> "Backup of sheet..."
        Adapter->>GDrive: 2. MigrationManager.runMigrations()
        Adapter->>GDrive: 3. Update appProperties: quomida_schema_version = "1"
        Adapter->>Adapter: setStatus('idle'); Resume sync
    else Columns Missing (User Altered Spreadsheet)
        GDrive-->>Adapter: status = CORRUPTED
        Adapter->>Adapter: Suspend auto-sync; setStatus('corrupted')
        Adapter-->>WebApp: SyncStatus: corrupted
        WebApp->>User: Display SchemaRemediationModal ("Structure Mismatch")
        User->>WebApp: Click "Repair Spreadsheet"
        WebApp->>Adapter: adapter.repair()
        Adapter->>GDrive: 1. createBackup() -> "Backup of sheet..."
        Adapter->>GDrive: 2. appendDimension & updateCells (append missing cols)
        Adapter->>GDrive: 3. Update appProperties: quomida_validation_status = READY
        Adapter->>Adapter: setStatus('idle'); Resume sync
    else Schema Healthy (READY)
        GDrive-->>Adapter: status = READY
        Adapter->>GDrive: Execute normal pull() / push()
    end
```

---

## ⚡ Transparent Background Sync

To provide a seamless, multi-device experience (e.g. switching between phone and laptop without manual refreshing), the application implements transparent synchronization triggers in the core Context (`AppContext.tsx`):

1. **Optimistic UI with Asynchronous Push**: Every time a user modifies data (logs food, changes settings, creates a custom ingredient), the UI reacts instantly using local IndexedDB, while a non-blocking `forceSync` pushes the delta to the cloud asynchronously.
2. **Periodic Background Polling**: A 1-minute interval `setInterval` routinely checks and pulls remote changes, ensuring an idle device automatically stays up-to-date.
3. **Visibility Focus Sync**: A `visibilitychange` event listener automatically triggers a synchronization cycle whenever the application regains focus (e.g., pulling the browser out of the background on mobile, or switching tabs on desktop).
4. **Re-entrancy Protection**: A `syncLock` (`useRef`) prevents overlapping or concurrent sync jobs from corrupting state during frequent rapid network changes.

---

## 🛠️ Developer & AI Agent Playbook

### Scenario A: Adding a Field to Local Storage Only (e.g. UI state)
1. Edit `packages/domain-core/src/schemas/index.ts`.
2. Add the field to the RxDB collection schema.
3. Bump `version: N + 1`.
4. Add a migration strategy under `migrationStrategies[N + 1]`.
5. Run `npm run build` to verify `validate-schemas.js` passes.

### Scenario B: Adding a Field to Google Sheets Remote Only
1. Edit `packages/sync-adapters/src/google/schemas.ts`.
2. Add the column definition to `QuomidaDailyLogsSpreadsheetSchema` or `QuomidaFoodCatalogSpreadsheetSchema`.
3. Update `serializers.ts` to map the new column in `docToRow` and `rowToDoc`.
4. Run unit tests: `npx vitest run packages/sync-adapters/tests/schema-validation-remediation.test.ts`.

### Scenario C: Adding a Synced Field (Both Local RxDB and Cloud Sheets)
1. **Local Layer**:
   - Update RxDB schema in `packages/domain-core/src/schemas/index.ts`.
   - Bump version and add `migrationStrategies` function.
2. **Cloud Layer**:
   - Update remote schema in `packages/sync-adapters/src/google/schemas.ts`.
   - Update `packages/sync-adapters/src/strategy/serializers.ts` (`headers`, `docToRow`, `rowToDoc`).
3. **i18n Translations**:
   - Ensure keys exist in both `packages/i18n-locales/locales/en.json` and `es.json`.
4. **Verification Registry**:
   ```bash
   # 1. Run unit & domain tests
   npm run test

   # 2. Verify build guards & TypeScript across monorepo
   npm run build

   # 3. Verify zero vulnerabilities
   npm audit
   ```

---

## 📚 Related Architectural Decision Records

* [ADR 0001: RxDB + IndexedDB Local-First Client Engine](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0001-rxdb-indexeddb-local-first-engine.md)
* [ADR 0002: Bring Your Own Storage (BYOS) & Decoupled Sync Adapter](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0002-byos-decoupled-sync-adapter-pattern.md)
* [ADR 0010: Storage Strategy Pattern & Composite Multi-Format Cloud Sync Connectors](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0010-storage-strategy-composite-cloud-sync-connectors.md)
* [ADR 0011: Build-Time Schema Validation & Database Recovery UX](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0011-build-time-schema-validation-and-recovery.md)
* [ADR 0012: Cloud Spreadsheet Schema Validation, Dynamic Header Mapping & Remediation](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0012-schema-validation-dynamic-mapping-and-remediation.md)
* [ADR 0013: Dual-Layer Migration Engines and Three-Tier Version Tracking Architecture](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0013-dual-migration-frameworks-and-three-tier-versioning.md)
