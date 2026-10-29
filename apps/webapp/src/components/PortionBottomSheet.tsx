import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext.js';
import { dictionaries } from '@quomida/i18n-locales';
import type { BaseIngredient, FoodItem, RecipeFoodItem, MealType, Portion, TaggedPortion } from '@quomida/domain-core';
import { calculateItemMacros, convertPortionToGrams, PortionManager } from '@quomida/domain-core';
import { Minus, Plus, Check, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { RecipeComponentList } from './recipes/RecipeComponentList.js';
import { DateSelector } from './DateSelector.js';
import { BottomSheet } from './common/BottomSheet.js';

interface PortionBottomSheetProps {
  ingredient: FoodItem | BaseIngredient | null;
  defaultMealType: MealType;
  onClose: () => void;
  onBack?: () => void;
  onSuccess?: () => void;
  initialDate?: string;
}

export const PortionBottomSheet: React.FC<PortionBottomSheetProps> = ({
  ingredient,
  defaultMealType,
  onClose,
  onBack,
  onSuccess,
  initialDate
}) => {
  const { db, logFoodItem, selectedDate, setSelectedDate, dailyLogs, t } = useApp();
  const dict = t || dictionaries.es;
  const [portionManager] = useState(() => new PortionManager());
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedPortionName, setSelectedPortionName] = useState<string>('g');
  const [availablePortions, setAvailablePortions] = useState<TaggedPortion[]>([]);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [modalDate, setModalDate] = useState<string>(initialDate || selectedDate || todayStr);

  const isPastDate = modalDate < todayStr;
  const logsOnModalDate = useMemo(() => {
    return (dailyLogs || []).filter((l) => l.date === modalDate);
  }, [dailyLogs, modalDate]);
  const foodCountOnDate = logsOnModalDate.length;

  useEffect(() => {
    if (initialDate) {
      setModalDate(initialDate);
    } else if (selectedDate) {
      setModalDate(selectedDate);
    }
  }, [initialDate, selectedDate]);

  // Fetch available portions dynamically using domain PortionManager
  useEffect(() => {
    let isCancelled = false;
    const fetchAllPortions = async () => {
      if (!ingredient || !db) {
        setAvailablePortions([]);
        setSelectedPortionName('g');
        setQuantity(100);
        return;
      }
      
      let customPortions: Portion[] = [];
      try {
        const localDocs = await db.portions.find({
          selector: { base_food_id: { $in: [ingredient.id, 'generic'] } }
        }).exec();
        customPortions = localDocs.map((d: any) => d.toJSON ? d.toJSON() : d);
      } catch (e) {
        console.warn('[PortionBottomSheet] Failed to query local portions:', e);
      }

      let remoteService: any = undefined;
      try {
        remoteService = (await import('../services/RemoteCatalogService.js')).RemoteCatalogService.getInstance();
      } catch (e) {
        console.warn('[PortionBottomSheet] RemoteCatalogService load notice:', e);
      }

      const resolved = await portionManager.resolvePortions({
        ingredient,
        customPortions,
        catalogProvider: remoteService
      });
      
      if (!isCancelled) {
        setAvailablePortions(resolved);
        if (resolved.length > 0) {
          setSelectedPortionName(resolved[0].name);
          setQuantity(1);
        } else {
          setSelectedPortionName('g');
          setQuantity(100);
        }
      }
    };
    
    fetchAllPortions();
    return () => { isCancelled = true; };
  }, [ingredient, db, portionManager]);

  useEffect(() => {
    setMealType(defaultMealType);
  }, [defaultMealType]);

  if (!ingredient) return null;

  const weightGrams = convertPortionToGrams(quantity, selectedPortionName, availablePortions);
  const calculated = calculateItemMacros(ingredient, weightGrams);

  const handleLog = async () => {
    await logFoodItem(ingredient, mealType, quantity, selectedPortionName, availablePortions, modalDate);
    if (onSuccess) {
      onSuccess();
    } else {
      onClose();
    }
  };

  return (
    <BottomSheet
      isOpen={!!ingredient}
      onClose={onClose}
      onBack={onBack || onClose}
      backTestId="btn-close-portion"
      backId="btn-close-portion"
      title={dict.portionModal.title}
      titleId="portion-modal-title"
      zIndex="z-[55]"
      testId="portion-bottom-sheet"
      maxHeight="max-h-[92dvh]"
    >
      {/* Main Container */}
      <div className="max-w-md mx-auto w-full space-y-4">
        {/* Date Selector at the top */}
        <div className="flex justify-center pt-1">
          <DateSelector
            value={modalDate}
            onChange={(d) => {
              setModalDate(d);
              setSelectedDate(d);
            }}
          />
        </div>

        {/* Food Hero Card */}
        <div className="p-4 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm dark:shadow-lg space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{ingredient.name}</h2>
            {'kind' in ingredient && ingredient.kind === 'recipe' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                {dict.recipes?.recipeBadge || 'Recipe'}
              </span>
            )}
          </div>
          {'kind' in ingredient && ingredient.kind === 'recipe' ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {dict.recipes?.totalDish || 'Total'}: {Math.round((ingredient as RecipeFoodItem).total_macros.calories)} kcal ({(ingredient as RecipeFoodItem).cooked_weight_g}g {dict.recipes?.cooked || 'cooked'})
              </span>
              <span className="text-slate-400 dark:text-slate-600"> • </span>
              <span>{Math.round(ingredient.calories_100g * 10) / 10} kcal/100g</span>
            </p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              100g base: {ingredient.calories_100g} kcal | P: {ingredient.protein_100g}g | C: {ingredient.carbs_100g}g | F: {ingredient.fats_100g}g
            </p>
          )}
        </div>

        {/* If Recipe: Ingredients Breakdown Collapsible */}
        {'kind' in ingredient && ingredient.kind === 'recipe' && (
          <div className="bg-slate-100 dark:bg-slate-900/90 rounded-2xl border border-purple-500/30 overflow-hidden shadow-sm dark:shadow-lg">
            <button
              type="button"
              onClick={() => setIsBreakdownOpen(!isBreakdownOpen)}
              className="w-full p-3.5 flex items-center justify-between text-left text-xs font-bold text-purple-600 dark:text-purple-400 hover:bg-slate-200/50 dark:hover:bg-slate-850 transition-colors min-h-[44px]"
            >
              <span>{dict.recipes?.breakdownTitle || 'Recipe Ingredients Breakdown'}</span>
              {isBreakdownOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {isBreakdownOpen && (
              <div className="p-3 pt-0 border-t border-slate-200 dark:border-slate-800/80">
                <RecipeComponentList
                  components={(ingredient as RecipeFoodItem).recipe?.ingredients || (ingredient as any).ingredients || []}
                  cookedWeightGrams={(ingredient as RecipeFoodItem).cooked_weight_g}
                  totalMacros={(ingredient as RecipeFoodItem).total_macros}
                  showSummary={false}
                />
              </div>
            )}
          </div>
        )}

        {/* Meal Category Switcher */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            {dict.ai?.selectMeal || 'Meal'}
          </label>
          <div className="grid grid-cols-4 gap-2">
            {(['meal_breakfast', 'meal_lunch', 'meal_dinner', 'meal_snack'] as MealType[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMealType(m)}
                className={`py-2 px-1 text-xs font-semibold rounded-xl border transition-all min-h-[44px] ${
                  mealType === m
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-400 shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-900/90 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {dict.dashboard.meals[m.replace('meal_', '') as keyof typeof dict.dashboard.meals]}
              </button>
            ))}
          </div>
        </div>

        {/* Portion Selector & Stepper */}
        <div className="grid grid-cols-2 gap-3">
          {/* Portion Unit */}
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
              {dict.portionModal.unitLabel}
            </label>
            <select
              value={selectedPortionName}
              onChange={(e) => {
                setSelectedPortionName(e.target.value);
                if (e.target.value === 'g' && quantity === 1) {
                  setQuantity(100);
                }
              }}
              className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 min-h-[44px]"
            >
              {availablePortions.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name} ({p.equivalent_weight_g}g) {p.tag === 'Generic' ? '(Fallback)' : p.tag ? `(${p.tag})` : ''}
                </option>
              ))}
              <option value="g">{dict.portionModal.customGrams}</option>
            </select>
          </div>

          {/* Quantity Stepper */}
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
              {dict.portionModal.quantityLabel}
            </label>
            <div className="flex items-center bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 min-h-[44px]">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(selectedPortionName === 'g' ? 1 : 0.5, quantity - (selectedPortionName === 'g' ? 10 : 0.5)))}
                aria-label="Decrease quantity"
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-bold transition-colors active:scale-95 min-w-[44px] min-h-[44px]"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="number"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(0.1, parseFloat(e.target.value) || 1))}
                className="w-full text-center bg-transparent font-bold text-slate-900 dark:text-white text-base focus:outline-none min-h-[44px]"
              />
              <button
                type="button"
                onClick={() => setQuantity(quantity + (selectedPortionName === 'g' ? 10 : 0.5))}
                aria-label="Increase quantity"
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-bold transition-colors active:scale-95 min-w-[44px] min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Calculated Nutrition Summary Card */}
        <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm dark:shadow-lg space-y-3">
          <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2.5">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">{dict.portionModal.calculatedMacros}</span>
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">~{Math.round(weightGrams)}g</span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="p-2 rounded-xl bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 shadow-xs">
              <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">{dict.dashboard.calories}</div>
              <div className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{calculated.calories}</div>
            </div>
            <div className="p-2 rounded-xl bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 shadow-xs">
              <div className="text-[10px] text-rose-600 dark:text-rose-400 uppercase tracking-wider">{dict.dashboard.protein}</div>
              <div className="text-sm font-bold text-rose-600 dark:text-rose-400 font-mono mt-0.5">{calculated.protein}g</div>
            </div>
            <div className="p-2 rounded-xl bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 shadow-xs">
              <div className="text-[10px] text-amber-600 dark:text-amber-400 uppercase tracking-wider">{dict.dashboard.carbs}</div>
              <div className="text-sm font-bold text-amber-600 dark:text-amber-400 font-mono mt-0.5">{calculated.carbs}g</div>
            </div>
            <div className="p-2 rounded-xl bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 shadow-xs">
              <div className="text-[10px] text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">{dict.dashboard.fats}</div>
              <div className="text-sm font-bold text-cyan-600 dark:text-cyan-400 font-mono mt-0.5">{calculated.fats}g</div>
            </div>
          </div>
        </div>

        {/* Past Date Warning Banner (Approach A) */}
        {isPastDate && (
          <div
            data-testid="banner-past-date-warning"
            className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2.5 animate-in fade-in duration-200"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-xs text-amber-200 font-medium">
                {foodCountOnDate > 0
                  ? (dict.portionModal.pastDateWarningWithCount || 'Logging to past date: {{date}} ({{count}} foods already logged)')
                      .replace('{{date}}', modalDate)
                      .replace('{{count}}', String(foodCountOnDate))
                  : (dict.portionModal.pastDateWarning || 'Logging to past date: {{date}}')
                      .replace('{{date}}', modalDate)}
              </span>
            </div>
            <button
              type="button"
              id="btn-switch-to-today"
              data-testid="btn-switch-to-today"
              onClick={() => {
                setModalDate(todayStr);
                setSelectedDate(todayStr);
              }}
              className="px-2.5 py-1 text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg shrink-0 shadow-sm transition-all active:scale-95 min-h-[36px] flex items-center justify-center cursor-pointer"
            >
              {dict.portionModal.switchToToday || 'Switch to Today'}
            </button>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleLog}
          id="btn-log-item"
          data-testid="btn-log-item"
          className={`w-full py-3.5 px-4 active:scale-[0.99] font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-all min-h-[48px] ${
            isPastDate
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-950/40'
              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-950/50'
          }`}
        >
          <Check className="w-5 h-5" />
          <span>
            {isPastDate
              ? (dict.portionModal.logToPastDate || 'Log to {{date}}').replace('{{date}}', modalDate)
              : dict.portionModal.logAction}
          </span>
        </button>
      </div>
    </BottomSheet>
  );
};
