# Google Drive & Sheets Connector

The **Google Drive & Sheets Sync Adapter** enables Quomida to synchronize local user data to the user's personal Google account, guaranteeing data ownership and zero vendor lock-in.

It uses a composite strategy:
- **Application configuration** (like settings) is synced to a private hidden folder in Google Drive (`appDataFolder`) as JSON blobs.
- **Tabular data** (like daily food logs and food catalogs) is synced to a human-readable Google Sheet document.

## 🚀 Setting Up Google Cloud for Development

To run Quomida with the Google connector in your local development environment, you must create an OAuth 2.0 Client ID in the Google Cloud Console.

### 1. Create a Google Cloud Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., `Quomida Dev`).

### 2. Enable Required APIs
Navigate to **APIs & Services > Library** and enable the following APIs:
- **Google Drive API**
- **Google Sheets API**

### 3. Configure OAuth Consent Screen
1. Go to **APIs & Services > OAuth consent screen**.
2. Select **External** user type (or Internal if you are in a Google Workspace and prefer that).
3. Fill in the App Information (Name, User support email, Developer contact email).
4. Add the following scopes:
   - `https://www.googleapis.com/auth/drive.appdata` (For syncing private config blobs)
   - `https://www.googleapis.com/auth/drive.file` (For creating and syncing the spreadsheet)
5. Under **Test users**, add the Google email address you plan to test with.

### 4. Create OAuth 2.0 Credentials
1. Go to **APIs & Services > Credentials**.
2. Click **Create Credentials** -> **OAuth client ID**.
3. Application type: **Web application**.
4. Name: `Quomida Web Dev`.
5. Authorized JavaScript origins:
   - `http://localhost:3000` (or whichever port Vite runs on)
6. Authorized redirect URIs:
   - `http://localhost:3000` 
7. Click **Create**. You will receive a **Client ID**.

### 5. Configure Local Environment
Create a `.env.local` file in `apps/webapp` with your Client ID:

```env
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

When you start the app with `npm run dev`, it will now use your Client ID to authenticate.

---

## 🔒 Production Environment Setup

For a production deployment, the steps are largely the same, but with stricter verification requirements from Google.

1. **Authorized Origins and URIs**: Ensure you add your production domain (e.g., `https://quomida.app`) to the Authorized JavaScript origins and Authorized redirect URIs in your OAuth Client ID settings.
2. **App Verification**: Because Quomida requests sensitive scopes (`drive.appdata` and `drive.file`), if you intend to allow the general public to use your hosted version with their Google accounts, you must submit your app for [Google OAuth Verification](https://support.google.com/cloud/answer/13463073).
3. **Production ENV**: Inject the `VITE_GOOGLE_CLIENT_ID` into your CI/CD pipeline or hosting platform (e.g., Vercel, Netlify) environment variables during the build step.
4. **Content Security Policy (CSP)**: Ensure your CSP allows connections to Google APIs (`https://www.googleapis.com`, `https://accounts.google.com`).

## 🔄 Using the Adapter

In the application codebase, initialize the connector:

```typescript
import { GoogleDriveSheetsSyncAdapter } from '@quomida/sync-adapters';

const syncAdapter = new GoogleDriveSheetsSyncAdapter();

// Initiate OAuth flow (usually triggered by user action)
await syncAdapter.connect();

// Sync data
const status = await syncAdapter.sync(payload);
```
