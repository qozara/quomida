import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext.js';
import {
  TrendingUp,
  Activity,
  Flame,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Clock
} from 'lucide-react';
import {
  computeWeightTrendAnalytics,
  computeEnergyTrendSeries,
  addDaysToDate,
  calculateBaselineSeed,
  type DailyLog,
  type WeightLog
} from '@quomida/domain-core';
import {
  WeightTrendChart,
  type WeightChartDataPoint,
  type TrendChartPoint
} from './WeightTrendChart.js';

const AnalyticsScreenContent: React.FC = () => {
  const {
    setIsAnalyticsOpen,
    setIsWeightModalOpen,
    selectedDate = new Date().toISOString().slice(0, 10),
    dailyLogs = [],
    weightLogs = [],
    deleteWeightLog,
    userSettings,
    dbService,
    lastSyncedTime,
    t
  } = useApp();

  const [activeChartTab, setActiveChartTab] = useState<'weight' | 'energy'>('weight');
  const [rangeDays, setRangeDays] = useState<14 | 30 | 90>(30);
  const [historyDailyLogs, setHistoryDailyLogs] = useState<DailyLog[]>([]);
  const [latestFoodDate, setLatestFoodDate] = useState<string | null>(null);

  // Effective anchor date: evaluates full active horizon even when viewing a past date in daily food diary
  const effectiveToday = useMemo(() => {
    const maxWeightDate = weightLogs.length > 0 ? weightLogs[weightLogs.length - 1].date : undefined;
    const candidates = [
      selectedDate,
      maxWeightDate,
      latestFoodDate,
      userSettings?.adaptive_state?.last_calibrated_date
    ].filter(Boolean) as string[];
    return candidates.reduce((max, d) => (d > max ? d : max), selectedDate || new Date().toISOString().slice(0, 10));
  }, [selectedDate, weightLogs, latestFoodDate, userSettings?.adaptive_state?.last_calibrated_date]);

  // Retrieve up to 105 days of daily logs (90-day horizon + 14-day warm-up window)
  // Observes daily logs reactively across dates to immediately update upon local or cloud sync changes
  useEffect(() => {
    if (!dbService) return;

    if (dbService.observeAllDailyLogs) {
      const sub = dbService.observeAllDailyLogs().subscribe((allLogs: DailyLog[]) => {
        let maxDate = '';
        for (const log of allLogs) {
          if (log.date && log.date > maxDate) maxDate = log.date;
        }
        setLatestFoodDate(maxDate || null);

        const effDate = [
          selectedDate,
          weightLogs.length > 0 ? weightLogs[weightLogs.length - 1].date : undefined,
          maxDate,
          userSettings?.adaptive_state?.last_calibrated_date
        ].filter(Boolean).reduce((max, d) => (d! > max! ? d : max), selectedDate || new Date().toISOString().slice(0, 10))!;

        const windowStart = addDaysToDate(effDate, -105);
        const filtered = allLogs
          .filter((l) => l.date >= windowStart && l.date <= effDate)
          .sort((a, b) => a.date.localeCompare(b.date));
        setHistoryDailyLogs(filtered);
      });

      return () => {
        sub.unsubscribe();
      };
    } else {
      if (dbService.getLatestDailyLogDate) {
        dbService
          .getLatestDailyLogDate()
          .then((d) => {
            if (d) setLatestFoodDate(d);
          })
          .catch((err) => console.warn('[AnalyticsScreen] Failed to get latest daily log date:', err));
      }
      const windowStart = addDaysToDate(effectiveToday, -105);
      if (dbService?.getDailyLogsInRange) {
        dbService
          .getDailyLogsInRange(windowStart, effectiveToday)
          .then((logs) => setHistoryDailyLogs(logs && logs.length > 0 ? logs : (Array.isArray(dailyLogs) ? dailyLogs : [])))
          .catch((err) => console.warn('[AnalyticsScreen] Failed to load history logs:', err));
      } else {
        setHistoryDailyLogs(Array.isArray(dailyLogs) ? dailyLogs : []);
      }
    }
  }, [dbService, weightLogs, userSettings, lastSyncedTime, selectedDate, effectiveToday, dailyLogs]);

  // Effective daily logs (combines loaded range logs with current context logs if needed)
  const effectiveDailyLogs = useMemo(() => {
    if (historyDailyLogs.length > 0) return historyDailyLogs;
    return Array.isArray(dailyLogs) ? dailyLogs : [];
  }, [historyDailyLogs, dailyLogs]);

  // Compute analytics using domain-core engine
  const analytics = useMemo(() => {
    return computeWeightTrendAnalytics({
      today: effectiveToday,
      weightLogs,
      dailyLogs: effectiveDailyLogs,
      userSettings: userSettings || {}
    });
  }, [effectiveToday, weightLogs, effectiveDailyLogs, userSettings]);

  // Estimated TDEE resolution: adaptive state > baseline seed > rolling intake > fallback
  const displayedTdee = useMemo(() => {
    if (userSettings?.adaptive_state?.estimated_tdee) {
      return userSettings.adaptive_state.estimated_tdee;
    }
    if (userSettings?.biometrics && userSettings?.goal_config) {
      const currentWeight = analytics.current_raw_weight_kg || 75;
      const seed = calculateBaselineSeed({
        biometrics: userSettings.biometrics,
        goalConfig: userSettings.goal_config,
        currentWeightKg: currentWeight,
        referenceDate: effectiveToday
      });
      return seed.seed_tdee;
    }
    if (analytics.rolling_14d_intake_avg > 0) {
      return analytics.rolling_14d_intake_avg;
    }
    return userSettings?.daily_calorie_target || null;
  }, [userSettings, analytics, effectiveToday]);

  // Filter weight logs for chart according to selected range
  const chartData = useMemo<WeightChartDataPoint[]>(() => {
    const rangeStartDate = addDaysToDate(effectiveToday, -(rangeDays - 1));
    return weightLogs
      .filter((w) => w.date >= rangeStartDate && w.date <= effectiveToday)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((w) => ({
        date: w.date,
        rawWeightKg: w.weight_kg,
        trendWeightKg: w.trend_weight_kg,
        note: w.note
      }));
  }, [weightLogs, rangeDays, effectiveToday]);

  // Reconstruct Unified Energy Balance series on the fly for 14d, 30d, or 90d
  const energySeries = useMemo(() => {
    return computeEnergyTrendSeries({
      today: effectiveToday,
      rangeDays,
      weightLogs,
      dailyLogs: effectiveDailyLogs,
      userSettings: userSettings || {}
    });
  }, [effectiveToday, rangeDays, weightLogs, effectiveDailyLogs, userSettings]);

  // Map energy series into generalized TrendChartPoint[] for SVG renderer
  const energyChartPoints = useMemo<TrendChartPoint[]>(() => {
    // Only return points if at least one day has food intake logged
    const hasAnyIntake = energySeries.some((p) => p.intakeKcal !== undefined);
    if (!hasAnyIntake) return [];
    return energySeries.map((p) => ({
      date: p.date,
      rawValue: p.intakeKcal,
      isPartial: p.intakeKcal !== undefined && !p.isQualifyingIntake,
      trendValue: p.expenditureKcal,
      secondaryTrendValue: p.intakeTrendKcal,
      note:
        p.intakeKcal !== undefined && !p.isQualifyingIntake
          ? t.analytics.partialIntakeNotice
          : undefined
    }));
  }, [energySeries, t.analytics.partialIntakeNotice]);

  // Recent 10 weigh-ins
  const recentWeighIns = useMemo(() => {
    return [...weightLogs]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);
  }, [weightLogs]);

  // Recent 10 daily energy logs (days with logged intake)
  const recentEnergyDays = useMemo(() => {
    return [...energySeries]
      .filter((p) => p.intakeKcal !== undefined)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);
  }, [energySeries]);

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
    <section
      role="region"
      aria-label={t.analytics.title}
      data-testid="analytics-screen"
      className="space-y-4 animate-in fade-in duration-200"
    >
      {/* Screen Header Bar */}
      <div className="flex items-center gap-3 px-1">
        <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
          <TrendingUp className="w-5 h-5" />
        </div>
        <div>
          <h1 id="analytics-screen-title" className="text-xl font-extrabold text-white tracking-tight">
            {t.analytics.title}
          </h1>
          <p className="text-xs text-slate-400">{t.analytics.subtitle}</p>
        </div>
      </div>

      {/* Metabolic Status Banner (2 Metric Cards) */}
      <div className="grid grid-cols-2 gap-3">
        {/* Estimated TDEE */}
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg flex flex-col justify-between">
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
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg flex flex-col justify-between">
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
      <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg space-y-3">
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

      {/* Tabbed Trend Chart Section (Weight Trend vs Energy Balance Trend) */}
      <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg space-y-3">
        {/* Segmented Tab Switcher */}
        <div
          role="tablist"
          aria-label={t.analytics.title}
          className="grid grid-cols-2 gap-1.5 p-1 bg-slate-800/70 border border-slate-700/60 rounded-xl"
        >
          <button
            type="button"
            role="tab"
            id="tab-analytics-weight"
            data-testid="tab-analytics-weight"
            aria-selected={activeChartTab === 'weight'}
            onClick={() => setActiveChartTab('weight')}
            className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeChartTab === 'weight'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Activity className="w-4 h-4 shrink-0" />
            <span>{t.analytics.tabWeightTrend}</span>
          </button>

          <button
            type="button"
            role="tab"
            id="tab-analytics-energy"
            data-testid="tab-analytics-energy"
            aria-selected={activeChartTab === 'energy'}
            onClick={() => setActiveChartTab('energy')}
            className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeChartTab === 'energy'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Flame className="w-4 h-4 shrink-0" />
            <span>{t.analytics.tabEnergyTrend}</span>
          </button>
        </div>

        {activeChartTab === 'weight' ? (
          <WeightTrendChart
            data={chartData}
            rangeDays={rangeDays}
            onRangeChange={setRangeDays}
            unitLabel={t.weight.unitKg}
            valuePrecision={1}
            accentTheme="emerald"
            emptyStateMessage={t.analytics.emptyChart}
            rawLegendLabel={t.analytics.rawWeightLegend}
            trendLegendLabel={t.analytics.trendWeightLegend}
          />
        ) : (
          <WeightTrendChart
            data={[]}
            genericData={energyChartPoints}
            rangeDays={rangeDays}
            onRangeChange={setRangeDays}
            unitLabel={t.analytics.unitKcal}
            valuePrecision={0}
            accentTheme="amber"
            emptyStateMessage={t.analytics.emptyEnergyChart}
            rawLegendLabel={t.analytics.energyIntakeLegend}
            trendLegendLabel={t.analytics.energyExpenditureLegend}
            secondaryTrendLegendLabel={t.analytics.energyIntakeTrendLegend}
          />
        )}
      </div>

      {/* Contextual Bottom Section (Recent Weigh-Ins vs Recent Daily Energy Logs) */}
      {activeChartTab === 'weight' ? (
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200">{t.analytics.recentEntries}</h3>
            <button
              type="button"
              onClick={() => {
                setIsWeightModalOpen(true);
              }}
              className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.weight.logWeightCta}</span>
            </button>
          </div>

          {recentWeighIns.length === 0 ? (
            <p className="text-xs text-slate-500 py-3 text-center">{t.analytics.emptyChart}</p>
          ) : (
            <div className="divide-y divide-slate-800/60 max-h-56 overflow-y-auto rounded-xl bg-slate-950/60 border border-slate-800/80">
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
                    data-testid={`btn-delete-entry-${entry.date}`}
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
      ) : (
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200">{t.analytics.recentEnergyEntries}</h3>
          </div>

          {recentEnergyDays.length === 0 ? (
            <p className="text-xs text-slate-500 py-3 text-center">
              {t.analytics.emptyEnergyChart}
            </p>
          ) : (
            <div className="divide-y divide-slate-800/60 max-h-56 overflow-y-auto rounded-xl bg-slate-950/60 border border-slate-800/80">
              {recentEnergyDays.map((day) => (
                <div
                  key={day.date}
                  className="flex items-center justify-between px-3.5 py-2.5 text-xs text-slate-300 hover:bg-slate-800/40"
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <div className="flex items-baseline flex-wrap gap-2">
                      <span className="font-mono font-semibold text-slate-100">{day.date}</span>
                      <span className="font-bold text-white font-mono">
                        {day.intakeKcal} {t.analytics.unitKcal}
                      </span>
                      <span className="text-[11px] text-amber-400 font-mono">
                        (TDEE: {day.expenditureKcal} {t.analytics.unitKcal})
                      </span>
                    </div>
                    {day.macros && (
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        P: {day.macros.protein}g · C: {day.macros.carbs}g · F: {day.macros.fats}g
                      </p>
                    )}
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${
                      day.isQualifyingIntake
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {day.isQualifyingIntake
                      ? t.analytics.qualifyingDayBadge
                      : t.analytics.partialDayBadge}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export const AnalyticsScreen: React.FC = () => {
  const { isAnalyticsOpen } = useApp();
  if (!isAnalyticsOpen) return null;
  return <AnalyticsScreenContent />;
};

export { AnalyticsScreen as AnalyticsModal };
