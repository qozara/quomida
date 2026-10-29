import { useGoogleDriveProvider } from './google/useGoogleDriveProvider.js';
import type { CloudProviderFactory } from './types.js';

export const useCloudProviderRegistry = (): CloudProviderFactory[] => {
  return [
    useGoogleDriveProvider()
  ];
};

export type { CloudProviderFactory };
