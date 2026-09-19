import type { SyncAdapter, SyncDeltaPayload, SyncStatus } from '../types.js';
import type {
  BlobStorageDriver,
  TabularStorageDriver,
  CollectionRoute,
  CompositeSyncAdapterOptions
} from './types.js';
import { collectionSerializers } from './serializers.js';

export const DEFAULT_COLLECTION_ROUTES: Record<string, CollectionRoute> = {
  user_settings: {
    target: 'blob',
    filename: 'settings.json'
  },
  daily_logs: {
    target: 'tabular',
    documentKey: 'logs',
    documentTitle: 'Quomida Daily Logs',
    tabName: 'daily_logs'
  },
  base_ingredients: {
    target: 'tabular',
    documentKey: 'catalog',
    documentTitle: 'Quomida Food Catalog',
    tabName: 'base_ingredients'
  },
  recipes: {
    target: 'tabular',
    documentKey: 'catalog',
    documentTitle: 'Quomida Food Catalog',
    tabName: 'recipes'
  },
  portions: {
    target: 'tabular',
    documentKey: 'catalog',
    documentTitle: 'Quomida Food Catalog',
    tabName: 'portions'
  }
};

export class CompositeSyncAdapter implements SyncAdapter {
  id: string;
  name: string;
  description?: string;

  protected initialized = false;
  protected status: SyncStatus = 'disconnected';
  protected lastSyncedTime: string | null = null;
  protected statusListeners: Set<(status: SyncStatus) => void> = new Set();
  protected blobDriver?: BlobStorageDriver;
  protected tabularDriver?: TabularStorageDriver;
  protected routes: Record<string, CollectionRoute>;
  protected documentIdCache: Map<string, string> = new Map();
  protected tabularCache: Map<string, Record<string, any>[]> = new Map();

