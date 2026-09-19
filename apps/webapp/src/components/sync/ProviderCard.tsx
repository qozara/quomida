import React from 'react';
import { Cloud, HardDrive, AlertTriangle, ExternalLink } from 'lucide-react';
import { StatusDot } from './StatusDot.js';
import { useApp } from '../../context/AppContext.js';
import { resolveProviderDiagnostic, type UXSyncState } from '@quomida/sync-adapters';

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  iconType: 'mock' | 'gdrive' | 'custom';
}

export interface ProviderCardProps {
  provider: ProviderInfo;
  isActive: boolean;
  onConnect: (id: string) => void;
  onDisconnectClick: (id: string, name: string) => void;
  onReconnect: () => void;
}

export const ProviderCard: React.FC<ProviderCardProps> = ({
  provider,
  isActive,
  onConnect,
  onDisconnectClick,
  onReconnect
}) => {
  const { uxSyncState, activeAdapter, t } = useApp();

  const providerDiag = resolveProviderDiagnostic(uxSyncState, isActive);
  const isError = isActive && providerDiag.statusKey === 'needsAttention';
  const accountInfo = isActive ? activeAdapter?.getConnectedAccount?.() || 'user@connected-account' : null;

  const getStatusBadge = () => {
    if (!isActive || providerDiag.statusKey === 'notConnected') return null;
    if (providerDiag.statusKey === 'needsAttention') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-950/80 text-amber-400 border border-amber-700/60">
          <StatusDot variant="attention" hasAlertBadge={true} />
          <span>{t.sync?.panel?.needsReconnect || 'Needs Reconnect'}</span>
        </span>
      );
    }
    if (providerDiag.statusKey === 'paused') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
          <StatusDot variant="paused" />
          <span>{t.sync?.panel?.paused || 'Paused'}</span>
        </span>
      );
    }
    if (providerDiag.statusKey === 'syncing') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
          <StatusDot variant="online" />
          <span>{t.sync?.diagnostics?.syncing || t.sync?.actions?.syncing || 'Syncing...'}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
        <StatusDot variant="online" />
        <span>{t.sync?.panel?.connected || 'Connected'}</span>
      </span>
    );
  };


  const getIcon = () => {
    if (provider.iconType === 'gdrive') {
      return <Cloud className="w-5 h-5 text-emerald-400" />;
    }
    if (provider.iconType === 'mock') {
      return <HardDrive className="w-5 h-5 text-cyan-400" />;
    }
    return <Cloud className="w-5 h-5 text-indigo-400" />;
  };

  return (
    <div
      className={`p-4 rounded-2xl border transition-all ${
        isError
          ? 'bg-amber-950/20 border-amber-600/80 ring-1 ring-amber-500/50'
          : isActive
          ? 'bg-slate-800/80 border-emerald-500/40 ring-1 ring-emerald-500/20'
          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700/80'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700/50 flex-shrink-0">
            {getIcon()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-white tracking-wide truncate">{provider.name}</h4>
              {getStatusBadge()}
            </div>

            {isActive && accountInfo && (
              <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">{accountInfo}</p>
            )}

            <p className="text-xs text-slate-400 mt-1 leading-relaxed">{provider.description}</p>
          </div>
        </div>
      </div>

      {/* Action footer */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
        {isActive ? (
          <>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onDisconnectClick(provider.id, provider.name)}
                className="text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors"
              >
                {t.sync?.panel?.disconnect || 'Disconnect'}
              </button>
              <span
                onClick={() => {
                  if (activeAdapter?.getRemoteLinks) {
                    const links = activeAdapter.getRemoteLinks();
                    links.forEach(link => window.open(link, '_blank'));
                  }
                }}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 cursor-pointer transition-colors"
              >
                <span>{t.sync?.panel?.configure || 'Configure'}</span>
                <ExternalLink className="w-3 h-3" />
              </span>
            </div>

            {isError && (
              <button
                type="button"
                onClick={onReconnect}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-sm"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{t.sync?.panel?.reconnect || 'Reconnect'}</span>
              </button>
            )}
          </>
        ) : (
          <div className="w-full flex justify-end">
            <button
              type="button"
              onClick={() => onConnect(provider.id)}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold rounded-lg transition-all active:scale-95"
            >
              {t.sync?.panel?.connect || 'Connect'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
