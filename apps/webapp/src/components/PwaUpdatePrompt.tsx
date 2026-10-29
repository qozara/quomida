import React from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { usePwaUpdate } from '../hooks/usePwaUpdate.js';

export const PwaUpdatePrompt: React.FC = () => {
  const { t } = useApp();
  const { needRefresh, isUpdating, isPromptDismissed, applyUpdate, dismissPrompt } = usePwaUpdate();

  if (!needRefresh || isPromptDismissed) {
    return null;
  }

  const pwaLabels = (t as any).pwaUpdate || {};
  const title = pwaLabels.bannerTitle || 'Update Available';
  const description = pwaLabels.bannerDescription || 'A new version of Quomida is ready to install.';
  const reloadLabel = pwaLabels.reloadNow || 'Update & Reload';
  const dismissLabel = pwaLabels.dismiss || 'Later';

  return (
    <div
      data-testid="pwa-update-prompt"
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-4 right-4 z-40 max-w-md mx-auto bg-slate-900/95 backdrop-blur-md border border-emerald-500/40 rounded-2xl p-3.5 shadow-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
          <RefreshCw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />
        </div>
        <div className="min-w-0">
          <h4 className="text-xs font-bold text-white truncate">{title}</h4>
          <p className="text-[11px] text-slate-300 leading-snug">{description}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          id="btn-pwa-update-reload"
          data-testid="btn-pwa-update-reload"
          disabled={isUpdating}
          onClick={() => applyUpdate()}
          className="min-h-[44px] px-3 py-2 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-sm whitespace-nowrap disabled:opacity-75 flex items-center gap-1.5"
        >
          {isUpdating ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>{reloadLabel}</span>
            </>
          ) : (
            reloadLabel
          )}
        </button>
        <button
          type="button"
          id="btn-pwa-update-dismiss"
          data-testid="btn-pwa-update-dismiss"
          disabled={isUpdating}
          onClick={() => dismissPrompt()}
          aria-label={dismissLabel}
          className="min-w-[44px] min-h-[44px] p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors flex items-center justify-center disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
