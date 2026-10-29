# 0033. Isolation of Mock Cloud Sync Provider to Test Packages and Removal from Production UI

* Status: accepted
* Date: 2026-10-28

## Context and Problem Statement

Previously, `MockCloudSyncProvider` was bundled as a first-class export of `@quomida/cloud-providers` and registered in `useCloudProviderRegistry()` alongside Google Drive. This resulted in a "Mock Cloud Sync" provider card appearing in the Storage Settings UI panel in production and development builds.

Having mock adapters exposed in user-facing settings created several issues:
1. **User Confusion & Accidental Selection**: End users could mistakenly connect to the in-memory mock provider, believing their data was safely backed up remotely when in fact changes were stored only in ephemeral memory.
2. **Production Bundle Bloat & Attack Surface**: Bundling test mocks and test simulation hooks (`simulateThrottled`, `simulateAuthFailed`) in production runtime assets violates the separation of concerns between test fixtures and production business logic.
3. **Purity of BYOS Principle**: Out-of-the-box local development functions completely offline through SQLite and RxDB IndexedDB caching without requiring any cloud adapter connected (`uxSyncState: 'local'`). Mock adapters should only serve automated test suites, CI pipelines, and CLI simulations.

## Decision Outcome

We isolate `MockCloudSyncProvider` exclusively to test packages and remove all mock cards from the production user interface:

1. **Test Package Submodule Export (`@quomida/cloud-providers/testing`)**:
   - Moved `MockCloudSyncProvider` to `packages/cloud-providers/src/testing/MockCloudSyncProvider.ts`.
   - Exported under the dedicated `"./testing"` export path in `packages/cloud-providers/package.json` and path-mapped in `tsconfig.json`.
   - Removed `MockCloudSyncProvider` export from the primary entrypoint (`packages/cloud-providers/src/index.ts`).
2. **Removal from WebApp Production UI**:
   - Deleted `apps/webapp/src/cloud-providers/mock/` and unregistered `useMockCloudProvider` from `useCloudProviderRegistry()`.
   - Removed `'mock'` from `iconType` union in `CloudProviderFactory` and `ProviderCard`.
   - Cleaned up special `'Mock Storage'` / `'mock'` bypass checks in `HeaderAvatarButton.tsx` and `SettingsModal.tsx`.
3. **Test Suite Migration**:
   - Updated integration test suites and the CLI admin tool (`apps/cli/src/index.ts`) to import `MockCloudSyncProvider` from `@quomida/cloud-providers/testing`.
   - Added automated tests in `cloud-providers-registry.test.ts` verifying that `CloudProviderList` does not render mock adapter cards in the UI.

## Consequences

### Positive
- **Clean Production UX**: The Storage Settings panel only presents real, production-ready BYOS cloud sync providers (Google Drive / Sheets).
- **Zero Confusion**: Users will not accidentally select an ephemeral in-memory mock thinking it provides real cloud redundancy.
- **Architectural Isolation**: Clear distinction between production provider implementations and headless test fixtures.

### Negative / Trade-offs
- Integration tests simulating cloud synchronization must explicitly import from `@quomida/cloud-providers/testing` rather than relying on default registry presence.
