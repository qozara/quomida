import { useMemo } from 'react';
import { MockCloudSyncProvider } from '@quomida/cloud-providers';
import type { CloudProviderFactory } from '../types.js';

export const useMockCloudProvider = (): CloudProviderFactory => {
  return useMemo(() => ({
    id: 'mock-sync-adapter',
    name: 'Mock Cloud Sync',
    description: 'Local test adapter simulating BYOS synchronization and offline resilience.',
    iconType: 'mock',
    
    connect: async () => {
      const adapter = new MockCloudSyncProvider();
      await adapter.initialize();
      return { adapter, credentials: {} };
    },
    
    restore: async () => {
      const adapter = new MockCloudSyncProvider();
      await adapter.initialize();
      return adapter;
    }
  }), []);
};
