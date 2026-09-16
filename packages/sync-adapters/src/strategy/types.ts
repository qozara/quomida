export interface BlobStorageDriver {
  id: string;
  name: string;
  readBlob<T = any>(filename: string): Promise<T | null>;
  writeBlob<T = any>(filename: string, data: T): Promise<void>;
  deleteBlob?(filename: string): Promise<void>;
}

export interface TabularRow {
  id: string;
  values: (string | number | boolean | null)[];
  updatedAt?: number;
  _deleted?: boolean;
}

export interface TabularStorageDriver {
  id: string;
  name: string;
  ensureDocument(title: string, tabs: string[]): Promise<string>;
  readTable(documentId: string, tabName: string): Promise<TabularRow[]>;
  writeTable(documentId: string, tabName: string, headers: string[], rows: TabularRow[]): Promise<void>;
}

export type CollectionRoute =
  | {
      target: 'blob';
      filename: string;
    }
  | {
      target: 'tabular';
      documentKey: string;
      documentTitle: string;
      tabName: string;
    };

export interface CompositeSyncAdapterOptions {
  id: string;
  name: string;
  description?: string;
  blobDriver?: BlobStorageDriver;
  tabularDriver?: TabularStorageDriver;
  routes?: Record<string, CollectionRoute>;
}
