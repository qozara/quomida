import React, { useState } from 'react';
import { useApp } from '../context/AppContext.js';
import type { BaseIngredient, MealType } from '@quomida/domain-core';
import { parseNaturalLanguageLog, MockLLMProvider } from '@quomida/llm-engine';
import { Search, Sparkles, PlusCircle } from 'lucide-react';

interface FoodLoggerProps {
  onSelectIngredient: (ingredient: BaseIngredient, mealType: MealType) => void;
}

export const FoodLogger: React.FC<FoodLoggerProps> = ({ onSelectIngredient }) => {
  const { ingredients, t, dbService, db } = useApp();
  const [activeInputTab, setActiveInputTab] = useState<'search' | 'ai'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [aiQuery, setAiQuery] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [filteredIngredients, setFilteredIngredients] = useState<BaseIngredient[]>([]);

  // Search results dynamic filter against RxDB and Custom ingredients
  React.useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredIngredients([]);
      return;
    }

    const query = searchQuery.trim().toLowerCase();
    let isCancelled = false;

    const performSearch = async () => {
      // 1. Search local custom ingredients (in-memory)
      const customMatches = ingredients.filter(ing => 
        ing.name.toLowerCase().includes(query)
      );

      let systemMatches: BaseIngredient[] = [];
      
      // 2. Search massive system database (dynamic query)
      if (db) {
        try {
          const docs = await db.base_ingredients.find({
            selector: { 
              source: 'system',
              name: { $regex: new RegExp(query, 'i') } 
            },
            limit: 20
          }).exec();
          
          if (!isCancelled) {
            systemMatches = docs.map((d: any) => d.toJSON() as BaseIngredient);
          }
        } catch (e) {
          console.error('Search query failed:', e);
        }
      }

      if (!isCancelled) {
        setFilteredIngredients([...customMatches, ...systemMatches].slice(0, 30));
      }
    };

    performSearch();

    return () => { isCancelled = true; };
  }, [searchQuery, ingredients, db]);

  const handleAiParse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuery.trim()) return;

    setIsParsing(true);
    const mockProvider = new MockLLMProvider();
    const parsed = await parseNaturalLanguageLog(aiQuery, mockProvider);
    setIsParsing(false);

    if (parsed && parsed.items.length > 0) {
      const foodQuery = parsed.items[0].foodQuery.toLowerCase();
      
      let match = ingredients.find((ing) => ing.name.toLowerCase().includes(foodQuery));
      
      if (!match && db) {
        try {
          const docs = await db.base_ingredients.find({
            selector: { name: { $regex: new RegExp(foodQuery, 'i') } },
            limit: 1
          }).exec();
          if (docs.length > 0) match = docs[0].toJSON() as BaseIngredient;
        } catch (e) {}
      }

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
            <div className="mt-2 bg-slate-900/95 border border-slate-800 rounded-2xl max-h-60 overflow-y-auto divide-y divide-slate-800/60 shadow-2xl z-20">
              {filteredIngredients.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  {t.search.noResults}
                </div>
              ) : (
                filteredIngredients.map((ing) => (
                  <button
                    key={ing.id}
                    type="button"
                    onClick={() => {
                      onSelectIngredient(ing, 'meal_lunch');
                      setSearchQuery('');
                    }}
                    className="w-full p-3.5 text-left hover:bg-slate-800/80 transition-colors flex items-center justify-between group"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">
                        {ing.name}
                      </div>
                      <div className="text-xs text-slate-400">
                        {ing.calories_100g} kcal/100g • P: {ing.protein_100g}g | C: {ing.carbs_100g}g | F: {ing.fats_100g}g
                      </div>
                    </div>
                    <PlusCircle className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                  </button>
                ))
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
