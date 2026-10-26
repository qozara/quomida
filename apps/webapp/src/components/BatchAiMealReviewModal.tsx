import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext.js';
import type {
  MealType,
  FoodItem,
  BaseIngredient,
  TaggedPortion,
  ResolvedBatchMeal,
  ResolvedMealItem,
  Portion,
  Recipe,
  IRecipeDecomposer
} from '@quomida/domain-core';
import {
  convertPortionToGrams,
  calculateItemMacros,
  CatalogSearchManager,
  PortionManager,
  matchPortionUnit,
  BatchMealResolver,
  RecipeManager
} from '@quomida/domain-core';
import { LlmRecipeDecomposer } from '@quomida/ai-services';
import { AI_CONFIG } from '../config/ai.js';
import {
  Sparkles,
  X,
  Check,
  Plus,
  Minus,
  Trash2,
  Coffee,
  Utensils,
  Moon,
  Apple,
  AlertTriangle,
  Search,
  ArrowLeft
} from 'lucide-react';
import { RemoteCatalogService } from '../services/RemoteCatalogService.js';

interface BatchAiMealReviewModalProps {
  isOpen: boolean;
  batchMeal: ResolvedBatchMeal | null;
  onClose: () => void;
  onBack?: () => void;
  onLoggedSuccess?: () => void;
  decomposer?: IRecipeDecomposer;
}

const mealIcons: Record<MealType, React.ReactNode> = {
  meal_breakfast: <Coffee className="w-4 h-4 text-amber-400" />,
  meal_lunch: <Utensils className="w-4 h-4 text-emerald-400" />,
  meal_dinner: <Moon className="w-4 h-4 text-indigo-400" />,
  meal_snack: <Apple className="w-4 h-4 text-rose-400" />
};

