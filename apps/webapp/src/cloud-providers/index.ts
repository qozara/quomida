import { useGoogleDriveProvider } from './google/useGoogleDriveProvider.js';
import { useMockCloudProvider } from './mock/useMockCloudProvider.js';
import type { CloudProviderFactory } from './types.js';

export const useCloudProviderRegistry = (): CloudProviderFactory[] => {
  return [
    useMockCloudProvider(),
    useGoogleDriveProvider()
  ];
};

export type { CloudProviderFactory };
