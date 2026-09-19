import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { ProviderCard, type ProviderInfo } from './ProviderCard.js';

export interface CloudProviderListProps {
  onDisconnectRequest: (id: string, name: string) => void;
}

import { useCloudProviderRegistry } from '../../cloud-providers/index.js';

export const CloudProviderList: React.FC<CloudProviderListProps> = ({ onDisconnectRequest }) => {
  const { activeProvider, connectProvider, reconnectProvider, t } = useApp();

  const registry = useCloudProviderRegistry();

  const handleConnect = async (providerId: string) => {
    await connectProvider(providerId);
  };

  const handleReconnect = async () => {
    await reconnectProvider();
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
        {registry.map((provider) => {
          const isActive = Boolean(
            activeProvider &&
            activeProvider.id === provider.id &&
            activeProvider.isInitialized() &&
            activeProvider.getStatus() !== 'disconnected'
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
