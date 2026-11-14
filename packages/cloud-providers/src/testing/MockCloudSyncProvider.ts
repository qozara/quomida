import {
  MockCloudSyncProvider as BaseMockCloudSyncProvider,
  type MockCloudSyncProviderOptions,
} from '@qozara/cloud-sync';

export type { MockCloudSyncProviderOptions };

export class MockCloudSyncProvider extends BaseMockCloudSyncProvider {
  constructor(options: MockCloudSyncProviderOptions = {}) {
    super({
      ...options,
      shouldSkipPushDoc:
        options.shouldSkipPushDoc ??
        ((collection, doc) =>
          (collection === 'base_ingredients' || collection === 'portions') &&
          doc.source === 'system'),
    });
  }
}
