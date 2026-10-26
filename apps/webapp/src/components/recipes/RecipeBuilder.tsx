import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext.js';
import {
  type FoodItem,
  type RecipeComponent,
  type Recipe,
  type Portion,
  RecipeManager,
  CatalogSearchManager,
  convertPortionToGrams
} from '@quomida/domain-core';
import { dictionaries } from '@quomida/i18n-locales';
import { RemoteCatalogService } from '../../services/RemoteCatalogService.js';
import { RecipeComponentList } from './RecipeComponentList.js';
import { X, Search, Plus, AlertCircle, Sparkles, ChefHat, Scale, ArrowLeft } from 'lucide-react';

interface RecipeBuilderProps {
  onClose: () => void;
  onBack?: () => void;
  onSave: (recipe: Recipe, portions?: { name: string; equivalent_weight_g: number }[]) => Promise<void>;
  initialRecipe?: any;
}

export const RecipeBuilder: React.FC<RecipeBuilderProps> = ({ onClose, onBack, onSave, initialRecipe }) => {
  const { ingredients = [], recipeFoods = [], db, t } = useApp();
  const dict = t || dictionaries.en;
  const [recipeManager] = useState(() => new RecipeManager());
  const [searchManager] = useState(() => new CatalogSearchManager());
  const [remoteService] = useState(() => RemoteCatalogService.getInstance());

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
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

      await onSave(newRecipe, portions);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to create recipe');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recipe-builder-title"
      className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100 animate-in slide-in-from-right duration-300 ease-out overflow-y-auto"
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

        {errorMsg && (
          <div className="p-3 bg-rose-950/80 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
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
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 min-h-[44px]"
                />

                {/* Autocomplete dropdown */}
                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-800 shadow-2xl z-30">
                    {searchResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectFood(item)}
                        className="w-full p-2.5 text-left hover:bg-slate-800 transition-colors flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-white">{item.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                              item.kind === 'recipe'
                                ? 'bg-purple-950 text-purple-400 border border-purple-800/50'
                                : item.source === 'custom'
                                ? 'bg-amber-950 text-amber-400 border border-amber-800/50'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              {item.kind === 'recipe' ? dict.recipes.recipeBadge : item.source}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">
                            {item.calories_100g} kcal/100g • P: {item.protein_100g}g | C: {item.carbs_100g}g | F: {item.fats_100g}g
                          </div>
                        </div>
                        <Plus className="w-4 h-4 text-purple-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Selected Food Quantity & Portion Configurator */
              <div className="bg-slate-900 p-3 rounded-xl border border-purple-500/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-white">{selectedFood.name}</span>
                    {selectedFood.kind === 'recipe' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-purple-950 text-purple-400 border border-purple-800/50">
                        {dict.recipes.recipeBadge}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFood(null)}
                    className="text-slate-400 hover:text-white p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Portion</label>
                    <select
                      value={chosenPortionName}
                      onChange={(e) => setChosenPortionName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none min-h-[44px]"
                    >
                      <option value="g">Grams (g)</option>
                      {componentPortions.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name} ({p.equivalent_weight_g}g)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Quantity</label>
                    <input
                      type="number"
                      step="any"
                      min="0.1"
                      value={componentQuantity}
                      onChange={(e) => setComponentQuantity(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none min-h-[44px] text-center font-bold"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddComponent}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl transition-colors min-h-[44px] flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{dict.recipes.addComponent}</span>
                </button>
              </div>
            )}

            {/* Added Components List */}
            <RecipeComponentList components={components} onRemove={handleRemoveComponent} />
          </div>

          {/* Weight & Yield Factor Section */}
          <div className="grid grid-cols-3 gap-2 bg-slate-950/80 p-3 rounded-2xl border border-slate-800/80 text-center">
            <div>
              <span className="text-[10px] text-slate-400 block">{dict.recipes.rawWeight}</span>
              <span className="text-sm font-bold text-white">{Math.round(rawWeightSum)}g</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">{dict.recipes.cookedWeight}</span>
              <input
                type="number"
                value={cookedWeight}
                onChange={(e) => {
                  setIsCookedWeightManual(true);
                  setCookedWeight(e.target.value);
                }}
                placeholder="g"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white text-center font-bold min-h-[32px] focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">{dict.recipes.yieldFactor}</span>
              <span className="text-sm font-bold text-purple-400">
                {rawWeightSum > 0 ? yieldFactor.toFixed(2) : '1.00'}x
              </span>
            </div>
          </div>

          {/* Live Nutrition Summary */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-purple-500/30 space-y-3">
            <div>
              <span className="text-[11px] font-bold text-purple-400 block mb-1">
                {dict.recipes.nutritionPer100g}
              </span>
              <div className="grid grid-cols-4 gap-1 text-center">
                <div className="bg-slate-900 p-1.5 rounded-lg">
                  <div className="text-[10px] text-slate-400">kcal</div>
                  <div className="text-xs font-bold text-white">{Math.round(nutritionPreview.density.calories_100g * 10) / 10}</div>
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
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={isSaving || components.length === 0}
              className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg transition-all min-h-[44px] flex items-center justify-center gap-2"
            >
              <ChefHat className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : dict.recipes.saveRecipe}</span>
            </button>
            <button
              type="button"
              onClick={onBack || onClose}
              className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-semibold text-sm rounded-xl transition-colors min-h-[44px]"
            >
              {dict.recipes.cancel}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
