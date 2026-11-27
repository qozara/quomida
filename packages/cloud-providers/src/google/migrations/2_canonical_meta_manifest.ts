import {
  MANIFEST_KEYS,
  QOZARA_MANIFEST_VERSION,
  computeSchemaHash,
  type SchemaDefinition,
  type SchemaMigration,
  type TabularMigrationContext,
} from '@qozara/cloud-sync';
import {
  GoogleSheetsContainerDriver,
  type GoogleSheetsFetchClient,
} from '@qozara/cloud-sync-google';
import {
  QuomidaDailyLogsSpreadsheetSchema,
  QuomidaFoodCatalogSpreadsheetSchema,
} from '../schemas.js';

const META_PROTECT_WARNING = 'Qozara System Manifest - Do not delete or alter.';

export function createCanonicalMetaMigration(
  docType: 'daily_logs' | 'food_catalog',
  schema: SchemaDefinition
): SchemaMigration {
  return {
    version: 2,
    up: async (
      client: GoogleSheetsFetchClient,
      spreadsheetId: string,
      context?: TabularMigrationContext
    ) => {
      const legacyEntries: Record<string, string> = {};

      // Non-destructively copy any custom/system entries from legacy _quomida_meta
      try {
        const metaCheck = await client.getSpreadsheetMetadata(
          spreadsheetId,
          'sheets.properties(title)'
        );
        const legacySheet = (metaCheck?.sheets || []).find(
          (s: any) => s?.properties?.title?.trim().toLowerCase() === '_quomida_meta'
        );
        if (legacySheet?.properties?.title) {
          const legacyRes = await client.batchGet(spreadsheetId, [
            `'${legacySheet.properties.title}'!A1:C50`,
          ]);
          const rows: any[][] = legacyRes?.valueRanges?.[0]?.values || [];
          for (let i = 1; i < rows.length; i++) {
            const key = String(rows[i]?.[0] ?? '').trim();
            const val = String(rows[i]?.[1] ?? '').trim();
            if (key && key.toLowerCase() !== 'key' && !key.startsWith('QUOMIDA SYSTEM')) {
              legacyEntries[key] = val;
            }
          }
        }
      } catch {
        // Proceed with canonical stamping even if legacy tab is absent
      }

      const schemaHash = await computeSchemaHash(schema);
      const entries: Record<string, string> = {
        ...legacyEntries,
        [MANIFEST_KEYS.MANIFEST_VERSION]: QOZARA_MANIFEST_VERSION,
        [MANIFEST_KEYS.APP_ID]: 'quomida',
        [MANIFEST_KEYS.DOC_TYPE]: docType,
        [MANIFEST_KEYS.SCHEMA_VERSION]: String(schema.version),
        [MANIFEST_KEYS.SCHEMA_HASH]: schemaHash,
        [MANIFEST_KEYS.ORIGIN_CONTAINER_ID]: spreadsheetId,
      };

      if (context) {
        await context.ensureTable({
          name: '_meta',
          headers: ['key', 'value', 'updatedAt'],
          hidden: true,
          protectWarning: META_PROTECT_WARNING,
          frozenHeaderRow: true,
        });
        await context.writeMeta(entries, {
          hidden: true,
          protectWarning: META_PROTECT_WARNING,
        });
        return;
      }

      const driver = new GoogleSheetsContainerDriver(client);
      await driver.ensureTable(spreadsheetId, {
        name: '_meta',
        headers: ['key', 'value', 'updatedAt'],
        hidden: true,
        protectWarning: META_PROTECT_WARNING,
        frozenHeaderRow: true,
      });
      await driver.writeMeta(spreadsheetId, entries, {
        hidden: true,
        protectWarning: META_PROTECT_WARNING,
      });
    },
  };
}

export const dailyLogsMigrations: SchemaMigration[] = [
  createCanonicalMetaMigration('daily_logs', QuomidaDailyLogsSpreadsheetSchema),
];

export const foodCatalogMigrations: SchemaMigration[] = [
  createCanonicalMetaMigration('food_catalog', QuomidaFoodCatalogSpreadsheetSchema),
];

export const QUOMIDA_MIGRATIONS_BY_DOC_TYPE: Record<string, SchemaMigration[]> = {
  daily_logs: dailyLogsMigrations,
  food_catalog: foodCatalogMigrations,
};
