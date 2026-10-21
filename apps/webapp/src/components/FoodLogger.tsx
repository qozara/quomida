import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.js';
import type { BaseIngredient, FoodItem, MealType, Portion, ResolvedAiBatchMeal } from '@quomida/domain-core';
import { CatalogSearchManager, BatchAiMealResolver } from '@quomida/domain-core';
import { MealService, AiMealError } from '@quomida/llm-engine';
import { Search, Sparkles, PlusCircle, Download } from 'lucide-react';
import { AI_CONFIG } from '../config/ai.js';
import { BatchAiMealReviewModal } from './BatchAiMealReviewModal.js';

import { RemoteCatalogService } from '../services/RemoteCatalogService.js';

interface FoodLoggerProps {
  onSelectIngredient: (ingredient: FoodItem | BaseIngredient, mealType: MealType) => void;
}

export const FoodLogger: React.FC<FoodLoggerProps> = ({ onSelectIngredient }) => {
  const { ingredients, recipes = [], recipeFoods = [], t, locale, setIsSettingsOpen, userSettings, db } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [filteredIngredients, setFilteredIngredients] = useState<(FoodItem | BaseIngredient)[]>([]);
  const [searchManager] = useState(() => new CatalogSearchManager());
  const [remoteService] = useState(() => RemoteCatalogService.getInstance());
  const [batchResolver] = useState(() => new BatchAiMealResolver(searchManager));
  const [batchMeal, setBatchMeal] = useState<ResolvedAiBatchMeal | null>(null);
  const [isBatchReviewOpen, setIsBatchReviewOpen] = useState(false);
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

      const mealService = new MealService({
        decomposerConfig: {
          proxyUrl: AI_CONFIG.proxyUrl,
          provider: userSettings?.ai_settings?.provider || AI_CONFIG.defaultProvider,
          ciphertext: userSettings?.ai_settings?.ciphertext,
          ollamaBaseUrl: userSettings?.ai_settings?.ollama_base_url || AI_CONFIG.defaultOllamaBaseUrl,
          ollamaModel: userSettings?.ai_settings?.ollama_model || AI_CONFIG.defaultOllamaModel,
          getAuthToken
        },
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
      setBatchMeal(resolved);
      setIsBatchReviewOpen(true);
    } catch (err: unknown) {
      setIsParsing(false);
      if (err instanceof AiMealError) {
        switch (err.code) {
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
      } else {
        setParseError(t.ai?.parseError || 'Natural language parsing failed. Falling back to catalog search.');
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
        {searchQuery.trim().length >= 2 && !isParsing && (
          <div className="mt-2 bg-slate-900/95 border border-slate-800 rounded-2xl max-h-60 overflow-y-auto divide-y divide-slate-800/60 shadow-2xl z-20" aria-live="polite">
            {filteredIngredients.length === 0 && !isSearching && searchQuery.trim().length >= 3 && (
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

            {filteredIngredients.map((ing, idx) => (
              <button
                key={`${ing.id}-${idx}`}
                type="button"
                onClick={() => {
                  onSelectIngredient(ing, 'meal_lunch');
                  setSearchQuery('');
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

            {isSearching && (
              <div className="p-3 text-center text-xs text-slate-500 flex justify-center items-center gap-2">
                <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                {t.search.searchingLocal}
              </div>
            )}

            {/* At the bottom of the dropdown list, ALWAYS render the "✨ Find more / Compose dish" action button */}
            <button
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
            </button>
          </div>
        )}
      </form>

      {/* Batch AI Multi-Ingredient Review Modal */}
      {isBatchReviewOpen && batchMeal && (
        <BatchAiMealReviewModal
          isOpen={isBatchReviewOpen}
          batchMeal={batchMeal}
          onClose={() => setIsBatchReviewOpen(false)}
          onLoggedSuccess={() => {
            setSearchQuery('');
            setIsBatchReviewOpen(false);
            setBatchMeal(null);
          }}
        />
      )}

    </section>
  );
};
