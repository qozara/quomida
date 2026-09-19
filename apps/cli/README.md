# @quomida/cli

Developer CLI tool for Quomida. Provides terminal-based domain testing, catalog search, Google OAuth authentication harness, and live End-to-End (E2E) integration testing against personal Google Drive/Sheets.

---

## 🛠️ CLI Commands & Scripts

Run these scripts from the repository root or within the `apps/cli` workspace:

| Script | Command | Purpose |
| :--- | :--- | :--- |
| **Catalog & Domain Demo** | `npm run cli` | Runs domain calculations and catalog search demo in terminal. |
| **Google OAuth Login** | `npm run login --workspace=@quomida/cli` | Starts local OAuth listener, launches browser, and saves tokens to `~/.quomida/credentials.json`. |
| **Google OAuth Logout** | `npm run logout --workspace=@quomida/cli` | Removes cached credentials from `~/.quomida/credentials.json`. |
| **Google Sync E2E Test** | `npm run test:e2e --workspace=@quomida/cli` | Executes live `push()` and `pull()` payloads against user's real Google Drive. |

---

## 🔑 Google Cloud OAuth Setup for CLI Testing

To test Google Drive synchronization against real Google APIs via the CLI:

### 1. Create a Desktop OAuth Client in Google Cloud Console
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Select your project (e.g. `Quomida Dev`).
3. Navigate to **APIs & Services > Credentials**.
4. Click **Create Credentials > OAuth client ID**.
5. Application type: **Desktop app**.
6. Name: `Quomida CLI Test Harness`.
7. Click **Create** and copy the `Client ID` and `Client Secret`.

### 2. Configure Local Environment
Create an `apps/cli/.env` file (copied from `apps/cli/.env.example`):

```env
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here
```

> [!NOTE]
> `apps/cli/.env` is git-ignored and will never be committed to source control.

### 3. Authenticate
```bash
npm run login --workspace=@quomida/cli
```
Your browser will open asking for permission to manage files created by Quomida (`drive.file` and `drive.appdata`). After consenting, the tokens are saved securely with `0600` permissions in:
```
~/.quomida/credentials.json
```

### 4. Run Live E2E Tests
```bash
npm run test:e2e --workspace=@quomida/cli
```
The test verifies:
- Loading saved credentials.
- Initializing `GoogleDriveSheetsSyncAdapter`.
- Pushing a custom ingredient to the `appDataFolder` (`settings.json`).
- Pushing a meal log to `Quomida Daily Logs` Google Sheet.
- Pulling state and verifying structure.
- Verifying dynamic header mapping and schema health gatekeeping.

---

## 🔒 Security Posture
- Credentials stored in `~/.quomida/` are file-system isolated with restricted permissions (`0o600`).
- Minimal scopes requested: strictly `drive.file` (access only to files created by the app) and `drive.appdata` (hidden configuration storage). Never requests broad `drive` or `drive.readonly` scopes.
