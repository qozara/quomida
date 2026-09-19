import { CloudSyncProvider } from '@quomida/cloud-providers';

export interface CloudProviderFactory {
  id: string;
  name: string;
  description: string;
  iconType: 'mock' | 'gdrive' | 'custom';
  
  /**
   * Connects interactively or fetches new credentials if necessary.
   * Returns the initialized adapter and the credentials to persist.
   */
  connect: () => Promise<{ adapter: CloudSyncProvider, credentials: any }>;

  /**
   * Restores a previously connected adapter using stored credentials without prompting the user.
   */
  restore: (credentials: any) => Promise<CloudSyncProvider>;
}
