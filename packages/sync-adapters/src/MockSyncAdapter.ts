import type { SyncAdapter, SyncDeltaPayload, SyncStatus } from './types.js';

export class MockSyncAdapter implements SyncAdapter {
  id = 'mock-sync-adapter';
  name = 'Local Offline Mock Storage';
  private initialized = false;
  private status: SyncStatus = 'disconnected';
  private lastSyncedTime: string | null = null;
  private storage: Map<string, Record<string, any>[]> = new Map();

  isInitialized(): boolean {
    return this.initialized;
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  getLastSyncedTime(): string | null {
    return this.lastSyncedTime;
  }

  async initialize(_credentials?: string | Record<string, any>): Promise<void> {
    this.initialized = true;
    this.status = 'synced';
    this.lastSyncedTime = new Date().toISOString();
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
    this.status = 'syncing';
    const existing = this.storage.get(payload.collection) || [];
    
    // Upsert items by id
    const map = new Map(existing.map(doc => [doc.id, doc]));
    for (const doc of payload.documents) {
      if (doc.id) {
        map.set(doc.id, doc);
      }
    }

    this.storage.set(payload.collection, Array.from(map.values()));
    this.status = 'synced';
    this.lastSyncedTime = new Date().toISOString();
  }
}
