# 14. UI Adapter Static Hook Registry

Date: 2026-09-19

## Status

Accepted

## Context

Quomida relies on a local-first architecture with optional Bring-Your-Own-Storage (BYOS) synchronization. Initial versions tightly coupled `AppContext` with specific cloud providers (like Google Drive) using React hooks directly in the core context. 

As we anticipate adding multiple providers (e.g., OneDrive, Dropbox) and maintaining the core domain purely isomorphic, the UI logic and third-party authentication hooks (`@react-oauth/google`) needed to be abstracted and dynamically loaded, but without introducing complex asynchronous mounting issues or sacrificing robustness.

## Decision

We have implemented a **Static Hook Registry** pattern to decouple the UI synchronization flows from the core `AppContext`.

1. **Encapsulated Provider Hooks**: Each cloud provider is implemented in a dedicated sub-folder within `apps/webapp/src/adapters/` (e.g., `google/useGoogleDriveAdapter.tsx`). This hook encapsulates all third-party React dependencies and returns a factory that implements standard `connect` and `restore` methods.
2. **Compile-Time Registry**: The file `apps/webapp/src/adapters/index.ts` exposes a `useSyncAdapterRegistry()` hook that synchronously composes and returns all registered adapter factories. 
3. **Build-Time Consistency Checking**: To ensure developers don't forget to register a new adapter or remove an old one, a unit test scans the `adapters/` directory and asserts that all subdirectories are imported in `index.ts`. If they fall out of sync, the build pipeline fails.
4. **Isomorphic Interface**: The core `@quomida/sync-adapters` package remains 100% isomorphic and unaware of the browser UI, taking asynchronous `onTokenRefresh` callbacks injected by the UI adapters.

## Consequences

- **Pros**:
  - Full decoupling: `AppContext` only interacts with abstract `AdapterFactory` objects.
  - Deleting an adapter is completely safe: delete its directory and the import in `index.ts`. No core logic needs modifying.
  - Zero race conditions: Because it resolves at compile time via React hooks, there is no asynchronous loading of plugins to manage.
  - High robustness: Leverages the strength of established React libraries rather than writing vanilla JS OAuth wrappers from scratch.
- **Cons**:
  - The registry is statically defined in `index.ts` rather than dynamically loaded, so the codebase must be re-compiled to recognize new adapters. However, for an SPA like Quomida, this is acceptable and preferred over dynamic injection complexity.
