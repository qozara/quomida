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

  async initialize(_credentials?: string | Record<string, any>): Promise<void> {
    this.initialized = true;
    this.lastSyncedTime = new Date().toISOString();
    this.setStatus('idle');
  }

  async disconnect(): Promise<void> {
    this.initialized = false;
    this.documentIdCache.clear();
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

  async push(payload: SyncDeltaPayload): Promise<void> {
    if (!this.initialized) return;
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
            if (doc._deleted) {
              docMap.delete(doc.id);
            } else {
              docMap.set(doc.id, doc);
            }
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
        const rows = payload.documents.map(doc => serializer.docToRow(doc));
        await this.tabularDriver.writeTable(docId, route.tabName, serializer.headers, rows);
      }

      this.lastSyncedTime = new Date().toISOString();
      this.setStatus('idle');
    } catch (err) {
      this.setStatus('error');
      throw err;
    }
  }

  async pull(): Promise<SyncDeltaPayload[]> {
    if (!this.initialized) return [];
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
              results.push({ collection, documents });
            } catch {
              // Document or sheet tab might not exist yet; gracefully return empty
              results.push({ collection, documents: [] });
            }
          }
        }
      }

      this.lastSyncedTime = new Date().toISOString();
      this.setStatus('idle');
      return results;
    } catch (err) {
      this.setStatus('error');
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
