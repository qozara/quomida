export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'throttled'
  | 'auth_failed'
  | 'disconnected'
  | 'synced'
  | 'error';

export type UXSyncState =
  | 'syncing'
  | 'offline'
  | 'waiting'
  | 'error'
  | 'idle'
  | 'local';

export interface SyncDeltaPayload {
  collection: string;
  documents: Record<string, any>[];
  checkpoint?: string;
}

export interface SyncAdapterMetadata {
  id: string;
  name: string;
  description?: string;
  connectedAccount?: string | null;
}

export interface SyncAdapter {
  id: string;
  name: string;
  description?: string;
  isInitialized(): boolean;
  getStatus(): SyncStatus;
  getLastSyncedTime(): string | null;
  getConnectedAccount?(): string | null;
  initialize(credentials?: string | Record<string, any>): Promise<void>;
  disconnect?(): Promise<void>;
  reauthenticate?(): Promise<void>;
  forceSync?(): Promise<void>;
  pull(): Promise<SyncDeltaPayload[]>;
  push(payload: SyncDeltaPayload): Promise<void>;
  onStatusChange?(listener: (status: SyncStatus) => void): () => void;
}

