import React from 'react';
import type { RecipeComponent } from '@quomida/domain-core';
import { useApp } from '../../context/AppContext.js';
import { dictionaries } from '@quomida/i18n-locales';
import { Trash2 } from 'lucide-react';

interface RecipeComponentListProps {
  components: RecipeComponent[];
  onRemove?: (index: number) => void;
  className?: string;
}

export const RecipeComponentList: React.FC<RecipeComponentListProps> = ({
  components,
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
    </div>
  );
};
