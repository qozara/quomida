import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.js';
import type { BaseIngredient, FoodItem, MealType, Portion, ResolvedAiBatchMeal } from '@quomida/domain-core';
import { CatalogSearchManager, BatchAiMealResolver } from '@quomida/domain-core';
import { QozaraAiMealParser } from '@quomida/llm-engine';
import { Search, Sparkles, PlusCircle, Download } from 'lucide-react';
import { AI_CONFIG } from '../config/ai.js';
import { BatchAiMealReviewModal } from './BatchAiMealReviewModal.js';

import { RemoteCatalogService } from '../services/RemoteCatalogService.js';

interface FoodLoggerProps {
  onSelectIngredient: (ingredient: FoodItem | BaseIngredient, mealType: MealType) => void;
}

export const FoodLogger: React.FC<FoodLoggerProps> = ({ onSelectIngredient }) => {
  const { ingredients, recipeFoods = [], t, setIsSettingsOpen, userSettings, db } = useApp();
  const [activeInputTab, setActiveInputTab] = useState<'search' | 'ai'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [aiQuery, setAiQuery] = useState('');
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
  }, [searchQuery, ingredients, searchManager, remoteService]);

  const handleAiParse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuery.trim()) return;

    setIsParsing(true);
    setParseError(null);

    try {
      const getAuthToken = async (): Promise<string | null> => {
        const token = userSettings?.active_cloud_provider?.credentials?.access_token;
        return typeof token === 'string' ? token : null;
      };

      const aiProvider = new QozaraAiMealParser({
        proxyUrl: AI_CONFIG.proxyUrl,
        provider: userSettings?.ai_settings?.provider || AI_CONFIG.defaultProvider,
        ciphertext: userSettings?.ai_settings?.ciphertext,
        ollamaBaseUrl: userSettings?.ai_settings?.ollama_base_url || AI_CONFIG.defaultOllamaBaseUrl,
        ollamaModel: userSettings?.ai_settings?.ollama_model || AI_CONFIG.defaultOllamaModel,
        getAuthToken
      });

      const parsed = await aiProvider.parse(aiQuery);
      setIsParsing(false);

      if (parsed && parsed.items.length > 0) {
        let customPortions: Portion[] = [];
        if (db) {
          try {
            const pdocs = await db.portions.find().exec();
            customPortions = pdocs.map((d: any) => (d.toJSON ? d.toJSON() : d));
          } catch (e) {
            console.warn('[FoodLogger] Failed to query local portions for batch:', e);
          }
        }

        const resolved = await batchResolver.resolveBatch({
          rawInput: aiQuery,
          rawItems: parsed.items,
          customIngredients: ingredients,
          customRecipes: recipeFoods,
          customPortions,
          catalogProvider: remoteService,
          detectedMealType: parsed.detectedMealType
        });

        setBatchMeal(resolved);
        setIsBatchReviewOpen(true);
      } else {
        setParseError(t.ai?.noItemsParsed || 'Could not extract food items from description.');
      }
    } catch (err: any) {
      setIsParsing(false);
      const errMsg = err?.message || String(err);
      if (/RATE_LIMIT|quota|Too Many Requests|429/i.test(errMsg)) {
        setParseError(t.ai?.quotaNotice || 'Daily AI quota exceeded. Please sign in or provide a Gemini API key in Settings.');
      } else if (/AI is disabled/i.test(errMsg)) {
        setParseError(t.ai?.aiDisabled || 'AI is disabled. Please configure your AI provider in Settings.');
      } else {
        setParseError(t.ai?.parseError || 'Natural language parsing failed. Falling back to catalog search.');
      }
    }
  };

  return (
    <section className="w-full glass-card rounded-3xl p-5 border border-slate-800/90 shadow-xl space-y-4">
      
      {/* Segmented Control Input Switcher */}
      <div className="flex bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 shadow-inner">
        <button
          type="button"
          onClick={() => setActiveInputTab('search')}
          className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            activeInputTab === 'search'
              ? 'bg-emerald-500 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span>{t.search.tabSearch}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveInputTab('ai')}
          className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            activeInputTab === 'ai'
              ? 'bg-emerald-500 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{t.search.tabAi}</span>
        </button>
      </div>

      {/* Input Field: Search */}
      {activeInputTab === 'search' ? (
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
          <input
            type="text"
            id="input-food-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.search.placeholder}
            className="w-full pl-11 pr-4 py-3 bg-slate-950/80 border border-slate-800 rounded-2xl text-sm font-medium text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors shadow-inner"
          />

          {/* Real-time search result list */}
          {searchQuery.trim() !== '' && (
            <div className="mt-2 bg-slate-900/95 border border-slate-800 rounded-2xl max-h-60 overflow-y-auto divide-y divide-slate-800/60 shadow-2xl z-20" aria-live="polite">
              {filteredIngredients.length === 0 && !isSearching ? (
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
              ) : (
                <>
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
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Input Field: AI Natural Log */
        <form onSubmit={handleAiParse} className="space-y-3">
          <textarea
            rows={2}
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            placeholder={t.search.aiPlaceholder}
            className="w-full p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl text-sm font-medium text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors shadow-inner resize-none"
          />
          {parseError && (
            <div className="space-y-1.5 px-1" aria-live="polite">
              <p className="text-xs text-rose-400 leading-relaxed">{parseError}</p>
              {(parseError === t.ai?.quotaNotice || parseError === t.ai?.aiDisabled) && (
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
          <button
            type="submit"
            disabled={isParsing || !aiQuery.trim()}
            className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99]"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isParsing ? t.ai.parsingMeal : t.search.parseButton}</span>
          </button>
        </form>
      )}

      {/* Batch AI Multi-Ingredient Review Modal */}
      {isBatchReviewOpen && batchMeal && (
        <BatchAiMealReviewModal
          isOpen={isBatchReviewOpen}
          batchMeal={batchMeal}
          onClose={() => setIsBatchReviewOpen(false)}
          onLoggedSuccess={() => {
            setAiQuery('');
            setIsBatchReviewOpen(false);
            setBatchMeal(null);
          }}
        />
      )}

    </section>
  );
};
