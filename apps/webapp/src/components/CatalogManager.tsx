import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext.js';
import {
  CatalogSearchManager,
  BatchMealResolver,
  MealService,
  addDaysToDate,
  type BaseIngredient,
  type FoodItem,
  type RecipeFoodItem,
  type Recipe,
  type RecipeComponent,
  type Portion,
  type ResolvedBatchMeal,
  type DailyLog
} from '@quomida/domain-core';
import {
  Plus,
  Search,
  Trash2,
  ChefHat,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Pencil,
  Sparkles
} from 'lucide-react';
import { dictionaries } from '@quomida/i18n-locales';
import { RecipeBuilder } from './recipes/RecipeBuilder.js';
import { RecipeComponentList } from './recipes/RecipeComponentList.js';
import { CustomDialog } from './common/CustomDialog.js';
import { IngredientBuilder } from './IngredientBuilder.js';
import { RemoteCatalogService } from '../services/RemoteCatalogService.js';
import { LlmRecipeDecomposer } from '@quomida/ai-services';
import { AI_CONFIG } from '../config/ai.js';
import { useRecentFoods } from '../hooks/useRecentFoods.js';

const EMPTY_ARRAY: any[] = [];

interface CatalogManagerProps {
  onSelectFood?: (item: FoodItem | BaseIngredient) => void;
}

