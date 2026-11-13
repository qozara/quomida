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
  const { t, selectedDate, setSelectedDate, dailyLogs, locale, db } = useApp();
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

  // Nutrition Basis Mode: '100g' or 'portion'
  const [basisMode, setBasisMode] = useState<'100g' | 'portion'>('100g');
  const [basisWeight, setBasisWeight] = useState<string>('100');
  const [basisPortionName, setBasisPortionName] = useState<string>('');

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

  // Load initial ingredient and query its portions from RxDB if needed (fixes Bug 1)
  useEffect(() => {
    if (initialIngredient) {
      setName(initialIngredient.name || '');
      setCalories(initialIngredient.calories_100g !== undefined ? String(initialIngredient.calories_100g) : '');
      setProtein(initialIngredient.protein_100g !== undefined ? String(initialIngredient.protein_100g) : '');
      setCarbs(initialIngredient.carbs_100g !== undefined ? String(initialIngredient.carbs_100g) : '');
      setFats(initialIngredient.fats_100g !== undefined ? String(initialIngredient.fats_100g) : '');

      const directPortions = (initialIngredient as any)?.portions as
        | Array<{ name: string; equivalent_weight_g: number }>
        | undefined;

      if (directPortions && directPortions.length > 0) {
        setPortions(directPortions.map((p) => ({ name: p.name, equivalent_weight_g: p.equivalent_weight_g })));
      } else if (db && initialIngredient.id) {
        let isCancelled = false;
        db.portions.find({ selector: { base_food_id: initialIngredient.id } }).exec().then((docs: any[]) => {
          if (!isCancelled && docs && docs.length > 0) {
            setPortions(docs.map((d: any) => ({ name: d.name, equivalent_weight_g: d.equivalent_weight_g })));
          }
        }).catch((err: any) => {
          console.warn('[IngredientBuilder] Failed to load portions for editing ingredient:', err);
        });
        return () => { isCancelled = true; };
      }
    }
  }, [initialIngredient, db]);

  // Handle switching basis mode
  const handleToggleBasisMode = (newMode: '100g' | 'portion') => {
    if (newMode === basisMode) return;
    setBasisMode(newMode);
    if (newMode === '100g') {
      setBasisWeight('100');
    } else {
      if (basisWeight === '100' || !basisWeight) {
        // If there's an existing portion, adopt its values for seamless editing
        if (portions.length > 0) {
          setBasisWeight(String(portions[0].equivalent_weight_g));
          setBasisPortionName(portions[0].name);
        } else {
          setBasisWeight('30');
        }
      }
    }
  };

  // Normalized 100g Preview Calculation
  const normalized100g = useMemo(() => {
    const rawWeight = basisMode === '100g' ? 100 : parseFloat(basisWeight);
    if (!Number.isFinite(rawWeight) || rawWeight <= 0) {
      return null;
    }
    const calNum = parseFloat(calories);
    const pNum = parseFloat(protein);
    const cNum = parseFloat(carbs);
    const fNum = parseFloat(fats);

    const factor = 100 / rawWeight;
    return {
      calories: Number.isFinite(calNum) ? Math.round(calNum * factor * 10) / 10 : 0,
      protein: Number.isFinite(pNum) ? Math.round(pNum * factor * 10) / 10 : 0,
      carbs: Number.isFinite(cNum) ? Math.round(cNum * factor * 10) / 10 : 0,
      fats: Number.isFinite(fNum) ? Math.round(fNum * factor * 10) / 10 : 0
    };
  }, [basisMode, basisWeight, calories, protein, carbs, fats]);

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
    if (!name.trim()) return;

    const rawWeight = basisMode === '100g' ? 100 : parseFloat(basisWeight);
    if (!Number.isFinite(rawWeight) || rawWeight <= 0) {
      setErrorMsg(dict.catalog?.portionWeightPositive || 'Portion weight must be greater than zero');
      return;
    }

    const macroInputs = [calories, protein, carbs, fats];
    const allFilled = macroInputs.every((v) => v.trim() !== '' && Number.isFinite(parseFloat(v)));
    if (!allFilled) {
      setErrorMsg(
        dict.catalog?.ingredientMacrosRequired ||
          'Please fill in calories, protein, carbs and fats (use 0 where none).'
      );
      return;
    }

    const [calInput, pInput, cInput, fInput] = macroInputs.map((v) => parseFloat(v));

    // If inputting per portion, check macro weight against the portion weight
    if (basisMode === 'portion') {
      const totalEnteredMacros = pInput + cInput + fInput;
      if (totalEnteredMacros > rawWeight) {
        const template = dict.catalog?.macroWeightExceedsPortion || 'Total macro weight ({{total}}g) cannot exceed portion weight ({{weight}}g)';
        setErrorMsg(
          template
            .replace('{{total}}', String(Math.round(totalEnteredMacros * 10) / 10))
            .replace('{{weight}}', String(rawWeight))
        );
        return;
      }
    }

    // Convert to canonical 100g values
    const factor = 100 / rawWeight;
    const calNum = Math.round(calInput * factor * 10) / 10;
    const pNum = Math.round(pInput * factor * 10) / 10;
    const cNum = Math.round(cInput * factor * 10) / 10;
    const fNum = Math.round(fInput * factor * 10) / 10;

    const validation = validateMacroAlignment(calNum, pNum, cNum, fNum);
    if (!validation.valid) {
      setErrorMsg(validation.reason || 'Invalid macro values');
      return;
    }

    // Assemble final portions:
    // If basisMode is 'portion', include the primary portion first
    const finalPortions: { name: string; equivalent_weight_g: number }[] = [];
    if (basisMode === 'portion') {
      const primaryName = basisPortionName.trim() || dict.catalog?.defaultPortionName || '1 serving';
      finalPortions.push({
        name: primaryName,
        equivalent_weight_g: Math.round(rawWeight * 10) / 10
      });
    }

    // Append custom portions, filtering out any accidental exact match with the primary portion
    for (const p of portions) {
      const isDuplicateOfPrimary =
        basisMode === 'portion' &&
        p.name.trim().toLowerCase() === (basisPortionName.trim() || dict.catalog?.defaultPortionName || '1 serving').toLowerCase() &&
        Math.abs(p.equivalent_weight_g - rawWeight) < 0.01;
      if (!isDuplicateOfPrimary) {
        finalPortions.push(p);
      }
    }

    // If user filled in the pending portion row, add it as well
    if (portionName.trim() && portionWeight.trim() && !isNaN(parseFloat(portionWeight))) {
      finalPortions.push({
        name: portionName.trim(),
        equivalent_weight_g: parseFloat(portionWeight)
      });
    }

    const appLocale = (locale === 'en' ? 'en' : 'es') as 'en' | 'es';

    const ingredientData = {
      id: initialIngredient?.id || undefined,
      name: name.trim(),
      lang: appLocale,
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
      aria-label={name || (initialIngredient?.id ? (dict.catalog?.editCustomIngredient || 'Edit Single Food') : (dict.catalog?.newCustomIngredient || 'New Single Food'))}
      className="fixed inset-0 z-[60] flex flex-col bg-slate-950 text-slate-100 animate-slide-in-right slide-in-from-right overflow-y-auto"
    >
      {/* Top Sticky Navigation Bar with Back Button */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-md shrink-0">
        <button
          id="btn-close-ingredient-builder"
          data-testid="btn-back-ingredient-builder"
          onClick={onBack || onClose}
          aria-label={dict.date?.back || 'Back'}
          className="min-w-[44px] min-h-[44px] p-2 -ml-2 rounded-full hover:bg-slate-800/80 text-slate-300 hover:text-white transition-colors flex items-center justify-center active:scale-95"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center flex-1 mx-2 min-w-0">
          <div className="flex items-center justify-center gap-1.5 text-emerald-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {initialIngredient?.id ? (dict.catalog?.edit || 'Edit') : (dict.catalog?.newFood || 'New')}
            </span>
          </div>
          <h2 id="ingredient-builder-title" className="text-sm font-semibold text-white truncate max-w-[200px] sm:max-w-xs mx-auto">
            {name || (initialIngredient?.id
              ? dict.catalog?.editCustomIngredient || 'Edit Single Food'
              : dict.catalog?.newCustomIngredient || 'New Single Food')}
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
              {dict.catalog?.foodName || 'Food Name'}
            </label>
            <input
              type="text"
              placeholder={dict.catalog?.foodNamePlaceholder || 'e.g. Milanesa de soya casera'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 min-h-[44px]"
            />
          </div>

          {/* Reference Basis Segmented Toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-400">
                {dict.catalog?.basisLabel || 'Nutritional Info Basis'}
              </label>
            </div>
            <div className="grid grid-cols-2 p-1 bg-slate-900/90 border border-slate-800 rounded-xl">
              <button
                type="button"
                data-testid="btn-basis-100g"
                onClick={() => handleToggleBasisMode('100g')}
                className={`min-h-[38px] rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  basisMode === '100g'
                    ? 'bg-emerald-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>{dict.catalog?.per100g || 'Per 100g'}</span>
              </button>
              <button
                type="button"
                data-testid="btn-basis-portion"
                onClick={() => handleToggleBasisMode('portion')}
                className={`min-h-[38px] rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  basisMode === 'portion'
                    ? 'bg-emerald-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>{dict.catalog?.perPortion || 'Per Portion'}</span>
              </button>
            </div>
          </div>

          {/* When basisMode === 'portion', show Portion Weight & Portion Name Inputs */}
          {basisMode === 'portion' && (
            <div className="p-3.5 bg-slate-900/80 border border-emerald-500/30 rounded-xl space-y-3 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-emerald-400 block mb-1">
                    {dict.catalog?.portionWeightLabel || 'Portion Weight (g)'} *
                  </label>
                  <input
                    type="number"
                    data-testid="input-basis-weight"
                    placeholder="e.g. 30"
                    step="any"
                    min="0.1"
                    value={basisWeight}
                    onChange={(e) => setBasisWeight(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 min-h-[44px] font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    {dict.catalog?.portionNameLabel || 'Portion Name (optional)'}
                  </label>
                  <input
                    type="text"
                    data-testid="input-basis-portion-name"
                    placeholder={dict.catalog?.portionNamePlaceholder || 'e.g. 1 scoop (default: 1 serving)'}
                    value={basisPortionName}
                    onChange={(e) => setBasisPortionName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 min-h-[44px]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Macros (for selected basis) */}
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1.5">
              {dict.catalog?.macrosTitle || 'Macros'} (
              {basisMode === '100g'
                ? 'per 100g'
                : `per ${basisPortionName.trim() ? `${basisPortionName.trim()} · ` : ''}${basisWeight || 0}g`}
              )
            </label>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1 text-center font-medium">
                  {dict.catalog?.caloriesLabel || dict.dashboard?.calories || 'Calories'}
                </label>
                <input
                  type="number"
                  placeholder="kcal"
                  step="any"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  required
                  min="0"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 text-center font-bold min-h-[44px]"
                />
              </div>
              <div>
                <label className="text-[10px] text-rose-400 block mb-1 text-center font-medium">
                  {dict.catalog?.proteinLabel || dict.dashboard?.protein || 'Protein (g)'}
                </label>
                <input
                  type="number"
                  placeholder="g"
                  step="any"
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                  required
                  min="0"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500 text-center font-bold min-h-[44px]"
                />
              </div>
              <div>
                <label className="text-[10px] text-amber-400 block mb-1 text-center font-medium">
                  {dict.catalog?.carbsLabel || dict.dashboard?.carbs || 'Carbs (g)'}
                </label>
                <input
                  type="number"
                  placeholder="g"
                  step="any"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                  required
                  min="0"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 text-center font-bold min-h-[44px]"
                />
              </div>
              <div>
                <label className="text-[10px] text-cyan-400 block mb-1 text-center font-medium">
                  {dict.catalog?.fatsLabel || dict.dashboard?.fats || 'Fats (g)'}
                </label>
                <input
                  type="number"
                  placeholder="g"
                  step="any"
                  value={fats}
                  onChange={(e) => setFats(e.target.value)}
                  required
                  min="0"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 text-center font-bold min-h-[44px]"
                />
              </div>
            </div>

            {/* Live Normalized 100g Preview (Shown when basisMode !== '100g') */}
            {basisMode === 'portion' && normalized100g && (
              <div
                data-testid="preview-normalized-100g"
                className="mt-2.5 p-2 px-3 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center justify-between text-xs text-slate-400 animate-in fade-in"
              >
                <span className="font-semibold text-slate-300 text-[11px]">
                  ⚡ {dict.catalog?.normalized100gPreview || 'Normalized per 100g'}:
                </span>
                <span className="font-mono text-[11px]">
                  <strong className="text-white">{normalized100g.calories} kcal</strong>
                  <span className="text-slate-600"> • </span>
                  <span className="text-rose-400">P: {normalized100g.protein}g</span>
                  <span className="text-slate-600"> | </span>
                  <span className="text-amber-400">C: {normalized100g.carbs}g</span>
                  <span className="text-slate-600"> | </span>
                  <span className="text-cyan-400">F: {normalized100g.fats}g</span>
                </span>
              </div>
            )}
          </div>

          {/* Custom Portions (Optional) */}
          <div className="pt-2 border-t border-slate-800/80">
            <label className="text-xs text-slate-400 font-semibold mb-2 block">
              {dict.catalog?.customPortionsTitle || 'Custom Portions (Optional)'}
            </label>

            {/* If in portion mode, show primary portion row */}
            {basisMode === 'portion' && (
              <div className="mb-2 p-2 px-3 bg-emerald-950/30 border border-emerald-500/40 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-400">
                    ✨ {basisPortionName.trim() || dict.catalog?.defaultPortionName || '1 serving'}
                  </span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {dict.catalog?.primaryPortionBadge || 'Primary portion'}
                  </span>
                </div>
                <span className="text-xs font-mono text-emerald-300 font-bold">
                  {basisWeight || 0}g
                </span>
              </div>
            )}

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
                        aria-label={(dict.catalog?.removePortionAria || 'Remove portion {{name}}').replace('{{name}}', p.name)}
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
                placeholder={dict.catalog?.portionNameColPlaceholder || 'E.g., Slice, Cup, Tbsp'}
                value={portionName}
                onChange={(e) => setPortionName(e.target.value)}
                className="flex-[2] bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 min-h-[44px]"
              />
              <input
                type="number"
                placeholder={dict.catalog?.portionGramsColPlaceholder || 'Grams'}
                step="any"
                value={portionWeight}
                onChange={(e) => setPortionWeight(e.target.value)}
                className="flex-[1] bg-slate-900 border border-slate-700 rounded-xl px-2 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 text-center min-h-[44px]"
              />
              <button
                type="button"
                onClick={handleAddPortion}
                disabled={!portionName.trim() || !portionWeight.trim()}
                aria-label={dict.catalog?.addPortionAria || 'Add custom portion'}
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
