import { useMemo } from 'react';
import { MockSyncAdapter } from '@quomida/sync-adapters';
import type { AdapterFactory } from '../types.js';

export const useMockAdapter = (): AdapterFactory => {
  return useMemo(() => ({
    id: 'mock-sync-adapter',
    name: 'Mock Cloud Sync',
    description: 'Local test adapter simulating BYOS synchronization and offline resilience.',
    iconType: 'mock',
    
    connect: async () => {
      const adapter = new MockSyncAdapter();
      await adapter.initialize();
      return { adapter, credentials: {} };
    },
    
    restore: async () => {
      const adapter = new MockSyncAdapter();
      await adapter.initialize();
      return adapter;
    }
  }), []);
};