export const CatalogManager: React.FC<CatalogManagerProps> = ({ onSelectFood }) => {
  const {
    ingredients = EMPTY_ARRAY,
    recipes = EMPTY_ARRAY,
    recipeFoods = EMPTY_ARRAY,
    addCustomIngredient,
    removeCustomIngredient,
    addRecipe,
    removeRecipe,
    isCatalogOpen,
    db,
    userSettings,
    locale,
    t
  } = useApp();

  const dict = t || dictionaries.en;

  const [isBuildingIngredient, setIsBuildingIngredient] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<FoodItem | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<any | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isBuildingRecipe, setIsBuildingRecipe] = useState(false);
  const [filterType, setFilterType] = useState<'recent' | 'all' | 'ingredients' | 'recipes'>('recent');
  const [expandedRecipeIds, setExpandedRecipeIds] = useState<Record<string, boolean>>({});

  const [searchManager] = useState(() => new CatalogSearchManager());
  const [remoteService] = useState(() => RemoteCatalogService.getInstance());
  const [batchResolver] = useState(() => new BatchMealResolver(searchManager));

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoodItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: 'ingredient' | 'recipe'; name: string } | null>(null);

  const toggleRecipeExpand = (id: string) => {
    setExpandedRecipeIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const { recentItems } = useRecentFoods();


  // Build stable items list
  const customItems: FoodItem[] = useMemo(() => [
    ...(recipeFoods || []),
    ...(ingredients || []).map(ing => ({
      ...ing,
      kind: 'ingredient' as const
    }))
  ], [ingredients, recipeFoods]);

  const displayedItems = useMemo(() => {
    if (searchQuery.trim()) {
      let items = searchResults;
      if (filterType === 'ingredients') {
        return items.filter(item => item.kind === 'ingredient');
      }
      if (filterType === 'recipes') {
        return items.filter(item => item.kind === 'recipe');
      }
      return items;
    }

    if (filterType === 'recent') {
      return recentItems;
    }
    if (filterType === 'ingredients') {
      return customItems.filter(item => item.kind === 'ingredient');
    }
    if (filterType === 'recipes') {
      return customItems.filter(item => item.kind === 'recipe');
    }
    return customItems;
  }, [searchQuery, searchResults, customItems, recentItems, filterType]);

  // Search effect: searches custom recipes, custom ingredients AND system catalog items
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }

    let active = true;
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const result = await searchManager.search({
          query: trimmed,
          customIngredients: ingredients,
          customRecipes: recipeFoods,
          limit: 50
        }, remoteService);

        if (active) {
          setSearchResults(result.items);
        }
      } catch (err) {
        console.error('Catalog search failed:', err);
      } finally {
        if (active) setIsSearching(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery, ingredients, recipeFoods, searchManager, remoteService]);

  if (!isCatalogOpen) return null;

  const handleEditIngredient = (item: FoodItem) => {
    setEditingIngredient(item);
    setIsBuildingIngredient(true);
    setIsBuildingRecipe(false);
  };

  const handleEditRecipe = (recipeItem: FoodItem) => {
    setEditingRecipe(recipeItem as RecipeFoodItem);
    setIsBuildingRecipe(true);
    setIsBuildingIngredient(false);
  };

  const handleSaveIngredient = async (
    ingredientData: {
      id?: string;
      name: string;
      lang?: string;
      calories_100g: number;
      protein_100g: number;
      carbs_100g: number;
      fats_100g: number;
    },
    portions?: { name: string; equivalent_weight_g: number }[]
  ) => {
    await addCustomIngredient({
      ...ingredientData,
      lang: ingredientData.lang || 'es'
    }, portions);
    setIsBuildingIngredient(false);
    setEditingIngredient(null);
  };

  const handleRemoveIngredient = (id: string, name = '') => {
    setDeleteTarget({ id, type: 'ingredient', name });
  };

  const handleRemoveRecipe = (id: string, name = '') => {
    setDeleteTarget({ id, type: 'recipe', name });
  };

  const handleSaveRecipe = async (recipe: Recipe, recipePortions?: { name: string; equivalent_weight_g: number }[]) => {
    await addRecipe(recipe, recipePortions);
    setIsBuildingRecipe(false);
    setEditingRecipe(null);
  };

  const handleAiParse = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault();
    const query = searchQuery.trim();
    if (!query || isParsing) return;

    setIsParsing(true);
    try {
      const getAuthToken = async (): Promise<string | null> => {
        const creds = userSettings?.active_cloud_provider?.credentials;
        if (typeof creds === 'string' && creds.trim()) return creds.trim();
        const token = creds?.accessToken || creds?.access_token || creds?.token;
        if (typeof token === 'string' && token.trim()) return token.trim();
        return null;
      };

      let customPortions: Portion[] = [];
      if (db?.portions?.find) {
        try {
          const pdocs = await db.portions.find().exec();
          customPortions = pdocs.map((d: any) => (d.toJSON ? d.toJSON() : d));
        } catch (e) {
          console.warn('[CatalogManager] Failed to query local portions for batch:', e);
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
    } catch (err) {
      console.error('[CatalogManager] AI Parse error:', err);
      setIsParsing(false);
    }
  };

  return (
    <section
      role="region"
      aria-label={dict.catalog.title}
      data-testid="catalog-screen"
      className="space-y-4 animate-in fade-in duration-200"
    >
      {/* Action Buttons & Search */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
            <input
              type="text"
              placeholder={dict.catalog.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 min-h-[44px]"
            />
          </div>

          <button
            onClick={() => {
              setEditingIngredient(null);
              setIsBuildingIngredient(true);
              setIsBuildingRecipe(false);
            }}
            className="p-2 px-3 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white border border-emerald-500/40 transition-all text-sm font-bold flex items-center gap-1 min-w-[44px] min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>{dict.catalog.newFood}</span>
          </button>

          <button
            onClick={() => {
              setEditingRecipe(null);
              setIsBuildingRecipe(true);
              setIsBuildingIngredient(false);
            }}
            className="p-2 px-3 rounded-xl bg-purple-500/20 text-purple-400 hover:bg-purple-500 hover:text-white border border-purple-500/40 transition-all text-sm font-bold flex items-center gap-1 min-w-[44px] min-h-[44px]"
          >
            <ChefHat className="w-4 h-4" />
            <span>{dict.recipes.recipeBadge}</span>
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-1.5 pt-1 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setFilterType('recent')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[32px] shrink-0 ${
              filterType === 'recent'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            {dict.catalog?.filterRecent || 'Recently used'} ({recentItems.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[32px] shrink-0 ${
              filterType === 'all'
                ? 'bg-slate-700 text-white'
                : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            {dict.catalog.filterAll} ({recipeFoods.length + ingredients.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('recipes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[32px] shrink-0 ${
              filterType === 'recipes'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            {dict.catalog.filterRecipes} ({recipeFoods.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('ingredients')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[32px] shrink-0 ${
              filterType === 'ingredients'
                ? 'bg-emerald-700 text-white'
                : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            {dict.catalog.filterIngredients} ({ingredients.length})
          </button>
        </div>
      </div>

      <div aria-live="polite" className="sr-only">
        {isSearching ? 'Searching...' : `Found ${searchResults.length} foods`}
      </div>


      {/* Backdrop for closing open context menu */}
      {openMenuId !== null && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setOpenMenuId(null)}
          aria-hidden="true"
        />
      )}

      {/* Content List */}
      <div className="space-y-2">
        {displayedItems.length === 0 && !isSearching && (
          <div className="text-center py-6 text-slate-500 text-sm">
            {searchQuery
              ? dict.catalog.noFoodsFound
              : filterType === 'recent'
              ? (dict.catalog?.noRecentFoods || 'No recently used foods or recipes in the last 60 days')
              : dict.catalog.noCustomFoodsYet}
          </div>
        )}
        {displayedItems.map((item) => {
          const isRecipe = item.kind === 'recipe';
          const recipeFood = isRecipe ? (item as RecipeFoodItem) : null;
          const isExpanded = isRecipe && Boolean(expandedRecipeIds[item.id]);
          const isCustomItem = isRecipe || item.source === 'custom';

          return (
            <div
              key={item.id}
              className="rounded-xl bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition-colors group overflow-visible relative"
            >
              <div className="flex items-center justify-between p-3">
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-white truncate">{item.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      isRecipe
                        ? 'bg-purple-950 text-purple-400 border border-purple-800/50'
                        : item.source === 'custom'
                        ? 'bg-amber-950 text-amber-400 border border-amber-800/50'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {isRecipe ? dict.recipes.recipeBadge : item.source}
                    </span>
                  </div>
                  {isRecipe && recipeFood ? (
                    <div className="text-xs text-slate-400 mt-0.5 space-y-0.5">
                      <div>
                        <span className="font-semibold text-white">
                          {dict.recipes.totalDish || 'Total'}: {Math.round(recipeFood.total_macros.calories)} kcal
                        </span>
                        <span className="text-slate-400"> ({recipeFood.cooked_weight_g}g {dict.recipes.cooked})</span>
                        <span className="text-slate-600"> • </span>
                        <span className="text-rose-400">P: {Math.round(recipeFood.total_macros.protein * 10) / 10}g</span>
                        <span className="text-slate-600"> | </span>
                        <span className="text-amber-400">C: {Math.round(recipeFood.total_macros.carbs * 10) / 10}g</span>
                        <span className="text-slate-600"> | </span>
                        <span className="text-cyan-400">F: {Math.round(recipeFood.total_macros.fats * 10) / 10}g</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {Math.round(recipeFood.calories_100g * 10) / 10} kcal/100g • P: {Math.round(recipeFood.protein_100g * 10) / 10}g | C: {Math.round(recipeFood.carbs_100g * 10) / 10}g | F: {Math.round(recipeFood.fats_100g * 10) / 10}g
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 mt-0.5">
                      {item.calories_100g} kcal/100g • P: {item.protein_100g}g | C: {item.carbs_100g}g | F: {item.fats_100g}g
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Expand Recipe Breakdown Chevron */}
                  {isRecipe && (
                    <button
                      type="button"
                      onClick={() => toggleRecipeExpand(item.id)}
                      aria-label={isExpanded ? 'Collapse recipe ingredients' : 'Expand recipe ingredients'}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  )}

                  {/* Context Menu for Custom Items (Recipes & Custom Ingredients) */}
                  {isCustomItem && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
                        aria-label="Item options"
                        aria-haspopup="menu"
                        aria-expanded={openMenuId === item.id}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {openMenuId === item.id && (
                        <div
                          role="menu"
                          className="absolute right-0 top-full mt-1 z-20 w-32 bg-slate-850 border border-slate-700 rounded-xl shadow-2xl py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            aria-label={isRecipe ? 'Edit recipe' : 'Edit custom ingredient'}
                            onClick={() => {
                              setOpenMenuId(null);
                              if (isRecipe) {
                                handleEditRecipe(item);
                              } else {
                                handleEditIngredient(item);
                              }
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-750 hover:text-white transition-colors min-h-[36px]"
                          >
                            <Pencil className="w-3.5 h-3.5 text-slate-400" />
                            <span>{dict.catalog?.edit || 'Edit'}</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            aria-label={isRecipe ? 'Delete recipe' : 'Delete custom ingredient'}
                            onClick={() => {
                              setOpenMenuId(null);
                              if (isRecipe) {
                                handleRemoveRecipe(item.id);
                              } else {
                                handleRemoveIngredient(item.id);
                              }
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition-colors min-h-[36px]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{dict.catalog?.delete || 'Delete'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Primary Add to Diary (+) Action Button */}
                  <button
                    type="button"
                    onClick={() => onSelectFood?.(item)}
                    aria-label={isRecipe ? 'Add recipe to log' : 'Add food to log'}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Expanded Recipe Breakdown (Redundant totals omitted per spec) */}
              {isRecipe && isExpanded && recipeFood && (
                <div className="p-3 bg-slate-950/80 border-t border-slate-800/80 space-y-2 rounded-b-xl">
                  <span className="text-[11px] font-bold text-purple-400 block">
                    {dict.recipes.breakdownTitle}
                  </span>
                  <RecipeComponentList
                    components={recipeFood.recipe?.ingredients || (recipeFood as any).ingredients || []}
                    cookedWeightGrams={recipeFood.cooked_weight_g}
                    totalMacros={recipeFood.total_macros}
                    showSummary={false}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* At the bottom of search results, render the "✨ Compose dish or estimate with AI" action card */}
        {searchQuery.trim().length > 0 && (
          <button
            type="button"
            id="btn-catalog-compose-ai"
            data-testid="btn-catalog-compose-ai"
            onClick={handleAiParse}
            disabled={isParsing}
            className="w-full p-3.5 text-left bg-gradient-to-r from-emerald-950/30 to-purple-950/20 hover:from-emerald-950/50 hover:to-purple-950/40 border border-emerald-500/30 hover:border-emerald-500/60 rounded-xl transition-all flex items-center justify-between group min-h-[44px]"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-emerald-400 group-hover:text-emerald-300 transition-colors flex items-center gap-1.5">
                  <span>
                    {(dict.catalog?.composeDishAi || '✨ Compose dish or estimate with AI for "{query}"').replace('{query}', searchQuery.trim())}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {dict.catalog?.composeDishAiSubtitle || 'Decompose into ingredients and save as a new recipe in your catalog'}
                </div>
              </div>
            </div>
            {isParsing && (
              <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
            )}
          </button>
        )}
      </div>

      {/* Recipe Builder Modal */}
      {isBuildingRecipe && (
        <RecipeBuilder
          initialRecipe={editingRecipe}
          mode="catalog"
          onBack={() => {
            setIsBuildingRecipe(false);
            setEditingRecipe(null);
          }}
          onClose={() => {
            setIsBuildingRecipe(false);
            setEditingRecipe(null);
          }}
          onSave={handleSaveRecipe}
        />
      )}

      {/* Custom Ingredient Builder Modal */}
      {isBuildingIngredient && (
        <IngredientBuilder
          initialIngredient={editingIngredient}
          mode="catalog"
          onBack={() => {
            setIsBuildingIngredient(false);
            setEditingIngredient(null);
          }}
          onClose={() => {
            setIsBuildingIngredient(false);
            setEditingIngredient(null);
          }}
          onSave={handleSaveIngredient}
        />
      )}

      {/* Mobile-Friendly Delete Confirmation Dialog */}
      <CustomDialog
        isOpen={deleteTarget !== null}
        variant="danger"
        title={
          deleteTarget?.type === 'recipe'
            ? ((dict.recipes as any).deleteConfirmTitle || dict.catalog?.delete || 'Delete Recipe?')
            : ((dict.catalog as any).deleteCustomTitle || dict.catalog?.delete || 'Delete Custom Food?')
        }
        message={
          deleteTarget?.type === 'recipe'
            ? dict.recipes.deleteConfirm
            : dict.catalog.deleteCustomConfirm
        }
        confirmText={dict.catalog?.delete || 'Delete'}
        cancelText={dict.recipes?.cancel || 'Cancel'}
        confirmTestId="btn-confirm-delete"
        cancelTestId="btn-cancel-delete"
        dialogTestId="confirm-delete-dialog"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const { id, type } = deleteTarget;
          setDeleteTarget(null);
          if (type === 'recipe') {
            await removeRecipe(id);
          } else {
            await removeCustomIngredient(id);
          }
        }}
      />
    </section>
  );
};
