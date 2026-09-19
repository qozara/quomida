import type { CloudSyncProvider, SyncDeltaPayload, SyncStatus } from './types.js';

export class MockCloudSyncProvider implements CloudSyncProvider {
  id = 'mock-sync-adapter';
  name = 'Mock Cloud Connector';
  description = 'Local in-memory cloud simulator for testing sync states';
  private initialized = false;
  private status: SyncStatus = 'disconnected';
  private lastSyncedTime: string | null = null;
  private connectedAccount: string | null = 'test-user@mock-cloud.internal';
  private storage: Map<string, Record<string, any>[]> = new Map();
  private statusListeners: Set<(status: SyncStatus) => void> = new Set();

  isInitialized(): boolean {
    return this.initialized;
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  getLastSyncedTime(): string | null {
    return this.lastSyncedTime;
  }

  getConnectedAccount(): string | null {
    return this.initialized ? this.connectedAccount : null;
  }

  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private setStatus(newStatus: SyncStatus): void {
    this.status = newStatus;
    for (const listener of this.statusListeners) {
      try {
        listener(newStatus);
      } catch (err) {
        console.error('Error in status change listener', err);
      }
    }
  }

  // --- Test Simulation Hooks ---
  simulateThrottled(durationMs?: number): void {
    this.setStatus('throttled');
    if (durationMs && durationMs > 0) {
      setTimeout(() => {
        if (this.status === 'throttled') {
          this.setStatus('idle');
        }
      }, durationMs);
    }
  }

  simulateAuthFailed(): void {
    this.setStatus('auth_failed');
  }

  simulateOffline(): void {
    this.setStatus('disconnected');
  }

  simulateIdle(): void {
    this.setStatus('idle');
  }

  simulateSyncing(): void {
    this.setStatus('syncing');
  }

  async initialize(_credentials?: string | Record<string, any>): Promise<void> {
    this.initialized = true;
    this.lastSyncedTime = new Date().toISOString();
    this.setStatus('idle');
  }

  async disconnect(): Promise<void> {
    this.initialized = false;
    this.setStatus('disconnected');
  }

  async reauthenticate(): Promise<void> {
    if (!this.initialized) {
      this.initialized = true;
    }
    this.setStatus('idle');
    this.lastSyncedTime = new Date().toISOString();
  }

  async forceSync(): Promise<void> {
    this.setStatus('syncing');
    await new Promise((resolve) => setTimeout(resolve, 50));
    this.lastSyncedTime = new Date().toISOString();
    this.setStatus('idle');
  }

  async pull(): Promise<SyncDeltaPayload[]> {
    const results: SyncDeltaPayload[] = [];
    for (const [collection, documents] of this.storage.entries()) {
      results.push({ collection, documents });
    }
    this.lastSyncedTime = new Date().toISOString();
    return results;
  }

  async push(payload: SyncDeltaPayload): Promise<void> {
    this.setStatus('syncing');
    const existing = this.storage.get(payload.collection) || [];
    
    // Upsert items by id
    const map = new Map(existing.map(doc => [doc.id, doc]));
    for (const doc of payload.documents) {
      if (doc.id) {
        map.set(doc.id, doc);
      }
    }

    this.storage.set(payload.collection, Array.from(map.values()));
    this.lastSyncedTime = new Date().toISOString();
    this.setStatus('idle');
  }
}

