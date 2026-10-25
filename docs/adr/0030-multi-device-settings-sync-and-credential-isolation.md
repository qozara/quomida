# 0030. Multi-Device User Settings Synchronization, Zero-Epoch Seed & Credential Isolation

* Status: accepted
* Date: 2026-10-24

## Context and Problem Statement

While tabular collections (`daily_logs`, `weight_logs`, `base_ingredients`, `recipes`, `portions`) synchronized reliably across devices via Google Sheets, users experienced a multi-device handoff failure with `user_settings` (`appDataFolder/settings.json`):
1. When a user configured biometrics, calorie targets, or adaptive goals on **Device A** and synced with Google Drive, then opened **Device B** for the first time and connected Google Drive, Device B failed to adopt Device A's settings and instead overwrote `settings.json` in the cloud with Device B's factory defaults (`2000 kcal`, `manual`).
2. Unlike tabular collections—which start empty (`[]`) on a fresh device—`user_settings` is a pre-seeded singleton (`id: 'global_settings'`). Seeding this default record with `updatedAt: Date.now()` on Device B boot, combined with `connectProvider()` saving `active_cloud_provider` (again stamping `updatedAt: Date.now()`) *before* pulling remote data, guaranteed that Device B's untouched defaults always had a newer Last-Write-Wins (LWW) timestamp (`localTime > remoteTime`) than Device A's cloud settings.
3. Storing device-local OAuth session credentials (`active_cloud_provider`) inside the synced `user_settings` payload leaked short-lived device bearer tokens to remote `settings.json` blobs and caused remote pulls on Device B to overwrite Device B's valid token with Device A's stale token.
4. Additional race conditions existed across the sync lifecycle:
   - `runWithSyncLock` used `{ ifAvailable: true }` and dropped concurrent `forceSync()` calls (such as when saving Smart Goals triggered `logWeight()` followed immediately by `updateUserSettings()`).
   - `GoogleDriveBlobDriver` did not cache `fileId`s returned by `POST` creation or sort `files.list` by `modifiedTime desc`, allowing Google Drive's eventual consistency to create duplicate `settings.json` files during rapid consecutive writes.
   - `SettingsModal.tsx` initialized its form `useState` fields only once at component mount (before `dbService.init()` or cloud sync completed) and never re-hydrated them when `userSettings` updated.

## Decision Outcome

We establish five architectural invariants across `@quomida/cloud-providers` and `apps/webapp`:

1. **Zero-Epoch Baseline Seed (`updatedAt: 0`)**:
   - Untouched factory-seeded singleton documents (`global_settings` in `initDatabase()` and `LocalDBService.getSettings()`) MUST initialize with `updatedAt: 0`.
   - Any user-configured or calibrated cloud document (`updatedAt > 0`) deterministically wins LWW (`remoteTime > localTime`) during initial device handoff.
   - Untouched local seed documents (`updatedAt === 0`) are never pushed to overwrite existing remote settings.

2. **Strict Device-Local Credential & Session Isolation**:
   - `active_cloud_provider` (containing OAuth tokens and session metadata) is strictly device-local state.
   - Updating `active_cloud_provider` alone in `LocalDBService.saveSettings()` MUST NOT increment `user_settings.updatedAt`. Only mutations to domain preference/target fields (`locale`, `theme`, `daily_calorie_target`, `custom_macros`, `ai_settings`, `target_mode`, `biometrics`, `goal_config`, `adaptive_state`) advance `updatedAt`.
   - Before pushing `user_settings` to any remote `CloudSyncProvider` (`replication.ts`, `CompositeCloudSyncProvider`, `MockCloudSyncProvider`), `active_cloud_provider` is stripped from the remote payload.
   - When pulling remote `user_settings` into local RxDB, the device's local `active_cloud_provider` is preserved and merged onto the incoming document.
   - In `connectProvider()`, the adapter is registered and `syncDatabaseWithRemote()` executes before any local target calibration, ensuring remote settings are pulled first.

3. **Coalesced Trailing Sync Queue (`runWithSyncLock`)**:
   - When `forceSync()` is invoked while `quomida_sync_lock` is already held by an in-flight sync, the request is not dropped; instead, a `pendingSync` flag schedules a single coalesced trailing sync pass immediately after the active sync completes.
   - `setLocale()` and `setTheme()` immediately trigger `forceSync()` after persisting to RxDB.

4. **AppData Blob File ID Caching, `modifiedTime` Ordering & LWW Push Guard**:
   - `GoogleDriveBlobDriver` caches resolved `fileId`s per filename from both `GET` lookups and `POST` multipart creation responses, queries `appDataFolder` with `orderBy=modifiedTime desc`, self-heals on HTTP `404`, and asynchronously prunes duplicate files if multiple blobs share the same filename.
   - `CompositeCloudSyncProvider.push()` (both `blob` and `tabular` routes) and `MockCloudSyncProvider.push()` validate LWW timestamps (`(incoming.updatedAt ?? 0) >= (existing.updatedAt ?? 0)`) before overwriting records in remote storage maps.

5. **Idempotent Post-Sync Calibration & Reactive Settings UI Hydration**:
   - Boot adaptive calibration executes *after* initial cloud auto-connect and sync when online.
   - Post-sync adaptive calibration (`runAdaptiveCalibrationOnDatabaseWithMeta`) tracks `didChange` and only upserts/pushes `user_settings` when target or calibration state values actually change.
   - `SettingsModal.tsx` reactively synchronizes all local form state with `userSettings` and `weightLogs` via `useEffect`, and updates `weight_logs` on goal save whenever the user modifies `currentWeightKg`.

## Consequences

### Positive
- **Seamless Multi-Device Handoff**: A user can configure goals and biometrics on Device A, open Device B, connect Google Drive, and immediately receive all settings, targets, biometrics, locale, and theme without risk of factory-default overwrites.
- **Zero Conflict / True LWW When Both Devices Are Open**: Concurrent edits across open devices resolve deterministically by `updatedAt` timestamp without credential clobbering, dropped syncs, or calibration ping-pong loops.
- **Stronger Security Posture**: OAuth bearer tokens (`accessToken`) never leave the local device's IndexedDB and are never written to `settings.json` in Google Drive.
