import React from 'react';
import { useApp } from '../context/AppContext.js';
import { Settings, BookOpen, ChevronLeft, ChevronRight, Cloud, CloudOff, RefreshCw } from 'lucide-react';

export const Header: React.FC = () => {
  const {
    selectedDate,
    setSelectedDate,
    locale,
    syncStatus,
    lastSyncedTime,
    setIsSettingsOpen,
    setIsCatalogOpen,
    t
  } = useApp();

  const handlePrevDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const formattedDate = new Intl.DateTimeFormat(locale === 'es' ? 'es-AR' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(new Date(selectedDate + 'T00:00:00'));

  return (
    <header className="sticky top-0 z-30 w-full glass-card border-b border-slate-800/80 px-4 py-3 shadow-lg">
      <div className="max-w-md mx-auto flex items-center justify-between">
        
        {/* Left Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSettingsOpen(true)}
            id="btn-open-settings"
            aria-label={t.settings.title}
            className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 hover:text-emerald-400 transition-all duration-200 active:scale-95 border border-slate-700/50"
          >
            <Settings className="w-5 h-5" />
          </button>

          <button
            onClick={() => setIsCatalogOpen(true)}
            id="btn-open-catalog"
            aria-label={t.nav.catalog}
            className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 hover:text-emerald-400 transition-all duration-200 active:scale-95 border border-slate-700/50 flex items-center gap-1.5 text-xs font-semibold"
          >
            <BookOpen className="w-5 h-5" />
            <span className="hidden sm:inline">{t.nav.catalog}</span>
          </button>
        </div>

        {/* Center Date Selector */}
        <div className="flex items-center gap-1 bg-slate-900/80 px-3 py-1.5 rounded-full border border-slate-800 shadow-inner">
          <button
            onClick={handlePrevDay}
            aria-label="Previous day"
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-slate-100 capitalize min-w-[100px] text-center">
            {formattedDate}
          </span>
          <button
            onClick={handleNextDay}
            aria-label="Next day"
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Right Sync Status Badge (WCAG aria-live polite) */}
        <div
          aria-live="polite"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/60 border border-emerald-800/50 text-emerald-400 shadow-sm"
          title={`Status: ${syncStatus} (Last: ${lastSyncedTime || 'Now'})`}
        >
          {syncStatus === 'syncing' ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
          ) : syncStatus === 'synced' ? (
            <Cloud className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <CloudOff className="w-3.5 h-3.5 text-amber-400" />
          )}
          <span className="hidden xs:inline">{syncStatus === 'synced' ? 'Local' : syncStatus}</span>
        </div>

      </div>
    </header>
  );
};
