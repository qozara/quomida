import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext.js';
import {
  type FoodItem,
  type MealType,
  validateMacroAlignment
} from '@quomida/domain-core';
import { dictionaries } from '@quomida/i18n-locales';
import { ArrowLeft, Sparkles, AlertCircle, PlusCircle, X, Check, Coffee, Utensils, Moon, Apple, AlertTriangle } from 'lucide-react';
import { DateSelector } from './DateSelector.js';

export interface IngredientBuilderProps {
  initialIngredient?: FoodItem | null;
  onClose: () => void;
  onBack?: () => void;
  onSave: (
    ingredient: {
      id?: string;
      name: string;
      lang?: 'en' | 'es';
      calories_100g: number;
      protein_100g: number;
      carbs_100g: number;
      fats_100g: number;
    },
    portions?: { name: string; equivalent_weight_g: number }[]
  ) => Promise<void | string>;
  mode?: 'catalog' | 'diary';
  targetMealType?: MealType;
  initialDate?: string;
  onSaveAndLog?: (
    ingredient: {
      id?: string;
      name: string;
      lang?: 'en' | 'es';
      calories_100g: number;
      protein_100g: number;
      carbs_100g: number;
      fats_100g: number;
    },
    portions: { name: string; equivalent_weight_g: number }[] | undefined,
    mealType: MealType,
    date?: string
  ) => Promise<void>;
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

const getMealTitle = (meal: MealType, dict: any) => {
  switch (meal) {
    case 'meal_breakfast':
      return dict?.dashboard?.meals?.breakfast || 'Breakfast';
    case 'meal_lunch':
      return dict?.dashboard?.meals?.lunch || 'Lunch';
    case 'meal_dinner':
      return dict?.dashboard?.meals?.dinner || 'Dinner';
    case 'meal_snack':
      return dict?.dashboard?.meals?.snack || 'Snack';
  }
};

export const IngredientBuilder: React.FC<IngredientBuilderProps> = ({
  initialIngredient,
  onClose,
  onBack,
  onSave,
  mode = 'catalog',
  targetMealType,
  initialDate,
  onSaveAndLog
}) => {
  const { t, selectedDate, setSelectedDate, dailyLogs } = useApp();
  const dict = t || dictionaries.en;

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [modalDate, setModalDate] = useState<string>(initialDate || selectedDate || todayStr);

  const isPastDate = modalDate < todayStr;
  const logsOnModalDate = useMemo(() => {
    return (dailyLogs || []).filter((l) => l.date === modalDate);
  }, [dailyLogs, modalDate]);
  const foodCountOnDate = logsOnModalDate.length;

  const [selectedMeal, setSelectedMeal] = useState<MealType>(() => targetMealType || 'meal_lunch');
  const [name, setName] = useState(() => initialIngredient?.name || '');
  const [calories, setCalories] = useState(() =>
    initialIngredient?.calories_100g !== undefined ? String(initialIngredient.calories_100g) : ''
  );
  const [protein, setProtein] = useState(() =>
    initialIngredient?.protein_100g !== undefined ? String(initialIngredient.protein_100g) : ''
  );
  const [carbs, setCarbs] = useState(() =>
    initialIngredient?.carbs_100g !== undefined ? String(initialIngredient.carbs_100g) : ''
  );
  const [fats, setFats] = useState(() =>
    initialIngredient?.fats_100g !== undefined ? String(initialIngredient.fats_100g) : ''
  );

  const [portions, setPortions] = useState<{ name: string; equivalent_weight_g: number }[]>(() => {
    const itemPortions = (initialIngredient as any)?.portions as
      | Array<{ name: string; equivalent_weight_g: number }>
      | undefined;
    return itemPortions ? itemPortions.map((p) => ({ name: p.name, equivalent_weight_g: p.equivalent_weight_g })) : [];
  });

  const [portionName, setPortionName] = useState('');
  const [portionWeight, setPortionWeight] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (targetMealType) {
      setSelectedMeal(targetMealType);
    }
  }, [targetMealType]);

  useEffect(() => {
    if (initialIngredient) {
      setName(initialIngredient.name || '');
      setCalories(initialIngredient.calories_100g !== undefined ? String(initialIngredient.calories_100g) : '');
      setProtein(initialIngredient.protein_100g !== undefined ? String(initialIngredient.protein_100g) : '');
      setCarbs(initialIngredient.carbs_100g !== undefined ? String(initialIngredient.carbs_100g) : '');
      setFats(initialIngredient.fats_100g !== undefined ? String(initialIngredient.fats_100g) : '');
      const itemPortions = (initialIngredient as any)?.portions as
        | Array<{ name: string; equivalent_weight_g: number }>
        | undefined;
      setPortions(itemPortions ? itemPortions.map((p) => ({ name: p.name, equivalent_weight_g: p.equivalent_weight_g })) : []);
    }
  }, [initialIngredient]);

  const handleAddPortion = () => {
    if (portionName.trim() && portionWeight.trim()) {
      const parsedWeight = parseFloat(portionWeight);
      if (!isNaN(parsedWeight) && parsedWeight > 0) {
        setPortions([...portions, { name: portionName.trim(), equivalent_weight_g: parsedWeight }]);
        setPortionName('');
        setPortionWeight('');
      }
    }
  };

  const handleRemovePortion = (index: number) => {
    setPortions(portions.filter((_, i) => i !== index));
  };

  const handlePerformSave = async (e?: React.FormEvent, andLog = false) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    if (!name.trim() || !calories.trim()) return;

    const calNum = parseFloat(calories) || 0;
    const pNum = parseFloat(protein) || 0;
    const cNum = parseFloat(carbs) || 0;
    const fNum = parseFloat(fats) || 0;

    const validation = validateMacroAlignment(calNum, pNum, cNum, fNum);
    if (!validation.valid) {
      setErrorMsg(validation.reason || 'Invalid macro values');
      return;
    }

    const finalPortions = [...portions];
    if (portionName.trim() && portionWeight.trim() && !isNaN(parseFloat(portionWeight))) {
      finalPortions.push({
        name: portionName.trim(),
        equivalent_weight_g: parseFloat(portionWeight)
      });
    }

    const ingredientData = {
      id: initialIngredient?.id || undefined,
      name: name.trim(),
      lang: 'es' as const,
      calories_100g: calNum,
      protein_100g: pNum,
      carbs_100g: cNum,
      fats_100g: fNum
    };

    setIsSaving(true);
    try {
      if (andLog && onSaveAndLog) {
        await onSaveAndLog(ingredientData, finalPortions, selectedMeal, modalDate);
      } else {
        await onSave(ingredientData, finalPortions);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save food');
    } finally {
      setIsSaving(false);
    }
  };

  const modalNode = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name || (initialIngredient ? (dict.catalog?.editCustomIngredient || 'Edit Single Food') : (dict.catalog?.newCustomIngredient || 'New Single Food'))}
      className="fixed inset-0 z-[60] flex flex-col bg-slate-950 text-slate-100 animate-slide-in-right slide-in-from-right overflow-y-auto"
    >
      {/* Top Sticky Navigation Bar with Back Button */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-md shrink-0">
        <button
          id="btn-close-ingredient-builder"
          data-testid="btn-back-ingredient-builder"
          onClick={onBack || onClose}
          aria-label="Back"
          className="min-w-[44px] min-h-[44px] p-2 -ml-2 rounded-full hover:bg-slate-800/80 text-slate-300 hover:text-white transition-colors flex items-center justify-center active:scale-95"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center flex-1 mx-2 min-w-0">
          <div className="flex items-center justify-center gap-1.5 text-emerald-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {initialIngredient ? (dict.catalog?.edit || 'Edit') : (dict.catalog?.newFood || 'New')}
            </span>
          </div>
          <h2 id="ingredient-builder-title" className="text-sm font-semibold text-white truncate max-w-[200px] sm:max-w-xs mx-auto">
            {name || (initialIngredient
              ? dict.catalog?.editCustomIngredient || 'Edit Single Food (100g base)'
              : dict.catalog?.newCustomIngredient || 'New Single Food (100g base)')}
          </h2>
        </div>
        <div className="w-[44px]" aria-hidden="true" />
      </header>

      {/* Main Content Form Container */}
      <div className="max-w-lg mx-auto w-full p-4 sm:p-6 space-y-5 flex-1">
        {/* In Diary Mode: Date Selector & Meal Type Switcher */}
        {mode === 'diary' && (
          <div className="space-y-3 pb-3 border-b border-slate-800/80">
            <div className="flex justify-center pt-1">
              <DateSelector
                value={modalDate}
                onChange={(d) => {
                  setModalDate(d);
                  setSelectedDate(d);
                }}
              />
            </div>

            {isPastDate && (
              <div
                data-testid="banner-past-date-warning"
                className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2.5 animate-in fade-in duration-200"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs text-amber-200 font-medium">
                    {foodCountOnDate > 0
                      ? (dict.portionModal?.pastDateWarningWithCount || 'Logging to past date: {{date}} ({{count}} foods already logged)')
                          .replace('{{date}}', modalDate)
                          .replace('{{count}}', String(foodCountOnDate))
                      : (dict.portionModal?.pastDateWarning || 'Logging to past date: {{date}}')
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
                  {dict.portionModal?.switchToToday || 'Switch to Today'}
                </button>
              </div>
            )}

            <div className="space-y-1.5 pt-1">
              <span className="text-xs font-semibold text-slate-400">
                {dict.ai?.selectMeal || 'Meal Time'}
              </span>
              <div className="grid grid-cols-4 gap-2">
                {mealOptions.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = selectedMeal === opt.id;
                  const title = getMealTitle(opt.id, dict);

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedMeal(opt.id)}
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
          </div>
        )}

        {errorMsg && (
          <div className="p-3 bg-rose-950/80 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={(e) => handlePerformSave(e, false)} className="space-y-4">
          {/* Food Name */}
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1">
              Food Name
            </label>
            <input
              type="text"
              placeholder="e.g. Milanesa de soya casera"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 min-h-[44px]"
            />
          </div>

          {/* Macros (per 100g) */}
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1.5">
              Macros (per 100g base)
            </label>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1 text-center font-medium">Calories</label>
                <input
                  type="number"
                  placeholder="kcal"
                  step="any"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 text-center font-bold min-h-[44px]"
                />
              </div>
              <div>
                <label className="text-[10px] text-rose-400 block mb-1 text-center font-medium">Protein (g)</label>
                <input
                  type="number"
                  placeholder="g"
                  step="any"
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500 text-center font-bold min-h-[44px]"
                />
              </div>
              <div>
                <label className="text-[10px] text-amber-400 block mb-1 text-center font-medium">Carbs (g)</label>
                <input
                  type="number"
                  placeholder="g"
                  step="any"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 text-center font-bold min-h-[44px]"
                />
              </div>
              <div>
                <label className="text-[10px] text-cyan-400 block mb-1 text-center font-medium">Fats (g)</label>
                <input
                  type="number"
                  placeholder="g"
                  step="any"
                  value={fats}
                  onChange={(e) => setFats(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 text-center font-bold min-h-[44px]"
                />
              </div>
            </div>
          </div>

          {/* Custom Portions (Optional) */}
          <div className="pt-2 border-t border-slate-800/80">
            <label className="text-xs text-slate-400 font-semibold mb-2 block">
              Custom Portions (Optional)
            </label>

            {portions.length > 0 && (
              <div className="space-y-2 mb-3 max-h-36 overflow-y-auto">
                {portions.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-2 px-3"
                  >
                    <span className="text-sm font-medium text-white">{p.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 font-mono">{p.equivalent_weight_g}g</span>
                      <button
                        type="button"
                        onClick={() => handleRemovePortion(i)}
                        aria-label={`Remove portion ${p.name}`}
                        className="text-rose-400 hover:text-rose-300 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-rose-950/30 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="E.g., Slice, Cup, Tbsp"
                value={portionName}
                onChange={(e) => setPortionName(e.target.value)}
                className="flex-[2] bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 min-h-[44px]"
              />
              <input
                type="number"
                placeholder="Grams"
                step="any"
                value={portionWeight}
                onChange={(e) => setPortionWeight(e.target.value)}
                className="flex-[1] bg-slate-900 border border-slate-700 rounded-xl px-2 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 text-center min-h-[44px]"
              />
              <button
                type="button"
                onClick={handleAddPortion}
                disabled={!portionName.trim() || !portionWeight.trim()}
                aria-label="Add custom portion"
                className="px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-emerald-400 font-bold rounded-xl flex items-center justify-center min-h-[44px] min-w-[44px] transition-colors"
              >
                <PlusCircle className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          {mode === 'diary' ? (
            <div className="flex flex-col sm:flex-row gap-2 pt-3">
              <button
                type="button"
                id="btn-save-and-log-ingredient"
                data-testid="btn-save-and-log-ingredient"
                disabled={isSaving}
                onClick={(e) => handlePerformSave(e, true)}
                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-sm rounded-xl shadow-md min-h-[44px] transition-colors flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>
                  {isSaving
                    ? (dict.recipes?.saving || 'Saving...')
                    : (dict.catalog?.saveAndLog || 'Save & Log to {{meal}}').replace('{{meal}}', getMealTitle(selectedMeal, dict))}
                </span>
              </button>
              <button
                type="button"
                id="btn-save-catalog-ingredient"
                data-testid="btn-save-catalog-ingredient"
                disabled={isSaving}
                onClick={(e) => handlePerformSave(e, false)}
                className="py-3 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-emerald-400 hover:text-emerald-300 font-semibold text-xs rounded-xl transition-colors min-h-[44px] border border-slate-700"
              >
                {dict.catalog?.saveCatalogOnly || 'Save to Catalog only'}
              </button>
              <button
                type="button"
                onClick={onBack || onClose}
                disabled={isSaving}
                className="py-3 px-3 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white font-semibold text-xs rounded-xl transition-colors min-h-[44px]"
              >
                {dict.recipes?.cancel || 'Cancel'}
              </button>
            </div>
          ) : (
            <div className="flex gap-3 pt-3">
              <button
                type="submit"
                id="btn-save-ingredient"
                data-testid="btn-save-ingredient"
                disabled={isSaving}
                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md min-h-[44px] transition-colors"
              >
                {isSaving ? (dict.recipes?.saving || 'Saving...') : ((dict.recipes as any)?.save || dict.recipes?.saveRecipe || 'Save')}
              </button>
              <button
                type="button"
                onClick={onBack || onClose}
                disabled={isSaving}
                className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-semibold text-sm rounded-xl transition-colors min-h-[44px]"
              >
                {dict.recipes?.cancel || 'Cancel'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalNode, document.body);
  }

  return modalNode;
};
