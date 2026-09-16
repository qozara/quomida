import React, { useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext.js';
import { SyncGlyph } from './SyncGlyph.js';
import { StatusDot } from './StatusDot.js';
import { DiagnosticRow } from './DiagnosticRow.js';
import { SyncTimestamp } from './SyncTimestamp.js';
import { Wifi, Cloud, Clock, RefreshCw, AlertTriangle } from 'lucide-react';
import { resolveProviderDiagnostic } from '@quomida/sync-adapters';

export interface SyncInspectorPopoverProps {

  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

export const SyncInspectorPopover: React.FC<SyncInspectorPopoverProps> = ({
  isOpen,
  onClose,
  triggerRef
}) => {
  const {
    uxSyncState,
    syncStatus,
    activeAdapter,
    isOnline,
    lastSyncedTime,
    forceSync,
    reconnectAdapter,
    setIsStorageSettingsOpen,
    t
  } = useApp();

  const popoverRef = useRef<HTMLDivElement>(null);
  const reconnectBtnRef = useRef<HTMLButtonElement>(null);
  const forceSyncBtnRef = useRef<HTMLButtonElement>(null);

  // Focus management: move focus to primary action upon opening, restore to trigger upon closing
  useEffect(() => {
    if (isOpen) {
      // Prioritize reconnect button if error state, otherwise force sync button
      if (uxSyncState === 'error' && reconnectBtnRef.current) {
        reconnectBtnRef.current.focus();
      } else if (forceSyncBtnRef.current) {
        forceSyncBtnRef.current.focus();
      }
    }
  }, [isOpen, uxSyncState]);

  // Handle escape key and outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        triggerRef.current?.focus();
      } else if (e.key === 'Tab' && popoverRef.current) {
        // Focus trap
        const focusableElements = popoverRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    const handlePointerDown = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        onClose();
        triggerRef.current.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  const hasActiveAdapter = Boolean(
    activeAdapter &&
    activeAdapter.isInitialized() &&
    activeAdapter.getStatus() !== 'disconnected'
  );

  const providerName = hasActiveAdapter ? activeAdapter!.name : 'BYOS Cloud';

  // Headings and assurances based on UX state
  const title = t.sync?.header?.[uxSyncState] || 'Sync Status';
  const subtitle = t.sync?.subtitle?.[uxSyncState] || '';

  const isSyncDisabled = !isOnline || uxSyncState === 'syncing' || !hasActiveAdapter;

  const handleOpenStorageSettings = () => {
    onClose();
    setIsStorageSettingsOpen(true);
  };

  return (
    <div
      ref={popoverRef}
      id="sync-inspector-popover"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-inspector-title"
      className="absolute top-full right-0 mt-2 z-50 w-[320px] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-4 text-slate-100 animate-in fade-in zoom-in-95 duration-150"
    >
      {/* 1. Status Header */}
      <div className="flex items-start gap-3 pb-3 border-b border-slate-800">
        <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/50 flex-shrink-0 flex items-center justify-center">
          <SyncGlyph state={uxSyncState} className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 id="sync-inspector-title" className="text-sm font-bold text-white tracking-wide truncate">
            {title}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 leading-snug">
            {subtitle}
          </p>
        </div>
      </div>

      {/* 2. Diagnostic Checklist */}
      <div className="py-3 space-y-1">
        {/* Row 1: Internet Connection */}
        <DiagnosticRow
          icon={<Wifi className="w-4 h-4" />}
          label={t.sync?.diagnostics?.connection || 'Internet connection'}
          value={isOnline ? t.sync?.diagnostics?.connected || 'Connected' : t.sync?.diagnostics?.offline || 'Offline'}
          statusBadge={<StatusDot variant={isOnline ? 'online' : 'offline'} />}
        />

        {/* Row 2: Cloud Provider */}
        {(() => {
          const providerDiag = resolveProviderDiagnostic(uxSyncState, hasActiveAdapter);
          const getDiagnosticText = () => {
            if (!hasActiveAdapter || providerDiag.statusKey === 'notConnected') {
              return t.sync?.diagnostics?.notConnected || 'Not connected';
            }
            if (providerDiag.statusKey === 'needsAttention') {
              return t.sync?.diagnostics?.needsAttention || 'Needs attention';
            }
            if (uxSyncState === 'waiting') {
              return t.sync?.diagnostics?.reauthenticating || 'Re-authenticating in background...';
            }
            if (providerDiag.statusKey === 'paused') {
              return t.sync?.diagnostics?.paused || 'Paused';
            }
            if (providerDiag.statusKey === 'syncing') {
              return t.sync?.diagnostics?.syncing || 'Syncing...';
            }
            return t.sync?.diagnostics?.connected || 'Connected';
          };

          return (
            <DiagnosticRow
              icon={<Cloud className="w-4 h-4" />}
              label={hasActiveAdapter ? activeAdapter!.name : (t.sync?.diagnostics?.cloudProvider || 'Cloud Provider')}
              value={getDiagnosticText()}
              statusBadge={
                <StatusDot
                  variant={providerDiag.variant}
                  hasAlertBadge={providerDiag.hasAlertBadge}
                />
              }
            />
          );
        })()}


        {/* Row 3: Last Sync Metric */}
        <DiagnosticRow
          icon={<Clock className="w-4 h-4" />}
          label={t.sync?.diagnostics?.lastSync?.replace('{{time}}', '')?.replace(':', '') || 'Last sync'}
          value={<SyncTimestamp timestamp={lastSyncedTime} />}
        />
      </div>

      {/* 3. Inline Resolution Banner (Conditional - Persistent Errors Only) */}
      {uxSyncState === 'error' && (
        <div className="my-2 p-3 bg-amber-950/50 border border-amber-800/80 rounded-xl space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-amber-200 leading-snug">
              {(t.sync?.banner?.expired || 'Your session with {{provider}} expired. Re-authenticate to keep cloud backups current.').replace(
                '{{provider}}',
                providerName
              )}
            </p>
          </div>
          <button
            ref={reconnectBtnRef}
            onClick={reconnectAdapter}
            className="w-full py-1.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-colors shadow-sm active:scale-[0.98]"
          >
            {(t.sync?.banner?.reconnect || 'Reconnect {{provider}}').replace('{{provider}}', providerName)}
          </button>
        </div>
      )}

      {/* 4. Action Bar / Footer */}
      <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
        <button
          ref={forceSyncBtnRef}
          onClick={forceSync}
          disabled={isSyncDisabled}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all active:scale-95 ${
            isSyncDisabled
              ? 'text-slate-600 bg-slate-800/40 cursor-not-allowed'
              : 'text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin text-emerald-400' : ''}`} />
          <span>{syncStatus === 'syncing' ? t.sync?.actions?.syncing || 'Syncing...' : t.sync?.actions?.forceSync || 'Force Sync Now'}</span>
        </button>

        <button
          onClick={handleOpenStorageSettings}
          className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-semibold transition-colors hover:underline"
        >
          <span>{t.sync?.actions?.storageSettings || 'Storage Settings →'}</span>
        </button>
      </div>
    </div>
  );
};
