import React, { useState } from 'react';
import { useApp } from '../context/AppContext.js';
import type { MealType, BaseIngredient, FoodItem } from '@quomida/domain-core';
import { ChevronDown, ChevronUp, Trash2, Coffee, Utensils, Moon, Apple, Plus } from 'lucide-react';

interface MealSectionProps {
  mealType: MealType;
  title: string;
  onOpenPortionModal: (ingredient: FoodItem | BaseIngredient, mealType: MealType) => void;
  onOpenAddModal?: (mealType: MealType) => void;
}

const mealIcons: Record<MealType, React.ReactNode> = {
  meal_breakfast: <Coffee className="w-4 h-4 text-amber-400" />,
  meal_lunch: <Utensils className="w-4 h-4 text-emerald-400" />,
  meal_dinner: <Moon className="w-4 h-4 text-indigo-400" />,
  meal_snack: <Apple className="w-4 h-4 text-rose-400" />
};

export const MealSection: React.FC<MealSectionProps> = ({
  mealType,
  title,
  onOpenPortionModal: _onOpenPortionModal,
  onOpenAddModal
}) => {
  const { dailyLogs, ingredients, deleteLogItem, t } = useApp();
  const [isOpen, setIsOpen] = useState(true);

  const logs = dailyLogs.filter((l) => l.meal_type === mealType);
  const totalCalories = logs.reduce((acc, l) => acc + (l.macros.calories || 0), 0);

  const getIngredientName = (id: string) => {
    const ing = ingredients.find((i) => i.id === id);
    return ing ? ing.name : id;
  };

  return (
    <div className="w-full glass-card rounded-2xl overflow-hidden border border-slate-800/80 shadow-md transition-all duration-200">
      
      {/* Header Bar */}
      <div className="w-full flex items-center justify-between p-3 sm:p-4 bg-slate-900/60 hover:bg-slate-800/40 transition-colors">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          className="flex-1 flex items-center gap-3 text-left min-h-[44px]"
        >
          <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/50 shadow-inner">
            {mealIcons[mealType]}
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-wide">{title}</h3>
            <p className="text-xs text-slate-400">
              {logs.length} {logs.length === 1 ? 'item' : 'items'}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800/40">
            {Math.round(totalCalories)} kcal
          </span>

          {/* Dedicated Contextual Add Button */}
          {onOpenAddModal && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenAddModal(mealType);
              }}
              aria-label={`Add food to ${title}`}
              className="min-w-[44px] min-h-[44px] p-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center transition-all duration-150 active:scale-95"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-label={isOpen ? 'Collapse section' : 'Expand section'}
            className="min-w-[44px] min-h-[44px] p-2 text-slate-400 hover:text-slate-200 flex items-center justify-center"
          >
            {isOpen ? (
              <ChevronUp className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            )}
          </button>
        </div>
      </div>

      {/* Accordion Content */}
      {isOpen && (
        <div className="p-4 pt-2 border-t border-slate-800/60 space-y-2">
          {logs.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-xs italic">
              {t.dashboard.noEntries}
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-900/40 hover:bg-slate-800/40 border border-slate-800/50 transition-all group"
              >
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-200">
                    {log.food_name || getIngredientName(log.food_reference_id)}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {log.quantity} {log.portion_name} • P: {log.macros.protein}g | C: {log.macros.carbs}g | F: {log.macros.fats}g
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-200">
                    {Math.round(log.macros.calories)} kcal
                  </span>
                  <button
                    onClick={() => deleteLogItem(log.id)}
                    aria-label="Delete entry"
                    className="min-w-[44px] min-h-[44px] p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
