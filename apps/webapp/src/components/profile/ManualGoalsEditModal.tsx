import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.js';
import { ArrowLeft, Target, Save, Check } from 'lucide-react';

interface ManualGoalsEditModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ManualGoalsEditModal: React.FC<ManualGoalsEditModalProps> = ({
  isOpen,
  onClose
}) => {
  const { t, userSettings, updateUserSettings } = useApp();

  const [calorieTarget, setCalorieTarget] = useState(userSettings?.daily_calorie_target || 2000);
  const [proteinTarget, setProteinTarget] = useState(userSettings?.custom_macros?.protein || 150);
  const [carbsTarget, setCarbsTarget] = useState(userSettings?.custom_macros?.carbs || 200);
  const [fatsTarget, setFatsTarget] = useState(userSettings?.custom_macros?.fats || 65);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (!userSettings) return;
    setCalorieTarget(userSettings.daily_calorie_target || 2000);
    setProteinTarget(userSettings.custom_macros?.protein || 150);
    setCarbsTarget(userSettings.custom_macros?.carbs || 200);
    setFatsTarget(userSettings.custom_macros?.fats || 65);
  }, [userSettings, isOpen]);

  if (!isOpen) return null;

  const totalMacroCalories = (proteinTarget * 4) + (carbsTarget * 4) + (fatsTarget * 9);
  const proteinPct = totalMacroCalories > 0 ? Math.round(((proteinTarget * 4) / totalMacroCalories) * 100) : 0;
  const carbsPct = totalMacroCalories > 0 ? Math.round(((carbsTarget * 4) / totalMacroCalories) * 100) : 0;
  const fatsPct = totalMacroCalories > 0 ? Math.round(((fatsTarget * 9) / totalMacroCalories) * 100) : 0;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateUserSettings({
      target_mode: 'manual',
      daily_calorie_target: calorieTarget,
      custom_macros: {
        protein: proteinTarget,
        carbs: carbsTarget,
        fats: fatsTarget
      }
    });
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
      aria-label={t.goals?.editManualTitle || 'Edit Manual Targets'}
      data-testid="manual-goals-edit-modal"
      className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100 animate-slide-in-right overflow-y-auto"
    >
      {/* Top Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-md shrink-0">
        <button
          id="btn-back-manual-goals"
          data-testid="btn-back-manual-goals"
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="min-w-[44px] min-h-[44px] p-2 -ml-2 rounded-full hover:bg-slate-800/80 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors flex items-center justify-center active:scale-95"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center flex-1 mx-2 min-w-0">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
            {t.goals?.editManualTitle || 'Edit Manual Targets'}
          </h2>
        </div>
        <div className="w-[44px]" aria-hidden="true" />
      </header>

      {/* Main Form */}
      <div className="max-w-md mx-auto w-full p-4 space-y-4 flex-1">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-3 bg-slate-900/80 p-4 rounded-2xl border border-slate-800 shadow-sm">
            <div>
              <label className="text-xs text-slate-400 block mb-1 font-medium">
                {t.settings.dailyTarget}
              </label>
              <input
                id="input-calorie-target"
                data-testid="input-calorie-target"
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
                  id="input-protein-target"
                  data-testid="input-protein-target"
                  type="number"
                  min="0"
                  max="500"
                  value={proteinTarget}
                  onChange={(e) => setProteinTarget(Number(e.target.value))}
                  className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white text-center focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  {t.dashboard.carbs} (g)
                </label>
                <input
                  id="input-carbs-target"
                  data-testid="input-carbs-target"
                  type="number"
                  min="0"
                  max="1000"
                  value={carbsTarget}
                  onChange={(e) => setCarbsTarget(Number(e.target.value))}
                  className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white text-center focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  {t.dashboard.fats} (g)
                </label>
                <input
                  id="input-fats-target"
                  data-testid="input-fats-target"
                  type="number"
                  min="0"
                  max="500"
                  value={fatsTarget}
                  onChange={(e) => setFatsTarget(Number(e.target.value))}
                  className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white text-center focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            {/* Macro Distribution Bar & Summary */}
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{t.goals?.macroDistribution || 'Macro Distribution'}</span>
                <span className="font-mono text-[11px]">
                  {totalMacroCalories} / {calorieTarget} kcal
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden flex gap-0.5">
                <div
                  className="bg-rose-500 transition-all duration-300"
                  style={{ width: `${proteinPct}%` }}
                  title={`Protein: ${proteinPct}%`}
                />
                <div
                  className="bg-amber-500 transition-all duration-300"
                  style={{ width: `${carbsPct}%` }}
                  title={`Carbs: ${carbsPct}%`}
                />
                <div
                  className="bg-cyan-500 transition-all duration-300"
                  style={{ width: `${fatsPct}%` }}
                  title={`Fats: ${fatsPct}%`}
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                <span className="text-rose-400">{proteinPct}% {t.dashboard.protein}</span>
                <span className="text-amber-400">{carbsPct}% {t.dashboard.carbs}</span>
                <span className="text-cyan-400">{fatsPct}% {t.dashboard.fats}</span>
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
                <span>{t.goals?.saveTargets || t.recipes.saveRecipe}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
