import type { CollectionRoute } from '@qozara/cloud-sync';
import {
  GoogleDriveSheetsCloudSyncProvider as BaseGoogleDriveSheetsCloudSyncProvider,
  type GoogleHttpClient,
} from '@qozara/cloud-sync-google';
import { createQuomidaTabularDriverOptions } from './google/GoogleSheetsTabularDriver.js';
import { collectionSerializers } from './strategy/serializers.js';

export interface GoogleDriveSheetsCloudSyncProviderOptions {
  httpClient?: GoogleHttpClient;
  routes?: Record<string, CollectionRoute>;
  onTokenRefresh?: () => Promise<string>;
}

const DEFAULT_QUOMIDA_GOOGLE_ROUTES: Record<string, CollectionRoute> = {
  daily_logs: {
    target: 'tabular',
    documentKey: 'quomida_daily_logs',
    documentTitle: 'Quomida Daily Logs',
    tabName: 'daily_logs',
  },
  weight_logs: {
    target: 'tabular',
    documentKey: 'quomida_daily_logs',
    documentTitle: 'Quomida Daily Logs',
    tabName: 'weight_logs',
  },
  base_ingredients: {
    target: 'tabular',
    documentKey: 'quomida_food_catalog',
    documentTitle: 'Quomida Food Catalog',
    tabName: 'base_ingredients',
  },
  recipes: {
    target: 'tabular',
    documentKey: 'quomida_food_catalog',
    documentTitle: 'Quomida Food Catalog',
    tabName: 'recipes',
  },
  portions: {
    target: 'tabular',
    documentKey: 'quomida_food_catalog',
    documentTitle: 'Quomida Food Catalog',
    tabName: 'portions',
  },
  user_settings: { target: 'blob', filename: 'settings.json' },
};

export class GoogleDriveSheetsCloudSyncProvider extends BaseGoogleDriveSheetsCloudSyncProvider {
  constructor(options?: GoogleDriveSheetsCloudSyncProviderOptions) {
    const { getAccessToken: _ignored, ...tabularDefaults } = createQuomidaTabularDriverOptions({
      getAccessToken: () => null,
      httpClient: options?.httpClient,
    });

    super({
      id: 'google-drive-sheets',
      name: 'Google Drive / Sheets BYOS Adapter',
      description: 'Direct synchronization to personal Google Drive spreadsheets',
      httpClient: options?.httpClient,
      routes: options?.routes || { ...DEFAULT_QUOMIDA_GOOGLE_ROUTES },
      serializers: collectionSerializers,
      shouldSkipTabularPushDoc: (collection, doc) =>
        (collection === 'base_ingredients' || collection === 'portions') &&
        doc.source === 'system',
      blobDriverOptions: {
        enableLegacyRootMigration: false,
        multipartBoundary: '-------quomida_blob_boundary',
      },
      tabularDriverOptions: tabularDefaults,
      onTokenRefresh: options?.onTokenRefresh,
    });
  }
}