  constructor(options: CompositeSyncAdapterOptions) {
    this.id = options.id;
    this.name = options.name;
    this.description = options.description;
    this.blobDriver = options.blobDriver;
    this.tabularDriver = options.tabularDriver;
    this.routes = options.routes || { ...DEFAULT_COLLECTION_ROUTES };
  }

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
    return this.initialized ? 'connected-account' : null;
  }

  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  protected setStatus(newStatus: SyncStatus): void {
    this.status = newStatus;
    for (const listener of this.statusListeners) {
      try {
        listener(newStatus);
      } catch (err) {
        console.error('Error in status change listener', err);
      }
    }
  }

  setCorruptedStatus(): void {
    this.setStatus('corrupted');
  }

  setUpgradeRequiredStatus(): void {
    this.setStatus('upgrade_required');
  }

  async getRemoteLinks(): Promise<string[]> {
    const links: string[] = [];
    if (this.blobDriver?.getRemoteLinks) {
      links.push(...(await this.blobDriver.getRemoteLinks()));
    }
    if (this.tabularDriver?.getRemoteLinks) {
      links.push(...(await this.tabularDriver.getRemoteLinks()));
    }
    return links;
  }

  async initialize(credentials?: string | Record<string, any>): Promise<void> {
    this.initialized = true;
    this.lastSyncedTime = new Date().toISOString();
    this.setStatus('idle');
  }

  async disconnect(): Promise<void> {
    this.initialized = false;
    this.documentIdCache.clear();
    this.tabularCache.clear();
    this.setStatus('disconnected');
  }

  async reauthenticate(): Promise<void> {
    if (this.initialized) {
      this.setStatus('idle');
      this.lastSyncedTime = new Date().toISOString();
    } else {
      this.setStatus('auth_failed');
    }
  }

  async forceSync(): Promise<void> {
    if (!this.initialized) return;
    this.setStatus('syncing');
    await this.pull();
    this.lastSyncedTime = new Date().toISOString();
    this.setStatus('idle');
  }

  async repair(): Promise<void> {
    if (!this.tabularDriver || !this.tabularDriver.repairTable) {
      throw new Error('Repair is not supported by this sync adapter driver');
    }

    this.setStatus('syncing');
    try {
      const docIds = new Set<string>();
      for (const route of Object.values(this.routes)) {
        if (route.target === 'tabular') {
          const docId = await this.resolveDocumentId(route.documentKey, route.documentTitle);
          docIds.add(docId);
        }
      }

      for (const docId of docIds) {
        await this.tabularDriver.repairTable(docId);
      }

      this.setStatus('idle');
    } catch (err) {
      this.setStatus('corrupted');
      throw err;
    }
  }

  async migrate(): Promise<void> {
    if (!this.tabularDriver || !this.tabularDriver.migrateTable) {
      throw new Error('Migration is not supported by this sync adapter driver');
    }

    this.setStatus('syncing');
    try {
      const docIds = new Set<string>();
      for (const route of Object.values(this.routes)) {
        if (route.target === 'tabular') {
          const docId = await this.resolveDocumentId(route.documentKey, route.documentTitle);
          docIds.add(docId);
        }
      }

      for (const docId of docIds) {
        await this.tabularDriver.migrateTable(docId);
      }

      this.setStatus('idle');
    } catch (err) {
      this.setStatus('upgrade_required');
      throw err;
    }
  }

  async getSchemaDiagnostic(): Promise<{
    status: SyncStatus;
    missingColumns?: Record<string, string[]>;
    missingTabs?: string[];
  } | null> {
    if (this.status !== 'corrupted' && this.status !== 'upgrade_required') {
      return null;
    }
    if (!this.tabularDriver || !this.tabularDriver.checkHealth) {
      return { status: this.status };
    }

    try {
      const allMissingCols: Record<string, string[]> = {};
      const allMissingTabs: string[] = [];

      for (const route of Object.values(this.routes)) {
        if (route.target === 'tabular') {
          const docId = await this.resolveDocumentId(route.documentKey, route.documentTitle);
          const health = await this.tabularDriver.checkHealth(docId);
          if (health?.missingColumns) {
            Object.assign(allMissingCols, health.missingColumns);
          }
          if (health?.missingTabs) {
            allMissingTabs.push(...health.missingTabs);
          }
        }
      }

      return {
        status: this.status,
        missingColumns: allMissingCols,
        missingTabs: allMissingTabs
      };
    } catch {
      return { status: this.status };
    }
  }

  async push(payload: SyncDeltaPayload): Promise<void> {
    if (!this.initialized) return;
    if (this.status === 'corrupted') {
      throw new Error(
        'Sync suspended: remote spreadsheet schema is corrupted. Please repair the spreadsheet before syncing.'
      );
    }
    if (this.status === 'upgrade_required') {
      throw new Error(
        'Sync suspended: remote spreadsheet schema requires upgrade. Please migrate the spreadsheet before syncing.'
      );
    }

    this.setStatus('syncing');

    try {
      const route = this.routes[payload.collection];
      if (!route) {
        throw new Error(`No sync route defined for collection "${payload.collection}"`);
      }

      if (route.target === 'blob') {
        if (!this.blobDriver) {
          throw new Error(`BlobStorageDriver is required for collection "${payload.collection}"`);
        }
        // Read existing blob to merge or upsert
        const existingDocs = (await this.blobDriver.readBlob<Record<string, any>[]>(route.filename)) || [];
        const docMap = new Map(existingDocs.map(d => [d.id, d]));
        for (const doc of payload.documents) {
          if (doc.id) {
            docMap.set(doc.id, doc);
          }
        }
        await this.blobDriver.writeBlob(route.filename, Array.from(docMap.values()));
      } else if (route.target === 'tabular') {
        if (!this.tabularDriver) {
          throw new Error(`TabularStorageDriver is required for collection "${payload.collection}"`);
        }

        const serializer = collectionSerializers[payload.collection];
        if (!serializer) {
          throw new Error(`No tabular serializer registered for collection "${payload.collection}"`);
        }

        const docId = await this.resolveDocumentId(route.documentKey, route.documentTitle);
        const cacheKey = `${docId}_${route.tabName}`;

        let existingDocs: Record<string, any>[] = [];
        if (this.tabularCache.has(cacheKey)) {
          existingDocs = this.tabularCache.get(cacheKey)!;
        } else {
          try {
            const existingRows = await this.tabularDriver.readTable(docId, route.tabName);
            existingDocs = existingRows.map(r => serializer.rowToDoc(r));
          } catch (err: any) {
            if (
              err?.message?.includes('corruption') ||
              err?.message?.includes('missing required column')
            ) {
              throw err;
            }
            // If table doesn't exist or is empty, we start with empty existingDocs
          }
        }

        const docMap = new Map(existingDocs.map(d => [d.id, d]));
        for (const doc of payload.documents) {
          if (doc.id) {
            docMap.set(doc.id, doc);
          }
        }

        const mergedDocs = Array.from(docMap.values());
        this.tabularCache.set(cacheKey, mergedDocs);

        const rows = mergedDocs.map(doc => serializer.docToRow(doc));
        await this.tabularDriver.writeTable(docId, route.tabName, serializer.headers, rows);
      }

      this.lastSyncedTime = new Date().toISOString();
      this.setStatus('idle');
    } catch (err: any) {
      if (
        err?.message?.includes('corruption') ||
        err?.message?.includes('missing required column')
      ) {
        this.setStatus('corrupted');
      } else if (
        err?.message?.includes('upgrade') ||
        err?.message?.includes('SchemaUpgradeRequired')
      ) {
        this.setStatus('upgrade_required');
      } else {
        this.setStatus('error');
      }
      throw err;
    }
  }

  async pull(): Promise<SyncDeltaPayload[]> {
    if (!this.initialized) return [];
    if (this.status === 'corrupted') {
      throw new Error(
        'Sync suspended: remote spreadsheet schema is corrupted. Please repair the spreadsheet before syncing.'
      );
    }
    if (this.status === 'upgrade_required') {
      throw new Error(
        'Sync suspended: remote spreadsheet schema requires upgrade. Please migrate the spreadsheet before syncing.'
      );
    }

    this.setStatus('syncing');

    try {
      const results: SyncDeltaPayload[] = [];

      for (const [collection, route] of Object.entries(this.routes)) {
        if (route.target === 'blob' && this.blobDriver) {
          const docs = await this.blobDriver.readBlob<Record<string, any>[]>(route.filename);
          if (docs && Array.isArray(docs)) {
            results.push({ collection, documents: docs });
          }
        } else if (route.target === 'tabular' && this.tabularDriver) {
          const serializer = collectionSerializers[collection];
          if (serializer) {
            try {
              const docId = await this.resolveDocumentId(route.documentKey, route.documentTitle);
              const rows = await this.tabularDriver.readTable(docId, route.tabName);
              const documents = rows.map(r => serializer.rowToDoc(r));
              const cacheKey = `${docId}_${route.tabName}`;
              this.tabularCache.set(cacheKey, documents);
              results.push({ collection, documents });
            } catch (tabErr: any) {
              if (
                tabErr?.message?.includes('corruption') ||
                tabErr?.message?.includes('missing required column')
              ) {
                throw tabErr;
              }
              // Document or sheet tab might not exist yet; gracefully return empty
              results.push({ collection, documents: [] });
            }
          }
        }
      }

      this.lastSyncedTime = new Date().toISOString();
      this.setStatus('idle');
      return results;
    } catch (err: any) {
      if (
        err?.message?.includes('corruption') ||
        err?.message?.includes('missing required column')
      ) {
        this.setStatus('corrupted');
      } else if (
        err?.message?.includes('upgrade') ||
        err?.message?.includes('SchemaUpgradeRequired')
      ) {
        this.setStatus('upgrade_required');
      } else {
        this.setStatus('error');
      }
      throw err;
    }
  }

  protected async resolveDocumentId(documentKey: string, documentTitle: string): Promise<string> {
    if (this.documentIdCache.has(documentKey)) {
      return this.documentIdCache.get(documentKey)!;
    }
    if (!this.tabularDriver) {
      throw new Error('TabularStorageDriver not configured');
    }

    // Determine all tabs for this documentKey
    const relevantTabs = Object.values(this.routes)
      .filter(r => r.target === 'tabular' && r.documentKey === documentKey)
      .map(r => (r as Extract<CollectionRoute, { target: 'tabular' }>).tabName);

    const docId = await this.tabularDriver.ensureDocument(documentTitle, relevantTabs);
    this.documentIdCache.set(documentKey, docId);
    return docId;
  }
}
