# @quomida/sync-adapters

Bring Your Own Storage (BYOS) synchronization layer for Quomida. Provides decoupled, local-first synchronization between RxDB collections in IndexedDB and personal cloud storage providers (Google Drive & Sheets, and future Box / OneDrive connectors).

---

## 🏛️ Storage Strategy Architecture

The storage layer employs the **Storage Strategy Pattern** via `CompositeSyncAdapter`. Instead of forcing all data into a single file or remote format, sync operations are routed based on the data domain:

| Domain Collection | Format | Target Driver | Document / File Target | Privacy & Access |
| :--- | :--- | :--- | :--- | :--- |
| `user_settings` | JSON Blob | `BlobStorageDriver` | Hidden AppData (`settings.json`) | Private (tamper-proof) |
| `daily_logs` | Flat Rows | `TabularStorageDriver` | `Quomida Daily Logs` (Spreadsheet) | Private |
| `base_ingredients` | Flat Rows | `TabularStorageDriver` | `Quomida Food Catalog` (Spreadsheet) | **Shareable** |
| `recipes` | Flat Rows | `TabularStorageDriver` | `Quomida Food Catalog` (Spreadsheet) | **Shareable** |
| `portions` | Flat Rows | `TabularStorageDriver` | `Quomida Food Catalog` (Spreadsheet) | **Shareable** |

### Why Separate Spreadsheets for Catalog and Logs?

Users often want to share custom ingredients and recipes with family members, friends, or fitness coaches without sharing their personal consumption history (daily calorie intake). By separating master catalog data (`Quomida Food Catalog`) from transactional meal logs (`Quomida Daily Logs`), users can safely use their cloud provider's native sharing capabilities (e.g. Google Drive link sharing) with zero risk of leaking private logs.

---

## 🛡️ Schema Validation, Dynamic Mapping & Remediation

Spreadsheets in personal cloud accounts are user-owned. Users may reorder, rename, or delete columns, or connect to spreadsheets created by older application releases. Quomida protects against silent corruption through a 4-layer defense system:

### 1. Dynamic Header Mapping
Serializers in `src/strategy/serializers.ts` dynamically inspect `row.headers` (read from row 1 of the spreadsheet) rather than relying on hardcoded array indices (`values[6]`). If a user moves `calories` to column A or `quantity` to column D, field extraction maps columns by name dynamically.

### 2. Fast-Path Corruption Detection
During `GoogleSheetsTabularDriver.readTable()`, headers are validated against the schema's required columns. If any required column is missing, the driver throws a descriptive `Schema corruption` error, transitioning the adapter status to `'corrupted'`.

### 3. Automatic Background Suspension
If `SyncStatus` enters `'corrupted'` or `'upgrade_required'`, `CompositeSyncAdapter` **suspends all automatic `pull()` and `push()` polling**, protecting both the local RxDB database and the remote spreadsheet from corrupted state synchronization.

### 4. Non-Destructive Repair with Automated Backups
When the user clicks "Repair Spreadsheet" in the UI (`SchemaRemediationModal`), `ValidationService`:
1. **Creates a Safety Backup**: Invokes `createBackup()`, producing a duplicate copy in Google Drive (`Backup of <id> - <timestamp>`).
2. **Appends Missing Columns**: Uses Google Sheets API `appendDimension` and `updateCells` to append missing column headers to the end of the sheet, preserving user data and custom column order.
3. **Enforces OCC**: Validates `expectedLastModified` against Google Drive `modifiedTime` to prevent race conditions during repair.

---

## 🧩 Core Interfaces & Contracts

### 1. `SyncAdapter`
The primary interface consumed by the presentation layer:
```typescript
export interface SyncAdapter {
  id: string;
  name: string;
  description?: string;
  isInitialized(): boolean;
  getStatus(): SyncStatus;
  getLastSyncedTime(): string | null;
  getConnectedAccount?(): string | null;
  initialize(credentials?: string | Record<string, any>): Promise<void>;
  disconnect?(): Promise<void>;
  reauthenticate?(): Promise<void>;
  forceSync?(): Promise<void>;
  repair?(): Promise<void>;
  migrate?(): Promise<void>;
  getSchemaDiagnostic?(): Promise<{
    status: SyncStatus;
    missingColumns?: Record<string, string[]>;
    missingTabs?: string[];
  } | null>;
  pull(): Promise<SyncDeltaPayload[]>;
  push(payload: SyncDeltaPayload): Promise<void>;
  onStatusChange?(listener: (status: SyncStatus) => void): () => void;
}
```

### 2. `SyncStatus`
Granular lifecycle and health statuses:
```typescript
export type SyncStatus =
  | 'idle'             // Synced and healthy
  | 'syncing'          // Pull or push operation in progress
  | 'throttled'        // 429 rate limit / quota backoff
  | 'auth_failed'      // Token expired or revoked
  | 'disconnected'     // No remote store configured
  | 'synced'           // Push completed successfully
  | 'corrupted'        // Structure mismatch: missing required columns
  | 'upgrade_required' // Outdated remote schema version
  | 'error';           // Network or unexpected driver failure
```

