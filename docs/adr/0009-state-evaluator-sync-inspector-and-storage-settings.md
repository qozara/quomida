# 0009. State Evaluator, Sync Inspector Popover, and Modular Storage Settings

* Status: accepted
* Date: 2026-09-15

## Context and Problem Statement

Quomida operates on a local-first architecture where data is always durable in IndexedDB (RxDB) regardless of remote connectivity or cloud provider availability. Users require clear ambient assurance that their data is safe, transparent diagnostics on synchronization status, and easy self-healing recovery actions (such as re-authenticating expired sessions) without anxiety or modal disruption. Additionally, future storage backends (Google Drive, Box, OneDrive, Supabase, Postgres) must plug into the architecture without altering presentation or domain logic.

## Decision Drivers

* Local-first assurance: UI must communicate that local records are always preserved even if sync is paused or disconnected.
* Decoupled state evaluation: Separation between low-level network/adapter status (`idle`, `syncing`, `throttled`, `auth_failed`, `disconnected`) and presentation UX status (`syncing`, `offline`, `waiting`, `error`, `idle`, `local`).
* Non-disruptive transient error handling: Rate limits (HTTP 429) or transient 5xx errors must not show alarming alert colors or warning badges.
* WCAG 2.2 accessibility: Color independence (SC 1.4.1), screen reader state transition announcements via `aria-live="polite"` (SC 4.1.3), minimum 44x44px touch targets (SC 2.5.8), and keyboard focus management (trapping & Esc key).
* Pluggable BYOS Adapter Architecture: Abstract interface enabling plug-and-play storage connectors with zero hardcoded backends.

## Decision Outcome

Chosen option: **Pure State Evaluator (`resolveUXStatus`) with Popover Diagnostic Inspector and Modular Slot-Based Storage Settings Panel**.

### Architecture Overview

```
Data & Network Layer:
  Device Network (Online / Offline)
  Storage Adapter (Idle / Syncing / Throttled / Auth_Failed / Disconnected)
          │
          ▼
State Evaluator (packages/sync-adapters/src/evaluator.ts):
  resolveUXStatus(isOnline, adapterStatus) -> UXSyncState
          │
          ▼
UI Presentation Layer (apps/webapp/src/components/sync):
  ├── HeaderSyncTrigger (44x44px, aria-live="polite")
  ├── SyncInspectorPopover (320px diagnostic flyout)
  │     ├── Status Header (SyncGlyph contextual icon)
  │     ├── Diagnostic Checklist (Network, Provider, Last Sync)
  │     ├── Conditional Inline Resolution Banner (Reconnect on error)
  │     └── Action Bar (Force Sync, Settings deep link)
  └── StorageSettingsPanel
        ├── Local Device Storage Overview (RxDB item counts)
        ├── Cloud Connector Slot (Active & Inactive ProviderCards)
        └── Disconnect Confirmation Modal (Local data retention guarantee)
```

### Positive Consequences

* **Testability**: `MockSyncAdapter` includes test hooks (`simulateThrottled`, `simulateAuthFailed`, `simulateSyncing`) allowing comprehensive unit and integration test verification of all state flows without third-party network access.
* **Extensibility**: Cloud adapters (Google Drive, Supabase, etc.) only need to implement the `SyncAdapter` interface and fire `onStatusChange`.
* **Zero Anxiety UX**: Users see clear distinctions between self-healing transient delays and actionable authentication requirements.
* **Accessibility**: Screen readers receive non-intrusive status updates; keyboard navigation adheres to WAI-ARIA dialog practices.
