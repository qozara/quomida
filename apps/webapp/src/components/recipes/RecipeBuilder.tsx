import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext.js';
import {
  type FoodItem,
  type RecipeComponent,
  type Recipe,
  type Portion,
  type MealType,
  RecipeManager,
  CatalogSearchManager,
  convertPortionToGrams
} from '@quomida/domain-core';
import { dictionaries } from '@quomida/i18n-locales';
import { RemoteCatalogService } from '../../services/RemoteCatalogService.js';
import { RecipeComponentList } from './RecipeComponentList.js';
import { DateSelector } from '../DateSelector.js';
import { X, Search, Plus, AlertCircle, Sparkles, ChefHat, Scale, ArrowLeft, Check, Coffee, Utensils, Moon, Apple, AlertTriangle } from 'lucide-react';

export interface RecipeBuilderProps {
  onClose: () => void;
  onBack?: () => void;
  onSave: (recipe: Recipe, portions?: { name: string; equivalent_weight_g: number }[]) => Promise<void | string>;
  initialRecipe?: any;
  mode?: 'catalog' | 'diary';
  targetMealType?: MealType;
  initialDate?: string;
  onSaveAndLog?: (
    recipe: Recipe,
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

export const RecipeBuilder: React.FC<RecipeBuilderProps> = ({
  onClose,
  onBack,
  onSave,
  initialRecipe,
  mode = 'catalog',
  targetMealType,
  initialDate,
  onSaveAndLog
}) => {
  const { ingredients = [], recipeFoods = [], db, t, selectedDate, setSelectedDate, dailyLogs } = useApp();
  const dict = t || dictionaries.en;
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [modalDate, setModalDate] = useState<string>(initialDate || selectedDate || todayStr);

  const isPastDate = modalDate < todayStr;
  const logsOnModalDate = useMemo(() => {
    return (dailyLogs || []).filter((l) => l.date === modalDate);
  }, [dailyLogs, modalDate]);
  const foodCountOnDate = logsOnModalDate.length;

  const [recipeManager] = useState(() => new RecipeManager());
  const [searchManager] = useState(() => new CatalogSearchManager());
  const [remoteService] = useState(() => RemoteCatalogService.getInstance());

  const [selectedMeal, setSelectedMeal] = useState<MealType>(() => targetMealType || 'meal_lunch');

  const initialComponents = useMemo(() => {
    if (!initialRecipe) return [];
    return initialRecipe.recipe?.ingredients || initialRecipe.ingredients || [];
  }, [initialRecipe]);

  // Form State
  const [recipeName, setRecipeName] = useState(() => initialRecipe?.name || '');
  const [components, setComponents] = useState<RecipeComponent[]>(initialComponents);
  const [rawWeightSum, setRawWeightSum] = useState<number>(0);
  const [cookedWeight, setCookedWeight] = useState<string>(() => {
    if (initialRecipe?.cooked_weight_g) return String(initialRecipe.cooked_weight_g);
    return '';
  });
  const [isCookedWeightManual, setIsCookedWeightManual] = useState(() => {
    return Boolean(initialRecipe?.cooked_weight_g && initialRecipe.cooked_weight_g !== initialRecipe.raw_weight_g);
  });
  const [portions, setPortions] = useState<{ name: string; equivalent_weight_g: number }[]>(() => {
    return initialRecipe?.portions || [];
  });
  const [servingsCount, setServingsCount] = useState<number>(4);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Component Search & Picker State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoodItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [componentPortions, setComponentPortions] = useState<Portion[]>([]);
  const [chosenPortionName, setChosenPortionName] = useState<string>('g');
  const [componentQuantity, setComponentQuantity] = useState<number>(100);

  useEffect(() => {
    if (targetMealType) {
      setSelectedMeal(targetMealType);
    }
  }, [targetMealType]);

  useEffect(() => {
    if (initialRecipe) {
      setRecipeName(initialRecipe.name || '');
      const comps = initialRecipe.recipe?.ingredients || initialRecipe.ingredients || [];
      setComponents(comps);
      if (initialRecipe.cooked_weight_g) {
        setCookedWeight(String(initialRecipe.cooked_weight_g));
        setIsCookedWeightManual(Boolean(initialRecipe.cooked_weight_g !== initialRecipe.raw_weight_g));
      }
      if (initialRecipe.portions) {
        setPortions(initialRecipe.portions);
      }
    }
  }, [initialRecipe]);

  // Update raw weight sum and auto-cooked weight when components change
  useEffect(() => {
    const rawSum = components.reduce((sum, c) => sum + (c.weight_g || 0), 0);
    setRawWeightSum(rawSum);
    if (!isCookedWeightManual) {
      setCookedWeight(rawSum > 0 ? String(Math.round(rawSum)) : '');
    }
  }, [components, isCookedWeightManual]);

  // Debounced search for constituent foods
  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    let active = true;
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchManager.search({
          query,
          customIngredients: ingredients,
          customRecipes: recipeFoods,
          kinds: ['ingredient', 'recipe'],
          limit: 20
        }, remoteService);
        if (active) {
          setSearchResults(res.items);
        }
      } catch (err) {
        console.error('Failed to search constituent foods:', err);
      } finally {
        if (active) setIsSearching(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery, ingredients, recipeFoods, searchManager, remoteService]);

  // When a food is selected from search, load its portions
  const handleSelectFood = async (food: FoodItem) => {
    setSelectedFood(food);
    setSearchQuery('');
    setSearchResults([]);
    setChosenPortionName('g');
    setComponentQuantity(100);

    if (db) {
      try {
        const docs = await db.portions.find({ selector: { base_food_id: food.id } }).exec();
        const pts = docs.map((d: any) => d.toJSON ? d.toJSON() : d);
        setComponentPortions(pts);
        if (pts.length > 0) {
          setChosenPortionName(pts[0].name);
          setComponentQuantity(1);
        }
      } catch {
        setComponentPortions([]);
      }
    }
  };

  // Add component to recipe
  const handleAddComponent = () => {
    if (!selectedFood) return;
    const weightGrams = convertPortionToGrams(componentQuantity, chosenPortionName, componentPortions);
    if (weightGrams <= 0) return;

    const comp = recipeManager.buildComponent(selectedFood, weightGrams, {
      quantity: componentQuantity,
      portionName: chosenPortionName
    });
    setComponents(prev => [...prev, comp]);
    setSelectedFood(null);
  };

  const handleRemoveComponent = (index: number) => {
    setComponents(prev => prev.filter((_, i) => i !== index));
  };

  // Yield Factor calculation
  const numericCookedWeight = parseFloat(cookedWeight) || rawWeightSum;
  const yieldFactor = rawWeightSum > 0 ? numericCookedWeight / rawWeightSum : 1.0;

  // Live Nutrition Preview
  const nutritionPreview = useMemo(() => {
    if (components.length === 0) {
      return {
        raw_weight_g: 0,
        cooked_weight_g: 0,
        yield_factor: 1,
        total_macros: { calories: 0, protein: 0, carbs: 0, fats: 0 },
        density: { calories_100g: 0, protein_100g: 0, carbs_100g: 0, fats_100g: 0 },
        contributions: []
      };
    }
    return recipeManager.computeNutrition({
      id: 'preview',
      name: 'preview',
      ingredients: components,
      yield_factor: yieldFactor
    });
  }, [components, yieldFactor, recipeManager]);

  // Split into equal servings helper
  const handleSplitServings = () => {
    if (servingsCount <= 0 || numericCookedWeight <= 0) return;
    const servingWeight = Math.round(numericCookedWeight / servingsCount);
    const existing = portions.filter(p => !p.name.includes(dict.recipes.servingName));
    setPortions([
      ...existing,
      {
        name: dict.recipes.servingName,
        equivalent_weight_g: servingWeight
      }
    ]);
  };

  const handleRemovePortion = (index: number) => {
    setPortions(prev => prev.filter((_, i) => i !== index));
  };

  // Save recipe
  const handlePerformSave = async (e?: React.FormEvent, andLog = false) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    const trimmedName = recipeName.trim();
    if (!trimmedName) {
      setErrorMsg('Recipe name is required');
      return;
    }

    if (components.length === 0) {
      setErrorMsg('Add at least one constituent food');
      return;
    }

    if (numericCookedWeight <= 0) {
      setErrorMsg('Cooked weight must be greater than zero');
      return;
    }

    setIsSaving(true);
    try {
      const newRecipe = recipeManager.createRecipe({
        name: trimmedName,
        ingredients: components,
        yield_factor: yieldFactor
      });

      if (initialRecipe && initialRecipe.id) {
        newRecipe.id = initialRecipe.id;
      }

      if (andLog && onSaveAndLog) {
        await onSaveAndLog(newRecipe, portions, selectedMeal, modalDate);
      } else {
        await onSave(newRecipe, portions);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to create recipe');
    } finally {
      setIsSaving(false);
    }
  };

  const modalNode = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={recipeName || dict.recipes.newRecipe}
      className="fixed inset-0 z-[60] flex flex-col bg-slate-950 text-slate-100 animate-slide-in-right slide-in-from-right overflow-y-auto"
    >
      {/* Top Sticky Navigation Bar with Back Button */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-md shrink-0">
        <button
          id="btn-close-recipe-builder"
          data-testid="btn-back-recipe-builder"
          onClick={onBack || onClose}
          aria-label="Back"
          className="min-w-[44px] min-h-[44px] p-2 -ml-2 rounded-full hover:bg-slate-800/80 text-slate-300 hover:text-white transition-colors flex items-center justify-center active:scale-95"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center flex-1 mx-2 min-w-0">
          <div className="flex items-center justify-center gap-1.5 text-purple-400">
            <ChefHat className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {initialRecipe ? (dict.catalog?.edit || 'Edit') : (dict.recipes?.recipeBadge || 'Recipe')}
            </span>
          </div>
          <h2 id="recipe-builder-title" className="text-sm font-semibold text-white truncate max-w-[200px] sm:max-w-xs mx-auto">
            {dict.recipes.newRecipe}
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
                        ? 'bg-purple-600 text-white border-purple-400 font-bold shadow-md'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-700/80'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
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
          
          {/* Recipe Name */}
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1">
              {dict.recipes.recipeName}
            </label>
            <input
              type="text"
              placeholder={dict.recipes.recipeNamePlaceholder}
              value={recipeName}
              onChange={(e) => setRecipeName(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 min-h-[44px]"
            />
          </div>

          {/* Constituent Foods Search & Picker */}
          <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800/80 space-y-3">
            <label className="text-xs font-bold text-purple-400 uppercase tracking-wider block">
              {dict.recipes.componentsTitle}
            </label>

            {!selectedFood ? (
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder={dict.recipes.searchFoodPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 min-h-[44px]"
                />
                {isSearching && (
                  <div className="absolute right-3 top-3 text-[11px] text-slate-400 animate-pulse">
                    Searching...
                  </div>
                )}

                {/* Dropdown Results */}
                {searchResults.length > 0 && (
                  <div className="absolute z-30 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-slate-900 border border-slate-800 rounded-xl shadow-2xl divide-y divide-slate-800/60">
                    {searchResults.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => handleSelectFood(f)}
                        className="w-full p-2.5 text-left hover:bg-slate-800/80 transition-colors flex items-center justify-between min-h-[44px]"
                      >
                        <div>
                          <div className="text-xs font-semibold text-white">{f.name}</div>
                          <div className="text-[10px] text-slate-400">
                            {f.calories_100g} kcal/100g • P: {f.protein_100g}g | C: {f.carbs_100g}g | F: {f.fats_100g}g
                          </div>
                        </div>
                        <Plus className="w-4 h-4 text-purple-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Selected Food Configuration Box */
              <div className="bg-slate-900/90 p-3 rounded-xl border border-purple-500/30 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-white">{selectedFood.name}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedFood(null)}
                    aria-label="Cancel component selection"
                    className="text-slate-400 hover:text-white min-h-[32px] min-w-[32px] flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    value={componentQuantity}
                    onChange={(e) => setComponentQuantity(parseFloat(e.target.value) || 0)}
                    className="w-20 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white text-center font-bold min-h-[44px]"
                  />
                  <select
                    value={chosenPortionName}
                    onChange={(e) => setChosenPortionName(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white min-h-[44px]"
                  >
                    <option value="g">Grams (g)</option>
                    {componentPortions.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name} ({p.equivalent_weight_g}g)
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddComponent}
                    className="px-3 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl flex items-center gap-1 transition-colors min-h-[44px]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{dict.recipes.addComponent}</span>
                  </button>
                </div>
              </div>
            )}

            {/* List of Constituent Foods Added */}
            <div className="space-y-2 pt-1">
              {components.map((comp, idx) => (
                <div
                  key={`${comp.food_id}-${idx}`}
                  className="flex items-center justify-between bg-slate-900/60 border border-slate-800/80 p-2.5 rounded-xl text-xs"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-semibold text-white truncate">{comp.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {comp.weight_g}g ({Math.round((comp.weight_g * comp.calories_100g) / 100)} kcal | P: {Math.round(((comp.weight_g * comp.protein_100g) / 100) * 10) / 10}g | C: {Math.round(((comp.weight_g * comp.carbs_100g) / 100) * 10) / 10}g | F: {Math.round(((comp.weight_g * comp.fats_100g) / 100) * 10) / 10}g)
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveComponent(idx)}
                    aria-label={`Remove component ${comp.name}`}
                    className="text-rose-400 hover:text-rose-300 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-rose-950/30 transition-colors shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {components.length === 0 && (
                <p className="text-center text-[11px] text-slate-400 py-3 italic">
                  {dict.recipes.noComponents}
                </p>
              )}
            </div>
          </div>

          {/* Weight & Yield Calculation */}
          <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-purple-400" />
                {dict.recipes.yieldFactor}
              </span>
              <span className="text-xs font-mono text-purple-400 font-bold">
                {rawWeightSum}g {dict.recipes.raw}
              </span>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">
                {dict.recipes.cookedWeight}
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  step="any"
                  value={cookedWeight}
                  onChange={(e) => {
                    setCookedWeight(e.target.value);
                    setIsCookedWeightManual(true);
                  }}
                  placeholder="e.g. 800"
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold focus:outline-none focus:border-purple-500 min-h-[44px]"
                />
                <span className="text-xs text-slate-400">g</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Yield factor: <span className="font-mono text-slate-300 font-semibold">{yieldFactor.toFixed(2)}x</span>
                {yieldFactor < 1 && ' (water evaporation/reduction)'}
                {yieldFactor > 1 && ' (water absorption/expansion)'}
              </p>
            </div>
          </div>

          {/* Live Nutrition Density Preview */}
          <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800/80 space-y-2">
            <span className="text-xs font-bold text-slate-300 block">
              {dict.recipes.nutritionPer100g}
            </span>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-slate-900 p-1.5 rounded-lg">
                <div className="text-[10px] text-slate-400">kcal</div>
                <div className="text-xs font-bold text-white">{Math.round(nutritionPreview.density.calories_100g)}</div>
              </div>
              <div className="bg-slate-900 p-1.5 rounded-lg">
                <div className="text-[10px] text-rose-400">P</div>
                <div className="text-xs font-bold text-white">{Math.round(nutritionPreview.density.protein_100g * 10) / 10}g</div>
              </div>
              <div className="bg-slate-900 p-1.5 rounded-lg">
                <div className="text-[10px] text-amber-400">C</div>
                <div className="text-xs font-bold text-white">{Math.round(nutritionPreview.density.carbs_100g * 10) / 10}g</div>
              </div>
              <div className="bg-slate-900 p-1.5 rounded-lg">
                <div className="text-[10px] text-cyan-400">F</div>
                <div className="text-xs font-bold text-white">{Math.round(nutritionPreview.density.fats_100g * 10) / 10}g</div>
              </div>
            </div>

            <div className="border-t border-slate-800/80 pt-2 flex justify-between items-center text-xs text-slate-400">
              <span>{dict.recipes.totalNutrition}:</span>
              <span className="font-bold text-white">
                {nutritionPreview.total_macros.calories} kcal (P: {nutritionPreview.total_macros.protein}g | C: {nutritionPreview.total_macros.carbs}g | F: {nutritionPreview.total_macros.fats}g)
              </span>
            </div>
          </div>

          {/* Servings Generator */}
          <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800/80 space-y-2">
            <span className="text-xs font-bold text-slate-400 block">{dict.recipes.splitServings}</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={servingsCount}
                onChange={(e) => setServingsCount(parseInt(e.target.value) || 1)}
                className="w-20 bg-slate-900 border border-slate-800 rounded-xl px-2 py-2 text-xs text-white text-center font-bold min-h-[44px]"
              />
              <span className="text-xs text-slate-400">{dict.recipes.servingsCount}</span>
              <button
                type="button"
                onClick={handleSplitServings}
                className="ml-auto px-3 py-2 bg-slate-800 hover:bg-slate-700 text-purple-400 font-bold text-xs rounded-xl transition-colors min-h-[44px]"
              >
                {dict.recipes.applyServings}
              </button>
            </div>

            {portions.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {portions.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-slate-900 p-2 rounded-lg text-xs">
                    <span className="font-semibold text-white">{p.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">{p.equivalent_weight_g}g</span>
                      <button
                        type="button"
                        onClick={() => handleRemovePortion(idx)}
                        className="text-rose-400 hover:text-rose-300 min-h-[32px] min-w-[32px] flex items-center justify-center"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {mode === 'diary' ? (
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                id="btn-save-and-log-recipe"
                data-testid="btn-save-and-log-recipe"
                disabled={isSaving || components.length === 0}
                onClick={(e) => handlePerformSave(e, true)}
                className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg transition-all min-h-[44px] flex items-center justify-center gap-2"
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
                id="btn-save-catalog-recipe"
                data-testid="btn-save-catalog-recipe"
                disabled={isSaving || components.length === 0}
                onClick={(e) => handlePerformSave(e, false)}
                className="py-3 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-purple-400 hover:text-purple-300 font-semibold text-xs rounded-xl transition-colors min-h-[44px] border border-slate-700"
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
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                id="btn-save-recipe"
                data-testid="btn-save-catalog-ai"
                disabled={isSaving || components.length === 0}
                className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg transition-all min-h-[44px] flex items-center justify-center gap-2"
              >
                <ChefHat className="w-4 h-4" />
                <span>
                  {isSaving
                    ? (dict.recipes?.saving || 'Saving...')
                    : (dict.ai?.saveRecipeToCatalog || dict.recipes.saveRecipe)}
                </span>
              </button>
              <button
                type="button"
                onClick={onBack || onClose}
                className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-semibold text-sm rounded-xl transition-colors min-h-[44px]"
              >
                {dict.recipes.cancel}
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