### 3. `BlobStorageDriver`
Stores unformatted JSON blobs (used for application settings):
```typescript
export interface BlobStorageDriver {
  id: string;
  name: string;
  readBlob<T = any>(filename: string): Promise<T | null>;
  writeBlob<T = any>(filename: string, data: T): Promise<void>;
  deleteBlob?(filename: string): Promise<void>;
}
```

### 4. `TabularStorageDriver`
Manages multi-sheet tabular workbooks (used for logs and catalog):
```typescript
export interface TabularStorageDriver {
  id: string;
  name: string;
  ensureDocument(title: string, tabs: string[]): Promise<string>;
  readTable(documentId: string, tabName: string): Promise<TabularRow[]>;
  writeTable(documentId: string, tabName: string, headers: string[], rows: TabularRow[]): Promise<void>;
  repairTable?(documentId: string, tabName?: string, expectedLastModified?: string): Promise<void>;
  migrateTable?(documentId: string, expectedLastModified?: string): Promise<void>;
  checkHealth?(documentId: string): Promise<any>;
}
```

### 5. `CompositeSyncAdapter`
Orchestrating base class that routes `SyncDeltaPayload` to either `BlobStorageDriver` or `TabularStorageDriver` based on declarative route configurations. Handles automatic suspension on corruption or upgrade needed, and coordinates `repair()` and `migrate()` across registered documents.

---

## 🚀 Adding a New Cloud Provider (e.g., Microsoft OneDrive / Box)

To add support for another cloud provider, follow these 3 steps without altering domain or UI code:

### Step 1: Implement `BlobStorageDriver`
Target the provider's hidden app-data folder (or dedicated config folder):
```typescript
import type { BlobStorageDriver } from '@quomida/sync-adapters';

export class OneDriveBlobDriver implements BlobStorageDriver {
  id = 'onedrive-appdata-blob';
  name = 'OneDrive AppData Blob Driver';

  async readBlob<T = any>(filename: string): Promise<T | null> {
    // Call Microsoft Graph API /me/drive/special/approot:/${filename}:/content
    return null;
  }

  async writeBlob<T = any>(filename: string, data: T): Promise<void> {
    // PUT to /me/drive/special/approot:/${filename}:/content
  }
}
```

### Step 2: Implement `TabularStorageDriver`
Target the provider's spreadsheet API (e.g., Excel Online via Microsoft Graph API):
```typescript
import type { TabularStorageDriver, TabularRow } from '@quomida/sync-adapters';

export class ExcelOnlineTabularDriver implements TabularStorageDriver {
  id = 'excel-online-tabular';
  name = 'Excel Online Tabular Driver';

  async ensureDocument(title: string, tabs: string[]): Promise<string> {
    // Create or find .xlsx workbook on OneDrive with worksheet tabs
    return 'workbook_id_123';
  }

  async readTable(documentId: string, tabName: string): Promise<TabularRow[]> {
    // Fetch used range via Microsoft Graph API
    // Return rows with `headers` attached for dynamic header mapping
    return [];
  }

  async writeTable(documentId: string, tabName: string, headers: string[], rows: TabularRow[]): Promise<void> {
    // Update Excel worksheet table
  }

  async repairTable?(documentId: string): Promise<void> {
    // Create backup workbook and append missing columns
  }
}
```

### Step 3: Bundle into Composite Connector
```typescript
import { CompositeSyncAdapter } from '@quomida/sync-adapters';

export class OneDriveExcelSyncAdapter extends CompositeSyncAdapter {
  constructor(options: { getAccessToken: () => string | null }) {
    super({
      id: 'onedrive-excel',
      name: 'Microsoft OneDrive / Excel Online',
      description: 'Synchronizes logs and food catalog directly to personal OneDrive',
      blobDriver: new OneDriveBlobDriver(),
      tabularDriver: new ExcelOnlineTabularDriver()
    });
  }
}
```

---

## 📚 Architectural References
- Detailed Persistence & Migration Guide: [`docs/persistence-and-migrations.md`](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/persistence-and-migrations.md)
- ADR 0010: [Storage Strategy Pattern & Composite Multi-Format Cloud Sync Connectors](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0010-storage-strategy-composite-cloud-sync-connectors.md)
- ADR 0012: [Cloud Spreadsheet Schema Validation, Dynamic Header Mapping & Remediation](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0012-schema-validation-dynamic-mapping-and-remediation.md)
- ADR 0013: [Dual-Layer Migration Engines and Three-Tier Version Tracking Architecture](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0013-dual-migration-frameworks-and-three-tier-versioning.md)
