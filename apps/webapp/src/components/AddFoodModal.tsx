import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.js';
import { FoodLogger } from './FoodLogger.js';
import type { MealType, BaseIngredient, FoodItem } from '@quomida/domain-core';
import { ArrowLeft, Utensils, Coffee, Moon, Apple } from 'lucide-react';

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
  };

  const activeTitle = getMealTitle(currentMeal);
  const headerText = t.dashboard.meals.addFoodToMeal
    ? t.dashboard.meals.addFoodToMeal.replace('{{meal}}', activeTitle)
    : `Add Food to ${activeTitle}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-food-modal-title"
      className="fixed inset-0 z-50 bg-slate-950 text-slate-100 flex flex-col overflow-y-auto animate-slide-in-right"
    >
      {/* Modern Sticky Navigation Header */}
      <header className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 flex items-center justify-between shrink-0">
        <button
          id="btn-close-add-food"
          data-testid="btn-close-add-food"
          onClick={onClose}
          aria-label="Back"
          className="min-w-[44px] min-h-[44px] p-2 -ml-2 rounded-full hover:bg-slate-800/80 text-slate-300 hover:text-white transition-colors flex items-center justify-center active:scale-95"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 id="add-food-modal-title" className="text-base sm:text-lg font-bold text-white tracking-wide">
          {headerText}
        </h1>
        <div className="w-[44px]" aria-hidden="true" />
      </header>

      {/* Main Container */}
      <div className="max-w-md mx-auto w-full px-4 py-4 space-y-4 flex-1">
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
          <FoodLogger onSelectIngredient={handleSelect} onClose={onClose} />
        </div>
      </div>
    </div>
  );
};
