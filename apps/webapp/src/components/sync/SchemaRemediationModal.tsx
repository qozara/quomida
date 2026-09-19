import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.js';
import { AlertTriangle, ShieldCheck, RefreshCw, CheckCircle2, X } from 'lucide-react';

export const SchemaRemediationModal: React.FC = () => {
  const { syncStatus, t, repairSync, migrateSync } = useApp();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // If status transitions back to idle or disconnected, reset dismissal & state
  useEffect(() => {
    if (syncStatus !== 'corrupted' && syncStatus !== 'upgrade_required') {
      setIsDismissed(false);
      setIsSuccess(false);
      setErrorMessage(null);
    }
  }, [syncStatus]);

  if (isDismissed || (syncStatus !== 'corrupted' && syncStatus !== 'upgrade_required')) {
    return null;
  }

  const isCorrupted = syncStatus === 'corrupted';
  const title = isCorrupted
    ? t.sync.remediation?.corruptedTitle || 'Spreadsheet Structure Mismatch'
    : t.sync.remediation?.upgradeTitle || 'Spreadsheet Schema Upgrade Required';

  const description = isCorrupted
    ? t.sync.remediation?.corruptedDesc ||
      'Columns or tabs have been altered in your linked cloud spreadsheet. Quomida can safely repair the structure by appending missing columns without deleting your existing data.'
    : t.sync.remediation?.upgradeDesc ||
      'Your linked cloud spreadsheet was created with an older schema version. An automatic migration is required to continue syncing.';

  const handleRemediate = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (isCorrupted) {
        await repairSync();
      } else {
        await migrateSync();
      }
      setIsSuccess(true);
      setTimeout(() => {
        setIsDismissed(true);
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err?.message || 'An error occurred while repairing the spreadsheet.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="schema-remediation-title"
      aria-describedby="schema-remediation-desc"
    >
      <div className="relative w-full max-w-lg overflow-hidden bg-slate-900/95 border border-amber-500/40 rounded-2xl shadow-2xl shadow-amber-950/40 p-6 text-slate-100">
        {/* Dismiss top-right button */}
        <button
          onClick={() => setIsDismissed(true)}
          className="absolute top-4 right-4 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors"
          aria-label={t.sync.remediation?.dismiss || 'Dismiss for now'}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon + Title */}
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h2 id="schema-remediation-title" className="text-lg font-bold text-white tracking-tight">
              {title}
            </h2>
            <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mt-0.5">
              {isCorrupted ? 'Structure Remediation' : 'Schema Upgrade'}
            </p>
          </div>
        </div>

        {/* Description */}
        <p id="schema-remediation-desc" className="text-sm text-slate-300 leading-relaxed mb-5">
          {description}
        </p>

        {/* Automated Backup Guarantee Badge */}
        <div className="flex items-center gap-3 p-3 bg-slate-800/80 border border-slate-700/60 rounded-xl mb-5">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="text-xs text-slate-300 leading-snug">
            {t.sync.remediation?.backupNote ||
              'A backup copy of your spreadsheet will be created in your cloud drive before applying changes.'}
          </p>
        </div>

        {/* Error Announcement */}
        {errorMessage && (
          <div
            className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 mb-4"
            aria-live="polite"
          >
            {errorMessage}
          </div>
        )}

        {/* Success Announcement */}
        {isSuccess && (
          <div
            className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 mb-4"
            aria-live="polite"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              {isCorrupted
                ? t.sync.remediation?.repairSuccess || 'Spreadsheet repaired successfully. Sync has resumed.'
                : t.sync.remediation?.upgradeSuccess || 'Spreadsheet upgraded successfully. Sync has resumed.'}
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2">
          <button
            onClick={() => setIsDismissed(true)}
            disabled={isLoading}
            className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-sm font-medium transition-colors active:scale-95 disabled:opacity-50"
          >
            {t.sync.remediation?.dismiss || 'Dismiss for now'}
          </button>

          <button
            onClick={handleRemediate}
            disabled={isLoading || isSuccess}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-slate-950 text-sm font-semibold shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
          >
            {isLoading && <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />}
            <span>
              {isLoading
                ? isCorrupted
                  ? t.sync.remediation?.repairing || 'Repairing spreadsheet...'
                  : t.sync.remediation?.upgrading || 'Upgrading spreadsheet...'
                : isCorrupted
                  ? t.sync.remediation?.repairButton || 'Repair Spreadsheet'
                  : t.sync.remediation?.upgradeButton || 'Upgrade Spreadsheet'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