export const BatchAiMealReviewModal: React.FC<BatchAiMealReviewModalProps> = ({
  isOpen,
  batchMeal,
  onClose,
  onBack,
  onLoggedSuccess,
  decomposer: propsDecomposer
}) => {
  const { logBatchFoodItems, addRecipe, ingredients, recipes = [], recipeFoods = [], db, t, locale, userSettings } = useApp();

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : true
  );
  const [isDecomposingMeal, setIsDecomposingMeal] = useState<boolean>(false);
  const [decomposeError, setDecomposeError] = useState<string | null>(null);
  const [isAiDecomposedBanner, setIsAiDecomposedBanner] = useState<boolean>(() => Boolean(batchMeal?.isAiDecomposed));
  const [sourceDishTitle, setSourceDishTitle] = useState<string | undefined>(() => batchMeal?.sourceDishName);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const isAiConfigured = userSettings?.ai_settings?.enabled !== false;
  const isAiAvailable = isAiConfigured && isOnline;

  const [mealType, setMealType] = useState<MealType>(() => batchMeal?.detectedMealType || 'meal_lunch');
  const [items, setItems] = useState<Array<ResolvedMealItem & { mealType?: MealType }>>(() =>
    (batchMeal?.items || []).map((it) => ({
      ...it,
      mealType: (it as any).mealType || batchMeal?.detectedMealType || 'meal_lunch'
    }))
  );
  const [loggingMode, setLoggingMode] = useState<'recipe' | 'batch'>(() => {
    if (!batchMeal) return 'recipe';
    const distinct = new Set<MealType>();
    for (const it of batchMeal.items || []) {
      distinct.add((it as any).mealType || batchMeal.detectedMealType || 'meal_lunch');
    }
    if (distinct.size > 1 || Boolean((batchMeal as any)?.isMultiMeal && distinct.size > 1)) {
      return 'batch';
    }
    if ((batchMeal as any).defaultLoggingMode) {
      return (batchMeal as any).defaultLoggingMode;
    }
    if (batchMeal.synthesizedRecipe && (batchMeal as any).defaultLoggingMode === undefined) {
      return 'recipe';
    }
    if (
      batchMeal.compositeDishName ||
      (/\b(?:con|with)\b/i.test(batchMeal.rawInput) && !/[,\n]|\b(?:y|and)\b/i.test(batchMeal.rawInput))
    ) {
      return 'recipe';
    }
    return 'batch';
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSubstituteId, setActiveSubstituteId] = useState<string | null>(null);
  const [substituteQuery, setSubstituteQuery] = useState('');
  const [substituteResults, setSubstituteResults] = useState<(FoodItem | BaseIngredient)[]>([]);

  const [searchManager] = useState(() => new CatalogSearchManager());
  const [portionManager] = useState(() => new PortionManager());
  const [recipeManager] = useState(() => new RecipeManager());
  const [remoteService] = useState(() => RemoteCatalogService.getInstance());
  const [batchResolver] = useState(() => new BatchMealResolver(searchManager, portionManager, recipeManager));

  const existingRecipes = useMemo<Recipe[]>(() => {
    if (recipes.length > 0) return recipes;
    return recipeFoods.map((r) => r.recipe).filter(Boolean) as Recipe[];
  }, [recipes, recipeFoods]);

  const distinctMeals = useMemo(() => {
    const set = new Set<MealType>();
    for (const it of items) {
      set.add(it.mealType || mealType);
    }
    return set;
  }, [items, mealType]);

  const isMultiMeal = distinctMeals.size > 1 || Boolean((batchMeal as any)?.isMultiMeal && distinctMeals.size > 1);

  const activeSynthesizedRecipe = useMemo(() => {
    if (isMultiMeal) return undefined;
    return batchResolver.computeSynthesizedRecipe(
      items,
      batchMeal?.compositeDishName,
      existingRecipes,
      locale
    );
  }, [items, batchMeal?.compositeDishName, existingRecipes, batchResolver, locale, isMultiMeal]);

  const activeDecomposer = useMemo<IRecipeDecomposer | null>(() => {
    if (propsDecomposer) return propsDecomposer;
    if (!isAiAvailable) return null;

    const getAuthToken = async () => {
      const creds = userSettings?.active_cloud_provider?.credentials;
      if (typeof creds === 'string' && creds.trim()) return creds.trim();
      const token = creds?.accessToken || creds?.access_token || creds?.token;
      if (typeof token === 'string' && token.trim()) return token.trim();
      return null;
    };

    return new LlmRecipeDecomposer({
      proxyUrl: AI_CONFIG.proxyUrl,
      provider: userSettings?.ai_settings?.provider || AI_CONFIG.defaultProvider,
      ciphertext: userSettings?.ai_settings?.ciphertext,
      ollamaBaseUrl: userSettings?.ai_settings?.ollama_base_url || AI_CONFIG.defaultOllamaBaseUrl,
      ollamaModel: userSettings?.ai_settings?.ollama_model || AI_CONFIG.defaultOllamaModel,
      getAuthToken
    });
  }, [propsDecomposer, isAiAvailable, userSettings]);

  // Re-sync state whenever batchMeal changes
  useEffect(() => {
    if (batchMeal) {
      const detected = batchMeal.detectedMealType || 'meal_lunch';
      setMealType(detected);
      const loadedItems = (batchMeal.items || []).map((it) => ({
        ...it,
        mealType: (it as any).mealType || detected
      }));
      setItems(loadedItems);
      setActiveSubstituteId(null);
      setSubstituteQuery('');
      setSubstituteResults([]);

      const distinct = new Set<MealType>();
      for (const it of loadedItems) {
        distinct.add(it.mealType || detected);
      }
      const multi = distinct.size > 1 || Boolean((batchMeal as any)?.isMultiMeal && distinct.size > 1);

      if (multi) {
        setLoggingMode('batch');
      } else if ((batchMeal as any).defaultLoggingMode) {
        setLoggingMode((batchMeal as any).defaultLoggingMode);
      } else if (batchMeal.synthesizedRecipe && (batchMeal as any).defaultLoggingMode === undefined) {
        setLoggingMode('recipe');
      } else if (
        batchMeal.compositeDishName ||
        (/\b(?:con|with)\b/i.test(batchMeal.rawInput) && !/[,\n]|\b(?:y|and)\b/i.test(batchMeal.rawInput))
      ) {
        setLoggingMode('recipe');
      } else {
        setLoggingMode('batch');
      }
      setIsAiDecomposedBanner(Boolean(batchMeal.isAiDecomposed));
      setSourceDishTitle(batchMeal.sourceDishName);
      setDecomposeError(null);
      setIsDecomposingMeal(false);
    }
  }, [batchMeal]);

  const handleForceDecomposeMeal = async () => {
    if (!activeDecomposer || isDecomposingMeal) return;

    setIsDecomposingMeal(true);
    setDecomposeError(null);

    try {
      const dishQuery = (batchMeal?.rawInput || sourceDishTitle || '').trim();
      if (!dishQuery) {
        throw new Error('No meal description available to decompose.');
      }

      const portionContext =
        items.length === 1 && items[0]
          ? `${items[0].quantity} ${items[0].selectedPortionName}`
          : undefined;

      const decomposed = await activeDecomposer.decomposeDish(dishQuery, portionContext, locale);

      if (!decomposed || !decomposed.ingredients || decomposed.ingredients.length === 0) {
        throw new Error('AI could not estimate ingredients for this dish.');
      }

      let customPortions: Portion[] = [];
      if (db) {
        try {
          const pdocs = await db.portions.find().exec();
          customPortions = pdocs.map((d: any) => (d.toJSON ? d.toJSON() : d));
        } catch (e) {
          console.warn('[BatchAiMealReviewModal] Failed to query local portions for decomposition:', e);
        }
      }

      const subResolved = await batchResolver.resolveBatch({
        rawInput: `${dishQuery} (${decomposed.dishName})`,
        rawItems: decomposed.ingredients.map((ing) => ({
          foodQuery: ing.search_alias || ing.food_name,
          name: ing.food_name,
          quantity: ing.quantity,
          unit: ing.unit,
          mealType
        })),
        customIngredients: ingredients,
        customRecipes: recipeFoods,
        customPortions,
        catalogProvider: remoteService,
        detectedMealType: mealType,
        compositeDishName: decomposed.dishName,
        existingRecipes,
        isCompositeDish: true,
        locale
      });

      const updatedItems: Array<ResolvedMealItem & { mealType?: MealType }> = subResolved.items.map((it) => ({
        ...it,
        isAiDecomposed: true,
        mealType
      }));

      setItems(updatedItems);
      setIsAiDecomposedBanner(true);
      setSourceDishTitle(dishQuery);
      setActiveSubstituteId(null);
      if (updatedItems.length >= 2) {
        setLoggingMode('recipe');
      }
    } catch (err: any) {
      console.warn('[BatchAiMealReviewModal] Force meal decomposition failed:', err);
      setDecomposeError(err?.message || t.ai?.parseError || 'AI decomposition failed.');
    } finally {
      setIsDecomposingMeal(false);
    }
  };

  const handleSelectGlobalMeal = (m: MealType) => {
    setMealType(m);
    setItems((prev) => prev.map((it) => ({ ...it, mealType: m })));
  };

  const handleUpdateItemMealType = (itemId: string, newMeal: MealType) => {
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, mealType: newMeal } : it))
    );
  };

  // Handle substitute food search
  useEffect(() => {
    if (!activeSubstituteId || !substituteQuery.trim()) {
      setSubstituteResults([]);
      return;
    }

    let isCancelled = false;
    const performSearch = async () => {
      const q = substituteQuery.trim();
      const localCustom = ingredients.filter((item) =>
        item.name.toLowerCase().includes(q.toLowerCase())
      );
      const matchedRecipes = recipeFoods.filter((r) =>
        r.name.toLowerCase().includes(q.toLowerCase())
      );

      let catalogResults: BaseIngredient[] = [];
      try {
        catalogResults = await remoteService.searchIngredients(q, 10);
      } catch (err) {
        console.warn('[BatchAiMealReviewModal] Remote catalog search error:', err);
      }

      if (!isCancelled) {
        const merged = searchManager.mergeAndDeduplicate(
          matchedRecipes,
          localCustom,
          catalogResults,
          10
        );
        setSubstituteResults(merged);
      }
    };

    const timer = setTimeout(performSearch, 200);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [substituteQuery, activeSubstituteId, ingredients, recipeFoods, remoteService, searchManager]);

  // Update item quantity and dynamically recalculate weight and macros
  const handleUpdateQuantity = (itemId: string, newQty: number) => {
    const qty = Math.max(0.1, Math.round(newQty * 10) / 10);
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId || it.unmatched || !it.food) return it;
        const weightGrams = convertPortionToGrams(
          qty,
          it.selectedPortionName,
          it.availablePortions
        );
        const rawMacros = calculateItemMacros(it.food, weightGrams);
        return {
          ...it,
          quantity: qty,
          calculatedWeightGrams: weightGrams,
          macros: {
            calories: Math.round(rawMacros.calories * 10) / 10,
            protein: Math.round(rawMacros.protein * 10) / 10,
            carbs: Math.round(rawMacros.carbs * 10) / 10,
            fats: Math.round(rawMacros.fats * 10) / 10
          }
        };
      })
    );
  };

  // Update item portion name and recalculate
  const handleUpdatePortion = (itemId: string, newPortionName: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId || it.unmatched || !it.food) return it;
        let targetQty = it.quantity;
        if (newPortionName === 'g' && targetQty === 1) {
          targetQty = 100;
        } else if (it.selectedPortionName === 'g' && newPortionName !== 'g' && targetQty >= 50) {
          targetQty = 1;
        }

        const weightGrams = convertPortionToGrams(
          targetQty,
          newPortionName,
          it.availablePortions
        );
        const rawMacros = calculateItemMacros(it.food, weightGrams);
        return {
          ...it,
          selectedPortionName: newPortionName,
          quantity: targetQty,
          calculatedWeightGrams: weightGrams,
          macros: {
            calories: Math.round(rawMacros.calories * 10) / 10,
            protein: Math.round(rawMacros.protein * 10) / 10,
            carbs: Math.round(rawMacros.carbs * 10) / 10,
            fats: Math.round(rawMacros.fats * 10) / 10
          }
        };
      })
    );
  };

  // Remove an individual item from batch (must keep at least one food)
  const handleRemoveItem = (itemId: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((it) => it.id !== itemId));
    if (activeSubstituteId === itemId) {
      setActiveSubstituteId(null);
    }
  };

  // Replace item with user-selected food
  const handleSelectSubstitute = async (itemId: string, food: FoodItem | BaseIngredient) => {
    const normalizedFood: FoodItem = 'kind' in food ? food : { ...food, kind: 'ingredient' };

    let customPortions: Portion[] = [];
    if (db) {
      try {
        const pdocs = await db.portions.find().exec();
        customPortions = pdocs.map((d: any) => (d.toJSON ? d.toJSON() : d));
      } catch (e) {
        console.warn('[BatchAiMealReviewModal] Failed to query local portions for substitute:', e);
      }
    }

    const availablePortions = await portionManager.resolvePortions({
      ingredient: normalizedFood,
      customPortions,
      catalogProvider: remoteService
    });

    const hasUnitPortion = availablePortions.some(p =>
      /unit|unidad|pieza|medium|mediana|chica|grande|serving/i.test(p.name)
    );
    if (!hasUnitPortion) {
      availablePortions.unshift({
        id: `port-std-unit-${normalizedFood.id}`,
        base_food_id: normalizedFood.id,
        name: '1 unidad',
        equivalent_weight_g: 100,
        source: 'system',
        tag: 'Generic'
      });
    }

    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const selectedPortionName = matchPortionUnit(it.selectedPortionName, availablePortions);
        const quantity = it.quantity > 0 ? it.quantity : 1;
        const weightGrams = convertPortionToGrams(quantity, selectedPortionName, availablePortions);
        const rawMacros = calculateItemMacros(normalizedFood, weightGrams);

        return {
          ...it,
          food: normalizedFood,
          unmatched: false,
          availablePortions,
          selectedPortionName,
          quantity,
          calculatedWeightGrams: weightGrams,
          macros: {
            calories: Math.round(rawMacros.calories * 10) / 10,
            protein: Math.round(rawMacros.protein * 10) / 10,
            carbs: Math.round(rawMacros.carbs * 10) / 10,
            fats: Math.round(rawMacros.fats * 10) / 10
          }
        };
      })
    );
    setActiveSubstituteId(null);
    setSubstituteQuery('');
    setSubstituteResults([]);
  };

  // Compute live cumulative totals across all matched items
  const totals = useMemo(() => {
    let calories = 0;
    let protein = 0;
    let carbs = 0;
    let fats = 0;

    for (const item of items) {
      if (!item.unmatched && item.food) {
        calories += item.macros.calories;
        protein += item.macros.protein;
        carbs += item.macros.carbs;
        fats += item.macros.fats;
      }
    }

    return {
      calories: Math.round(calories * 10) / 10,
      protein: Math.round(protein * 10) / 10,
      carbs: Math.round(carbs * 10) / 10,
      fats: Math.round(fats * 10) / 10
    };
  }, [items]);

  const validItems = useMemo(() => items.filter((it) => !it.unmatched && it.food), [items]);

  const shouldLogAsCompositeRecipe = Boolean(
    activeSynthesizedRecipe && loggingMode === 'recipe' && !isMultiMeal && validItems.length >= 2
  );

  // Log all items to daily log in one operation
  const handleLogAll = async () => {
    if (validItems.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (shouldLogAsCompositeRecipe && activeSynthesizedRecipe) {
        // Case A: Composite Dish (validItems.length >= 2)
        if (!activeSynthesizedRecipe.isExistingDuplicate && addRecipe) {
          await addRecipe(activeSynthesizedRecipe.recipe);
        }

        await logBatchFoodItems(
          [
            {
              food: activeSynthesizedRecipe.foodItem,
              quantity: 1,
              portionName: 'Whole recipe',
              availablePortions: (activeSynthesizedRecipe.foodItem as any).portions,
              mealType
            }
          ],
          mealType
        );
      } else {
        // Case B: Batch / Single / Multi-meal logging
        const itemsToLog = validItems.map((it) => ({
          food: it.food!,
          quantity: it.quantity,
          portionName: it.selectedPortionName,
          availablePortions: it.availablePortions,
          mealType: (it as any).mealType || mealType
        }));

        await logBatchFoodItems(itemsToLog, mealType);
      }

      setIsSubmitting(false);
      onClose();
      onLoggedSuccess?.();
    } catch (err) {
      console.error('[BatchAiMealReviewModal] Batch logging failed:', err);
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !batchMeal) return null;

  const modalNode = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-review-title"
      className="fixed inset-0 z-[60] flex flex-col bg-slate-950 text-slate-100 animate-slide-in-right slide-in-from-right overflow-y-auto"
    >
      {/* Top Sticky Navigation Bar with Back Button */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-md shrink-0">
        <button
          id="btn-back-batch-review"
          data-testid="btn-back-batch-review"
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
              {t.ai?.batchReviewTitle || 'Review Parsed Meal'}
            </span>
          </div>
          <h2 id="batch-review-title" className="text-sm font-semibold text-white truncate max-w-[200px] sm:max-w-md mx-auto">
            {batchMeal.rawInput}
          </h2>
        </div>
        <div className="w-[44px]" aria-hidden="true" />
      </header>

      {/* Main Content Container */}
      <div className="max-w-lg mx-auto w-full p-4 sm:p-6 space-y-4 flex-1">
        <p className="text-xs text-slate-400">
          {t.ai?.batchReviewSubtitle || 'Review detected foods and portions before logging'}
        </p>

        {/* AI Recipe Decomposition Banner */}
        {(isAiDecomposedBanner || batchMeal.isAiDecomposed) && (
          <div className="shrink-0 bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-3 flex items-start gap-3 animate-in fade-in duration-150">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-300">
                  {t.ai?.decomposedRecipeBadge || 'AI Suggested Recipe'}
                </span>
                {(sourceDishTitle || batchMeal.sourceDishName) && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-medium border border-emerald-500/30 truncate">
                    {sourceDishTitle || batchMeal.sourceDishName}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {t.ai?.decomposedRecipeNotice || 'This dish was not found in the catalog. AI estimated its typical ingredients.'}
              </p>
            </div>
          </div>
        )}

        {/* Dynamic Decomposing Loading or Error Feedback */}
        {isDecomposingMeal && (
          <div className="shrink-0 p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-300 animate-in fade-in duration-150" aria-live="polite">
            <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <span>{t.ai?.decomposingItem || 'Estimating recipe with AI...'}</span>
          </div>
        )}
        {decomposeError && (
          <div className="shrink-0 p-3 bg-rose-950/40 border border-rose-500/40 rounded-2xl text-xs text-rose-300 animate-in fade-in duration-150" aria-live="polite">
            <span>{decomposeError}</span>
          </div>
        )}

        {/* Meal Category Switcher */}
        <div className="shrink-0 space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            {t.ai?.selectMeal || 'Meal Time'}
          </label>
          {isMultiMeal && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs animate-in fade-in">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>
                {t.ai?.multiMealDetectedNotice ||
                  'Multiple meal times detected — each food will be logged to its assigned meal'}
              </span>
            </div>
          )}
          <div className="grid grid-cols-4 gap-2">
            {(['meal_breakfast', 'meal_lunch', 'meal_dinner', 'meal_snack'] as MealType[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleSelectGlobalMeal(m)}
                className={`py-2 px-1 text-xs font-semibold rounded-xl border transition-all flex items-center justify-center gap-1.5 min-h-[44px] ${
                  mealType === m
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-sm'
                    : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-white'
                }`}
              >
                {mealIcons[m]}
                <span>{t.dashboard.meals[m.replace('meal_', '') as keyof typeof t.dashboard.meals]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Items List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 divide-y divide-slate-800/60" aria-live="polite">
          {items.map((item) => (
            <div key={item.id} className="pt-3 first:pt-0 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white truncate">
                      {item.food?.name || item.rawQuery}
                    </span>
                    {item.unmatched ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>{t.ai?.unmatchedBadge || 'Unmatched'}</span>
                      </span>
                    ) : item.food && 'kind' in item.food && item.food.kind === 'recipe' ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                        {t.recipes?.recipeBadge || 'Recipe'}
                      </span>
                    ) : item.food?.source === 'custom' ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        {t.recipes?.customBadge || 'Custom'}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                        {t.recipes?.systemBadge || 'System'}
                      </span>
                    )}

                    {/* Per-Item Meal Time Selector: only shown for multi-meal batches on matched foods */}
                    {isMultiMeal && !item.unmatched && (
                      <select
                        aria-label="Item Meal Time"
                        value={(item as any).mealType || mealType}
                        onChange={(e) => handleUpdateItemMealType(item.id, e.target.value as MealType)}
                        className="bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-medium rounded-lg px-2 py-0.5 focus:outline-none focus:border-emerald-500 min-h-[30px] cursor-pointer"
                      >
                        <option value="meal_breakfast">{t.dashboard.meals.breakfast}</option>
                        <option value="meal_lunch">{t.dashboard.meals.lunch}</option>
                        <option value="meal_dinner">{t.dashboard.meals.dinner}</option>
                        <option value="meal_snack">{t.dashboard.meals.snack}</option>
                      </select>
                    )}
                  </div>

                  {!item.unmatched && item.food && (
                    <div className="text-xs text-slate-400">
                      <span>{item.macros.calories} kcal</span>
                      <span className="text-slate-600"> • </span>
                      <span>P: {item.macros.protein}g</span>
                      <span className="text-slate-600"> • </span>
                      <span>C: {item.macros.carbs}g</span>
                      <span className="text-slate-600"> • </span>
                      <span>F: {item.macros.fats}g</span>
                      <span className="text-slate-600"> • </span>
                      <span className="text-slate-400">~{Math.round(item.calculatedWeightGrams)}g</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Change/search food button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (activeSubstituteId === item.id) {
                        setActiveSubstituteId(null);
                      } else {
                        setActiveSubstituteId(item.id);
                        setSubstituteQuery(item.rawQuery || item.food?.name || '');
                      }
                    }}
                    aria-label={t.ai?.changeItem || 'Change food match'}
                    title={t.ai?.changeItem || 'Change food match'}
                    className={`p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${
                      activeSubstituteId === item.id
                        ? 'text-emerald-400 bg-slate-800'
                        : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800'
                    }`}
                  >
                    <Search className="w-4 h-4" />
                  </button>

                  {/* Delete Item Button (disabled when only 1 item remains) */}
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.id)}
                    disabled={items.length <= 1}
                    aria-label={t.ai?.removeItemAria || 'Remove item from meal'}
                    title={
                      items.length <= 1
                        ? (t.ai?.cannotRemoveLastItem || 'At least one food must remain in the meal')
                        : (t.ai?.removeItemAria || 'Remove item from meal')
                    }
                    className={`p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0 ${
                      items.length <= 1
                        ? 'opacity-30 cursor-not-allowed text-slate-600'
                        : 'text-slate-500 hover:text-rose-400 hover:bg-rose-950/30'
                    }`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Matched item: Quantity Stepper & Portion Unit Dropdown */}
              {!item.unmatched && item.food && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {/* Quantity Stepper */}
                  <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() =>
                        handleUpdateQuantity(
                          item.id,
                          item.quantity - (item.selectedPortionName === 'g' ? 10 : 0.5)
                        )
                      }
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors active:scale-95 min-w-[44px] min-h-[44px]"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      step="any"
                      value={item.quantity}
                      onChange={(e) =>
                        handleUpdateQuantity(item.id, parseFloat(e.target.value) || 1)
                      }
                      aria-label="Quantity"
                      className="w-full text-center bg-transparent font-bold text-white text-xs focus:outline-none"
                    />
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() =>
                        handleUpdateQuantity(
                          item.id,
                          item.quantity + (item.selectedPortionName === 'g' ? 10 : 0.5)
                        )
                      }
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors active:scale-95 min-w-[44px] min-h-[44px]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Portion Unit Selector */}
                  <div>
                    <select
                      value={item.selectedPortionName}
                      onChange={(e) => handleUpdatePortion(item.id, e.target.value)}
                      aria-label="Portion Unit"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2.5 text-xs font-medium text-white focus:outline-none focus:border-emerald-500 truncate min-h-[44px]"
                    >
                      {item.availablePortions.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name} ({p.equivalent_weight_g}g)
                        </option>
                      ))}
                      <option value="g">{t.portionModal.customGrams}</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Substitute Search dropdown when active */}
              {activeSubstituteId === item.id ? (
                <div className="p-3 bg-slate-900 border border-slate-700 rounded-xl space-y-2.5 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">
                      {t.ai?.searchSubstitute || 'Search catalog for substitute'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveSubstituteId(null)}
                      className="text-slate-400 hover:text-white p-1 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={substituteQuery}
                      onChange={(e) => setSubstituteQuery(e.target.value)}
                      placeholder={t.ai?.searchSubstitute || 'Search catalog for substitute'}
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  {substituteResults.length > 0 && (
                    <div className="bg-slate-950 border border-slate-800 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-800 text-xs">
                      {substituteResults.map((cand) => (
                        <button
                          key={cand.id}
                          type="button"
                          onClick={() => handleSelectSubstitute(item.id, cand)}
                          className="w-full text-left p-2.5 hover:bg-slate-800 text-slate-200 flex justify-between items-center transition-colors min-h-[44px]"
                        >
                          <span className="font-semibold truncate pr-2">{cand.name}</span>
                          <span className="text-[10px] text-slate-400 shrink-0">{cand.calories_100g} kcal/100g</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : item.unmatched ? (
                <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-xl space-y-2">
                  <p className="text-xs text-amber-300">
                    {t.ai?.unmatchedNotice || 'Food not found in catalog'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSubstituteId(item.id);
                        setSubstituteQuery(item.rawQuery);
                      }}
                      className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all min-h-[44px]"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>{t.ai?.searchSubstitute || 'Search catalog for substitute'}</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}

          {items.length === 0 && (
            <div className="p-6 text-center text-xs text-slate-500 italic">
              {t.dashboard.noEntries}
            </div>
          )}
        </div>

        {/* Logging Mode Toggle: Composite Recipe vs. Batch Separate Items */}
        {validItems.length >= 2 && !isMultiMeal && activeSynthesizedRecipe && (
          <div className="space-y-2 shrink-0">
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950/80 border border-slate-800 rounded-2xl">
              <button
                type="button"
                id="btn-mode-recipe"
                onClick={() => setLoggingMode('recipe')}
                className={`py-2 px-2.5 text-xs font-semibold rounded-xl border transition-all flex items-center justify-center gap-1.5 min-h-[44px] ${
                  loggingMode === 'recipe'
                    ? 'bg-purple-600/20 border-purple-500/50 text-purple-300 shadow-sm'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Utensils className="w-3.5 h-3.5" />
                <span className="truncate">{t.ai?.modeCombineRecipe || 'Combine as 1 Dish (Recipe)'}</span>
              </button>
              <button
                type="button"
                id="btn-mode-batch"
                onClick={() => setLoggingMode('batch')}
                className={`py-2 px-2.5 text-xs font-semibold rounded-xl border transition-all flex items-center justify-center gap-1.5 min-h-[44px] ${
                  loggingMode === 'batch'
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-sm'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="truncate">
                  {(t.ai?.modeSeparateItems || 'Log Separate Items ({count})').replace('{count}', String(validItems.length))}
                </span>
              </button>
            </div>

            {/* Composite Recipe Banner - only shown when loggingMode === 'recipe' */}
            {loggingMode === 'recipe' && (
              <div className="bg-purple-950/30 border border-purple-800/50 rounded-2xl p-3 flex items-center justify-between gap-3 animate-in fade-in duration-150">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 shrink-0">
                    <Utensils className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                      {activeSynthesizedRecipe.recipe.name}
                    </div>
                    <div className="text-xs text-purple-300 font-medium">
                      {activeSynthesizedRecipe.isExistingDuplicate
                        ? (t.ai?.existingRecipeMatchedBadge || 'Matched existing recipe in your library')
                        : (t.ai?.autoSavedRecipeBadge || 'Will be saved to My Recipes and logged as a single dish')}
                    </div>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 shrink-0">
                  {t.recipes?.recipeBadge || 'Recipe'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Total Meal Nutrition Summary Card */}
        {validItems.length > 0 && (
          <div className="bg-slate-950/90 rounded-2xl p-3 border border-slate-800 shrink-0 space-y-1.5">
            <div className="flex justify-between items-center text-xs text-slate-400 font-semibold px-1">
              <span>{t.ai?.mealTotal || 'Total Meal Macros'}</span>
              <span className="text-emerald-400 font-bold">{validItems.length} {validItems.length === 1 ? 'item' : 'items'}</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center pt-1 border-t border-slate-800/80">
              <div>
                <div className="text-[10px] text-slate-400">{t.dashboard.calories}</div>
                <div className="text-sm font-extrabold text-emerald-400">{totals.calories}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">{t.dashboard.protein}</div>
                <div className="text-xs font-bold text-rose-400">{totals.protein}g</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">{t.dashboard.carbs}</div>
                <div className="text-xs font-bold text-amber-400">{totals.carbs}g</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">{t.dashboard.fats}</div>
                <div className="text-xs font-bold text-cyan-400">{totals.fats}g</div>
              </div>
            </div>
          </div>
        )}

        {/* Force AI Decomposition Button: single action below meal macros and above log button */}
        {isAiAvailable && (
          <button
            type="button"
            id="btn-force-decompose-meal"
            data-testid="btn-force-decompose-meal"
            onClick={handleForceDecomposeMeal}
            disabled={isDecomposingMeal}
            className="w-full py-2.5 px-3 bg-slate-950/80 hover:bg-slate-800/80 border border-emerald-500/30 hover:border-emerald-500/60 rounded-2xl text-xs font-semibold text-emerald-300 flex items-center justify-center gap-2 transition-all min-h-[44px] active:scale-[0.99] shrink-0"
          >
            {isDecomposingMeal ? (
              <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
            ) : (
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span className="truncate">
              {t.ai?.forceDecomposeHint || '¿No es lo que buscabas? Estimar receta con IA'}
            </span>
          </button>
        )}

        {/* Primary Action Button */}
        <button
          onClick={handleLogAll}
          disabled={validItems.length === 0 || isSubmitting}
          id="btn-log-batch-ai"
          className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 text-white font-bold rounded-2xl shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2 transition-all min-h-[44px] active:scale-[0.99] shrink-0"
        >
          <Check className="w-5 h-5" />
          <span>
            {shouldLogAsCompositeRecipe && activeSynthesizedRecipe
              ? (activeSynthesizedRecipe.isExistingDuplicate
                  ? (t.ai?.logRecipeDishAction || 'Log Dish to Diary')
                  : (t.ai?.saveAndLogRecipeAction || 'Save Recipe & Log Dish'))
              : validItems.length > 1
              ? (t.ai?.logBatchAction || 'Log {count} Items to Diary').replace('{count}', String(validItems.length))
              : (t.ai?.logSingleAction || 'Log to Diary')}
          </span>
        </button>

      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalNode, document.body);
  }

  return modalNode;
};
