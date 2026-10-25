import React from 'react';
import { useApp } from '../context/AppContext.js';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

export const DashboardDateBar: React.FC = () => {
  const {
    selectedDate,
    setSelectedDate,
    locale
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
    <div
      data-testid="dashboard-date-bar"
      className="flex items-center justify-between gap-2 pr-12 py-1 animate-in fade-in duration-200"
    >
      {/* Brand Identity on Dashboard */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <span className="font-extrabold text-white text-base tracking-tight">
          Quomida
        </span>
      </div>

      {/* Thumb-friendly Date Selector */}
      <div className="flex items-center gap-1 bg-slate-900/90 px-2 py-0.5 rounded-full border border-slate-800 shadow-inner">
        <button
          onClick={handlePrevDay}
          aria-label="Previous day"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center p-1 text-slate-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs sm:text-sm font-semibold text-slate-100 capitalize min-w-[80px] sm:min-w-[90px] text-center">
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
    </div>
  );
};
