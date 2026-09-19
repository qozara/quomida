import React, { useState } from 'react';
import { AlertTriangle, RotateCcw, Download } from 'lucide-react';
import type { QuomidaDBError } from '../db/rxdb.js';
import { useApp } from '../context/AppContext.js';

interface Props {
  error: QuomidaDBError;
  dbVersion: number;
}

export const DatabaseRecoveryScreen: React.FC<Props> = ({ error, dbVersion }) => {
  const { clearLocalDatabase } = useApp();
  const [isDownloading, setIsDownloading] = useState(false);

  // Helper to download raw backup JSON
  const handleDownloadBackup = () => {
    if (!error.backupData) return;
    setIsDownloading(true);
    try {
      const blob = new Blob([error.backupData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quomida_backup_v${dbVersion}_${new Date().getTime()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

  let title = 'Local Database Initialization Failed';
  let description = error.message;

  if (error.type === 'SCHEMA_MISMATCH') {
    title = 'Local Database Schema Conflict';
    description = 'Your local IndexedDB was created with a different schema hash. This typically occurs during development when schemas change without a version bump.';
  } else if (error.type === 'MIGRATION_FAILED') {
    title = 'Database Upgrade Failed';
    description = 'Your local database needs to be upgraded to match the latest app version, but the upgrade failed. To prevent data loss, your previous data has been preserved in a backup.';
  } else if (error.type === 'CORRUPTION') {
    title = 'Local Data Corruption Detected';
    description = 'We detected an issue reading your local data. You can try recovering it or reset the local storage entirely.';
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-slate-900 border border-rose-900/50 rounded-3xl p-6 space-y-6 shadow-2xl text-center animate-in fade-in">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-950/60 border border-rose-800/60 flex items-center justify-center text-rose-400">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div className="space-y-3">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
        </div>

        <div className="space-y-3 pt-2">
          {error.backupData && (
            <button
              onClick={handleDownloadBackup}
              disabled={isDownloading}
              className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.99] text-white text-sm font-semibold transition-all shadow-md flex items-center justify-center gap-2 border border-slate-700/50"
            >
              <Download className="w-4 h-4" />
              <span>{isDownloading ? 'Downloading...' : 'Download Data Backup'}</span>
            </button>
          )}

          <button
            onClick={clearLocalDatabase}
            className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-[0.99] text-white text-sm font-bold transition-all shadow-lg shadow-rose-950/50 flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset Local Storage (Revert to v{dbVersion})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
