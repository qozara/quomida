import { describe, it, expect, beforeEach } from 'vitest';
import {
  QuomidaDailyLogsSpreadsheetSchema,
  weightLogsSerializer,
  weightLogHeaders,
  collectionSerializers,
  DEFAULT_COLLECTION_ROUTES,
  CompositeCloudSyncProvider,
  GoogleDriveSheetsCloudSyncProvider,
  type TabularRow,
  type BlobStorageDriver,
  type TabularStorageDriver
} from '../src/index.js';
import type { WeightLog } from '@quomida/domain-core';

class InMemoryBlobDriver implements BlobStorageDriver {
  id = 'in-memory-blob';
  name = 'In Memory Blob Driver';
  files = new Map<string, any>();

  async readBlob<T = any>(filename: string): Promise<T | null> {
    return this.files.has(filename) ? (this.files.get(filename) as T) : null;
  }

  async writeBlob<T = any>(filename: string, data: T): Promise<void> {
    this.files.set(filename, data);
  }

  async deleteBlob(filename: string): Promise<void> {
    this.files.delete(filename);
  }
}

class InMemoryTabularDriver implements TabularStorageDriver {
  id = 'in-memory-tabular';
  name = 'In Memory Tabular Driver';
  documents = new Map<string, { title: string; tabs: Map<string, { headers: string[]; rows: TabularRow[] }> }>();

  async ensureDocument(title: string, tabs: string[]): Promise<string> {
    for (const [docId, doc] of this.documents.entries()) {
      if (doc.title === title) return docId;
    }
    const docId = `doc_${Math.random().toString(36).substring(2, 8)}`;
    const tabsMap = new Map<string, { headers: string[]; rows: TabularRow[] }>();
    for (const tab of tabs) {
      tabsMap.set(tab, { headers: [], rows: [] });
    }
    this.documents.set(docId, { title, tabs: tabsMap });
    return docId;
  }

  async readTable(documentId: string, tabName: string): Promise<TabularRow[]> {
    const doc = this.documents.get(documentId);
    if (!doc) return [];
    const tab = doc.tabs.get(tabName);
    return tab ? tab.rows : [];
  }

  async writeTable(documentId: string, tabName: string, headers: string[], rows: TabularRow[]): Promise<void> {
    const doc = this.documents.get(documentId);
    if (!doc) throw new Error(`Document ${documentId} not found`);
    let tab = doc.tabs.get(tabName);
    if (!tab) {
      tab = { headers, rows: [] };
      doc.tabs.set(tabName, tab);
    }
    tab.headers = headers;

    const rowMap = new Map(tab.rows.map(r => [r.id, r]));
    for (const r of rows) {
      rowMap.set(r.id, r);
    }
    tab.rows = Array.from(rowMap.values());
  }
}

