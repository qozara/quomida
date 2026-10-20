import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.js';
import { FoodLogger } from './FoodLogger.js';
import type { MealType, BaseIngredient, FoodItem } from '@quomida/domain-core';
import { X, Utensils, Coffee, Moon, Apple } from 'lucide-react';

interface AddFoodModalProps {
  isOpen: boolean;
  targetMealType: MealType;
  onClose: () => void;
  onSelectIngredient: (ingredient: FoodItem | BaseIngredient, mealType: MealType) => void;
}

const mealOptions: Array<{
  id: MealType;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'meal_breakfast', icon: Coffee },
  { id: 'meal_lunch', icon: Utensils },
  { id: 'meal_dinner', icon: Moon },
  { id: 'meal_snack', icon: Apple }
];

export const AddFoodModal: React.FC<AddFoodModalProps> = ({
  isOpen,
  targetMealType,
  onClose,
  onSelectIngredient
}) => {
  const { t } = useApp();
  const [currentMeal, setCurrentMeal] = useState<MealType>(targetMealType);

  useEffect(() => {
    setCurrentMeal(targetMealType);
  }, [targetMealType, isOpen]);

  if (!isOpen) return null;

  const getMealTitle = (meal: MealType) => {
    switch (meal) {
      case 'meal_breakfast':
        return t.dashboard.meals.breakfast;
      case 'meal_lunch':
        return t.dashboard.meals.lunch;
      case 'meal_dinner':
        return t.dashboard.meals.dinner;
      case 'meal_snack':
        return t.dashboard.meals.snack;
    }
  };

  const handleSelect = (ingredient: FoodItem | BaseIngredient) => {
    onSelectIngredient(ingredient, currentMeal);
    onClose();
  };

  const activeTitle = getMealTitle(currentMeal);
  const headerText = t.dashboard.meals.addFoodToMeal
    ? t.dashboard.meals.addFoodToMeal.replace('{{meal}}', activeTitle)
    : `Add Food to ${activeTitle}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-food-modal-title"
        className="relative w-full max-w-lg bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
              <Utensils className="w-5 h-5" />
            </div>
            <div>
              <h2 id="add-food-modal-title" className="text-base sm:text-lg font-bold text-white tracking-wide">
                {headerText}
              </h2>
              <p className="text-xs text-slate-400">
                {t.search?.unifiedPlaceholder || 'Search food, saved recipes, or describe your meal'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-w-[44px] min-h-[44px] p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Meal Type Quick Switcher Pills */}
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-slate-400">
            {t.ai?.selectMeal || 'Meal Time'}
          </span>
          <div className="grid grid-cols-4 gap-2">
            {mealOptions.map((opt) => {
              const Icon = opt.icon;
              const isSelected = currentMeal === opt.id;
              const title = getMealTitle(opt.id);

              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCurrentMeal(opt.id)}
                  aria-pressed={isSelected}
                  className={`min-h-[44px] px-2 py-2 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 border ${
                    isSelected
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold shadow-md'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-700/80'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-slate-950' : 'text-slate-400'}`} />
                  <span className="truncate max-w-[70px] text-[11px]">{title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Embedded Food Logger / Search Bar & AI Natural Parser */}
        <div className="pt-2">
          <FoodLogger onSelectIngredient={handleSelect} />
        </div>
      </div>
    </div>
  );
};
