import React from 'react';
import { useApp } from '../context/AppContext.js';
import { Flame, Dumbbell, Wheat, Droplet } from 'lucide-react';

export const MacroRings: React.FC = () => {
  const { dailyLogs, userSettings, t } = useApp();

  const totalConsumed = dailyLogs.reduce(
    (acc, log) => {
      acc.calories += log.macros.calories || 0;
      acc.protein += log.macros.protein || 0;
      acc.carbs += log.macros.carbs || 0;
      acc.fats += log.macros.fats || 0;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );

  const calTarget = userSettings.daily_calorie_target || 2000;
  const pTarget = userSettings.custom_macros?.protein || 150;
  const cTarget = userSettings.custom_macros?.carbs || 200;
  const fTarget = userSettings.custom_macros?.fats || 65;

  const calRemaining = Math.max(0, calTarget - totalConsumed.calories);

  const getPercentage = (val: number, max: number) => Math.min(100, Math.round((val / max) * 100));

  return (
    <section className="w-full glass-card rounded-3xl p-5 shadow-2xl border border-slate-800/90 relative overflow-hidden bg-gradient-to-b from-slate-900/90 to-slate-950/90">
      
      {/* Background Subtle Gradient Glow */}
      <div className="absolute -top-12 -right-12 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Calorie Ring & Summary */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-xs tracking-wider uppercase">
            <Flame className="w-4 h-4 fill-emerald-400/20" />
            <span>{t.dashboard.calories}</span>
          </div>
          <div className="text-3xl font-extrabold text-white mt-1 tracking-tight">
            {Math.round(totalConsumed.calories)}
            <span className="text-base font-normal text-slate-400 ml-1">/ {calTarget} kcal</span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {calRemaining > 0
              ? `${Math.round(calRemaining)} kcal ${t.dashboard.remaining}`
              : `${Math.round(totalConsumed.calories - calTarget)} kcal ${t.dashboard.overGoal}`}
          </p>
        </div>

        {/* Circular Progress Ring */}
        <div className="relative w-20 h-20 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            <path
              className="text-slate-800"
              strokeWidth="3.5"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="text-emerald-500 transition-all duration-500 stroke-current"
              strokeDasharray={`${getPercentage(totalConsumed.calories, calTarget)}, 100`}
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <span className="absolute text-sm font-bold text-slate-100">
            {getPercentage(totalConsumed.calories, calTarget)}%
          </span>
        </div>
      </div>

      {/* Macro Breakdown Bars (Protein, Carbs, Fats) */}
      <div className="grid grid-cols-3 gap-3">
        {/* Protein */}
        <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800/80 shadow-sm">
          <div className="flex items-center gap-1 text-rose-400 text-xs font-semibold mb-1">
            <Dumbbell className="w-3.5 h-3.5" />
            <span>{t.dashboard.protein}</span>
          </div>
          <div className="text-lg font-bold text-white">
            {Math.round(totalConsumed.protein)}
            <span className="text-xs text-slate-400 font-normal">g</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-rose-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${getPercentage(totalConsumed.protein, pTarget)}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-400 mt-1 text-right">target {pTarget}g</div>
        </div>

        {/* Carbs */}
        <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800/80 shadow-sm">
          <div className="flex items-center gap-1 text-amber-400 text-xs font-semibold mb-1">
            <Wheat className="w-3.5 h-3.5" />
            <span>{t.dashboard.carbs}</span>
          </div>
          <div className="text-lg font-bold text-white">
            {Math.round(totalConsumed.carbs)}
            <span className="text-xs text-slate-400 font-normal">g</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-amber-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${getPercentage(totalConsumed.carbs, cTarget)}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-400 mt-1 text-right">target {cTarget}g</div>
        </div>

        {/* Fats */}
        <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800/80 shadow-sm">
          <div className="flex items-center gap-1 text-cyan-400 text-xs font-semibold mb-1">
            <Droplet className="w-3.5 h-3.5" />
            <span>{t.dashboard.fats}</span>
          </div>
          <div className="text-lg font-bold text-white">
            {Math.round(totalConsumed.fats)}
            <span className="text-xs text-slate-400 font-normal">g</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-cyan-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${getPercentage(totalConsumed.fats, fTarget)}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-400 mt-1 text-right">target {fTarget}g</div>
        </div>
      </div>

    </section>
  );
};
