# @quomida/sync-adapters

Bring Your Own Storage (BYOS) synchronization layer for Quomida. Provides decoupled, local-first synchronization between RxDB collections in IndexedDB and personal cloud storage providers.

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
  pull(): Promise<SyncDeltaPayload[]>;
  push(payload: SyncDeltaPayload): Promise<void>;
  onStatusChange?(listener: (status: SyncStatus) => void): () => void;
}
```

### 2. `BlobStorageDriver`
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

### 3. `TabularStorageDriver`
Manages multi-sheet tabular workbooks (used for logs and catalog):
```typescript
export interface TabularStorageDriver {
  id: string;
  name: string;
  ensureDocument(title: string, tabs: string[]): Promise<string>;
  readTable(documentId: string, tabName: string): Promise<TabularRow[]>;
  writeTable(documentId: string, tabName: string, headers: string[], rows: TabularRow[]): Promise<void>;
}
```

### 4. `CompositeSyncAdapter`
Orchestrating base class that routes `SyncDeltaPayload` to either `BlobStorageDriver` or `TabularStorageDriver` based on declarative route configurations.

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
    return [];
  }

  async writeTable(documentId: string, tabName: string, headers: string[], rows: TabularRow[]): Promise<void> {
    // Batch update table rows
  }
}
```

### Step 3: Subclass `CompositeSyncAdapter`
Assemble the drivers into a clean, reusable adapter:
```typescript
import { CompositeSyncAdapter } from '@quomida/sync-adapters';

export class OneDriveSyncAdapter extends CompositeSyncAdapter {
  constructor(config: { token: string }) {
    super({
      id: 'onedrive-excel-sync',
      name: 'Microsoft OneDrive / Excel Adapter',
      blobDriver: new OneDriveBlobDriver(config),
      tabularDriver: new ExcelOnlineTabularDriver(config)
    });
  }
}
```

---

## 🔒 Security & OAuth Scopes

Cloud connectors strictly request non-sensitive, per-file authorization scopes:
* **Google Drive / Sheets**:
  - `https://www.googleapis.com/auth/drive.file`: Read and write only files created by Quomida.
  - `https://www.googleapis.com/auth/drive.appdata`: Hidden application configuration folder.
* **Full drive access scopes (`drive` or `drive.readonly`) are strictly prohibited.**
