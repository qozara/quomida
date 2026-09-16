import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CompositeSyncAdapter,
  type BlobStorageDriver,
  type TabularStorageDriver,
  type TabularRow
} from '../src/index.js';
import type { SyncDeltaPayload } from '../src/types.js';

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

describe('CompositeSyncAdapter & Strategy Pattern', () => {
  let blobDriver: InMemoryBlobDriver;
  let tabularDriver: InMemoryTabularDriver;
  let adapter: CompositeSyncAdapter;

  beforeEach(async () => {
    blobDriver = new InMemoryBlobDriver();
    tabularDriver = new InMemoryTabularDriver();
    adapter = new CompositeSyncAdapter({
      id: 'test-composite-adapter',
      name: 'Test Composite Adapter',
      blobDriver,
      tabularDriver
    });
    await adapter.initialize();
  });

  it('routes user_settings to BlobStorageDriver as JSON', async () => {
    const settingsPayload: SyncDeltaPayload = {
      collection: 'user_settings',
      documents: [
        {
          id: 'global_settings',
          locale: 'es-AR',
          theme: 'dark',
          daily_calorie_target: 2200,
          custom_macros: { protein: 160, carbs: 220, fats: 70 },
          updatedAt: 1726440000000
        }
      ]
    };

    await adapter.push(settingsPayload);

    const savedBlob = await blobDriver.readBlob('settings.json');
    expect(savedBlob).toBeDefined();
    expect(Array.isArray(savedBlob)).toBe(true);
    expect(savedBlob[0].daily_calorie_target).toBe(2200);
    expect(savedBlob[0].theme).toBe('dark');
  });

  it('routes daily_logs to TabularStorageDriver with denormalized food_details_readonly column', async () => {
    const logsPayload: SyncDeltaPayload = {
      collection: 'daily_logs',
      documents: [
        {
          id: 'log_1',
          timestamp: '2026-09-15T12:00:00.000Z',
          date: '2026-09-15',
          meal_type: 'meal_lunch',
          food_reference_id: 'food_chicken',
          food_name: 'Pechuga de Pollo',
          quantity: 1.5,
          portion_name: 'Plato mediano',
          macros: { calories: 247, protein: 46, carbs: 0, fats: 5 },
          updatedAt: 1726441000000
        }
      ]
    };

    await adapter.push(logsPayload);

    const logsDocId = await tabularDriver.ensureDocument('Quomida Daily Logs', ['daily_logs']);
    const rows = await tabularDriver.readTable(logsDocId, 'daily_logs');
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe('log_1');

    // Verify denormalized food_details_readonly (at index 12)
    const values = rows[0].values;
    const denormalizedStr = values[12];
    expect(denormalizedStr).toBeDefined();
    expect(typeof denormalizedStr).toBe('string');
    expect(denormalizedStr).toContain('Pechuga de Pollo');
    expect(denormalizedStr).toContain('247kcal');
    expect(denormalizedStr).toContain('46g P');
  });

  it('routes base_ingredients, recipes, and portions to separate tabs in the Catalog spreadsheet', async () => {
    await adapter.push({
      collection: 'base_ingredients',
      documents: [
        {
          id: 'food_1',
          name: 'Avena Instantánea',
          source: 'custom',
          lang: 'es',
          calories_100g: 389,
          protein_100g: 16.9,
          carbs_100g: 66.3,
          fats_100g: 6.9,
          updatedAt: 1726442000000
        }
      ]
    });

    await adapter.push({
      collection: 'portions',
      documents: [
        {
          id: 'portion_1',
          base_food_id: 'food_1',
          name: 'Taza',
          equivalent_weight_g: 80,
          updatedAt: 1726443000000
        }
      ]
    });

    const catalogDocId = await tabularDriver.ensureDocument('Quomida Food Catalog', ['base_ingredients', 'recipes', 'portions']);
    const ingRows = await tabularDriver.readTable(catalogDocId, 'base_ingredients');
    const portionRows = await tabularDriver.readTable(catalogDocId, 'portions');

    expect(ingRows.length).toBe(1);
    expect(ingRows[0].id).toBe('food_1');
    expect(ingRows[0].values).toContain('Avena Instantánea');

    expect(portionRows.length).toBe(1);
    expect(portionRows[0].id).toBe('portion_1');
    expect(portionRows[0].values).toContain('Taza');
  });

  it('pulls data from drivers and reconstitutes normalized RxDB documents', async () => {
    // Push settings and daily logs
    await adapter.push({
      collection: 'user_settings',
      documents: [{ id: 'global_settings', locale: 'en-US', theme: 'light', daily_calorie_target: 2000, custom_macros: { protein: 150, carbs: 200, fats: 60 } }]
    });

    await adapter.push({
      collection: 'daily_logs',
      documents: [
        {
          id: 'log_99',
          timestamp: '2026-09-15T18:00:00.000Z',
          date: '2026-09-15',
          meal_type: 'meal_dinner',
          food_reference_id: 'food_salmon',
          food_name: 'Salmón Grillado',
          quantity: 1,
          portion_name: 'Filete',
          macros: { calories: 350, protein: 34, carbs: 0, fats: 22 },
          updatedAt: 1726445000000
        }
      ]
    });

    const pulled = await adapter.pull();
    expect(pulled.length).toBeGreaterThanOrEqual(2);

    const settingsPayload = pulled.find(p => p.collection === 'user_settings');
    expect(settingsPayload).toBeDefined();
    expect(settingsPayload!.documents[0].locale).toBe('en-US');

    const logsPayload = pulled.find(p => p.collection === 'daily_logs');
    expect(logsPayload).toBeDefined();
    expect(logsPayload!.documents[0].id).toBe('log_99');
    expect(logsPayload!.documents[0].food_name).toBe('Salmón Grillado');
    expect(logsPayload!.documents[0].macros.calories).toBe(350);
    // Ensure read-only denormalized string is stripped/omitted in RxDB document on pull
    expect((logsPayload!.documents[0] as any).food_details_readonly).toBeUndefined();
  });
});
