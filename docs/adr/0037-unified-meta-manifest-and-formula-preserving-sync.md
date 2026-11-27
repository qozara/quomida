# 0037. Unified `_meta` Manifest Identity & Formula-Preserving Sync

Date: 2026-11-27

## Status

Accepted

## Context

Quomida manages user-owned spreadsheets (`Quomida Daily Logs` and `Quomida Food Catalog`) via Google Drive and Google Sheets (`@qozara/cloud-sync` and `@qozara/cloud-sync-google`). Previously:
1. Drive discovery and validation relied on `appProperties` (`quomida_doc_type`, `quomida_schema_version`), fallback title matching, and a `_quomida_meta` tab, while lacking a unified `app_id` / `doc_type` manifest contract shared across Qozara apps.
2. When `ensureDocument` fell back to a title match or `writeTable` encountered a missing tab (`autoCreateMissingTabOnWrite: true`), an unrelated spreadsheet in the user's Drive sharing the same title could receive metadata patches or tab additions.
3. Row serializers returned positional arrays with no awareness of live header ordering, risking overwrite or misalignment when users manually added formula columns (e.g., custom macros/calorie formulas) or reordered columns in Sheets.

## Decision

1. **Upgrade to `@qozara/cloud-sync@^2.0.0` & `@qozara/cloud-sync-google@^2.0.0`:**
   Configure `appId: 'quomida'` and `autoCreateMissingTabOnWrite: false` in `createQuomidaTabularDriverOptions`, so unmanaged title matches and missing tabs never silently mutate arbitrary spreadsheets.
2. **Adopt Canonical `_meta` Manifest (Schema v2):**
   Bump `QuomidaDailyLogsSpreadsheetSchema` and `QuomidaFoodCatalogSpreadsheetSchema` to `version: 2` with `identity` declarations (`appId: 'quomida'`, `legacyMetaSheetNames: ['_quomida_meta']`, `legacyPropertyMatchers: [{ key: 'quomida_doc_type', ... }]`), paired with `createCanonicalMetaMigration` (`2_canonical_meta_manifest.ts`) that non-destructively preserves `_quomida_meta` entries while stamping `_meta` manifest keys (`qozara_manifest_version`, `app_id`, `doc_type`, `schema_version`, `schema_hash`, `origin_container_id`).
3. **Header-Aware, Formula-Preserving Serialization:**
   Update all five serializers (`daily_logs`, `base_ingredients`, `recipes`, `portions`, `weight_logs`) to map fields dynamically by normalized header name and return `undefined` for unrecognized user columns, enabling column-scoped `values:batchUpdate` writes in `GoogleSheetsTabularDriver`.
4. **Read-Only Rejection UI for `unmanaged` and `foreign_app` States:**
   Update `SchemaRemediationModal` and `en`/`es` dictionaries so `unmanaged` and `foreign_app` states explain the mismatch without offering repair or migration mutations.

## Consequences

- Legacy Quomida v1 spreadsheets (`_quomida_meta` / `quomida_doc_type`) continue upgrading cleanly to v2 without losing user data.
- Unrelated user spreadsheets or spreadsheets owned by other Qozara apps are never altered.
- Users can add custom Google Sheets formula columns and reorder headers while keeping bidirectional sync intact.
