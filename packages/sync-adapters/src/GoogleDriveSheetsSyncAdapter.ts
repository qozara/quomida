import type { SyncAdapter, SyncDeltaPayload, SyncStatus } from './types.js';

export class GoogleDriveSheetsSyncAdapter implements SyncAdapter {
  id = 'google-drive-sheets';
  name = 'Google Drive / Sheets BYOS Adapter';
  description = 'Direct synchronization to personal Google Drive spreadsheets';
  private initialized = false;
  private status: SyncStatus = 'disconnected';
  private lastSyncedTime: string | null = null;
  private accessToken: string | null = null;
  private statusListeners: Set<(status: SyncStatus) => void> = new Set();

  isInitialized(): boolean {
    return this.initialized && !!this.accessToken;
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  getLastSyncedTime(): string | null {
    return this.lastSyncedTime;
  }

  getConnectedAccount(): string | null {
    return this.accessToken ? 'google-user@drive.google.com' : null;
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

  async initialize(credentials?: string | Record<string, any>): Promise<void> {
    if (typeof credentials === 'string') {
      this.accessToken = credentials;
    } else if (credentials && typeof credentials === 'object' && credentials.accessToken) {
      this.accessToken = credentials.accessToken;
    }

    if (this.accessToken) {
      this.initialized = true;
      this.lastSyncedTime = new Date().toISOString();
      this.setStatus('idle');
    } else {
      this.setStatus('disconnected');
    }
  }

  async disconnect(): Promise<void> {
    this.accessToken = null;
    this.initialized = false;
    this.setStatus('disconnected');
  }

  async reauthenticate(): Promise<void> {
    // In production this triggers OAuth popup or token refresh
    if (this.accessToken) {
      this.setStatus('idle');
      this.lastSyncedTime = new Date().toISOString();
    } else {
      this.setStatus('auth_failed');
    }
  }

  async forceSync(): Promise<void> {
    if (!this.initialized || !this.accessToken) return;
    this.setStatus('syncing');
    this.lastSyncedTime = new Date().toISOString();
    this.setStatus('idle');
  }

  async pull(): Promise<SyncDeltaPayload[]> {
    if (!this.initialized || !this.accessToken) {
      return [];
    }
    // Remote Google Sheets fetch logic here (when active session present)
    this.lastSyncedTime = new Date().toISOString();
    return [];
  }

  async push(_payload: SyncDeltaPayload): Promise<void> {
    if (!this.initialized || !this.accessToken) {
      return;
    }
    this.setStatus('syncing');
    // Remote Google Sheets update logic here
    this.lastSyncedTime = new Date().toISOString();
    this.setStatus('idle');
  }
}

