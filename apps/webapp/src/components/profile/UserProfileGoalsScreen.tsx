import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { calculateBaselineSeed } from '@quomida/domain-core';
import { Target, Activity, Flame, Pencil, User, Scale, Ruler, Sparkles, CheckCircle2 } from 'lucide-react';
import { GoalsEditModal } from './GoalsEditModal.js';

interface UserProfileGoalsScreenProps {
  onOpenSettings?: () => void;
}

export const UserProfileGoalsScreen: React.FC<UserProfileGoalsScreenProps> = () => {
  const {
    t,
    userSettings,
    updateUserSettings,
    weightLogs,
    selectedDate
  } = useApp();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [pendingModeSwitch, setPendingModeSwitch] = useState<'manual' | 'smart' | null>(null);
  const [optimisticMode, setOptimisticMode] = useState<'manual' | 'smart' | null>(null);

  React.useEffect(() => {
    if (userSettings?.target_mode) {
      setOptimisticMode(userSettings.target_mode === 'manual' ? 'manual' : 'smart');
    }
  }, [userSettings?.target_mode]);

  const activeMode: 'manual' | 'smart' =
    optimisticMode ?? (userSettings?.target_mode === 'manual' ? 'manual' : 'smart');
  const isAdaptive = userSettings?.target_mode === 'adaptive';

  const calories = userSettings?.daily_calorie_target || 2000;
  const protein = userSettings?.custom_macros?.protein || 150;
  const carbs = userSettings?.custom_macros?.carbs || 200;
  const fats = userSettings?.custom_macros?.fats || 65;

  const totalMacroCalories = (protein * 4) + (carbs * 4) + (fats * 9);
  const proteinPct = totalMacroCalories > 0 ? Math.round(((protein * 4) / totalMacroCalories) * 100) : 0;
  const carbsPct = totalMacroCalories > 0 ? Math.round(((carbs * 4) / totalMacroCalories) * 100) : 0;
  const fatsPct = totalMacroCalories > 0 ? Math.round(((fats * 9) / totalMacroCalories) * 100) : 0;

  const biometrics = userSettings?.biometrics;
  const goalConfig = userSettings?.goal_config;

  const latestWeight = weightLogs && weightLogs.length > 0
    ? weightLogs[weightLogs.length - 1].weight_kg
    : 75.0;

  const userAge = React.useMemo(() => {
    if (!biometrics?.birth_date) return null;
    const birth = new Date(biometrics.birth_date);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
      age--;
    }
    return age > 0 ? age : null;
  }, [biometrics?.birth_date]);

  const activityLevelLabel = React.useMemo(() => {
    const pal = biometrics?.activity_multiplier || 1.375;
    if (pal <= 1.25) return t.settings.activitySedentary;
    if (pal <= 1.45) return t.settings.activityLight;
    if (pal <= 1.65) return t.settings.activityModerate;
    if (pal <= 1.8) return t.settings.activityVery;
    return t.settings.activityExtreme;
  }, [biometrics?.activity_multiplier, t.settings]);

  const goalTypeLabel = React.useMemo(() => {
    const type = goalConfig?.goal_type || 'lose';
    if (type === 'lose') return t.settings.goalLose;
    if (type === 'gain') return t.settings.goalGain;
    return t.settings.goalMaintain;
  }, [goalConfig?.goal_type, t.settings]);

  const handleModeButtonClick = (target: 'manual' | 'smart') => {
    if (target === activeMode) return;
    setPendingModeSwitch(target);
  };

  const handleConfirmModeSwitch = async () => {
    if (!pendingModeSwitch) return;

    const targetMode = pendingModeSwitch;
    setPendingModeSwitch(null);
    setOptimisticMode(targetMode);

    if (targetMode === 'manual') {
      await updateUserSettings({
        target_mode: 'manual'
      });
    } else {
      // Switching to Smart / Adaptive
      const todayStr = new Date().toISOString().slice(0, 10);
      const sex = biometrics?.sex || 'male';
      const birth_date = biometrics?.birth_date || '1990-01-01';
      const height_cm = biometrics?.height_cm || 170;
      const activity_multiplier = biometrics?.activity_multiplier || 1.375;
      const goal_type = goalConfig?.goal_type || 'lose';
      const weekly_rate_pct = goalConfig?.weekly_rate_pct !== undefined ? goalConfig.weekly_rate_pct : -0.5;
      const protein_g_per_kg = goalConfig?.protein_g_per_kg || 2.2;
      const fat_calorie_pct = goalConfig?.fat_calorie_pct || 0.25;

      const seed = calculateBaselineSeed({
        biometrics: { sex, birth_date, height_cm, activity_multiplier },
        goalConfig: { goal_type, weekly_rate_pct, protein_g_per_kg, fat_calorie_pct },
        currentWeightKg: latestWeight,
        referenceDate: todayStr
      });

      await updateUserSettings({
        target_mode: 'adaptive',
        biometrics: { sex, birth_date, height_cm, activity_multiplier },
        goal_config: { goal_type, weekly_rate_pct, protein_g_per_kg, fat_calorie_pct },
        adaptive_state: {
          estimated_tdee: seed.seed_tdee,
          prior_tdee: seed.seed_tdee,
          calibration_status: 'collecting_data',
          last_calibrated_date: todayStr
        },
        daily_calorie_target: seed.daily_calorie_target,
        custom_macros: seed.custom_macros
      });
    }

    setPendingModeSwitch(null);
  };

  return (
    <div data-testid="user-profile-goals-screen" className="space-y-4 pb-4">
      {/* Segmented Mode Switcher */}
      {/* Segmented Control on Main Screen */}
      {!isEditModalOpen && (
        <div className="flex bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 shadow-sm">
          <button
            type="button"
            id="btn-target-mode-manual"
            data-testid="btn-target-mode-manual"
            onClick={() => handleModeButtonClick('manual')}
            aria-pressed={activeMode === 'manual'}
            className={`flex-1 min-h-[44px] py-2 px-3 text-xs font-semibold rounded-xl transition-all ${
              activeMode === 'manual'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.settings.targetModeManual}
          </button>
          <button
            type="button"
            id="btn-target-mode-smart"
            data-testid="btn-target-mode-smart"
            onClick={() => handleModeButtonClick('smart')}
            aria-pressed={activeMode === 'smart'}
            className={`flex-1 min-h-[44px] py-2 px-3 text-xs font-semibold rounded-xl transition-all ${
              activeMode === 'smart'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.settings.targetModeSmart}
          </button>
        </div>
      )}

      {/* Target Overview Card */}
      <div
        data-testid="goals-summary-card"
        className="rounded-3xl border border-slate-800/80 bg-slate-900/70 p-5 shadow-lg relative overflow-hidden space-y-4"
      >
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
              {t.goals?.targetKcal || 'Daily Target'}
            </span>
            <div className="flex items-baseline gap-2">
              <span data-testid="summary-calories-value" className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight font-mono">
                {calories.toLocaleString()}
              </span>
              <span className="text-sm font-semibold text-emerald-400">kcal</span>
            </div>
          </div>

          <button
            type="button"
            id="btn-edit-goals"
            data-testid="btn-edit-goals"
            onClick={() => setIsEditModalOpen(true)}
            aria-label={t.goals?.editGoals || 'Edit Goals'}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700/80 text-emerald-400 hover:text-emerald-300 font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>{t.goals?.editGoals || 'Edit Goals'}</span>
          </button>
        </div>

        {/* Macro Distribution Bars & Pills */}
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden flex gap-0.5">
            <div
              style={{ width: `${proteinPct}%` }}
              className="bg-rose-500 transition-all duration-300"
              title={`Protein: ${proteinPct}%`}
            />
            <div
              style={{ width: `${carbsPct}%` }}
              className="bg-amber-500 transition-all duration-300"
              title={`Carbs: ${carbsPct}%`}
            />
            <div
              style={{ width: `${fatsPct}%` }}
              className="bg-cyan-500 transition-all duration-300"
              title={`Fats: ${fatsPct}%`}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
              <span className="text-[11px] font-semibold text-slate-400 block mb-0.5">
                {t.dashboard.protein}
              </span>
              <div className="font-mono text-sm font-bold text-rose-300">
                {protein}g
              </div>
              <span className="text-[10px] text-slate-400">{proteinPct}%</span>
            </div>

            <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
              <span className="text-[11px] font-semibold text-slate-400 block mb-0.5">
                {t.dashboard.carbs}
              </span>
              <div className="font-mono text-sm font-bold text-amber-300">
                {carbs}g
              </div>
              <span className="text-[10px] text-slate-400">{carbsPct}%</span>
            </div>

            <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
              <span className="text-[11px] font-semibold text-slate-400 block mb-0.5">
                {t.dashboard.fats}
              </span>
              <div className="font-mono text-sm font-bold text-cyan-300">
                {fats}g
              </div>
              <span className="text-[10px] text-slate-400">{fatsPct}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mode Details Summary Card */}
      {activeMode === 'manual' ? (
        <div data-testid="manual-mode-summary-card" className="rounded-3xl border border-slate-800/80 bg-slate-900/60 p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
            <Target className="w-4 h-4 text-emerald-400" />
            <span>{t.goals?.activeMode || 'Active Mode'}: {t.settings.targetModeManual}</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {t.goals?.manualModeDescription || 'You have full manual control over calorie and macronutrient targets.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Biometrics Summary */}
          <div data-testid="biometrics-summary-card" className="rounded-3xl border border-slate-800/80 bg-slate-900/60 p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>{t.goals?.biometricsSummary || 'Biometrics & Activity'}</span>
              </div>
              <span data-testid="adaptive-status-badge" className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                isAdaptive
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800/50'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}>
                {isAdaptive ? (t.goals?.adaptiveActive || 'Adaptive Active') : (t.goals?.adaptiveDeterministic || 'Deterministic')}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
                <span className="text-slate-400 block text-[11px] mb-0.5 flex items-center gap-1">
                  <User className="w-3 h-3 text-slate-400" />
                  {t.settings.sexLabel}
                </span>
                <span className="font-semibold text-white capitalize">
                  {biometrics?.sex === 'female' ? t.settings.sexFemale : t.settings.sexMale}
                  {userAge ? ` • ${userAge}y` : ''}
                </span>
              </div>

              <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
                <span className="text-slate-400 block text-[11px] mb-0.5 flex items-center gap-1">
                  <Ruler className="w-3 h-3 text-slate-400" />
                  {t.settings.heightCmLabel}
                </span>
                <span className="font-semibold text-white font-mono">
                  {biometrics?.height_cm || 170} cm
                </span>
              </div>

              <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
                <span className="text-slate-400 block text-[11px] mb-0.5 flex items-center gap-1">
                  <Scale className="w-3 h-3 text-slate-400" />
                  {t.settings.currentWeightKgLabel}
                </span>
                <span className="font-semibold text-white font-mono">
                  {latestWeight.toFixed(1)} kg
                </span>
              </div>

              <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
                <span className="text-slate-400 block text-[11px] mb-0.5 flex items-center gap-1">
                  <Activity className="w-3 h-3 text-slate-400" />
                  {t.settings.activityLevelLabel}
                </span>
                <span className="font-semibold text-white truncate block">
                  {activityLevelLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Strategy Summary */}
          <div data-testid="strategy-summary-card" className="rounded-3xl border border-slate-800/80 bg-slate-900/60 p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>{t.goals?.strategySummary || 'Goal Strategy'}</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-xs">
              <div>
                <span className="font-bold text-white block text-sm">{goalTypeLabel}</span>
                <span className="text-slate-400 text-[11px]">
                  {goalConfig?.goal_type === 'lose' && goalConfig.weekly_rate_pct !== undefined
                    ? `${goalConfig.weekly_rate_pct}% / week`
                    : goalConfig?.goal_type === 'gain' && goalConfig.weekly_rate_pct !== undefined
                    ? `+${goalConfig.weekly_rate_pct}% / week`
                    : 'Target weight balance'}
                </span>
              </div>

              <div className="text-right font-mono">
                <span className="text-[11px] text-slate-400 block">Baseline TDEE</span>
                <span className="font-bold text-emerald-300">
                  {userSettings?.adaptive_state?.estimated_tdee || userSettings?.adaptive_state?.prior_tdee || calories} kcal
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mode Switch Confirmation Dialog */}
      {pendingModeSwitch !== null && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="confirm-mode-switch-modal"
          aria-labelledby="confirm-switch-mode-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <Target className="w-5 h-5" />
              <h3 id="confirm-switch-mode-title" className="text-base text-white font-bold">
                {t.goals?.switchModeConfirmTitle || 'Switch Target Mode?'}
              </h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {pendingModeSwitch === 'smart'
                ? (t.goals?.switchToSmartMessage || 'Switching to Smart / Adaptive will calculate your daily calories and macros automatically based on your biometrics and weight goal. Would you like to proceed?')
                : (t.goals?.switchToManualMessage || 'Switching to Manual allows you to set custom fixed calorie and macronutrient targets. Adaptive adjustments will be paused. Would you like to proceed?')}
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                id="btn-cancel-mode-switch"
                data-testid="btn-cancel-mode-switch"
                onClick={() => setPendingModeSwitch(null)}
                className="flex-1 min-h-[44px] py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
              >
                {t.goals?.cancel || 'Cancel'}
              </button>
              <button
                type="button"
                id="btn-confirm-mode-switch"
                data-testid="btn-confirm-mode-switch"
                onClick={handleConfirmModeSwitch}
                className="flex-1 min-h-[44px] py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-md active:scale-95"
              >
                {t.goals?.confirmSwitch || 'Confirm & Switch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Edit Goals Slide-Over Modal */}
      <GoalsEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        initialMode={activeMode}
      />
    </div>
  );
};
