import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.js';
import type { BaseIngredient, FoodItem, MealType, Portion, RecipeComponent } from '@quomida/domain-core';
import { CatalogSearchManager, BatchMealResolver, MealService, RecipeManager, type Recipe } from '@quomida/domain-core';
import { LlmRecipeDecomposer, AiMealError, classifyAiError } from '@quomida/ai-services';
import { Search, Sparkles, PlusCircle, Download } from 'lucide-react';
import { AI_CONFIG } from '../config/ai.js';
import { RecipeBuilder } from './recipes/RecipeBuilder.js';
import { IngredientBuilder } from './IngredientBuilder.js';

import { RemoteCatalogService } from '../services/RemoteCatalogService.js';
import { useRecentFoods } from '../hooks/useRecentFoods.js';

interface FoodLoggerProps {
  onSelectIngredient: (ingredient: FoodItem | BaseIngredient, mealType: MealType) => void;
  onClose?: () => void;
  targetMealType?: MealType;
  /** When true, recently used foods ignore the target meal type filter. */
  showAllRecent?: boolean;
}

export const FoodLogger: React.FC<FoodLoggerProps> = ({ onSelectIngredient, onClose, targetMealType, showAllRecent = false }) => {
  const {
    ingredients = [],
    recipes = [],
    recipeFoods = [],
    selectedDate,
    t,
    locale,
    setIsSettingsOpen,
    userSettings,
    db,
    addRecipe,
    addCustomIngredient,
    logFoodItem,
    logBatchFoodItems
  } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const { recentItems } = useRecentFoods(showAllRecent ? undefined : targetMealType);
  const isRecentMode = searchQuery.trim().length < 2;
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [filteredIngredients, setFilteredIngredients] = useState<(FoodItem | BaseIngredient)[]>([]);
  const listItems = isRecentMode ? recentItems : filteredIngredients;
  const [searchManager] = useState(() => new CatalogSearchManager());
  const [recipeManager] = useState(() => new RecipeManager());
  const [remoteService] = useState(() => RemoteCatalogService.getInstance());
  const [batchResolver] = useState(() => new BatchMealResolver(searchManager));

  const [isBuildingRecipe, setIsBuildingRecipe] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<any | null>(null);
  const [isBuildingIngredient, setIsBuildingIngredient] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<FoodItem | null>(null);
  const [detectedMealType, setDetectedMealType] = useState<MealType | null>(null);

  const [isSearching, setIsSearching] = useState(false);
  const [isFullCatalog, setIsFullCatalog] = useState(() => remoteService.isFullCatalogLoaded);

  useEffect(() => {
    return RemoteCatalogService.onCatalogDownloaded(() => {
      setIsFullCatalog(true);
    });
  }, []);

  // Search results dynamic filter using domain CatalogSearchManager
  React.useEffect(() => {
    const query = searchQuery.trim();
    
    // Only search after 3 characters
    if (query.length < 3) {
      setFilteredIngredients([]);
      return;
    }

    let isCancelled = false;

    const performSearch = async () => {
      try {
        setIsSearching(true);
        const result = await searchManager.search({
          query,
          customIngredients: ingredients,
          customRecipes: recipeFoods,
          limit: 30
        }, remoteService);

        if (!isCancelled) {
          setFilteredIngredients(result.items);
          setIsFullCatalog(remoteService.isFullCatalogLoaded);
        }
      } catch (e) {
        console.error('Catalog search query failed:', e);
      } finally {
        if (!isCancelled) setIsSearching(false);
      }
    };

    const timerId = setTimeout(() => {
      performSearch();
    }, 300);

    return () => { 
      isCancelled = true; 
      clearTimeout(timerId);
    };
  }, [searchQuery, ingredients, recipeFoods, searchManager, remoteService]);

  const handleAiParse = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    setIsParsing(true);
    setParseError(null);

    try {
      const getAuthToken = async (): Promise<string | null> => {
        // Read Google OAuth token if authenticated in webapp user settings
        const creds = userSettings?.active_cloud_provider?.credentials;
        if (typeof creds === 'string' && creds.trim()) {
          return creds.trim();
        }
        const token = creds?.accessToken || creds?.access_token || creds?.token;
        if (typeof token === 'string' && token.trim()) {
          return token.trim();
        }

        return null;
      };

      let customPortions: Portion[] = [];
      if (db) {
        try {
          const pdocs = await db.portions.find().exec();
          customPortions = pdocs.map((d: any) => (d.toJSON ? d.toJSON() : d));
        } catch (e) {
          console.warn('[FoodLogger] Failed to query local portions for batch:', e);
        }
      }

      const isAiEnabled = userSettings?.ai_settings?.enabled !== false;

      const decomposer = isAiEnabled
        ? new LlmRecipeDecomposer({
            proxyUrl: AI_CONFIG.proxyUrl,
            provider: userSettings?.ai_settings?.provider || AI_CONFIG.defaultProvider,
            ciphertext: userSettings?.ai_settings?.ciphertext,
            ollamaBaseUrl: userSettings?.ai_settings?.ollama_base_url || AI_CONFIG.defaultOllamaBaseUrl,
            ollamaModel: userSettings?.ai_settings?.ollama_model || AI_CONFIG.defaultOllamaModel,
            getAuthToken
          })
        : undefined;

      const mealService = new MealService({
        decomposer,
        searchManager,
        batchResolver
      });

      const resolved = await mealService.processMeal({
        input: query,
        customIngredients: ingredients,
        customRecipes: recipeFoods,
        existingRecipes: recipes,
        customPortions,
        catalogProvider: remoteService,
        locale,
        aiEnabled: isAiEnabled
      });

      setIsParsing(false);
      setDetectedMealType(resolved.detectedMealType || null);

      const isRecipe = Boolean(
        resolved.synthesizedRecipe ||
        resolved.compositeDishName ||
        resolved.items.length > 1 ||
        (resolved.items.length === 1 && resolved.items[0].food?.kind === 'recipe')
      );

      if (isRecipe) {
        let recipeName = resolved.compositeDishName || resolved.synthesizedRecipe?.recipe?.name || resolved.rawInput;
        let components: RecipeComponent[] = [];
        let portions = (resolved.synthesizedRecipe?.foodItem as any)?.portions || [];

        if (resolved.synthesizedRecipe) {
          recipeName = resolved.compositeDishName || resolved.synthesizedRecipe.recipe.name;
          components = resolved.synthesizedRecipe.recipe.ingredients || [];
        } else {
          components = resolved.items.filter(it => it.food).map(it => ({
            food_id: it.food!.id,
            name: it.food!.name,
            weight_g: it.calculatedWeightGrams,
            calories_100g: it.food!.calories_100g,
            protein_100g: it.food!.protein_100g,
            carbs_100g: it.food!.carbs_100g,
            fats_100g: it.food!.fats_100g,
            portion_name: it.selectedPortionName,
            portion_quantity: it.quantity
          }));
        }

        const rawWeight = components.reduce((sum, c) => sum + (c.weight_g || 0), 0);
        const initialRecipeData = {
          name: recipeName,
          ingredients: components,
          raw_weight_g: rawWeight,
          cooked_weight_g: rawWeight,
          portions
        };

        setEditingRecipe(initialRecipeData);
        setIsBuildingRecipe(true);
      } else {
        const singleItem = resolved.items[0];
        const initialFood: any = singleItem?.food ? { ...singleItem.food } : {
          id: `custom_${Date.now()}`,
          name: singleItem?.rawQuery || query,
          calories_100g: 0,
          protein_100g: 0,
          carbs_100g: 0,
          fats_100g: 0,
          portions: []
        };

        setEditingIngredient(initialFood);
        setIsBuildingIngredient(true);
      }
    } catch (err: unknown) {
      setIsParsing(false);
      const aiError = err instanceof AiMealError ? err : classifyAiError(err);
      switch (aiError.code) {
        case 'AUTHENTICATION_REQUIRED':
          setParseError(t.ai?.tokenExpiredNotice || 'Your Google session has expired or is invalid. Please reconnect in Settings.');
          break;
        case 'RATE_LIMIT_EXCEEDED':
          setParseError(t.ai?.quotaNotice || 'Daily AI quota exceeded. Please sign in or provide a Gemini API key in Settings.');
          break;
        case 'AI_DISABLED':
          setParseError(t.ai?.aiDisabled || 'AI is disabled. Please configure your AI provider in Settings.');
          break;
        case 'NO_ITEMS_PARSED':
          setParseError(t.ai?.noItemsParsed || 'Could not extract food items from description.');
          break;
        default:
          setParseError(t.ai?.parseError || 'Natural language parsing failed. Falling back to catalog search.');
          break;
      }
    }
  };

  return (
    <section className="w-full glass-card rounded-3xl p-5 border border-slate-800/90 shadow-xl space-y-4">
      {/* Unified Search & Smart Escalation Form */}
      <form onSubmit={handleAiParse} className="relative">
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
          <input
            type="text"
            id="input-food-search"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (parseError) setParseError(null);
            }}
            placeholder={t.search.unifiedPlaceholder || t.search.placeholder}
            className="w-full pl-11 pr-12 py-3 bg-slate-950/80 border border-slate-800 rounded-2xl text-sm font-medium text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors shadow-inner"
          />
          <button
            type="submit"
            id="btn-smart-resolve"
            disabled={isParsing || !searchQuery.trim()}
            aria-label={t.search.parseButton}
            className="absolute right-2 top-2 p-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-emerald-400 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            {isParsing ? (
              <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Loading Feedback */}
        {isParsing && (
          <div className="mt-2 p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-300" aria-live="polite">
            <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <span>{t.ai.parsingMeal}</span>
          </div>
        )}

        {/* Error Feedback */}
        {parseError && (
          <div className="mt-2 space-y-1.5 px-1" aria-live="polite">
            <p className="text-xs text-rose-400 leading-relaxed">{parseError}</p>
            {(parseError === t.ai?.quotaNotice ||
              parseError === t.ai?.aiDisabled ||
              parseError === t.ai?.tokenExpiredNotice) && (
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="text-xs text-emerald-400 underline hover:text-emerald-300 font-semibold block transition-colors"
              >
                {t.ai?.openSettingsBtn || t.sync.actions.storageSettings}
              </button>
            )}
          </div>
        )}

        {/* Real-time Local Search Dropdown + "Find More / Compose Dish" Footer */}
        {!isParsing && (
          <div className="mt-2 bg-slate-900/95 border border-slate-800 rounded-2xl max-h-60 overflow-y-auto divide-y divide-slate-800/60 shadow-2xl z-20" aria-live="polite">
            {isRecentMode && (
              <div className="px-3.5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t.catalog?.filterRecent || 'Recently used'}
              </div>
            )}
            {isRecentMode && recentItems.length === 0 && (
              <div className="p-4 text-center text-xs text-slate-500">
                {t.catalog?.noRecentFoods || 'No recently used foods or recipes in the last 60 days'}
              </div>
            )}
            {!isRecentMode && filteredIngredients.length === 0 && !isSearching && searchQuery.trim().length >= 3 && (
              <div className="p-4 text-center text-xs space-y-2.5">
                {!isFullCatalog ? (
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex flex-col items-center gap-2">
                    <p className="text-slate-400 leading-relaxed">
                      {t.search.noResultsBasic}
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsSettingsOpen(true)}
                      className="min-h-[44px] px-3.5 py-1.5 text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-xl transition-all flex items-center gap-1.5 active:scale-95"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{t.search.downloadFullCatalog}</span>
                    </button>
                  </div>
                ) : (
                  <div className="text-slate-500 py-2">
                    {t.search.noResults}
                  </div>
                )}
              </div>
            )}

            {listItems.map((ing, idx) => (
              <button
                key={`${ing.id}-${idx}`}
                type="button"
                onClick={() => {
                  onSelectIngredient(ing, targetMealType || 'meal_lunch');
                }}
                className="w-full p-3.5 text-left hover:bg-slate-800/80 transition-colors flex items-center justify-between group"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">
                      {ing.name}
                    </div>
                    {'kind' in ing && ing.kind === 'recipe' ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                        {t.recipes.recipeBadge}
                      </span>
                    ) : ing.source === 'custom' ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">{t.recipes.customBadge}</span>
                    ) : ing.source === 'system' ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">{t.recipes.systemBadge}</span>
                    ) : null}
                  </div>
                  {'kind' in ing && ing.kind === 'recipe' ? (
                    <div className="text-xs text-slate-400 mt-0.5">
                      <span className="font-semibold text-slate-200">
                        {t.recipes.totalDish}: {Math.round(ing.total_macros.calories)} kcal
                      </span>
                      <span className="text-slate-400"> ({ing.cooked_weight_g}g {t.recipes.cooked})</span>
                      <span className="text-slate-600"> • </span>
                      <span>{Math.round(ing.calories_100g * 10) / 10} kcal/100g</span>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 mt-0.5">
                      {ing.calories_100g} kcal/100g • P: {ing.protein_100g}g | C: {ing.carbs_100g}g | F: {ing.fats_100g}g
                    </div>
                  )}
                </div>
                <PlusCircle className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
              </button>
            ))}

            {!isRecentMode && isSearching && (
              <div className="p-3 text-center text-xs text-slate-500 flex justify-center items-center gap-2">
                <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                {t.search.searchingLocal}
              </div>
            )}

            {/* At the bottom of the dropdown list, ALWAYS render the "✨ Find more / Compose dish" action button */}
            {!isRecentMode && (<button
              type="button"
              id="btn-find-more-ai"
              onClick={handleAiParse}
              className="w-full p-3.5 text-left hover:bg-slate-800/90 transition-colors flex items-center justify-between group border-t border-slate-800/80 min-h-[44px]"
            >
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-emerald-400 group-hover:text-emerald-300 transition-colors">
                    {(t.search.findMoreTitle || '✨ Find more or compose dish for "{query}"').replace('{query}', searchQuery.trim())}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {t.search.findMoreSubtitle || 'Analyzes ingredients and builds a composite dish without logging immediately'}
                  </div>
                </div>
              </div>
            </button>)}
          </div>
        )}
      </form>

      {/* Inferred Recipe Builder Modal */}
      {isBuildingRecipe && (
        <RecipeBuilder
          initialRecipe={editingRecipe}
          initialDate={selectedDate}
          mode="diary"
          targetMealType={targetMealType || detectedMealType || 'meal_lunch'}
          onBack={() => {
            setIsBuildingRecipe(false);
            setEditingRecipe(null);
          }}
          onClose={() => {
            setIsBuildingRecipe(false);
            setEditingRecipe(null);
            onClose?.();
          }}
          onSave={async (recipe, portions) => {
            await addRecipe(recipe, portions);
            setIsBuildingRecipe(false);
            setEditingRecipe(null);
            setSearchQuery('');
            onClose?.();
          }}
          onSaveAndLog={async (recipe, portions, meal, date) => {
            const savedRecipeId = await addRecipe(recipe, portions);
            const recipeWithId = { ...recipe, id: recipe.id || savedRecipeId };
            const recipeFood = recipeManager.toFoodItem(recipeWithId);
            const hasServing = portions && portions.length > 0;
            const portionName = hasServing ? portions[0].name : 'Whole recipe';
            const quantity = 1;
            const portionsToUse = portions?.map((p, idx) => ({
              id: `port-${savedRecipeId}-${idx}`,
              base_food_id: savedRecipeId,
              name: p.name,
              equivalent_weight_g: p.equivalent_weight_g,
              source: 'custom' as const
            }));
            if (logFoodItem) {
              await logFoodItem(recipeFood, meal, quantity, portionName, portionsToUse, date);
            } else if (logBatchFoodItems) {
              await logBatchFoodItems(
                [{ food: recipeFood, quantity, portionName, availablePortions: portionsToUse, mealType: meal }],
                meal
              );
            }
            setIsBuildingRecipe(false);
            setEditingRecipe(null);
            setSearchQuery('');
            onClose?.();
          }}
        />
      )}

      {/* Inferred Single Ingredient Builder Modal */}
      {isBuildingIngredient && (
        <IngredientBuilder
          initialIngredient={editingIngredient}
          initialDate={selectedDate}
          mode="diary"
          targetMealType={targetMealType || detectedMealType || 'meal_lunch'}
          onBack={() => {
            setIsBuildingIngredient(false);
            setEditingIngredient(null);
          }}
          onClose={() => {
            setIsBuildingIngredient(false);
            setEditingIngredient(null);
            onClose?.();
          }}
          onSave={async (ingredient, portions) => {
            await addCustomIngredient({ ...ingredient, lang: ingredient.lang || 'es' }, portions);
            setIsBuildingIngredient(false);
            setEditingIngredient(null);
            setSearchQuery('');
            onClose?.();
          }}
          onSaveAndLog={async (ingredient, portions, meal, date) => {
            const savedId = await addCustomIngredient({ ...ingredient, lang: ingredient.lang || 'es' }, portions);
            const idToUse = ingredient.id || savedId || `custom_${Date.now()}`;
            const baseFood: BaseIngredient = {
              ...ingredient,
              id: idToUse,
              lang: ingredient.lang || 'es',
              source: 'custom'
            };
            const hasPortions = portions && portions.length > 0;
            const portionName = hasPortions ? portions[0].name : 'g';
            const quantity = hasPortions ? 1 : 100;
            const portionsToUse = portions?.map((p, idx) => ({
              id: `port-${idToUse}-${idx}`,
              base_food_id: idToUse,
              name: p.name,
              equivalent_weight_g: p.equivalent_weight_g,
              source: 'custom' as const
            }));
            if (logFoodItem) {
              await logFoodItem(baseFood, meal, quantity, portionName, portionsToUse, date);
            } else if (logBatchFoodItems) {
              await logBatchFoodItems(
                [{ food: baseFood, quantity, portionName, availablePortions: portionsToUse, mealType: meal }],
                meal
              );
            }
            setIsBuildingIngredient(false);
            setEditingIngredient(null);
            setSearchQuery('');
            onClose?.();
          }}
        />
      )}

    </section>
  );
};
