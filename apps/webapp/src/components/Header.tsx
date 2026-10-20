import React from 'react';
import { useApp } from '../context/AppContext.js';
import { Settings, BookOpen, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { HeaderSyncTrigger } from './sync/index.js';

export const Header: React.FC = () => {
  const {
    selectedDate,
    setSelectedDate,
    locale,
    setIsSettingsOpen,
    setIsCatalogOpen,
    setIsAnalyticsOpen,
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
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsSettingsOpen(true)}
            id="btn-open-settings"
            data-testid="btn-open-settings"
            aria-label={t.settings.title}
            className="min-w-[44px] min-h-[44px] p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 hover:text-emerald-400 transition-all duration-200 active:scale-95 border border-slate-700/50 flex items-center justify-center"
          >
            <Settings className="w-5 h-5" />
          </button>

          <button
            onClick={() => setIsCatalogOpen(true)}
            id="btn-open-catalog"
            data-testid="btn-open-catalog"
            aria-label={t.nav.catalog}
            className="min-w-[44px] min-h-[44px] p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 hover:text-emerald-400 transition-all duration-200 active:scale-95 border border-slate-700/50 flex items-center justify-center gap-1.5 text-xs font-semibold"
          >
            <BookOpen className="w-5 h-5" />
            <span className="hidden sm:inline">{t.nav.catalog}</span>
          </button>

          <button
            onClick={() => setIsAnalyticsOpen(true)}
            id="btn-open-analytics"
            data-testid="btn-open-analytics"
            aria-label={t.nav.analytics}
            className="min-w-[44px] min-h-[44px] p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 hover:text-emerald-400 transition-all duration-200 active:scale-95 border border-slate-700/50 flex items-center justify-center gap-1.5 text-xs font-semibold"
          >
            <TrendingUp className="w-5 h-5" />
            <span className="hidden sm:inline">{t.nav.analytics}</span>
          </button>
        </div>

        {/* Center Date Selector */}
        <div className="flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-full border border-slate-800 shadow-inner">
          <button
            onClick={handlePrevDay}
            aria-label="Previous day"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-1 text-slate-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-slate-100 capitalize min-w-[90px] text-center">
            {formattedDate}
          </span>
          <button
            onClick={handleNextDay}
            aria-label="Next day"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-1 text-slate-400 hover:text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Right Sync Inspector Trigger Button (WCAG 2.2 compliant) */}
        <HeaderSyncTrigger />
      </div>
    </header>
  );
};

