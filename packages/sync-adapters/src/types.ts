export type SyncStatus = 'disconnected' | 'syncing' | 'synced' | 'error';

export interface SyncDeltaPayload {
  collection: string;
  documents: Record<string, any>[];
  checkpoint?: string;
}

export interface SyncAdapter {
  id: string;
  name: string;
  isInitialized(): boolean;
  getStatus(): SyncStatus;
  getLastSyncedTime(): string | null;
  initialize(credentials?: string | Record<string, any>): Promise<void>;
  pull(): Promise<SyncDeltaPayload[]>;
  push(payload: SyncDeltaPayload): Promise<void>;
}
