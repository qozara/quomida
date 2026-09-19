# Mock Sync Adapter

The **Mock Sync Adapter** provides a simulated sync environment for local development and offline testing. It fulfills the `SyncAdapter` interface without requiring any external network requests or cloud credentials.

This is the default connector used by Quomida when you first clone the repository and run `npm run dev`.

## 🚀 Development Usage

The mock adapter simulates network latency and potential sync conflicts to help developers build robust UI states without needing a real cloud backend.

By default, the Mock adapter stores its "synced" state in-memory. Every time you refresh the page, the remote state resets, which is useful for testing initial syncs.

### Using the Adapter

```typescript
import { MockSyncAdapter } from '@quomida/sync-adapters';

const syncAdapter = new MockSyncAdapter({
  simulatedLatencyMs: 1000, // Simulates a 1-second network delay
  shouldFail: false,        // Set to true to simulate network failures
});

// Connect is instant
await syncAdapter.connect();

// Sync resolves after the simulated latency
const status = await syncAdapter.sync(payload);
```

## 🔒 Production Environment

The Mock Sync Adapter is strictly for **development and testing environments**. It should **never** be used in a production build.

In production, you should conditionally instantiate a real cloud connector (like `GoogleDriveSheetsSyncAdapter`) based on environment variables or user selection.

For example:

```typescript
import { SyncAdapter } from '@quomida/sync-adapters';
import { GoogleDriveSheetsSyncAdapter } from '@quomida/sync-adapters/google';
import { MockSyncAdapter } from '@quomida/sync-adapters/mock';

let syncAdapter: SyncAdapter;

if (import.meta.env.MODE === 'development' && !import.meta.env.VITE_GOOGLE_CLIENT_ID) {
  syncAdapter = new MockSyncAdapter();
} else {
  syncAdapter = new GoogleDriveSheetsSyncAdapter();
}
```
