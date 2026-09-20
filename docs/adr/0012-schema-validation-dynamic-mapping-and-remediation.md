# 0012. Cloud Spreadsheet Schema Validation, Dynamic Header Mapping & Remediation

* Status: accepted
* Date: 2026-09-18

## Context and Problem Statement

When syncing local RxDB data with user-owned cloud spreadsheets (such as Google Sheets or future Box/OneDrive Excel workbooks), users may manually edit the spreadsheet in their personal Google Drive. Users might reorder columns, rename columns, or delete columns. Previously, `GoogleSheetsTabularDriver` and serializers relied on fixed column indices (`values[0]`, `values[6]`, etc.). If a user reordered or deleted columns, the adapter would silently corrupt data or fail with index out-of-bounds exceptions.

Furthermore, as the application schema evolves, older spreadsheets linked in user drives will become out-of-date and require migrations.

How can Quomida protect against silent corruption, support structural flexibility (like column reordering), and provide non-destructive repairs and migrations while keeping connector-specific details strictly isolated from generic orchestration and presentation logic?

## Decision Drivers

* **Zero Silent Data Corruption (Pillar 1 & 7):** Sync must immediately halt and protect user data if structural discrepancies occur.
* **Connector Agnosticism:** The UI (`SchemaRemediationModal`) and orchestration (`CompositeCloudSyncProvider`) must be 100% agnostic of cloud providers (Google, Box, OneDrive).
* **Non-Destructive Repairs:** Structure fixes must append missing columns to the existing sheet rather than wiping or overwriting user changes.
* **Automated Safety Backups:** Any repair or migration operation must create a remote backup copy of the spreadsheet before modifying it.
* **Optimistic Concurrency Control (OCC):** Prevent race conditions by checking file timestamps or metadata before applying schema modifications.

## Considered Options

* Option 1: Overwrite spreadsheets on mismatch with local fresh templates.
* Option 2: Strictly require users to never touch the Google Sheet and throw unrecoverable errors.
* Option 3: **Adopt Dynamic Header Mapping, `@qozara/gdocs-schema` gatekeeping, automated remote backups, and generic remediation orchestration.**

## Decision Outcome

Chosen option: **Option 3**.

### Positive Consequences
1. **Dynamic Header Mapping:** Serializers now inspect `row.headers` (fetched dynamically from row 1 of the sheet) and resolve fields by column name rather than hardcoded array indices. If a user reorders columns in Google Sheets, synchronization continues flawlessly.
2. **Encapsulated Schema Validation:** The Google driver encapsulates `@qozara/gdocs-schema` in `ValidationService.ts` to perform health checks (`checkHealth`), detecting missing columns and outdated versions.
3. **Automated Safety Backups:** Before performing any column additions or migrations, `ValidationService.repairFile()` and `migrateFile()` call `client.createBackup()` to create an automated copy in Google Drive (`Backup of <id> - <timestamp>`).
4. **Non-Destructive Repair:** Missing columns are appended to the end of the existing sheet using Google Sheets API `appendDimension` and `updateCells`, preserving the user's manual column order and personal data.
5. **Generic Orchestration & UI:**
   - `SyncStatus` includes `'corrupted'` and `'upgrade_required'`.
   - `CompositeCloudSyncProvider` suspends background polling while in `'corrupted'` or `'upgrade_required'` status.
   - `SchemaRemediationModal.tsx` provides a generic, WCAG 2.2 accessible dialog informing the user of the mismatch, guaranteeing backups, and triggering `activeProvider.repair()` or `activeProvider.migrate()`.
6. **Dual-Language Parity:** English and Spanish i18n dictionaries are kept in 100% sync under `t.sync.remediation`.

### Negative Consequences / Tradeoffs
- Additional Google Drive API call when creating spreadsheet backups prior to repairs or migrations.
- Column deletions by users cannot be automatically reconciled without appending the column back.
