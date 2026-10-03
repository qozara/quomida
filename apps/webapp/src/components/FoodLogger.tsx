import React, { useState } from 'react';
import { useApp } from '../context/AppContext.js';
import type { BaseIngredient, MealType } from '@quomida/domain-core';
import { CatalogSearchManager } from '@quomida/domain-core';
import { parseNaturalLanguageLog, MockLLMProvider } from '@quomida/llm-engine';
import { Search, Sparkles, PlusCircle } from 'lucide-react';

import { RemoteCatalogService } from '../services/RemoteCatalogService.js';

interface FoodLoggerProps {
  onSelectIngredient: (ingredient: BaseIngredient, mealType: MealType) => void;
}

export const FoodLogger: React.FC<FoodLoggerProps> = ({ onSelectIngredient }) => {
  const { ingredients, t } = useApp();
  const [activeInputTab, setActiveInputTab] = useState<'search' | 'ai'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [aiQuery, setAiQuery] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [filteredIngredients, setFilteredIngredients] = useState<BaseIngredient[]>([]);
  const [searchManager] = useState(() => new CatalogSearchManager());
  const [remoteService] = useState(() => RemoteCatalogService.getInstance());
  const [isSearching, setIsSearching] = useState(false);
  const [remoteSearchFailed, setRemoteSearchFailed] = useState(false);

  // Search results dynamic filter using domain CatalogSearchManager
  React.useEffect(() => {
    const query = searchQuery.trim();
    
    // Only search after 3 characters
    if (query.length < 3) {
      setFilteredIngredients([]);
      setRemoteSearchFailed(false);
      return;
    }

    let isCancelled = false;

    const performSearch = async () => {
      try {
        setIsSearching(true);
        const result = await searchManager.search({
          query,
          customIngredients: ingredients,
          limit: 30
        }, remoteService);

        if (!isCancelled) {
          setFilteredIngredients(result.items);
          setRemoteSearchFailed(remoteService.hasRemoteFailed);
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
    const mockProvider = new MockLLMProvider();
    const parsed = await parseNaturalLanguageLog(aiQuery, mockProvider);
    setIsParsing(false);

    if (parsed && parsed.items.length > 0) {
      const foodQuery = parsed.items[0].foodQuery;
      const match = await searchManager.resolveAiMatch(foodQuery, ingredients, remoteService);

      if (match) {
        onSelectIngredient(match, 'meal_lunch');
        setAiQuery('');
      } else if (ingredients.length > 0) {
        onSelectIngredient(ingredients[0], 'meal_lunch');
        setAiQuery('');
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
              {/* Subtle inline notice when remote search fails - NO popup dialog */}
              {remoteSearchFailed && !isSearching && (
                <div className="p-2.5 px-3 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-300 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                    <span>{t.search.remoteSearchFailed}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      remoteService.resetCircuitBreaker();
                      setRemoteSearchFailed(false);
                      const q = searchQuery.trim();
                      if (q.length >= 3) {
                        setIsSearching(true);
                        searchManager.search({
                          query: q,
                          customIngredients: ingredients,
                          limit: 30
                        }, remoteService).then(result => {
                          setFilteredIngredients(result.items);
                          setRemoteSearchFailed(remoteService.hasRemoteFailed);
                        }).finally(() => setIsSearching(false));
                      }
                    }}
                    className="min-h-[44px] px-2 text-[11px] font-semibold text-amber-400 hover:text-amber-200 underline decoration-amber-400/50 flex items-center"
                  >
                    {t.search.retry}
                  </button>
                </div>
              )}

              {filteredIngredients.length === 0 && !isSearching ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  {t.search.noResults}
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
                        setRemoteSearchFailed(false);
                      }}
                      className="w-full p-3.5 text-left hover:bg-slate-800/80 transition-colors flex items-center justify-between group"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">
                            {ing.name}
                          </div>
                          {ing.source === 'custom' && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">Custom</span>
                          )}
                          {ing.source === 'system' && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">System</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {ing.calories_100g} kcal/100g • P: {ing.protein_100g}g | C: {ing.carbs_100g}g | F: {ing.fats_100g}g
                        </div>
                      </div>
                      <PlusCircle className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                    </button>
                  ))}
                  {isSearching && (
                    <div className="p-3 text-center text-xs text-slate-500 flex justify-center items-center gap-2">
                      <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                      {remoteService.isHttpFallbackActive ? t.search.searchingRemote : t.search.searchingLocal}
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
          <button
            type="submit"
            disabled={isParsing || !aiQuery.trim()}
            className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99]"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isParsing ? 'Analyzing...' : t.search.parseButton}</span>
          </button>
        </form>
      )}

    </section>
  );
};
