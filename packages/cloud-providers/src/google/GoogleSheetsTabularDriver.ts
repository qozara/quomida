import {
  GoogleSheetsTabularDriver as BaseGoogleSheetsTabularDriver,
  type GoogleDriverOptions,
  type GoogleSheetsTabularDriverOptions,
} from '@qozara/cloud-sync-google';
import {
  QuomidaDailyLogsSpreadsheetSchema,
  QuomidaFoodCatalogSpreadsheetSchema,
} from './schemas.js';

export type { GoogleSheetsTabularDriverOptions };

export function createQuomidaTabularDriverOptions(
  options: GoogleDriverOptions & Partial<GoogleSheetsTabularDriverOptions>
): GoogleSheetsTabularDriverOptions {
  return {
    ...options,
    defaultSchema: options.defaultSchema ?? QuomidaDailyLogsSpreadsheetSchema,
    schemasByDocType: options.schemasByDocType ?? {
      daily_logs: QuomidaDailyLogsSpreadsheetSchema,
      food_catalog: QuomidaFoodCatalogSpreadsheetSchema,
    },
    docTypeResolver:
      options.docTypeResolver ??
      ((title, tabs) => {
        const isLogs = tabs.includes('daily_logs') || title.includes('Daily Logs');
        return {
          docType: isLogs ? 'daily_logs' : 'food_catalog',
          schema: isLogs ? QuomidaDailyLogsSpreadsheetSchema : QuomidaFoodCatalogSpreadsheetSchema,
        };
      }),
    tabMatcher:
      options.tabMatcher ??
      ((tabTitles) => {
        if (tabTitles.includes('daily_logs')) {
          return QuomidaDailyLogsSpreadsheetSchema;
        }
        if (
          tabTitles.includes('base_ingredients') ||
          tabTitles.includes('recipes') ||
          tabTitles.includes('portions')
        ) {
          return QuomidaFoodCatalogSpreadsheetSchema;
        }
        return undefined;
      }),
    appPropertyDocTypeKey: options.appPropertyDocTypeKey ?? 'quomida_doc_type',
    docTypesForLinks: options.docTypesForLinks ?? ['daily_logs', 'food_catalog'],
    metaSheetName: options.metaSheetName ?? '_quomida_meta',
    metaBannerText: options.metaBannerText ?? 'QUOMIDA SYSTEM FILE - DO NOT DELETE',
    metaDescription: options.metaDescription ?? 'Quomida System Metadata',
    autoCreateMissingTabOnWrite: options.autoCreateMissingTabOnWrite ?? true,
  };
}

export class GoogleSheetsTabularDriver extends BaseGoogleSheetsTabularDriver {
  constructor(options: GoogleDriverOptions & Partial<GoogleSheetsTabularDriverOptions>) {
    super(createQuomidaTabularDriverOptions(options));
  }
}
