import React from 'react';
import { useApp } from '../context/AppContext.js';
import { Scale, TrendingUp } from 'lucide-react';

export const DashboardWeightPill: React.FC = () => {
  const {
    selectedDate,
    weightLogs,
    setIsWeightModalOpen,
    setIsAnalyticsOpen,
    t
  } = useApp();

  const currentLog = weightLogs.find((w) => w.date === selectedDate);
  const latestLog = weightLogs.length > 0 ? weightLogs[weightLogs.length - 1] : undefined;

  return (
    <div className="w-full flex items-center justify-between gap-2 p-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg backdrop-blur-md">
      {/* Primary Log Button */}
      <button
        type="button"
        id="btn-quick-log-weight"
        data-testid="btn-quick-log-weight"
        onClick={() => setIsWeightModalOpen(true)}
        className="flex-1 min-h-[44px] px-3.5 py-2 flex items-center gap-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-left transition-all active:scale-[0.99] border border-slate-700/40"
      >
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
          <Scale className="w-4 h-4 text-emerald-400" />
        </div>

        <div className="flex flex-col min-w-0">
          {currentLog ? (
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                {currentLog.weight_kg} {t.weight.unitKg}
              </span>
              <span className="text-xs text-slate-400">
                ({t.weight.trendLabel}: <span className="text-emerald-400 font-semibold">{currentLog.trend_weight_kg} {t.weight.unitKg}</span>)
              </span>
            </div>
          ) : (
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-emerald-400">
                {t.weight.logWeightCta}
              </span>
              {latestLog && (
                <span className="text-xs text-slate-400">
                  ({t.weight.trendLabel}: <span className="text-emerald-400 font-semibold">{latestLog.trend_weight_kg} {t.weight.unitKg}</span>)
                </span>
              )}
            </div>
          )}
        </div>
      </button>

      {/* Secondary Analytics Button */}
      <button
        type="button"
        id="btn-pill-open-analytics"
        data-testid="btn-pill-open-analytics"
        onClick={() => setIsAnalyticsOpen(true)}
        aria-label={t.analytics.title}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-800/60 hover:bg-slate-700/70 text-slate-300 hover:text-emerald-400 transition-all active:scale-95 border border-slate-700/40 shrink-0"
      >
        <TrendingUp className="w-5 h-5 text-emerald-400" />
      </button>
    </div>
  );
};
