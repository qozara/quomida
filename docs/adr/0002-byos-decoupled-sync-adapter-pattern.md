# 0002. Bring Your Own Storage (BYOS) & Decoupled Sync Adapter

* Status: accepted
* Date: 2026-09-12

## Context and Problem Statement

Users value data ownership and total privacy for sensitive health and habit data. Quomida belongs to the Qozara portfolio (following the BYOS philosophy pioneered in Quozen). We need to persist user data remotely without incurring proprietary backend database infrastructure costs or forcing users into a closed SaaS ecosystem.

## Decision Drivers

* Zero infrastructure server costs.
* Data portability: users must own their data in standard formats (Google Drive / Sheets).
* Decoupling application logic from cloud storage vendor APIs.
* Easy offline testing without requiring active OAuth credentials during local development.

## Decision Outcome

Chosen option: **Decoupled CloudSyncProvider Interface with Swappable Implementations**.

```
CloudSyncProvider Interface (packages/sync-adapters)
 ├── MockCloudSyncProvider (In-Memory for local dev & unit tests)
 └── GoogleDriveSheetsCloudSyncProvider (BYOS Production)
```

### Positive Consequences
- Developers can run `npm run dev` and test full offline logging locally out of the box using `MockCloudSyncProvider` without setup.
- User data persists directly to user-owned Google Drive spreadsheets via OAuth 2.0 (`drive.file` / `spreadsheets` scopes).
- Application domain core remains 100% agnostic of cloud storage APIs.

### Negative Consequences / Tradeoffs
- Google Sheets API rate limits (60 req/min) require client-side batching and debounced delta replication.
