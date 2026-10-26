import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext.js';
import {
  type FoodItem,
  validateMacroAlignment
} from '@quomida/domain-core';
import { dictionaries } from '@quomida/i18n-locales';
import { ArrowLeft, Sparkles, AlertCircle, PlusCircle, X } from 'lucide-react';

export interface IngredientBuilderProps {
  initialIngredient?: FoodItem | null;
  onClose: () => void;
  onBack?: () => void;
  onSave: (
    ingredient: {
      id?: string;
      name: string;
      lang?: 'en' | 'es';
      calories_100g: number;
      protein_100g: number;
      carbs_100g: number;
      fats_100g: number;
    },
    portions?: { name: string; equivalent_weight_g: number }[]
  ) => Promise<void>;
}

export const IngredientBuilder: React.FC<IngredientBuilderProps> = ({
  initialIngredient,
  onClose,
  onBack,
  onSave
}) => {
  const { t } = useApp();
  const dict = t || dictionaries.en;

  const [name, setName] = useState(() => initialIngredient?.name || '');
  const [calories, setCalories] = useState(() =>
    initialIngredient?.calories_100g !== undefined ? String(initialIngredient.calories_100g) : ''
  );
  const [protein, setProtein] = useState(() =>
    initialIngredient?.protein_100g !== undefined ? String(initialIngredient.protein_100g) : ''
  );
  const [carbs, setCarbs] = useState(() =>
    initialIngredient?.carbs_100g !== undefined ? String(initialIngredient.carbs_100g) : ''
  );
  const [fats, setFats] = useState(() =>
    initialIngredient?.fats_100g !== undefined ? String(initialIngredient.fats_100g) : ''
  );

  const [portions, setPortions] = useState<{ name: string; equivalent_weight_g: number }[]>(() => {
    const itemPortions = (initialIngredient as any)?.portions as
      | Array<{ name: string; equivalent_weight_g: number }>
      | undefined;
    return itemPortions ? itemPortions.map((p) => ({ name: p.name, equivalent_weight_g: p.equivalent_weight_g })) : [];
  });

  const [portionName, setPortionName] = useState('');
  const [portionWeight, setPortionWeight] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialIngredient) {
      setName(initialIngredient.name || '');
      setCalories(initialIngredient.calories_100g !== undefined ? String(initialIngredient.calories_100g) : '');
      setProtein(initialIngredient.protein_100g !== undefined ? String(initialIngredient.protein_100g) : '');
      setCarbs(initialIngredient.carbs_100g !== undefined ? String(initialIngredient.carbs_100g) : '');
      setFats(initialIngredient.fats_100g !== undefined ? String(initialIngredient.fats_100g) : '');
      const itemPortions = (initialIngredient as any)?.portions as
        | Array<{ name: string; equivalent_weight_g: number }>
        | undefined;
      setPortions(itemPortions ? itemPortions.map((p) => ({ name: p.name, equivalent_weight_g: p.equivalent_weight_g })) : []);
    }
  }, [initialIngredient]);

  const handleAddPortion = () => {
    if (portionName.trim() && portionWeight.trim()) {
      const parsedWeight = parseFloat(portionWeight);
      if (!isNaN(parsedWeight) && parsedWeight > 0) {
        setPortions([...portions, { name: portionName.trim(), equivalent_weight_g: parsedWeight }]);
        setPortionName('');
        setPortionWeight('');
      }
    }
  };

  const handleRemovePortion = (index: number) => {
    setPortions(portions.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!name.trim() || !calories.trim()) return;

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

    setIsSaving(true);
    try {
      await onSave(
        {
          id: initialIngredient?.id || undefined,
          name: name.trim(),
          lang: 'es',
          calories_100g: calNum,
          protein_100g: pNum,
          carbs_100g: cNum,
          fats_100g: fNum
        },
        finalPortions
      );
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save food');
    } finally {
      setIsSaving(false);
    }
  };

  const modalNode = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ingredient-builder-title"
      className="fixed inset-0 z-[60] flex flex-col bg-slate-950 text-slate-100 animate-slide-in-right slide-in-from-right overflow-y-auto"
    >
      {/* Top Sticky Navigation Bar with Back Button */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-md shrink-0">
        <button
          id="btn-close-ingredient-builder"
          data-testid="btn-back-ingredient-builder"
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
              {initialIngredient ? (dict.catalog?.edit || 'Edit') : (dict.catalog?.newFood || 'New')}
            </span>
          </div>
          <h2 id="ingredient-builder-title" className="text-sm font-semibold text-white truncate max-w-[200px] sm:max-w-xs mx-auto">
            {initialIngredient
              ? dict.catalog?.editCustomIngredient || 'Edit Single Food (100g base)'
              : dict.catalog?.newCustomIngredient || 'New Single Food (100g base)'}
          </h2>
        </div>
        <div className="w-[44px]" aria-hidden="true" />
      </header>

      {/* Main Content Form Container */}
      <div className="max-w-lg mx-auto w-full p-4 sm:p-6 space-y-5 flex-1">
        {errorMsg && (
          <div className="p-3 bg-rose-950/80 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Food Name */}
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1">
              Food Name
            </label>
            <input
              type="text"
              placeholder="e.g. Milanesa de soya casera"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 min-h-[44px]"
            />
          </div>

          {/* Macros (per 100g) */}
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1.5">
              Macros (per 100g base)
            </label>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1 text-center font-medium">Calories</label>
                <input
                  type="number"
                  placeholder="kcal"
                  step="any"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 text-center font-bold min-h-[44px]"
                />
              </div>
              <div>
                <label className="text-[10px] text-rose-400 block mb-1 text-center font-medium">Protein (g)</label>
                <input
                  type="number"
                  placeholder="g"
                  step="any"
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500 text-center font-bold min-h-[44px]"
                />
              </div>
              <div>
                <label className="text-[10px] text-amber-400 block mb-1 text-center font-medium">Carbs (g)</label>
                <input
                  type="number"
                  placeholder="g"
                  step="any"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 text-center font-bold min-h-[44px]"
                />
              </div>
              <div>
                <label className="text-[10px] text-cyan-400 block mb-1 text-center font-medium">Fats (g)</label>
                <input
                  type="number"
                  placeholder="g"
                  step="any"
                  value={fats}
                  onChange={(e) => setFats(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 text-center font-bold min-h-[44px]"
                />
              </div>
            </div>
          </div>

          {/* Custom Portions (Optional) */}
          <div className="pt-2 border-t border-slate-800/80">
            <label className="text-xs text-slate-400 font-semibold mb-2 block">
              Custom Portions (Optional)
            </label>

            {portions.length > 0 && (
              <div className="space-y-2 mb-3 max-h-36 overflow-y-auto">
                {portions.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-2 px-3"
                  >
                    <span className="text-sm font-medium text-white">{p.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 font-mono">{p.equivalent_weight_g}g</span>
                      <button
                        type="button"
                        onClick={() => handleRemovePortion(i)}
                        aria-label={`Remove portion ${p.name}`}
                        className="text-rose-400 hover:text-rose-300 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-rose-950/30 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="E.g., Slice, Cup, Tbsp"
                value={portionName}
                onChange={(e) => setPortionName(e.target.value)}
                className="flex-[2] bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 min-h-[44px]"
              />
              <input
                type="number"
                placeholder="Grams"
                step="any"
                value={portionWeight}
                onChange={(e) => setPortionWeight(e.target.value)}
                className="flex-[1] bg-slate-900 border border-slate-700 rounded-xl px-2 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 text-center min-h-[44px]"
              />
              <button
                type="button"
                onClick={handleAddPortion}
                disabled={!portionName.trim() || !portionWeight.trim()}
                aria-label="Add custom portion"
                className="px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-emerald-400 font-bold rounded-xl flex items-center justify-center min-h-[44px] min-w-[44px] transition-colors"
              >
                <PlusCircle className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-3">
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md min-h-[44px] transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onBack || onClose}
              disabled={isSaving}
              className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-semibold text-sm rounded-xl transition-colors min-h-[44px]"
            >
              {dict.recipes?.cancel || 'Cancel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalNode, document.body);
  }

  return modalNode;
};
