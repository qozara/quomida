import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { ProviderCard, type ProviderInfo } from './ProviderCard.js';

export interface CloudAdapterListProps {
  onDisconnectRequest: (id: string, name: string) => void;
}

const AVAILABLE_PROVIDERS: ProviderInfo[] = [
  {
    id: 'mock-sync-adapter',
    name: 'Mock Cloud Sync',
    description: 'Local test adapter simulating BYOS synchronization and offline resilience.',
    iconType: 'mock'
  },
  {
    id: 'google-drive-sheets',
    name: 'Google Drive / Sheets (BYOS)',
    description: 'Connect personal Google Drive spreadsheet for cross-device cloud backups.',
    iconType: 'gdrive'
  }
];

import { useGoogleLogin } from '@react-oauth/google';

export const CloudAdapterList: React.FC<CloudAdapterListProps> = ({ onDisconnectRequest }) => {
  const { activeAdapter, connectAdapter, reconnectAdapter, t } = useApp();

  const googleLogin = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata',
    onSuccess: async (tokenResponse) => {
      await connectAdapter('google-drive-sheets', tokenResponse.access_token);
    },
    onError: (error) => console.error('Google Login Failed:', error)
  });

  const handleConnect = async (providerId: string) => {
    if (providerId === 'google-drive-sheets') {
      googleLogin();
    } else {
      await connectAdapter(providerId);
    }
  };

  const handleReconnect = async (providerId: string) => {
    if (providerId === 'google-drive-sheets') {
      googleLogin();
    } else {
      await reconnectAdapter();
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-200 tracking-wide">
          {t.sync?.panel?.remoteTitle || 'Remote Synchronization (BYOS)'}
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          {t.sync?.panel?.remoteDescription ||
            'Connect a storage provider to back up your logs and sync across devices.'}
        </p>
      </div>

      <div className="space-y-3">
        {AVAILABLE_PROVIDERS.map((provider) => {
          const isActive = Boolean(
            activeAdapter &&
            activeAdapter.id === provider.id &&
            activeAdapter.isInitialized() &&
            activeAdapter.getStatus() !== 'disconnected'
          );
          return (
            <ProviderCard
              key={provider.id}
              provider={provider}
              isActive={isActive}
              onConnect={handleConnect}
              onDisconnectClick={onDisconnectRequest}
              onReconnect={() => handleReconnect(provider.id)}
            />
          );
        })}
      </div>
    </div>
  );
};