describe('Weight Logs Sync Schemas, Serializers & Route Mapping', () => {
  describe('QuomidaDailyLogsSpreadsheetSchema', () => {
    it('has schema version 1 and includes weight_logs tab definition', () => {
      expect(QuomidaDailyLogsSpreadsheetSchema.version).toBe(1);
      const tabNames = QuomidaDailyLogsSpreadsheetSchema.tabs.map(t => t.name);
      expect(tabNames).toContain('daily_logs');
      expect(tabNames).toContain('weight_logs');

      const weightLogsTab = QuomidaDailyLogsSpreadsheetSchema.tabs.find(t => t.name === 'weight_logs');
      expect(weightLogsTab).toBeDefined();

      const columns = weightLogsTab!.columns;
      expect(columns).toEqual([
        { name: 'id', type: 'string', required: true },
        { name: 'date', type: 'string', required: true },
        { name: 'timestamp', type: 'string', required: true },
        { name: 'weight_kg', type: 'number', required: true },
        { name: 'trend_weight_kg', type: 'number', required: true },
        { name: 'note', type: 'string' },
        { name: 'updatedAt', type: 'number', required: true },
        { name: '_deleted', type: 'boolean' }
      ]);
    });
  });

  describe('weightLogsSerializer & collectionSerializers', () => {
    it('exports weightLogHeaders and registers weight_logs in collectionSerializers', () => {
      const expectedHeaders = ['id', 'date', 'timestamp', 'weight_kg', 'trend_weight_kg', 'note', 'updatedAt', '_deleted'];
      expect(weightLogHeaders).toEqual(expectedHeaders);
      expect(weightLogsSerializer).toBeDefined();
      expect(weightLogsSerializer.headers).toEqual(expectedHeaders);
      expect(collectionSerializers['weight_logs']).toBe(weightLogsSerializer);
    });

    it('docToRow serializes a valid WeightLog doc into a TabularRow', () => {
      const doc: WeightLog = {
        id: 'weight_2026-10-15',
        date: '2026-10-15',
        timestamp: '2026-10-15T08:00:00.000Z',
        weight_kg: 82.4,
        trend_weight_kg: 82.9,
        note: 'Morning weigh-in after fasting',
        updatedAt: 1729000000000
      };

      const row = weightLogsSerializer.docToRow(doc);
      expect(row.id).toBe('weight_2026-10-15');
      expect(row.updatedAt).toBe(1729000000000);
      expect(row._deleted).toBeUndefined();
      expect(row.values).toEqual([
        'weight_2026-10-15',
        '2026-10-15',
        '2026-10-15T08:00:00.000Z',
        82.4,
        82.9,
        'Morning weigh-in after fasting',
        1729000000000,
        false
      ]);
    });

    it('docToRow escapes CSV/Formula injection payloads in note and id', () => {
      const docWithFormulaNote: WeightLog = {
        id: 'weight_2026-10-16',
        date: '2026-10-16',
        timestamp: '2026-10-16T08:00:00.000Z',
        weight_kg: 81.5,
        trend_weight_kg: 82.2,
        note: '=SUM(A1:A2)',
        updatedAt: 1729000001000
      };

      const row1 = weightLogsSerializer.docToRow(docWithFormulaNote);
      // Formula prefix '=' in note must be escaped with leading single quote "'"
      expect(row1.values[5]).toBe("'=SUM(A1:A2)");

      const docWithCmdNote: WeightLog = {
        id: '+cmd|\' /C calc\'!A0',
        date: '2026-10-16',
        timestamp: '2026-10-16T08:00:00.000Z',
        weight_kg: 81.5,
        trend_weight_kg: 82.2,
        note: '+cmd|\' /C calc\'!A0',
        updatedAt: 1729000002000
      };

      const row2 = weightLogsSerializer.docToRow(docWithCmdNote);
      expect(row2.values[0]).toBe("'+cmd|' /C calc'!A0");
      expect(row2.values[5]).toBe("'+cmd|' /C calc'!A0");
    });

    it('docToRow handles undefined/null note cleanly without crashing', () => {
      const docWithoutNote: WeightLog = {
        id: 'weight_2026-10-17',
        date: '2026-10-17',
        timestamp: '2026-10-17T08:00:00.000Z',
        weight_kg: 80.0,
        trend_weight_kg: 80.5,
        updatedAt: 1729000003000
      };

      const row = weightLogsSerializer.docToRow(docWithoutNote);
      expect(row.values[5]).toBe('');
    });

    it('rowToDoc deserializes TabularRow back to WeightLog object', () => {
      const row: TabularRow = {
        id: 'weight_2026-10-15',
        updatedAt: 1729000000000,
        headers: ['id', 'date', 'timestamp', 'weight_kg', 'trend_weight_kg', 'note', 'updatedAt', '_deleted'],
        values: [
          'weight_2026-10-15',
          '2026-10-15',
          '2026-10-15T08:00:00.000Z',
          82.4,
          82.9,
          'Morning weigh-in after fasting',
          1729000000000,
          false
        ]
      };

      const doc = weightLogsSerializer.rowToDoc(row);
      expect(doc).toEqual({
        id: 'weight_2026-10-15',
        date: '2026-10-15',
        timestamp: '2026-10-15T08:00:00.000Z',
        weight_kg: 82.4,
        trend_weight_kg: 82.9,
        note: 'Morning weigh-in after fasting',
        updatedAt: 1729000000000,
        _deleted: false
      });
    });

    it('rowToDoc unescapes formula injection strings and handles _deleted tombstones', () => {
      const row: TabularRow = {
        id: 'weight_2026-10-16',
        updatedAt: 1729000001000,
        _deleted: true,
        headers: ['id', 'date', 'timestamp', 'weight_kg', 'trend_weight_kg', 'note', 'updatedAt', '_deleted'],
        values: [
          'weight_2026-10-16',
          '2026-10-16',
          '2026-10-16T08:00:00.000Z',
          81.5,
          82.2,
          "'=SUM(A1:A2)",
          1729000001000,
          true
        ]
      };

      const doc = weightLogsSerializer.rowToDoc(row);
      expect(doc.id).toBe('weight_2026-10-16');
      expect(doc.note).toBe('=SUM(A1:A2)');
      expect(doc._deleted).toBe(true);
    });

    it('rowToDoc dynamically maps reordered spreadsheet headers accurately', () => {
      // Headers scrambled/reordered by external spreadsheet user
      const scrambledHeaders = [
        'note',
        'weight_kg',
        'id',
        '_deleted',
        'updatedAt',
        'trend_weight_kg',
        'timestamp',
        'date'
      ];
      const scrambledValues = [
        'Post workout weigh-in',
        79.8,
        'weight_2026-10-18',
        'false',
        1729000004000,
        80.1,
        '2026-10-18T10:00:00.000Z',
        '2026-10-18'
      ];

      const row: TabularRow = {
        id: 'weight_2026-10-18',
        headers: scrambledHeaders,
        values: scrambledValues
      };

      const doc = weightLogsSerializer.rowToDoc(row);
      expect(doc.id).toBe('weight_2026-10-18');
      expect(doc.date).toBe('2026-10-18');
      expect(doc.timestamp).toBe('2026-10-18T10:00:00.000Z');
      expect(doc.weight_kg).toBe(79.8);
      expect(doc.trend_weight_kg).toBe(80.1);
      expect(doc.note).toBe('Post workout weigh-in');
      expect(doc.updatedAt).toBe(1729000004000);
      expect(doc._deleted).toBe(false);
    });
  });

  describe('Route Mapping in Providers', () => {
    it('DEFAULT_COLLECTION_ROUTES in CompositeCloudSyncProvider routes weight_logs to logs tabular', () => {
      const route = DEFAULT_COLLECTION_ROUTES['weight_logs'];
      expect(route).toBeDefined();
      expect(route).toEqual({
        target: 'tabular',
        documentKey: 'logs',
        documentTitle: 'Quomida Daily Logs',
        tabName: 'weight_logs'
      });
    });

    it('GoogleDriveSheetsCloudSyncProvider routes weight_logs to quomida_daily_logs tabular', () => {
      const provider = new GoogleDriveSheetsCloudSyncProvider();
      // Inspect routes via push behavior with mock drivers
      const routes = (provider as any).routes;
      expect(routes['weight_logs']).toEqual({
        target: 'tabular',
        documentKey: 'quomida_daily_logs',
        documentTitle: 'Quomida Daily Logs',
        tabName: 'weight_logs'
      });
    });

    it('CompositeCloudSyncProvider pushes and pulls weight_logs seamlessly', async () => {
      const blobDriver = new InMemoryBlobDriver();
      const tabularDriver = new InMemoryTabularDriver();
      const provider = new CompositeCloudSyncProvider({
        id: 'test-sync',
        name: 'Test Sync',
        blobDriver,
        tabularDriver
      });
      await provider.initialize();

      const weightPayload = {
        collection: 'weight_logs',
        documents: [
          {
            id: 'weight_2026-10-19',
            date: '2026-10-19',
            timestamp: '2026-10-19T07:30:00.000Z',
            weight_kg: 83.1,
            trend_weight_kg: 82.8,
            note: 'Morning log',
            updatedAt: 1729000010000
          }
        ]
      };

      await provider.push(weightPayload);

      const pulled = await provider.pull();
      const weightDelta = pulled.find(p => p.collection === 'weight_logs');
      expect(weightDelta).toBeDefined();
      expect(weightDelta!.documents.length).toBe(1);
      expect(weightDelta!.documents[0]).toEqual({
        id: 'weight_2026-10-19',
        date: '2026-10-19',
        timestamp: '2026-10-19T07:30:00.000Z',
        weight_kg: 83.1,
        trend_weight_kg: 82.8,
        note: 'Morning log',
        updatedAt: 1729000010000,
        _deleted: false
      });
    });
  });
});
