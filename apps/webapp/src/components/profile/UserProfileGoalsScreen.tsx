import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext.js';
import { calculateBaselineSeed, type UserSex, type GoalType } from '@quomida/domain-core';
import { Target, Activity, Flame, Save } from 'lucide-react';

interface UserProfileGoalsScreenProps {
  onOpenSettings?: () => void;
}

export const UserProfileGoalsScreen: React.FC<UserProfileGoalsScreenProps> = ({ onOpenSettings }) => {
  const {
    t,
    userSettings,
    updateUserSettings,
    weightLogs,
    logWeight,
    selectedDate
  } = useApp();

  const [calorieTarget, setCalorieTarget] = useState(userSettings?.daily_calorie_target || 2000);
  const [proteinTarget, setProteinTarget] = useState(userSettings?.custom_macros?.protein || 150);
  const [carbsTarget, setCarbsTarget] = useState(userSettings?.custom_macros?.carbs || 200);
  const [fatsTarget, setFatsTarget] = useState(userSettings?.custom_macros?.fats || 65);
  const [isSaved, setIsSaved] = useState(false);

  // Smart / Adaptive Goals State
  const [targetMode, setTargetMode] = useState<'manual' | 'smart'>(
    userSettings?.target_mode === 'manual' ? 'manual' : 'smart'
  );
  const [isAdaptive, setIsAdaptive] = useState<boolean>(
    userSettings?.target_mode === 'adaptive'
  );
  const [sex, setSex] = useState<UserSex>(userSettings?.biometrics?.sex || 'male');
  const [birthDate, setBirthDate] = useState<string>(
    userSettings?.biometrics?.birth_date || '1990-01-01'
  );
  const [heightCm, setHeightCm] = useState<number>(
    userSettings?.biometrics?.height_cm || 170
  );

  const initialWeight = useMemo(() => {
    if (weightLogs && weightLogs.length > 0) {
      return weightLogs[weightLogs.length - 1].weight_kg;
    }
    return 75.0;
  }, [weightLogs]);

  const [currentWeightKg, setCurrentWeightKg] = useState<number>(initialWeight);
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

  const handleGoalTypeChange = (newGoal: GoalType) => {
    setGoalType(newGoal);
    if (newGoal === 'lose') {
      setWeeklyRatePct(-0.5);
      setProteinGPerKg(2.2);
      setFatCaloriePct(0.25);
    } else if (newGoal === 'maintain') {
      setWeeklyRatePct(0);
      setProteinGPerKg(1.8);
      setFatCaloriePct(0.25);
    } else if (newGoal === 'gain') {
      setWeeklyRatePct(0.25);
      setProteinGPerKg(2.0);
      setFatCaloriePct(0.25);
    }
  };

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
      referenceDate: selectedDate
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
    selectedDate
  ]);

  const settingsSignature = useMemo(() => {
    if (!userSettings) return '';
    const { active_cloud_provider: _creds, ...domainSettings } = userSettings;
    return JSON.stringify(domainSettings);
  }, [userSettings]);

  useEffect(() => {
    if (!userSettings) return;
    setCalorieTarget(userSettings.daily_calorie_target || 2000);
    setProteinTarget(userSettings.custom_macros?.protein || 150);
    setCarbsTarget(userSettings.custom_macros?.carbs || 200);
    setFatsTarget(userSettings.custom_macros?.fats || 65);
    setTargetMode(userSettings.target_mode === 'manual' ? 'manual' : 'smart');
    setIsAdaptive(userSettings.target_mode === 'adaptive');
    if (userSettings.biometrics) {
      setSex(userSettings.biometrics.sex || 'male');
      setBirthDate(userSettings.biometrics.birth_date || '1990-01-01');
      setHeightCm(userSettings.biometrics.height_cm || 170);
      setActivityMultiplier(userSettings.biometrics.activity_multiplier || 1.375);
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
  }, [settingsSignature]);

  useEffect(() => {
    if (weightLogs && weightLogs.length > 0) {
      setCurrentWeightKg(weightLogs[weightLogs.length - 1].weight_kg);
    }
  }, [weightLogs]);

  const handleSaveGoals = async (e: React.FormEvent) => {
    e.preventDefault();
    if (targetMode === 'manual') {
      await updateUserSettings({
        target_mode: 'manual',
        daily_calorie_target: calorieTarget,
        custom_macros: {
          protein: proteinTarget,
          carbs: carbsTarget,
          fats: fatsTarget
        }
      });
    } else {
      const existingLog = weightLogs.find((w) => w.date === selectedDate);
      const hasWeightChangedFromInitial = Math.abs(currentWeightKg - initialWeight) > 1e-4;
      const hasWeightChangedOnSelectedDate =
        existingLog !== undefined && Math.abs(existingLog.weight_kg - currentWeightKg) > 1e-4;
      if (weightLogs.length === 0 || hasWeightChangedFromInitial || hasWeightChangedOnSelectedDate) {
        await logWeight(selectedDate, currentWeightKg);
      }

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
          last_calibrated_date: selectedDate
        },
        daily_calorie_target: baselinePreview.daily_calorie_target,
        custom_macros: baselinePreview.custom_macros
      });
    }
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div data-testid="user-profile-goals-screen" className="space-y-4">
      {/* Main Form Body */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-sm">
        <form onSubmit={handleSaveGoals} className="space-y-4">
          {/* Segmented Control */}
          <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              type="button"
              id="btn-target-mode-manual"
              data-testid="btn-target-mode-manual"
              onClick={() => setTargetMode('manual')}
              className={`flex-1 min-h-[44px] py-2 text-xs font-semibold rounded-lg transition-all ${
                targetMode === 'manual'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.settings.targetModeManual}
            </button>
            <button
              type="button"
              id="btn-target-mode-smart"
              data-testid="btn-target-mode-smart"
              onClick={() => setTargetMode('smart')}
              className={`flex-1 min-h-[44px] py-2 text-xs font-semibold rounded-lg transition-all ${
                targetMode === 'smart'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.settings.targetModeSmart}
            </button>
          </div>

          {targetMode === 'manual' ? (
            <div className="space-y-3 bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium">
                  {t.settings.dailyTarget}
                </label>
                <input
                  type="number"
                  min="500"
                  max="10000"
                  value={calorieTarget}
                  onChange={(e) => setCalorieTarget(Number(e.target.value))}
                  className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-bold"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    {t.dashboard.protein} (g)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={proteinTarget}
                    onChange={(e) => setProteinTarget(Number(e.target.value))}
                    className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    {t.dashboard.carbs} (g)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={carbsTarget}
                    onChange={(e) => setCarbsTarget(Number(e.target.value))}
                    className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    {t.dashboard.fats} (g)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={fatsTarget}
                    onChange={(e) => setFatsTarget(Number(e.target.value))}
                    className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Biometrics Card */}
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t.settings.biometricsTitle}</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Sex */}
                  <div>
                    <label className="text-xs text-slate-400 block mb-1 font-medium">{t.settings.sexLabel}</label>
                    <select
                      data-testid="select-biometrics-sex"
                      value={sex}
                      onChange={(e) => setSex(e.target.value as UserSex)}
                      className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="male">{t.settings.sexMale}</option>
                      <option value="female">{t.settings.sexFemale}</option>
                    </select>
                  </div>

                  {/* Birth Date */}
                  <div>
                    <label className="text-xs text-slate-400 block mb-1 font-medium">{t.settings.birthDateLabel}</label>
                    <input
                      data-testid="input-biometrics-birthdate"
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Height */}
                  <div>
                    <label className="text-xs text-slate-400 block mb-1 font-medium">{t.settings.heightCmLabel}</label>
                    <input
                      data-testid="input-biometrics-height"
                      type="number"
                      min={50}
                      max={260}
                      value={heightCm}
                      onChange={(e) => setHeightCm(parseInt(e.target.value) || 170)}
                      className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Current Weight */}
                  <div>
                    <label className="text-xs text-slate-400 block mb-1 font-medium">{t.settings.currentWeightKgLabel}</label>
                    <input
                      data-testid="input-biometrics-weight"
                      type="number"
                      step="0.1"
                      min={20}
                      max={500}
                      value={currentWeightKg}
                      onChange={(e) => setCurrentWeightKg(parseFloat(e.target.value) || 75)}
                      className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Activity Multiplier */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1 font-medium">{t.settings.activityLevelLabel}</label>
                  <select
                    data-testid="select-biometrics-activity"
                    value={activityMultiplier}
                    onChange={(e) => setActivityMultiplier(parseFloat(e.target.value) || 1.375)}
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

              {/* Goal & Weekly Rate */}
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                  <Target className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t.settings.goalSelectorTitle}</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    id="btn-goal-lose"
                    data-testid="btn-goal-lose"
                    onClick={() => handleGoalTypeChange('lose')}
                    className={`min-h-[44px] py-1.5 px-2 text-xs font-semibold rounded-xl border transition-all ${
                      goalType === 'lose'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {t.settings.goalLose}
                  </button>
                  <button
                    type="button"
                    id="btn-goal-maintain"
                    data-testid="btn-goal-maintain"
                    onClick={() => handleGoalTypeChange('maintain')}
                    className={`min-h-[44px] py-1.5 px-2 text-xs font-semibold rounded-xl border transition-all ${
                      goalType === 'maintain'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {t.settings.goalMaintain}
                  </button>
                  <button
                    type="button"
                    id="btn-goal-gain"
                    data-testid="btn-goal-gain"
                    onClick={() => handleGoalTypeChange('gain')}
                    className={`min-h-[44px] py-1.5 px-2 text-xs font-semibold rounded-xl border transition-all ${
                      goalType === 'gain'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {t.settings.goalGain}
                  </button>
                </div>

                {/* Sliders for Lose or Gain */}
                {goalType === 'lose' && (
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>{t.settings.weeklyRateLabel}</span>
                      <span className="font-bold text-emerald-400">{weeklyRatePct}% / wk</span>
                    </div>
                    <input
                      data-testid="slider-weekly-rate"
                      type="range"
                      min="-1.0"
                      max="-0.25"
                      step="0.05"
                      value={weeklyRatePct}
                      onChange={(e) => setWeeklyRatePct(parseFloat(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </div>
                )}

                {goalType === 'gain' && (
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>{t.settings.weeklyRateLabel}</span>
                      <span className="font-bold text-emerald-400">+{weeklyRatePct}% / wk</span>
                    </div>
                    <input
                      data-testid="slider-weekly-rate"
                      type="range"
                      min="0.20"
                      max="0.50"
                      step="0.05"
                      value={weeklyRatePct}
                      onChange={(e) => setWeeklyRatePct(parseFloat(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </div>
                )}
              </div>

              {/* Adaptive Toggle */}
              <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800">
                <label className="min-h-[44px] flex items-center gap-3 cursor-pointer select-none">
                  <input
                    data-testid="checkbox-adaptive-toggle"
                    type="checkbox"
                    checked={isAdaptive}
                    onChange={(e) => setIsAdaptive(e.target.checked)}
                    className="w-5 h-5 rounded accent-emerald-500 bg-slate-800 border-slate-700"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-200">{t.settings.adaptiveToggleLabel}</span>
                    <span className="text-[11px] text-slate-400 mt-0.5">{t.settings.adaptiveToggleHint}</span>
                  </div>
                </label>
              </div>

              {/* Calculated Output Preview */}
              <div
                data-testid="preview-seed-tdee"
                className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-2 text-xs"
              >
                <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                  <Flame className="w-4 h-4" />
                  <span>{t.settings.previewTitle}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-300">
                  <div>
                    <span className="text-slate-400 block">{t.settings.previewBmr}:</span>
                    <span data-testid="preview-bmr-value" className="font-mono font-bold text-white">{baselinePreview.bmr} kcal</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{t.settings.previewTdee}:</span>
                    <span data-testid="preview-tdee-value" className="font-mono font-bold text-white">{baselinePreview.seed_tdee} kcal</span>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-emerald-500/20 flex items-baseline justify-between">
                    <div>
                      <span className="text-slate-400 block">{t.settings.previewTargetKcal}:</span>
                      <span data-testid="preview-target-kcal-value" className="font-mono text-base font-black text-emerald-300">{baselinePreview.daily_calorie_target} kcal</span>
                    </div>
                    <div className="text-right font-mono text-[11px] text-slate-300">
                      P: <span data-testid="preview-protein-value" className="font-bold text-rose-300">{baselinePreview.custom_macros.protein}g</span> |{' '}
                      C: <span data-testid="preview-carbs-value" className="font-bold text-amber-300">{baselinePreview.custom_macros.carbs}g</span> |{' '}
                      F: <span data-testid="preview-fats-value" className="font-bold text-cyan-300">{baselinePreview.custom_macros.fats}g</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            id="btn-save-nutritional-targets"
            data-testid="btn-save-nutritional-targets"
            className="w-full min-h-[44px] py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-400 font-semibold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
          >
            <Save className="w-4 h-4" />
            <span>{isSaved ? (t.settings.targetsSaved || 'Goals Saved!') : (t.settings.saveTargets || 'Save Targets')}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
