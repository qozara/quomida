import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext.js';
import { calculateBaselineSeed, type GoalType } from '@quomida/domain-core';
import { ArrowLeft, Target, Activity, Flame, Save, Check } from 'lucide-react';

interface AdaptiveGoalsEditModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdaptiveGoalsEditModal: React.FC<AdaptiveGoalsEditModalProps> = ({
  isOpen,
  onClose
}) => {
  const {
    t,
    userSettings,
    updateUserSettings,
    weightLogs,
    setSelectedDate
  } = useApp();

  const todayStr = new Date().toISOString().slice(0, 10);

  const [isSaved, setIsSaved] = useState(false);
  const [isAdaptive, setIsAdaptive] = useState<boolean>(
    userSettings?.target_mode === 'adaptive'
  );

  const [activityMultiplier, setActivityMultiplier] = useState<number>(
    userSettings?.biometrics?.activity_multiplier || 1.375
  );

  const [goalType, setGoalType] = useState<GoalType>(
    userSettings?.goal_config?.goal_type || 'lose'
  );
  const [weeklyRatePct, setWeeklyRatePct] = useState<number>(
    userSettings?.goal_config?.weekly_rate_pct !== undefined
      ? userSettings.goal_config.weekly_rate_pct
      : -0.5
  );
  const [proteinGPerKg, setProteinGPerKg] = useState<number>(
    userSettings?.goal_config?.protein_g_per_kg || 2.2
  );
  const [fatCaloriePct, setFatCaloriePct] = useState<number>(
    userSettings?.goal_config?.fat_calorie_pct || 0.25
  );

  const currentWeightKg = useMemo(() => {
    if (weightLogs && weightLogs.length > 0) {
      return weightLogs[weightLogs.length - 1].weight_kg;
    }
    return 75.0;
  }, [weightLogs]);

  const sex = userSettings?.biometrics?.sex || 'male';
  const birthDate = userSettings?.biometrics?.birth_date || '1990-01-01';
  const heightCm = userSettings?.biometrics?.height_cm || 170;

  useEffect(() => {
    if (!userSettings) return;
    setIsAdaptive(userSettings.target_mode === 'adaptive');
    if (userSettings.biometrics?.activity_multiplier) {
      setActivityMultiplier(userSettings.biometrics.activity_multiplier);
    }
    if (userSettings.goal_config) {
      setGoalType(userSettings.goal_config.goal_type || 'lose');
      setWeeklyRatePct(
        userSettings.goal_config.weekly_rate_pct !== undefined
          ? userSettings.goal_config.weekly_rate_pct
          : -0.5
      );
      setProteinGPerKg(userSettings.goal_config.protein_g_per_kg || 2.2);
      setFatCaloriePct(userSettings.goal_config.fat_calorie_pct || 0.25);
    }
  }, [userSettings, isOpen]);

  const baselinePreview = useMemo(() => {
    return calculateBaselineSeed({
      biometrics: {
        sex,
        birth_date: birthDate,
        height_cm: heightCm,
        activity_multiplier: activityMultiplier
      },
      goalConfig: {
        goal_type: goalType,
        weekly_rate_pct: weeklyRatePct,
        protein_g_per_kg: proteinGPerKg,
        fat_calorie_pct: fatCaloriePct
      },
      currentWeightKg,
      referenceDate: todayStr
    });
  }, [
    sex,
    birthDate,
    heightCm,
    activityMultiplier,
    goalType,
    weeklyRatePct,
    proteinGPerKg,
    fatCaloriePct,
    currentWeightKg,
    todayStr
  ]);

  if (!isOpen) return null;

  const handleGoalTypeChange = (newType: GoalType) => {
    setGoalType(newType);
    if (newType === 'lose') {
      setWeeklyRatePct(-0.5);
      setProteinGPerKg(2.2);
    } else if (newType === 'maintain') {
      setWeeklyRatePct(0);
      setProteinGPerKg(1.8);
    } else if (newType === 'gain') {
      setWeeklyRatePct(0.25);
      setProteinGPerKg(2.0);
    }
  };

  const handleSaveGoals = async (e: React.FormEvent) => {
    e.preventDefault();
    const mode = isAdaptive ? 'adaptive' : 'deterministic_seed';

    await updateUserSettings({
      target_mode: mode,
      biometrics: {
        sex,
        birth_date: birthDate,
        height_cm: heightCm,
        activity_multiplier: activityMultiplier
      },
      goal_config: {
        goal_type: goalType,
        weekly_rate_pct: weeklyRatePct,
        protein_g_per_kg: proteinGPerKg,
        fat_calorie_pct: fatCaloriePct
      },
      adaptive_state: {
        estimated_tdee: baselinePreview.seed_tdee,
        prior_tdee: baselinePreview.seed_tdee,
        calibration_status: 'collecting_data',
        last_calibrated_date: todayStr
      },
      daily_calorie_target: baselinePreview.daily_calorie_target,
      custom_macros: baselinePreview.custom_macros
    });

    setSelectedDate(todayStr);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 400);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.goals?.editAdaptiveTitle || 'Edit Goal Strategy'}
      data-testid="adaptive-goals-edit-modal"
      className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100 animate-slide-in-right overflow-y-auto"
    >
      {/* Top Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-md shrink-0">
        <button
          id="btn-back-adaptive-goals"
          data-testid="btn-back-adaptive-goals"
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="min-w-[44px] min-h-[44px] p-2 -ml-2 rounded-full hover:bg-slate-800/80 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors flex items-center justify-center active:scale-95"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center flex-1 mx-2 min-w-0">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
            {t.goals?.editAdaptiveTitle || 'Edit Goal Strategy'}
          </h2>
        </div>
        <div className="w-[44px]" aria-hidden="true" />
      </header>

      {/* Main Form */}
      <div className="max-w-md mx-auto w-full p-4 space-y-4 flex-1">
        <form onSubmit={handleSaveGoals} className="space-y-4">
          {/* Activity Level Selection */}
          <div className="space-y-3 bg-slate-900/80 p-4 rounded-2xl border border-slate-800 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <Activity className="w-3.5 h-3.5" />
              <span>{t.settings.activityLevelLabel}</span>
            </div>

            <div>
              <select
                id="select-biometrics-activity"
                data-testid="select-biometrics-activity"
                value={activityMultiplier}
                onChange={(e) => setActivityMultiplier(Number(e.target.value))}
                className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value={1.2}>{t.settings.activitySedentary}</option>
                <option value={1.375}>{t.settings.activityLight}</option>
                <option value={1.55}>{t.settings.activityModerate}</option>
                <option value={1.725}>{t.settings.activityVery}</option>
                <option value={1.9}>{t.settings.activityExtreme}</option>
              </select>
            </div>
          </div>

          {/* Goal Selector & Rhythm */}
          <div className="space-y-3 bg-slate-900/80 p-4 rounded-2xl border border-slate-800 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <Target className="w-3.5 h-3.5" />
              <span>{t.settings.goalSelectorTitle}</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                id="btn-goal-lose"
                data-testid="btn-goal-lose"
                onClick={() => handleGoalTypeChange('lose')}
                className={`py-2 px-1 text-xs font-medium rounded-xl transition-all min-h-[44px] ${
                  goalType === 'lose'
                    ? 'bg-rose-500/20 border border-rose-500/50 text-rose-300 font-bold'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {t.settings.goalLose}
              </button>
              <button
                type="button"
                id="btn-goal-maintain"
                data-testid="btn-goal-maintain"
                onClick={() => handleGoalTypeChange('maintain')}
                className={`py-2 px-1 text-xs font-medium rounded-xl transition-all min-h-[44px] ${
                  goalType === 'maintain'
                    ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 font-bold'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {t.settings.goalMaintain}
              </button>
              <button
                type="button"
                id="btn-goal-gain"
                data-testid="btn-goal-gain"
                onClick={() => handleGoalTypeChange('gain')}
                className={`py-2 px-1 text-xs font-medium rounded-xl transition-all min-h-[44px] ${
                  goalType === 'gain'
                    ? 'bg-sky-500/20 border border-sky-500/50 text-sky-300 font-bold'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {t.settings.goalGain}
              </button>
            </div>

            {/* Weekly Rhythm Slider */}
            {goalType !== 'maintain' && (
              <div className="pt-2">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs text-slate-400 font-medium">
                    {t.settings.weeklyRateLabel}
                  </label>
                  <span className="text-xs font-bold text-emerald-400 font-mono">
                    {weeklyRatePct > 0 ? `+${weeklyRatePct}%` : `${weeklyRatePct}%`}/wk
                  </span>
                </div>
                <input
                  type="range"
                  id="slider-weekly-rate"
                  data-testid="slider-weekly-rate"
                  min={goalType === 'lose' ? -1.0 : 0.1}
                  max={goalType === 'lose' ? -0.25 : 0.5}
                  step={goalType === 'lose' ? 0.05 : 0.05}
                  value={weeklyRatePct}
                  onChange={(e) => setWeeklyRatePct(Number(e.target.value))}
                  className="w-full accent-emerald-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            )}

            {/* Adaptive Toggle */}
            <div className="pt-3 border-t border-slate-800">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  id="checkbox-adaptive-toggle"
                  data-testid="checkbox-adaptive-toggle"
                  checked={isAdaptive}
                  onChange={(e) => setIsAdaptive(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-emerald-500"
                />
                <div className="text-xs">
                  <span className="font-semibold text-white block">
                    {t.settings.adaptiveToggleLabel}
                  </span>
                  <span className="text-slate-400 text-[11px] leading-tight block mt-0.5">
                    {t.settings.adaptiveToggleHint}
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Calculated Output Preview */}
          <div
            id="preview-seed-tdee"
            data-testid="preview-seed-tdee"
            className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-3"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <Flame className="w-3.5 h-3.5" />
              <span>{t.settings.previewTitle}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{t.settings.previewBmr}</span>
                <span data-testid="preview-bmr-value" className="text-xs font-bold text-white font-mono">
                  {baselinePreview.bmr} kcal
                </span>
              </div>
              <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{t.settings.previewTdee}</span>
                <span data-testid="preview-tdee-value" className="text-xs font-bold text-white font-mono">
                  {baselinePreview.seed_tdee} kcal
                </span>
              </div>
              <div className="bg-slate-950/60 p-2 rounded-xl border border-emerald-500/30">
                <span className="text-[10px] text-emerald-400 font-semibold block">{t.settings.previewTargetKcal}</span>
                <span data-testid="preview-target-kcal-value" className="text-xs font-extrabold text-emerald-400 font-mono">
                  {baselinePreview.daily_calorie_target} kcal
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-[11px] pt-1 border-t border-slate-800/80 font-mono">
              <div>
                <span className="text-slate-400 block text-[10px]">Protein</span>
                <span data-testid="preview-protein-value" className="font-bold text-rose-300">
                  {baselinePreview.custom_macros.protein}g
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Carbs</span>
                <span className="font-bold text-amber-300">{baselinePreview.custom_macros.carbs}g</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Fats</span>
                <span className="font-bold text-cyan-300">{baselinePreview.custom_macros.fats}g</span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            id="btn-save-nutritional-targets"
            data-testid="btn-save-nutritional-targets"
            className="w-full min-h-[44px] py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 text-xs"
          >
            {isSaved ? (
              <>
                <Check className="w-4 h-4" />
                <span>{t.settings?.targetsSaved || 'Saved!'}</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{t.goals?.saveGoals || t.recipes.saveRecipe}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
