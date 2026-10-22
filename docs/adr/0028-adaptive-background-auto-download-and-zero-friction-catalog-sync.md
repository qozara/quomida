# 28. Adaptive Background Auto-Download and Zero-Friction Catalog Synchronization

Date: 2026-10-21

## Status

Accepted

## Context

In ADR 0018, Quomida established the Unified Single-SQLite Local-First Architecture where users boot with a lightweight `system.sqlite` embedded directly into the PWA and can optionally download the full external catalog into browser Origin Private File System (OPFS).

Prior to this decision:
1. **High Onboarding Friction**: The full catalog download was strictly manual and buried inside the Settings modal behind a confirmation dialog with a cellular data warning.
2. **Outdated Size Assumptions**: The UI assumed a ~55MB–120MB download requiring explicit Wi-Fi warnings, and `useCatalogDownload.ts` hardcoded an arbitrary `file.size > 10MB` check to determine whether the full catalog was installed in OPFS.
3. **Compact Catalog Reality**: Following ADR 0027, the deduplicated and reduced catalog is only **2.3 MB** (`catalog.sqlite.gz`), which transfers in less than a second on standard 4G/5G and takes ~5.2 MB uncompressed in OPFS.

Requiring users to manually hunt down a download button in Settings for a 2.3 MB payload creates unnecessary onboarding friction and prevents users from discovering thousands of regional items right away.

## Decision

We implement an **Adaptive Background Auto-Download Lifecycle** with shared status across Settings and the main application:

### 1. Dual-Threshold Auto-Download Policy
When the application initializes and checks remote metadata (`catalog_meta.json`):
- **Size Threshold ($\le$ 10 MB)**: If the remote compressed catalog is $\le$ 10 MB (currently 2.3 MB), the app automatically triggers `downloadWorker.ts` in the background after the initial render.
- **Data-Saver Respect (`navigator.connection.saveData`)**: If the user or browser has explicitly enabled "Data Saver" mode, automatic downloading is bypassed to respect mobile data quotas.
- **User Preference Override**: An explicit toggle in the Settings modal ("Auto-download catalog updates") allows users to disable automatic background downloads at any time.

### 2. Reactive, Synchronized State Architecture
- `useCatalogDownload` operates as a shared reactive hook/store across `SettingsModal` and background synchronization services.
- If the user opens Settings while an auto-download is underway, the Settings card displays real-time download and decompression progress rather than a stale "Not Downloaded" state.
- Once downloaded and atomically staged into OPFS, `RemoteCatalogService.notifyCatalogDownloaded()` immediately informs search managers to expand search results without page reload.

### 3. OPFS Full-Catalog Detection
- Replaced the brittle `file.size > 10MB` check with an adaptive check (`file.size > 1MB` and version matching `lastIngestedCatalogVersion`) to accurately recognize the new 5.2 MB uncompressed catalog as installed.

### 4. UI Copy Modernization
- Updated bilingual strings (`en.json`, `es.json`) removing outdated references to "1.1 million items" and 55MB fallbacks, reflecting the real high-accuracy ~20,000 item database and dynamic size badges.

## Consequences

### Positive
- **Zero-Friction Onboarding**: New users automatically gain access to the full regional database without manual steps.
- **Instant Boot Intact**: App startup remains instantaneous because `system.sqlite` mounts on first millisecond, and the full catalog streams asynchronously via a Web Worker.
- **Data Plan Respect**: Respects `navigator.connection.saveData` and provides a manual opt-out toggle.
- **Single Source of Truth**: Settings UI accurately reflects background downloading states in real-time.

### Negative / Trade-offs
- Devices on metered connections without `saveData` enabled will consume ~2.3 MB of background data on first launch unless auto-download is turned off in Settings.
