import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.js';
import { dictionaries } from '@quomida/i18n-locales';
import type { BaseIngredient, FoodItem, RecipeFoodItem, MealType, Portion, TaggedPortion } from '@quomida/domain-core';
import { calculateItemMacros, convertPortionToGrams, PortionManager } from '@quomida/domain-core';
import { X, Minus, Plus, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { RecipeComponentList } from './recipes/RecipeComponentList.js';

interface PortionBottomSheetProps {
  ingredient: FoodItem | BaseIngredient | null;
  defaultMealType: MealType;
  onClose: () => void;
}

export const PortionBottomSheet: React.FC<PortionBottomSheetProps> = ({
  ingredient,
  defaultMealType,
  onClose
}) => {
  const { db, logFoodItem, t } = useApp();
  const dict = t || dictionaries.es;
  const [portionManager] = useState(() => new PortionManager());
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedPortionName, setSelectedPortionName] = useState<string>('g');
  const [availablePortions, setAvailablePortions] = useState<TaggedPortion[]>([]);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);

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
    await logFoodItem(ingredient, mealType, quantity, selectedPortionName, availablePortions);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      
      {/* Click outside to dismiss */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Bottom Sheet Container */}
      <div className="relative w-full max-w-md bg-slate-900 border-t border-slate-700/80 rounded-t-3xl p-6 shadow-2xl z-10 space-y-5 animate-in slide-in-from-bottom duration-300">
        
        {/* Top Drag Handle Bar */}
        <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto -mt-2 mb-2" />

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block">{dict.portionModal.title}</span>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white">{ingredient.name}</h2>
              {'kind' in ingredient && ingredient.kind === 'recipe' && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  {dict.recipes?.recipeBadge || 'Recipe'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              100g base: {ingredient.calories_100g} kcal | P: {ingredient.protein_100g}g | C: {ingredient.carbs_100g}g | F: {ingredient.fats_100g}g
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* If Recipe: Ingredients Breakdown Collapsible */}
        {'kind' in ingredient && ingredient.kind === 'recipe' && (
          <div className="bg-slate-950/80 rounded-2xl border border-purple-500/30 overflow-hidden">
            <button
              type="button"
              onClick={() => setIsBreakdownOpen(!isBreakdownOpen)}
              className="w-full p-3 flex items-center justify-between text-left text-xs font-bold text-purple-400 hover:bg-slate-900/50 transition-colors min-h-[44px]"
            >
              <span>{dict.recipes?.breakdownTitle || 'Recipe Ingredients Breakdown'}</span>
              {isBreakdownOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {isBreakdownOpen && (
              <div className="p-3 pt-0 border-t border-slate-800/80">
                <RecipeComponentList components={(ingredient as RecipeFoodItem).recipe?.ingredients || (ingredient as any).ingredients || []} />
              </div>
            )}
          </div>
        )}

        {/* Meal Category Switcher */}
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
            Meal
          </label>
          <div className="grid grid-cols-4 gap-2">
            {(['meal_breakfast', 'meal_lunch', 'meal_dinner', 'meal_snack'] as MealType[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMealType(m)}
                className={`py-2 px-1 text-xs font-semibold rounded-xl border transition-all min-h-[44px] ${
                  mealType === m
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-sm'
                    : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-white'
                }`}
              >
                {dict.dashboard.meals[m.replace('meal_', '') as keyof typeof dict.dashboard.meals]}
              </button>
            ))}
          </div>
        </div>

        {/* Portion Selector & Stepper */}
        <div className="grid grid-cols-2 gap-4">
          
          {/* Portion Unit */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
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
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm font-medium text-white focus:outline-none focus:border-emerald-500"
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
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              {dict.portionModal.quantityLabel}
            </label>
            <div className="flex items-center bg-slate-800 border border-slate-700 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(selectedPortionName === 'g' ? 1 : 0.5, quantity - (selectedPortionName === 'g' ? 10 : 0.5)))}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-700/60 hover:bg-slate-600 text-white font-bold transition-colors active:scale-95 min-w-[44px] min-h-[44px]"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="number"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(0.1, parseFloat(e.target.value) || 1))}
                className="w-full text-center bg-transparent font-bold text-white text-base focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setQuantity(quantity + (selectedPortionName === 'g' ? 10 : 0.5))}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-700/60 hover:bg-slate-600 text-white font-bold transition-colors active:scale-95 min-w-[44px] min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

        </div>

        {/* Calculated Nutrition Summary Card */}
        <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800 space-y-2">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-xs text-slate-400 font-semibold">{dict.portionModal.calculatedMacros}</span>
            <span className="text-sm font-bold text-white">~{Math.round(weightGrams)}g edible</span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center pt-1">
            <div>
              <div className="text-xs text-slate-400">{dict.dashboard.calories}</div>
              <div className="text-base font-extrabold text-emerald-400">{calculated.calories}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">{dict.dashboard.protein}</div>
              <div className="text-sm font-bold text-rose-400">{calculated.protein}g</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">{dict.dashboard.carbs}</div>
              <div className="text-sm font-bold text-amber-400">{calculated.carbs}g</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">{dict.dashboard.fats}</div>
              <div className="text-sm font-bold text-cyan-400">{calculated.fats}g</div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleLog}
          id="btn-log-item"
          className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.99] text-white font-bold rounded-2xl shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all min-h-[44px]"
        >
          <Check className="w-5 h-5" />
          <span>{dict.portionModal.logAction}</span>
        </button>

      </div>
    </div>
  );
};
