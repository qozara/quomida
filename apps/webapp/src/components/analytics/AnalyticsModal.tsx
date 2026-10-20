import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext.js';
import {
  X,
  TrendingUp,
  Activity,
  Flame,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Clock
} from 'lucide-react';
import {
  computeWeightTrendAnalytics,
  addDaysToDate,
  calculateBaselineSeed,
  type DailyLog,
  type WeightLog
} from '@quomida/domain-core';
import { WeightTrendChart, type WeightChartDataPoint } from './WeightTrendChart.js';

export const AnalyticsModal: React.FC = () => {
  const {
    isAnalyticsOpen,
    setIsAnalyticsOpen,
    setIsWeightModalOpen,
    selectedDate,
    weightLogs,
    deleteWeightLog,
    userSettings,
    dbService,
    t
  } = useApp();

  const [rangeDays, setRangeDays] = useState<14 | 30 | 90>(30);
  const [fourteenDayLogs, setFourteenDayLogs] = useState<DailyLog[]>([]);

  // Load 14-day logs for calibration calculations
  useEffect(() => {
    if (!isAnalyticsOpen) return;
    const windowStart = addDaysToDate(selectedDate, -13);
    if (dbService?.getDailyLogsInRange) {
      dbService
        .getDailyLogsInRange(windowStart, selectedDate)
        .then((logs) => setFourteenDayLogs(logs))
        .catch((err) => console.warn('[AnalyticsModal] Failed to load 14-day logs:', err));
    }
  }, [isAnalyticsOpen, selectedDate, dbService]);

  // Compute analytics using domain-core engine
  const analytics = useMemo(() => {
    return computeWeightTrendAnalytics({
      today: selectedDate,
      weightLogs,
      dailyLogs: fourteenDayLogs,
      userSettings
    });
  }, [selectedDate, weightLogs, fourteenDayLogs, userSettings]);

  // Estimated TDEE resolution: adaptive state > baseline seed > rolling intake > fallback
  const displayedTdee = useMemo(() => {
    if (userSettings.adaptive_state?.estimated_tdee) {
      return userSettings.adaptive_state.estimated_tdee;
    }
    if (userSettings.biometrics && userSettings.goal_config) {
      const currentWeight = analytics.current_raw_weight_kg || 75;
      const seed = calculateBaselineSeed({
        biometrics: userSettings.biometrics,
        goalConfig: userSettings.goal_config,
        currentWeightKg: currentWeight,
        referenceDate: selectedDate
      });
      return seed.seed_tdee;
    }
    if (analytics.rolling_14d_intake_avg > 0) {
      return analytics.rolling_14d_intake_avg;
    }
    return userSettings.daily_calorie_target || null;
  }, [userSettings, analytics, selectedDate]);

  // Filter weight logs for chart according to selected range
  const chartData = useMemo<WeightChartDataPoint[]>(() => {
    const rangeStartDate = addDaysToDate(selectedDate, -(rangeDays - 1));
    return weightLogs
      .filter((w) => w.date >= rangeStartDate && w.date <= selectedDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((w) => ({
        date: w.date,
        rawWeightKg: w.weight_kg,
        trendWeightKg: w.trend_weight_kg,
        note: w.note
      }));
  }, [weightLogs, rangeDays, selectedDate]);

  // Recent 10 weigh-ins
  const recentWeighIns = useMemo(() => {
    return [...weightLogs]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);
  }, [weightLogs]);

  if (!isAnalyticsOpen) return null;

  // Calibration badge label and color
  const statusConfig = {
    ready: {
      label: t.analytics.statusReady,
      className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      icon: CheckCircle2
    },
    collecting_data: {
      label: t.analytics.statusCollecting,
      className: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
      icon: Clock
    },
    insufficient_logs: {
      label: t.analytics.statusInsufficient,
      className: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      icon: AlertCircle
    }
  }[analytics.calibration_status] || {
    label: t.analytics.statusCollecting,
    className: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    icon: Clock
  };

  const StatusIcon = statusConfig.icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="analytics-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 id="analytics-modal-title" className="text-lg font-bold text-white">
                {t.analytics.title}
              </h2>
              <p className="text-xs text-slate-400">{t.analytics.subtitle}</p>
            </div>
          </div>

          <button
            type="button"
            id="btn-close-analytics"
            data-testid="btn-close-analytics"
            onClick={() => setIsAnalyticsOpen(false)}
            aria-label="Close"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Metabolic Status Banner */}
        <div className="grid grid-cols-2 gap-3">
          {/* Estimated TDEE */}
          <div className="p-3.5 bg-slate-800/60 border border-slate-700/50 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <Flame className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{t.analytics.estimatedTdee}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-black text-white font-mono">
                {displayedTdee !== null ? displayedTdee : '--'}
              </span>
              <span className="text-xs text-slate-400">{t.analytics.kcalPerDay}</span>
            </div>
          </div>

          {/* 7-Day Trend Delta */}
          <div className="p-3.5 bg-slate-800/60 border border-slate-700/50 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <Activity className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{t.analytics.sevenDayDelta}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-black text-white font-mono">
                {analytics.weekly_trend_rate_kg > 0 ? '+' : ''}
                {analytics.weekly_trend_rate_kg}
              </span>
              <span className="text-xs text-slate-400">{t.analytics.kgPerWeek}</span>
            </div>
          </div>
        </div>

        {/* Calibration & Next Check-In Status Card */}
        <div className="p-4 bg-slate-800/40 border border-slate-800 rounded-2xl space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className={`px-2.5 py-1 rounded-full border text-xs font-semibold flex items-center gap-1.5 ${statusConfig.className}`}>
              <StatusIcon className="w-3.5 h-3.5" />
              <span>{statusConfig.label}</span>
            </div>

            <div className="text-xs text-slate-400 font-medium flex items-center gap-1">
              <span>{t.analytics.nextCheckIn}:</span>
              <span className="text-slate-200 font-bold">
                {analytics.calibration_status === 'ready'
                  ? t.analytics.readyNow
                  : t.analytics.daysRemaining.replace('{{days}}', String(analytics.days_until_next_calibration))}
              </span>
            </div>
          </div>

          {/* Compliance Requirements */}
          <div className="pt-2 border-t border-slate-800 text-xs space-y-1.5 text-slate-400">
            <div className="font-semibold text-slate-300 mb-1">
              {t.analytics.complianceTitle}
            </div>
            <div className="flex items-center justify-between">
              <span>{t.analytics.complianceRecentWeight.replace('{{count}}', String(analytics.recent_weight_count_7d))}</span>
              <span className={analytics.recent_weight_count_7d >= 4 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                {analytics.recent_weight_count_7d >= 4 ? '✓' : '...'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t.analytics.compliancePriorWeight.replace('{{count}}', String(analytics.prior_weight_count_7d))}</span>
              <span className={analytics.prior_weight_count_7d >= 1 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                {analytics.prior_weight_count_7d >= 1 ? '✓' : '...'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t.analytics.complianceFoodDays.replace('{{count}}', String(analytics.qualifying_intake_days_14d))}</span>
              <span className={analytics.qualifying_intake_days_14d >= 10 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                {analytics.qualifying_intake_days_14d >= 10 ? '✓' : '...'}
              </span>
            </div>
          </div>
        </div>

        {/* Dual-Layer Weight Trend Chart */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-200">{t.analytics.chartTitle}</h3>
          <WeightTrendChart
            data={chartData}
            rangeDays={rangeDays}
            onRangeChange={setRangeDays}
            unitLabel={t.weight.unitKg}
            emptyStateMessage={t.analytics.emptyChart}
            rawLegendLabel={t.analytics.rawWeightLegend}
            trendLegendLabel={t.analytics.trendWeightLegend}
          />
        </div>

        {/* Recent Weigh-Ins List */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200">{t.analytics.recentEntries}</h3>
            <button
              type="button"
              onClick={() => {
                setIsAnalyticsOpen(false);
                setIsWeightModalOpen(true);
              }}
              className="min-h-[44px] px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.weight.logWeightCta}</span>
            </button>
          </div>

          {recentWeighIns.length === 0 ? (
            <p className="text-xs text-slate-500 py-3 text-center">{t.analytics.emptyChart}</p>
          ) : (
            <div className="divide-y divide-slate-800/60 max-h-48 overflow-y-auto rounded-xl bg-slate-900/60 border border-slate-800">
              {recentWeighIns.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between px-3.5 py-2.5 text-xs text-slate-300 hover:bg-slate-800/40"
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono font-semibold text-slate-100">{entry.date}</span>
                      <span className="font-bold text-white font-mono">
                        {entry.weight_kg} {t.weight.unitKg}
                      </span>
                      <span className="text-[11px] text-emerald-400 font-mono">
                        ({t.weight.trendLabel}: {entry.trend_weight_kg})
                      </span>
                    </div>
                    {entry.note && (
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{entry.note}</p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => deleteWeightLog(entry.id)}
                    aria-label="Delete entry"
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
