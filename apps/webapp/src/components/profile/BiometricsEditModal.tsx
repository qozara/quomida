import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext.js';
import { calculateBaselineSeed, type UserSex } from '@quomida/domain-core';
import { User, Scale, Ruler, Calendar, Save, Check, Info, Flame } from 'lucide-react';
import { BottomSheet } from '../common/BottomSheet.js';

interface BiometricsEditModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BiometricsEditModal: React.FC<BiometricsEditModalProps> = ({
  isOpen,
  onClose
}) => {
  const {
    t,
    userSettings,
    updateUserSettings,
    weightLogs,
    logWeight,
    setSelectedDate
  } = useApp();

  const todayStr = new Date().toISOString().slice(0, 10);

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
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (!userSettings) return;
    if (userSettings.biometrics) {
      setSex(userSettings.biometrics.sex || 'male');
      setBirthDate(userSettings.biometrics.birth_date || '1990-01-01');
      setHeightCm(userSettings.biometrics.height_cm || 170);
    }
  }, [userSettings, isOpen]);

  useEffect(() => {
    setCurrentWeightKg(initialWeight);
  }, [initialWeight, isOpen]);

  const baselinePreview = useMemo(() => {
    const activityMultiplier = userSettings?.biometrics?.activity_multiplier || 1.375;
    const goalConfig = userSettings?.goal_config || {
      goal_type: 'lose' as const,
      weekly_rate_pct: -0.5,
      protein_g_per_kg: 2.2,
      fat_calorie_pct: 0.25
    };
    return calculateBaselineSeed({
      biometrics: { sex, birth_date: birthDate, height_cm: heightCm, activity_multiplier: activityMultiplier },
      goalConfig,
      currentWeightKg,
      referenceDate: todayStr
    });
  }, [
    sex,
    birthDate,
    heightCm,
    currentWeightKg,
    userSettings?.biometrics?.activity_multiplier,
    userSettings?.goal_config,
    todayStr
  ]);

  if (!isOpen) return null;

  const handleSaveBiometrics = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Log weight if modified or if no previous weight log exists
    const existingLog = weightLogs.find((w) => w.date === todayStr);
    const hasWeightChangedFromInitial = Math.abs(currentWeightKg - initialWeight) > 1e-4;
    const hasWeightChangedOnToday =
      existingLog !== undefined && Math.abs(existingLog.weight_kg - currentWeightKg) > 1e-4;

    if (weightLogs.length === 0 || hasWeightChangedFromInitial || hasWeightChangedOnToday) {
      await logWeight(todayStr, currentWeightKg);
    }

    const activityMultiplier = userSettings?.biometrics?.activity_multiplier || 1.375;
    const isSmartMode = userSettings?.target_mode !== 'manual';

    const updatedBiometrics = {
      sex,
      birth_date: birthDate,
      height_cm: heightCm,
      activity_multiplier: activityMultiplier
    };

    if (isSmartMode) {
      // Recalibrate baseline targets based on new biometrics
      const goalConfig = userSettings?.goal_config || {
        goal_type: 'lose' as const,
        weekly_rate_pct: -0.5,
        protein_g_per_kg: 2.2,
        fat_calorie_pct: 0.25
      };

      const seed = calculateBaselineSeed({
        biometrics: updatedBiometrics,
        goalConfig,
        currentWeightKg,
        referenceDate: todayStr
      });

      await updateUserSettings({
        biometrics: updatedBiometrics,
        adaptive_state: {
          estimated_tdee: seed.seed_tdee,
          prior_tdee: seed.seed_tdee,
          calibration_status: 'collecting_data',
          last_calibrated_date: todayStr
        },
        daily_calorie_target: seed.daily_calorie_target,
        custom_macros: seed.custom_macros
      });
      setSelectedDate(todayStr);
    } else {
      // Manual mode: preserve manual targets, update biometrics
      await updateUserSettings({
        biometrics: updatedBiometrics
      });
    }

    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 400);
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      onBack={onClose}
      backTestId="btn-back-biometrics"
      backId="btn-back-biometrics"
      title={t.goals?.editBiometrics || 'Edit Biometrics'}
      titleId="biometrics-modal-title"
      testId="biometrics-edit-modal"
      maxHeight="max-h-[92dvh]"
    >
      {/* Main Form */}
      <div className="max-w-md mx-auto w-full space-y-4">
        <form onSubmit={handleSaveBiometrics} className="space-y-4">
          <div className="space-y-4 bg-slate-100 dark:bg-slate-900/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1 font-medium flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  {t.settings.sexLabel}
                </label>
                <select
                  id="select-biometrics-sex"
                  data-testid="select-biometrics-sex"
                  value={sex}
                  onChange={(e) => setSex(e.target.value as UserSex)}
                  className="w-full min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="male">{t.settings.sexMale}</option>
                  <option value="female">{t.settings.sexFemale}</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1 font-medium flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  {t.settings.birthDateLabel}
                </label>
                <input
                  type="date"
                  id="input-biometrics-birthdate"
                  data-testid="input-biometrics-birthdate"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1 font-medium flex items-center gap-1">
                  <Ruler className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  {t.settings.heightCmLabel}
                </label>
                <input
                  type="number"
                  id="input-biometrics-height"
                  data-testid="input-biometrics-height"
                  min="100"
                  max="250"
                  value={heightCm}
                  onChange={(e) => setHeightCm(Number(e.target.value))}
                  className="w-full min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1 font-medium flex items-center gap-1">
                  <Scale className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  {t.settings.currentWeightKgLabel}
                </label>
                <input
                  type="number"
                  step="0.1"
                  id="input-biometrics-weight"
                  data-testid="input-biometrics-weight"
                  min="30"
                  max="300"
                  value={currentWeightKg}
                  onChange={(e) => setCurrentWeightKg(Number(e.target.value))}
                  className="w-full min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white/60 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-2">
              <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>{t.goals?.weightNotice || 'Updating your weight here records a new weigh-in for today.'}</span>
            </div>
          </div>

          {/* Calculated Output Preview */}
          <div
            id="preview-seed-tdee"
            data-testid="preview-seed-tdee"
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/90 p-4 space-y-3"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <Flame className="w-3.5 h-3.5" />
              <span>{t.settings.previewTitle}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white dark:bg-slate-950/60 p-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block">{t.settings.previewBmr}</span>
                <span data-testid="preview-bmr-value" className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                  {baselinePreview.bmr} kcal
                </span>
              </div>
              <div className="bg-white dark:bg-slate-950/60 p-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block">{t.settings.previewTdee}</span>
                <span data-testid="preview-tdee-value" className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                  {baselinePreview.seed_tdee} kcal
                </span>
              </div>
              <div className="bg-white dark:bg-slate-950/60 p-2 rounded-xl border border-emerald-500/30 shadow-xs">
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold block">{t.settings.previewTargetKcal}</span>
                <span data-testid="preview-target-kcal-value" className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                  {baselinePreview.daily_calorie_target} kcal
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-[11px] pt-1 border-t border-slate-200 dark:border-slate-800/80 font-mono">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Protein</span>
                <span data-testid="preview-protein-value" className="font-bold text-rose-600 dark:text-rose-300">
                  {baselinePreview.custom_macros.protein}g
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Carbs</span>
                <span className="font-bold text-amber-600 dark:text-amber-300">{baselinePreview.custom_macros.carbs}g</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Fats</span>
                <span className="font-bold text-cyan-600 dark:text-cyan-300">{baselinePreview.custom_macros.fats}g</span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            id="btn-save-biometrics"
            data-testid="btn-save-biometrics"
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
                <span>{t.goals?.saveBiometrics || 'Save Biometrics'}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </BottomSheet>
  );
};
