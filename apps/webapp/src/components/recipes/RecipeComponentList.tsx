import React from 'react';
import type { RecipeComponent } from '@quomida/domain-core';
import { useApp } from '../../context/AppContext.js';
import { dictionaries } from '@quomida/i18n-locales';
import { Trash2 } from 'lucide-react';

interface RecipeComponentListProps {
  components: RecipeComponent[];
  cookedWeightGrams?: number;
  totalMacros?: { calories: number; protein: number; carbs: number; fats: number };
  showSummary?: boolean;
  onRemove?: (index: number) => void;
  className?: string;
}

export const RecipeComponentList: React.FC<RecipeComponentListProps> = ({
  components,
  cookedWeightGrams,
  totalMacros,
  showSummary = true,
  onRemove,
  className = ''
}) => {
  const { t } = useApp();
  const dict = t || dictionaries.es;

  if (!components || components.length === 0) {
    return (
      <div className={`p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-500 ${className}`}>
        {dict.recipes.noComponents}
      </div>
    );
  }

  const totalRawWeight = components.reduce((sum, c) => sum + (c.weight_g || 0), 0);
  const totalCals = totalMacros ? totalMacros.calories : components.reduce((sum, c) => sum + ((c.calories_100g * c.weight_g) / 100), 0);
  const totalProtein = totalMacros ? totalMacros.protein : components.reduce((sum, c) => sum + ((c.protein_100g * c.weight_g) / 100), 0);
  const totalCarbs = totalMacros ? totalMacros.carbs : components.reduce((sum, c) => sum + ((c.carbs_100g * c.weight_g) / 100), 0);
  const totalFats = totalMacros ? totalMacros.fats : components.reduce((sum, c) => sum + ((c.fats_100g * c.weight_g) / 100), 0);

  const effectiveCookedWeight = cookedWeightGrams || totalRawWeight;
  const densityCals = effectiveCookedWeight > 0 ? (totalCals / effectiveCookedWeight) * 100 : 0;
  const densityProtein = effectiveCookedWeight > 0 ? (totalProtein / effectiveCookedWeight) * 100 : 0;
  const densityCarbs = effectiveCookedWeight > 0 ? (totalCarbs / effectiveCookedWeight) * 100 : 0;
  const densityFats = effectiveCookedWeight > 0 ? (totalFats / effectiveCookedWeight) * 100 : 0;

  return (
    <div className={`space-y-2 ${className}`}>
      {components.map((comp, idx) => {
        const cals = (comp.calories_100g * comp.weight_g) / 100;
        const protein = (comp.protein_100g * comp.weight_g) / 100;
        const carbs = (comp.carbs_100g * comp.weight_g) / 100;
        const fats = (comp.fats_100g * comp.weight_g) / 100;

        return (
          <div
            key={`${comp.food_id}-${idx}`}
            className="flex items-center justify-between p-3 rounded-xl bg-slate-950/90 border border-slate-800/90 hover:border-slate-700 transition-colors"
          >
            <div className="flex-1 min-w-0 pr-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white truncate">{comp.name}</span>
                {comp.from_recipe ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 shrink-0">
                    {dict.recipes.recipeBadge}
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 shrink-0">
                    {comp.weight_g}g
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap gap-x-2">
                <span>{Math.round(cals)} kcal</span>
                <span className="text-slate-600">•</span>
                <span className="text-rose-400">P: {Math.round(protein * 10) / 10}g</span>
                <span className="text-amber-400">C: {Math.round(carbs * 10) / 10}g</span>
                <span className="text-cyan-400">F: {Math.round(fats * 10) / 10}g</span>
                {comp.from_recipe && (
                  <>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-400">{comp.weight_g}g</span>
                  </>
                )}
              </div>
            </div>

          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(idx)}
              aria-label={`Remove ${comp.name}`}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          </div>
        );
      })}

      {showSummary && !onRemove && components.length > 0 && (
        <div className="mt-3 p-3 rounded-xl bg-purple-950/20 border border-purple-800/40 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-white">
            <span>
              {dict.recipes.totalDish || dict.recipes.totalNutrition} ({effectiveCookedWeight}g {cookedWeightGrams ? dict.recipes.cooked : dict.recipes.raw}):
            </span>
            <span className="text-purple-300">
              {Math.round(totalCals)} kcal
            </span>
          </div>
          <div className="text-xs text-slate-300 flex flex-wrap gap-x-2">
            <span className="text-rose-400">P: {Math.round(totalProtein * 10) / 10}g</span>
            <span className="text-slate-600">•</span>
            <span className="text-amber-400">C: {Math.round(totalCarbs * 10) / 10}g</span>
            <span className="text-slate-600">•</span>
            <span className="text-cyan-400">F: {Math.round(totalFats * 10) / 10}g</span>
          </div>
          <div className="text-[11px] text-slate-400 pt-1 border-t border-purple-800/30 flex items-center justify-between">
            <span>{dict.recipes.nutritionPer100g}:</span>
            <span className="font-semibold text-slate-300">
              {Math.round(densityCals * 10) / 10} kcal • P: {Math.round(densityProtein * 10) / 10}g | C: {Math.round(densityCarbs * 10) / 10}g | F: {Math.round(densityFats * 10) / 10}g
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
