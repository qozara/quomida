# Google Drive & Sheets Connector

The **Google Drive & Sheets Sync Adapter** enables Quomida to synchronize local user data to the user's personal Google account, guaranteeing total data ownership and zero vendor lock-in.

It uses a composite strategy across separate Google Drive files:
- **Application configuration** (`user_settings`) is synced to a private hidden folder in Google Drive (`appDataFolder`) as JSON blobs (`settings.json`).
- **Personal daily logs** (`daily_logs`) sync to a private Google Sheet titled `Quomida Daily Logs`, complete with auto-generated human-readable summary columns (`food_details_readonly`).
- **Food catalogs** (`base_ingredients`, `recipes`, `portions`) sync to a separate, shareable Google Sheet titled `Quomida Food Catalog`. This allows users to share custom ingredients or recipes with others via Google Drive link sharing without exposing their personal calorie records.

---

## 🛡️ Schema Gatekeeping, Resilience & Backups

To protect against user tampering (e.g. manually deleting or reordering columns in Google Drive):
1. **Dynamic Header Mapping**: Deserializers inspect `row.headers` dynamically from row 1 of each sheet rather than using fixed column indices. If columns are moved around, sync continues working.
2. **Health Checking via `@qozara/gdocs-schema`**: The connector proxies requests through `ValidationService` to check sheet headers and hidden `_migrations` tab versioning against `QuomidaDailyLogsSpreadsheetSchema` and `QuomidaFoodCatalogSpreadsheetSchema`.
3. **Automated Safety Backups**: Before applying any structural modifications or schema migrations, the connector calls `client.createBackup()` to generate a copy in Google Drive (`Backup of <id> - <timestamp>`).
4. **Non-Destructive Repairs**: Missing columns are appended to the end of the sheet using `appendDimension` and `updateCells`, preserving existing rows.
5. **Optimistic Concurrency Control (OCC)**: Validates `modifiedTime` against `expectedLastModified` to prevent concurrency conflicts.

---

## 🚀 Setting Up Google Cloud for Development

To run Quomida with the Google connector in your local development environment:

### 1. Create a Google Cloud Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `Quomida Dev`).

### 2. Enable Required APIs
Navigate to **APIs & Services > Library** and enable:
- **Google Drive API**
- **Google Sheets API**

### 3. Configure OAuth Consent Screen
1. Go to **APIs & Services > OAuth consent screen**.
2. Select **External** user type.
3. Fill in the App Information (Name, User support email, Developer contact email).
4. Add minimal non-sensitive / per-file scopes:
   - `https://www.googleapis.com/auth/drive.appdata` (For syncing private config blobs)
   - `https://www.googleapis.com/auth/drive.file` (For creating and syncing the spreadsheets)
5. Under **Test users**, add your personal Google email address.

### 4. Create OAuth 2.0 Credentials
For **Web App (`apps/webapp`)**:
- Create **OAuth client ID > Web application**.
- Authorized JavaScript origins: `http://localhost:3000`.
- Create `.env.local` in `apps/webapp`:
  ```env
  VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
  ```

For **CLI Testing (`apps/cli`)**:
- Create **OAuth client ID > Desktop app**.
- Create `apps/cli/.env` (from `apps/cli/.env.example`):
  ```env
  GOOGLE_CLIENT_ID=your-desktop-client-id.apps.googleusercontent.com
  GOOGLE_CLIENT_SECRET=your-desktop-client-secret
  ```

---

## 🧪 Testing with the Developer CLI Harness

You can test authentication and real Google Drive synchronization directly from the terminal without running the browser web app:

```bash
# 1. Start interactive OAuth login in browser
npm run login --workspace=@quomida/cli

# 2. Run End-to-End push/pull tests against real Google Drive
npm run test:e2e --workspace=@quomida/cli

# 3. Log out and clear saved credentials
npm run logout --workspace=@quomida/cli
```

---

## 🔄 Using the Adapter in Code

```typescript
import { GoogleDriveSheetsCloudSyncProvider } from '@quomida/sync-adapters';

const adapter = new GoogleDriveSheetsCloudSyncProvider();

// Initialize with user access token
await adapter.initialize({
  accessToken: 'ya29.a0AfH6SM...',
  userEmail: 'user@gmail.com'
});

// Push a change
await adapter.push({
  collection: 'daily_logs',
  documents: [/* ...log documents */]
});

// Pull remote changes
const delta = await adapter.pull();

// Repair corrupted structure (creates backup and appends missing columns)
await adapter.repair();
```

---

## 📚 References
- Architecture & Dual Migrations: [`docs/persistence-and-migrations.md`](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/persistence-and-migrations.md)
- ADR 0010: [Storage Strategy Pattern & Composite Multi-Format Cloud Sync Connectors](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0010-storage-strategy-composite-cloud-sync-connectors.md)
- ADR 0012: [Cloud Spreadsheet Schema Validation, Dynamic Header Mapping & Remediation](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0012-schema-validation-dynamic-mapping-and-remediation.md)
- ADR 0013: [Dual-Layer Migration Engines and Three-Tier Version Tracking Architecture](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0013-dual-migration-frameworks-and-three-tier-versioning.md)
