export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'throttled'
  | 'auth_failed'
  | 'disconnected'
  | 'synced'
  | 'corrupted'
  | 'upgrade_required'
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

export interface CloudSyncProviderMetadata {
  id: string;
  name: string;
  description?: string;
  connectedAccount?: string | null;
}

export interface CloudSyncProvider {
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
  getRemoteLinks?(): Promise<string[]>;
  repair?(): Promise<void>;
  migrate?(): Promise<void>;
  getSchemaDiagnostic?(): Promise<{
    status: SyncStatus;
    missingColumns?: Record<string, string[]>;
    missingTabs?: string[];
  } | null>;
  pull(): Promise<SyncDeltaPayload[]>;
  push(payload: SyncDeltaPayload): Promise<void>;
  onStatusChange?(listener: (status: SyncStatus) => void): () => void;
  onCredentialsChange?(listener: (credentials: any) => void): () => void;
}


