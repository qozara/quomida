import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext.js';
import {
  CatalogSearchManager,
  type BaseIngredient,
  type FoodItem,
  type RecipeFoodItem,
  type Recipe
} from '@quomida/domain-core';
import {
  Plus,
  Search,
  Trash2,
  ChefHat,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Pencil
} from 'lucide-react';
import { dictionaries } from '@quomida/i18n-locales';
import { RecipeBuilder } from './recipes/RecipeBuilder.js';
import { RecipeComponentList } from './recipes/RecipeComponentList.js';
import { IngredientBuilder } from './IngredientBuilder.js';
import { RemoteCatalogService } from '../services/RemoteCatalogService.js';

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
    t
  } = useApp();

  const dict = t || dictionaries.en;

  const [isBuildingIngredient, setIsBuildingIngredient] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<FoodItem | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<RecipeFoodItem | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isBuildingRecipe, setIsBuildingRecipe] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'ingredients' | 'recipes'>('all');
  const [expandedRecipeIds, setExpandedRecipeIds] = useState<Record<string, boolean>>({});

  const [searchManager] = useState(() => new CatalogSearchManager());
  const [remoteService] = useState(() => RemoteCatalogService.getInstance());

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoodItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const toggleRecipeExpand = (id: string) => {
    setExpandedRecipeIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Build stable items list
  const customItems: FoodItem[] = useMemo(() => [
    ...(recipeFoods || []),
    ...(ingredients || []).map(ing => ({
      ...ing,
      kind: 'ingredient' as const
    }))
  ], [ingredients, recipeFoods]);

  const displayedItems = useMemo(() => {
    let items = searchQuery.trim() ? searchResults : customItems;
    if (filterType === 'ingredients') {
      return items.filter(item => item.kind === 'ingredient');
    }
    if (filterType === 'recipes') {
      return items.filter(item => item.kind === 'recipe');
    }
    return items;
  }, [searchQuery, searchResults, customItems, filterType]);

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

  const handleRemoveIngredient = async (id: string) => {
    if (confirm(dict.catalog.deleteCustomConfirm)) {
      await removeCustomIngredient(id);
    }
  };

  const handleRemoveRecipe = async (id: string) => {
    if (confirm(dict.recipes.deleteConfirm)) {
      await removeRecipe(id);
    }
  };

  const handleSaveRecipe = async (recipe: Recipe, recipePortions?: { name: string; equivalent_weight_g: number }[]) => {
    await addRecipe(recipe, recipePortions);
    setIsBuildingRecipe(false);
    setEditingRecipe(null);
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
        <div className="flex gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[32px] ${
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
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[32px] ${
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
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[32px] ${
              filterType === 'ingredients'
                ? 'bg-emerald-600 text-white'
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
            {searchQuery ? dict.catalog.noFoodsFound : dict.catalog.noCustomFoodsYet}
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
      </div>

      {/* Recipe Builder Modal */}
      {isBuildingRecipe && (
        <RecipeBuilder
          initialRecipe={editingRecipe}
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
    </section>
  );
};
