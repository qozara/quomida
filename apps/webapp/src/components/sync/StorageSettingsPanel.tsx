import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { CloudProviderList } from './CloudProviderList.js';
import { ChevronLeft, X, Database, ShieldCheck, AlertCircle, Trash2 } from 'lucide-react';

export interface StorageSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onBack?: () => void;
}

export const StorageSettingsPanel: React.FC<StorageSettingsPanelProps> = ({
  isOpen,
  onClose,
  onBack
}) => {
  const { itemCounts, disconnectProvider, clearLocalDatabase, t, dbVersion } = useApp();
  const [disconnectTarget, setDisconnectTarget] = useState<{ id: string; name: string } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  if (!isOpen) return null;

  const handleConfirmDisconnect = async () => {
    if (disconnectTarget) {
      await disconnectProvider();
      setDisconnectTarget(null);
    }
  };

  const metadataText = (
    t.sync?.panel?.localMetadata ||
    'Storage Engine: IndexedDB (RxDB) · Items: {{logs}} logs, {{foods}} custom foods'
  )
    .replace('{{logs}}', String(itemCounts.logs))
    .replace('{{foods}}', String(itemCounts.customFoods));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="storage-settings-title"
        className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
      >
        {/* Navigation Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <button
            onClick={onBack || onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center gap-1 text-xs font-semibold"
            aria-label={t.sync?.panel?.back || 'Back'}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>{t.sync?.panel?.back || 'Back'}</span>
          </button>

          <h2 id="storage-settings-title" className="text-lg font-bold text-white tracking-wide">
            {t.sync?.panel?.title || 'Storage & Sync'}
          </h2>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            aria-label={t.sync?.panel?.close || 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Local Data Overview Card */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-sm">
            <Database className="w-4 h-4" />
            <span>{t.sync?.panel?.localTitle || 'Local Device Storage'}</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {t.sync?.panel?.localDescription ||
              'Quomida stores your meal logs and food catalogs on this device first for offline speed.'}
          </p>
          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800/80 text-[11px] font-mono text-slate-300">
            {metadataText}
          </div>
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            id="btn-empty-local-db"
            className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-800/60 text-slate-400 hover:text-rose-300 text-xs font-semibold transition-all flex items-center justify-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{(t.sync?.panel?.emptyDatabase || `Empty Local Database (v${dbVersion})`).replace('(v0)', `(v${dbVersion})`)}</span>
          </button>
        </div>

        {/* Remote Synchronization (BYOS) Section */}
        <CloudProviderList
          onDisconnectRequest={(id, name) => setDisconnectTarget({ id, name })}
        />

        {/* Local-First Guarantee Footer */}
        <div className="pt-2 border-t border-slate-800/80 flex items-start gap-2.5 text-slate-400 text-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <p className="leading-snug">
            {t.sync?.panel?.localFirstGuarantee ||
              'Local-first guarantee: Disconnecting a cloud provider will never delete records from this device.'}
          </p>
        </div>

        {/* Disconnect Confirmation Sheet / Dialog */}
        {disconnectTarget && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm rounded-3xl p-6 flex flex-col justify-center items-center text-center z-10 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-3 bg-rose-950/50 text-rose-400 rounded-full mb-3 border border-rose-800/50">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">
              {(t.sync?.panel?.confirmTitle || 'Disconnect {{provider}}?').replace(
                '{{provider}}',
                disconnectTarget.name
              )}
            </h3>
            <p className="text-xs text-slate-400 max-w-xs mb-6 leading-relaxed">
              {t.sync?.panel?.confirmMessage ||
                'Your local data remains intact, but changes will no longer back up remotely.'}
            </p>
            <div className="flex gap-3 w-full max-w-xs">
              <button
                type="button"
                onClick={() => setDisconnectTarget(null)}
                className="flex-1 py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                {t.sync?.panel?.cancelAction || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirmDisconnect}
                className="flex-1 py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-sm"
              >
                {t.sync?.panel?.confirmAction || 'Disconnect'}
              </button>
            </div>
          </div>
        )}

        {/* Empty Local Database Confirmation Dialog */}
        {showResetConfirm && (
          <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-sm rounded-3xl p-6 flex flex-col justify-center items-center text-center z-20 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-3 bg-rose-950/50 text-rose-400 rounded-full mb-3 border border-rose-800/50">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">
              {t.sync?.panel?.emptyDatabaseConfirmTitle || 'Empty local database?'}
            </h3>
            <p className="text-xs text-slate-400 max-w-xs mb-6 leading-relaxed">
              {(t.sync?.panel?.emptyDatabaseConfirmMessage ||
                `All local daily logs and custom ingredients will be permanently removed, and initial foods will be re-seeded fresh for version ${dbVersion}.`).replace('version 0', `version ${dbVersion}`)}
            </p>
            <div className="flex gap-3 w-full max-w-xs">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                {t.sync?.panel?.cancelAction || 'Cancel'}
              </button>
              <button
                type="button"
                id="btn-confirm-empty-db"
                onClick={async () => {
                  setShowResetConfirm(false);
                  await clearLocalDatabase();
                }}
                className="flex-1 py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-sm"
              >
                {t.sync?.panel?.emptyDatabaseAction || 'Empty Database'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
