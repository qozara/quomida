import type { SyncDeltaPayload, SyncStatus } from './types.js';
import { CompositeSyncAdapter } from './strategy/CompositeSyncAdapter.js';
import type { CollectionRoute } from './strategy/types.js';
import { GoogleDriveBlobDriver } from './google/GoogleDriveBlobDriver.js';
import { GoogleSheetsTabularDriver } from './google/GoogleSheetsTabularDriver.js';
import type { GoogleHttpClient } from './google/types.js';

export interface GoogleDriveSheetsSyncAdapterOptions {
  httpClient?: GoogleHttpClient;
  routes?: Record<string, CollectionRoute>;
}

export class GoogleDriveSheetsSyncAdapter extends CompositeSyncAdapter {
  private accessToken: string | null = null;
  private userEmail: string | null = null;
  private httpClient?: GoogleHttpClient;

  constructor(options?: GoogleDriveSheetsSyncAdapterOptions) {
    const httpClient = options?.httpClient;

    let getAccessToken = () => null as string | null;

    const blobDriver = new GoogleDriveBlobDriver({
      getAccessToken: () => getAccessToken(),
      httpClient
    });

    const tabularDriver = new GoogleSheetsTabularDriver({
      getAccessToken: () => getAccessToken(),
      httpClient
    });

    const defaultRoutes: Record<string, CollectionRoute> = {
      daily_logs: { 
        target: 'tabular', 
        documentKey: 'quomida_daily_logs', 
        documentTitle: 'Quomida Daily Logs', 
        tabName: 'daily_logs' 
      },
      base_ingredients: { 
        target: 'tabular', 
        documentKey: 'quomida_food_catalog', 
        documentTitle: 'Quomida Food Catalog', 
        tabName: 'base_ingredients' 
      },
      recipes: { 
        target: 'tabular', 
        documentKey: 'quomida_food_catalog', 
        documentTitle: 'Quomida Food Catalog', 
        tabName: 'recipes' 
      },
      portions: { 
        target: 'tabular', 
        documentKey: 'quomida_food_catalog', 
        documentTitle: 'Quomida Food Catalog', 
        tabName: 'portions' 
      },
      user_settings: { target: 'blob', filename: 'settings.json' }
    };

    super({
      id: 'google-drive-sheets',
      name: 'Google Drive / Sheets BYOS Adapter',
      description: 'Direct synchronization to personal Google Drive spreadsheets',
      blobDriver,
      tabularDriver,
      routes: options?.routes || defaultRoutes
    });

    this.httpClient = httpClient;
    getAccessToken = () => this.accessToken;
  }

  override isInitialized(): boolean {
    return this.initialized && !!this.accessToken;
  }

  override getConnectedAccount(): string | null {
    if (!this.isInitialized()) return null;
    return this.userEmail || 'google-user@drive.google.com';
  }

  override async initialize(credentials?: string | Record<string, any>): Promise<void> {
    if (typeof credentials === 'string') {
      this.accessToken = credentials;
    } else if (credentials && typeof credentials === 'object') {
      if (credentials.accessToken) {
        this.accessToken = credentials.accessToken;
      }
      if (credentials.userEmail) {
        this.userEmail = credentials.userEmail;
      }
      if (credentials.httpClient) {
        this.httpClient = credentials.httpClient;
      }
    }

    if (this.accessToken) {
      this.initialized = true;
      this.lastSyncedTime = new Date().toISOString();
      this.setStatus('idle');
    } else {
      this.initialized = false;
      this.setStatus('disconnected');
    }
  }

  override async disconnect(): Promise<void> {
    this.accessToken = null;
    this.userEmail = null;
    await super.disconnect();
  }

  override async reauthenticate(): Promise<void> {
    if (this.accessToken) {
      this.setStatus('idle');
      this.lastSyncedTime = new Date().toISOString();
    } else {
      this.setStatus('auth_failed');
    }
  }

  override async push(payload: SyncDeltaPayload): Promise<void> {
    if (!this.isInitialized()) {
      return;
    }
    await super.push(payload);
  }

  override async pull(): Promise<SyncDeltaPayload[]> {
    if (!this.isInitialized()) {
      return [];
    }
    return await super.pull();
  }
}
