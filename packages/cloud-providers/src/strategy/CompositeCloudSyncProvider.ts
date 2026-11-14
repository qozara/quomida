import {
  CompositeCloudSyncProvider as BaseCompositeCloudSyncProvider,
  isNetworkError,
  isEntityNotFoundError,
  shouldAcceptIncomingDoc,
  sanitizeRemoteDocument,
  type CollectionRoute,
  type CompositeCloudSyncProviderOptions,
} from '@qozara/cloud-sync';
import { collectionSerializers } from './serializers.js';

export {
  isNetworkError,
  isEntityNotFoundError,
  shouldAcceptIncomingDoc,
  sanitizeRemoteDocument,
};

export const DEFAULT_COLLECTION_ROUTES: Record<string, CollectionRoute> = {
  user_settings: {
    target: 'blob',
    filename: 'settings.json',
  },
  daily_logs: {
    target: 'tabular',
    documentKey: 'logs',
    documentTitle: 'Quomida Daily Logs',
    tabName: 'daily_logs',
  },
  weight_logs: {
    target: 'tabular',
    documentKey: 'logs',
    documentTitle: 'Quomida Daily Logs',
    tabName: 'weight_logs',
  },
  base_ingredients: {
    target: 'tabular',
    documentKey: 'catalog',
    documentTitle: 'Quomida Food Catalog',
    tabName: 'base_ingredients',
  },
  recipes: {
    target: 'tabular',
    documentKey: 'catalog',
    documentTitle: 'Quomida Food Catalog',
    tabName: 'recipes',
  },
  portions: {
    target: 'tabular',
    documentKey: 'catalog',
    documentTitle: 'Quomida Food Catalog',
    tabName: 'portions',
  },
};

export class CompositeCloudSyncProvider extends BaseCompositeCloudSyncProvider {
  constructor(options: CompositeCloudSyncProviderOptions) {
    super({
      ...options,
      routes: options.routes || { ...DEFAULT_COLLECTION_ROUTES },
      serializers: options.serializers || collectionSerializers,
      shouldSkipTabularPushDoc:
        options.shouldSkipTabularPushDoc ??
        ((collection, doc) =>
          (collection === 'base_ingredients' || collection === 'portions') &&
          doc.source === 'system'),
    });
  }
}
