# ADR 0036: Decoupled Google Identity Session (`@qozara/google-auth`) and Incremental OAuth Scopes

* Status: accepted
* Date: 2026-11-25

## Context and Problem Statement

Previously, Quomida coupled Qozara Cloud AI authentication (`https://ai.qozara.org`) directly to `userSettings.active_cloud_provider.credentials` inside the RxDB `user_settings` collection:
1. **Conflated Identity and Storage Authorization**: Users running in privacy-first Local-Only mode could not sign into Qozara Cloud AI without enabling Google Drive BYOS replication and granting full `drive.file` + `drive.appdata` scopes. Conversely, disconnecting Google Drive Storage Sync wiped the user's Qozara Cloud AI session.
2. **Token Expiry Blindness & Drift**: Short-lived 1-hour OAuth2 implicit access tokens (`expiresAt`) stored in RxDB were neither checked for expiration in `extractGoogleOAuthToken()` nor during `GoogleDriveSheetsCloudSyncProvider.initialize()`, causing expired tokens to show `"Synced"` in Settings while failing against `ai.qozara.org` with HTTP `401`.
3. **Ambiguous Error Classification**: `@qozara/ai-client` previously mapped both HTTP `401` (`UNAUTHORIZED_401`) and HTTP `403` (`FORBIDDEN_403` — unregistered Mode 1A account) to `AUTHENTICATION_REQUIRED`, displaying `"Your Google session has expired or is invalid. Please reconnect..."` even when the Google session was valid.

## Decision Outcome

1. **Dedicated Shared Package (`@qozara/google-auth`)**:
   - Introduce `@qozara/google-auth` (`GoogleSessionStore` + `@qozara/google-auth/react` `GoogleAuthSessionProvider`) to persist device-local OAuth sessions (`{ accessToken, expiresAt, scopes, user, updatedAt }`) outside RxDB in `localStorage` with a 60-second expiry safety buffer and cross-tab `storage` synchronization.
   - Canonicalize Google OIDC scope URI aliases (`userinfo.email` → `email`, `userinfo.profile` → `profile`) and merge scopes incrementally across sign-in upgrades for the same account.

2. **Decoupled Feature Scopes & Independent Lifecycle**:
   - **Qozara Cloud AI (`useMealAiService` + `SettingsModal`)**: Requests minimal identity scopes (`openid email profile` via `signInForIdentity()`) directly inside *Settings → Intelligence & Edge AI* (and inline in `FoodLogger` on `401`). Works 100% with Local-Only storage (`active_cloud_provider === undefined`).
   - **Google Drive BYOS Sync (`useGoogleDriveProvider` + `@qozara/cloud-sync-google@1.0.2`)**: Requests incremental Drive scopes (`drive.file` + `drive.appdata` via `signInForDrive()`, passing `hint: user.email`) and delegates live token reads to `GoogleSessionStore.getValidAccessToken(GOOGLE_DRIVE_BYOS_SCOPES)`.
   - **Independent Disconnect**: Disconnecting Cloud Storage Sync (`disconnectProvider()`) detaches `GoogleDriveSheetsCloudSyncProvider` and clears `active_cloud_provider` without revoking the user's Qozara Cloud AI session. Explicit Google sign-out is available in AI Settings.
   - **Seamless Legacy Migration**: Existing installs with `userSettings.active_cloud_provider.credentials` automatically migrate into `GoogleSessionStore` on boot via `migrateFromLegacyCredentials()`, while new connections omit ephemeral `accessToken`s from RxDB.

3. **Distinct `401` vs. `403` Error Semantics (`@qozara/ai-client@1.2.0`)**:
   - Separate `FORBIDDEN_NOT_REGISTERED` (`403`) from `AUTHENTICATION_REQUIRED` (`401`), ignore leftover BYOK `ciphertext` when explicit `'cloud'` mode is selected, and support 1-shot `onAuthExpired` retry on `401`.

## Consequences

- **Positive**: Local-only users can authenticate for Qozara Cloud AI with least-privilege OIDC scopes (`openid email profile`); Drive Sync users share the exact same Google session with zero double-login friction; expired tokens are caught deterministically before network dispatch; `403` allowlist rejections no longer masquerade as expired tokens.
