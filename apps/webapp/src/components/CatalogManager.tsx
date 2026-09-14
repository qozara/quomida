import React, { useState } from 'react';
import { useApp } from '../context/AppContext.js';
import { validateMacroAlignment } from '@quomida/domain-core';
import { X, Plus, Utensils, Tag, AlertCircle } from 'lucide-react';

export const CatalogManager: React.FC = () => {
  const { ingredients, portions, addCustomIngredient, isCatalogOpen, setIsCatalogOpen } = useApp();
  const [activeTab, setActiveTab] = useState<'ingredients' | 'portions'>('ingredients');
  const [isAdding, setIsAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New Ingredient Form State
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fats, setFats] = useState('');

  if (!isCatalogOpen) return null;

  const handleCreateIngredient = async (e: React.FormEvent) => {
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

    await addCustomIngredient({
      name,
      lang: 'es',
      calories_100g: calNum,
      protein_100g: pNum,
      carbs_100g: cNum,
      fats_100g: fNum
    });

    setName('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFats('');
    setIsAdding(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Utensils className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-extrabold text-white">Food Catalog Manager</h2>
          </div>
          <button
            onClick={() => setIsCatalogOpen(false)}
            className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher & Add Button */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setActiveTab('ingredients')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'ingredients' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Ingredients ({ingredients.length})
            </button>
            <button
              onClick={() => setActiveTab('portions')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'portions' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Portions ({portions.length})
            </button>
          </div>

          <button
            onClick={() => setIsAdding(!isAdding)}
            className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white border border-emerald-500/40 transition-all text-xs font-bold flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            <span>New</span>
          </button>
        </div>

        {/* Create Custom Ingredient Form */}
        {isAdding && (
          <form onSubmit={handleCreateIngredient} className="bg-slate-950 p-4 rounded-2xl border border-emerald-500/30 space-y-3 animate-in fade-in duration-200">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">New Custom Ingredient (100g base)</h3>
            
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
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
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
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 text-center font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] text-rose-400 block mb-1">Protein</label>
                <input
                  type="number"
                  placeholder="g"
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500 text-center font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] text-amber-400 block mb-1">Carbs</label>
                <input
                  type="number"
                  placeholder="g"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 text-center font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] text-cyan-400 block mb-1">Fats</label>
                <input
                  type="number"
                  placeholder="g"
                  value={fats}
                  onChange={(e) => setFats(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 text-center font-bold"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="flex-1 py-2 bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md"
              >
                Save Ingredient
              </button>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="py-2 px-3 bg-slate-800 text-slate-400 hover:text-white font-semibold text-xs rounded-xl"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Content List */}
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {activeTab === 'ingredients' ? (
            ingredients.map((ing) => (
              <div
                key={ing.id}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-white">{ing.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      ing.source === 'custom' ? 'bg-amber-950 text-amber-400 border border-amber-800/50' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {ing.source}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {ing.calories_100g} kcal/100g • P: {ing.protein_100g}g | C: {ing.carbs_100g}g | F: {ing.fats_100g}g
                  </div>
                </div>
              </div>
            ))
          ) : (
            portions.map((port) => (
              <div
                key={port.id}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80"
              >
                <div>
                  <div className="text-sm font-semibold text-white">{port.name}</div>
                  <div className="text-xs text-slate-400">Equivalent: {port.equivalent_weight_g}g</div>
                </div>
                <Tag className="w-4 h-4 text-slate-500" />
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
};
