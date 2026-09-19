import { useGoogleDriveAdapter } from './google/useGoogleDriveAdapter.js';
import { useMockAdapter } from './mock/useMockAdapter.js';
import type { AdapterFactory } from './types.js';

export const useSyncAdapterRegistry = (): AdapterFactory[] => {
  return [
    useMockAdapter(),
    useGoogleDriveAdapter()
  ];
};

export type { AdapterFactory };
