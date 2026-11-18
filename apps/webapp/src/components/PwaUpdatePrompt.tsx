import React from 'react';
import { RefreshCw, X } from 'lucide-react';
import { PwaUpdateBanner } from '@qozara/pwa-update';
import { useApp } from '../context/AppContext.js';
import { ensurePwaUpdateConfigured } from '../hooks/usePwaUpdate.js';

export const PwaUpdatePrompt: React.FC = () => {
  ensurePwaUpdateConfigured();
  const { t } = useApp();

  const pwaLabels = (t as any).pwaUpdate || {};

  return (
    <PwaUpdateBanner
      labels={{
        title: pwaLabels.bannerTitle || 'Update Available',
        description: pwaLabels.bannerDescription || 'A new version of Quomida is ready to install.',
        reload: pwaLabels.reloadNow || 'Update & Reload',
        updating: pwaLabels.reloadNow || 'Update & Reload',
        dismiss: pwaLabels.dismiss || 'Later',
      }}
      classNames={{
        root: 'fixed bottom-20 left-4 right-4 z-40 max-w-md mx-auto bg-slate-900/95 backdrop-blur-md border border-emerald-500/40 rounded-2xl p-3.5 shadow-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200',
        content: 'flex items-center gap-3 min-w-0',
        iconWrapper: 'p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0',
        textWrapper: 'min-w-0',
        title: 'text-xs font-bold text-white truncate',
        description: 'text-[11px] text-slate-300 leading-snug',
        actions: 'flex items-center gap-1.5 shrink-0',
        reloadButton: 'min-h-[44px] px-3 py-2 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-sm whitespace-nowrap disabled:opacity-75 flex items-center gap-1.5',
        dismissButton: 'min-h-[44px] min-w-[44px] p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors flex items-center justify-center disabled:opacity-50',
      }}
      icon={({ isUpdating }) => (
        <RefreshCw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />
      )}
      reloadIcon={({ isUpdating }) =>
        isUpdating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null
      }
      dismissIcon={<X className="w-4 h-4" />}
      ids={{
        reloadButton: 'btn-pwa-update-reload',
        dismissButton: 'btn-pwa-update-dismiss',
      }}
      testIds={{
        root: 'pwa-update-prompt',
        reloadButton: 'btn-pwa-update-reload',
        dismissButton: 'btn-pwa-update-dismiss',
      }}
    />
  );
};
