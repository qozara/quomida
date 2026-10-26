import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext.js';
import {
  validateMacroAlignment,
  CatalogSearchManager,
  type BaseIngredient,
  type FoodItem,
  type RecipeFoodItem,
  type Recipe
} from '@quomida/domain-core';
import {
  Plus,
  AlertCircle,
  Search,
  Trash2,
  PlusCircle,
  ChefHat,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Pencil,
  X
} from 'lucide-react';
import { dictionaries } from '@quomida/i18n-locales';
import { RecipeBuilder } from './recipes/RecipeBuilder.js';
import { RecipeComponentList } from './recipes/RecipeComponentList.js';
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

  const [isAdding, setIsAdding] = useState(false);
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<RecipeFoodItem | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isBuildingRecipe, setIsBuildingRecipe] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'ingredients' | 'recipes'>('all');
  const [expandedRecipeIds, setExpandedRecipeIds] = useState<Record<string, boolean>>({});

  const [searchManager] = useState(() => new CatalogSearchManager());
  const [remoteService] = useState(() => RemoteCatalogService.getInstance());

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoodItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // New / Edit Ingredient Form State
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fats, setFats] = useState('');
  const [portions, setPortions] = useState<{ name: string; equivalent_weight_g: number }[]>([]);
  const [portionName, setPortionName] = useState('');
  const [portionWeight, setPortionWeight] = useState('');

  const resetIngredientForm = () => {
    setName('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFats('');
    setPortionName('');
    setPortionWeight('');
    setPortions([]);
    setEditingIngredientId(null);
    setErrorMsg(null);
  };

  const handleAddPortion = () => {
    if (portionName && portionWeight) {
      setPortions([...portions, { name: portionName, equivalent_weight_g: parseFloat(portionWeight) }]);
      setPortionName('');
      setPortionWeight('');
    }
  };

  const handleRemovePortion = (index: number) => {
    setPortions(portions.filter((_, i) => i !== index));
  };

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
    setEditingIngredientId(item.id);
    setName(item.name);
    setCalories(String(item.calories_100g));
    setProtein(String(item.protein_100g));
    setCarbs(String(item.carbs_100g));
    setFats(String(item.fats_100g));
    const itemPortions = (item as any).portions as Array<{ name: string; equivalent_weight_g: number }> | undefined;
    setPortions(itemPortions ? itemPortions.map(p => ({ name: p.name, equivalent_weight_g: p.equivalent_weight_g })) : []);
    setIsAdding(true);
    setIsBuildingRecipe(false);
  };

  const handleEditRecipe = (recipeItem: FoodItem) => {
    setEditingRecipe(recipeItem as RecipeFoodItem);
    setIsBuildingRecipe(true);
    setIsAdding(false);
  };

  const handleCreateOrUpdateIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!name || !calories) return;

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

    await addCustomIngredient({
      id: editingIngredientId || undefined,
      name,
      lang: 'es',
      calories_100g: calNum,
      protein_100g: pNum,
      carbs_100g: cNum,
      fats_100g: fNum
    }, finalPortions);

    resetIngredientForm();
    setIsAdding(false);
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
              if (isAdding) {
                setIsAdding(false);
                resetIngredientForm();
              } else {
                resetIngredientForm();
                setIsAdding(true);
                setIsBuildingRecipe(false);
              }
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
              setIsAdding(false);
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

      {/* Create / Edit Custom Ingredient Form */}
      {isAdding && (
        <form onSubmit={handleCreateOrUpdateIngredient} className="bg-slate-900 p-4 rounded-2xl border border-emerald-500/30 space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
              {editingIngredientId ? (dict.catalog.editCustomIngredient || 'Edit Single Food (100g base)') : dict.catalog.newCustomIngredient}
            </h3>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                resetIngredientForm();
              }}
              className="p-1 rounded-full text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          {errorMsg && (
            <div className="p-2.5 bg-rose-950/80 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Food Name</label>
            <input
              type="text"
              placeholder="e.g. Milanesa de soya casera"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 min-h-[44px]"
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Calories</label>
              <input
                type="number"
                placeholder="kcal"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 text-center font-bold min-h-[44px]"
              />
            </div>
            <div>
              <label className="text-[10px] text-rose-400 block mb-1">Protein</label>
              <input
                type="number"
                placeholder="g"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500 text-center font-bold min-h-[44px]"
              />
            </div>
            <div>
              <label className="text-[10px] text-amber-400 block mb-1">Carbs</label>
              <input
                type="number"
                placeholder="g"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 text-center font-bold min-h-[44px]"
              />
            </div>
            <div>
              <label className="text-[10px] text-cyan-400 block mb-1">Fats</label>
              <input
                type="number"
                placeholder="g"
                value={fats}
                onChange={(e) => setFats(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 text-center font-bold min-h-[44px]"
              />
            </div>
          </div>

          <div className="pt-2">
            <label className="text-xs text-slate-400 font-semibold mb-2 block">Custom Portions (Optional)</label>
            
            <div className="space-y-2 mb-3 max-h-32 overflow-y-auto">
              {portions.map((p, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg p-2 px-3">
                  <span className="text-sm font-medium text-white">{p.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{p.equivalent_weight_g}g</span>
                    <button type="button" onClick={() => handleRemovePortion(i)} className="text-rose-400 hover:text-rose-300 min-h-[32px] min-w-[32px] flex items-center justify-center">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="E.g., Slice, Cup, Tbsp"
                value={portionName}
                onChange={(e) => setPortionName(e.target.value)}
                className="flex-[2] bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 min-h-[44px]"
              />
              <input
                type="number"
                placeholder="Grams"
                value={portionWeight}
                onChange={(e) => setPortionWeight(e.target.value)}
                className="flex-[1] bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 text-center min-h-[44px]"
              />
              <button
                type="button"
                onClick={handleAddPortion}
                disabled={!portionName || !portionWeight}
                className="px-3 bg-slate-850 hover:bg-slate-750 disabled:opacity-50 text-emerald-400 font-bold rounded-xl flex items-center justify-center min-h-[44px]"
              >
                <PlusCircle className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              className="flex-1 py-2 bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-md min-h-[44px]"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                resetIngredientForm();
              }}
              className="py-2 px-3 bg-slate-800 text-slate-400 hover:text-white font-semibold text-sm rounded-xl min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

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
    </section>
  );
};
