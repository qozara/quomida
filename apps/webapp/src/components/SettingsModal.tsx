import React, { useState } from 'react';
import { useApp } from '../context/AppContext.js';
import { X, Globe, Moon, Sun, Monitor, Target, Cloud, Save, Database, RefreshCw } from 'lucide-react';

export const SettingsModal: React.FC = () => {
  const {
    locale,
    setLocale,
    theme,
    setTheme,
    userSettings,
    updateUserSettings,
    syncStatus,
    activeProvider,
    lastSyncedTime,
    isSettingsOpen,
    setIsSettingsOpen,
    setIsStorageSettingsOpen,
    catalogVersion,
    isHydratingCatalog,
    refreshCatalog,
    t
  } = useApp();

  const [catalogFeedback, setCatalogFeedback] = useState<string | null>(null);


  const [calorieTarget, setCalorieTarget] = useState(userSettings.daily_calorie_target || 2000);
  const [proteinTarget, setProteinTarget] = useState(userSettings.custom_macros?.protein || 150);
  const [carbsTarget, setCarbsTarget] = useState(userSettings.custom_macros?.carbs || 200);
  const [fatsTarget, setFatsTarget] = useState(userSettings.custom_macros?.fats || 65);
  const [isSaved, setIsSaved] = useState(false);

  if (!isSettingsOpen) return null;

  const handleSaveGoals = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateUserSettings({
      daily_calorie_target: calorieTarget,
      custom_macros: {
        protein: proteinTarget,
        carbs: carbsTarget,
        fats: fatsTarget
      }
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleCheckCatalogUpdates = async () => {
    setCatalogFeedback(null);
    try {
      const res = await refreshCatalog({ force: true });
      if (res.status === 'UPDATED') {
        setCatalogFeedback(
          (t.settings as any).catalogUpdated
            ?.replace('{{version}}', res.version || '')
            .replace('{{count}}', String(res.itemsUpserted || 0)) ||
            `Catalog updated to ${res.version} (${res.itemsUpserted} items)`
        );
      } else if (res.status === 'UP_TO_DATE') {
        setCatalogFeedback((t.settings as any).catalogUpToDate || 'Catalog is up to date');
      } else if (res.status === 'SKIPPED') {
        setCatalogFeedback(res.error || (t.settings as any).catalogCheckError || 'Catalog update skipped');
      } else {
        setCatalogFeedback(res.error || (t.settings as any).catalogCheckError || 'Failed to check for updates');
      }
    } catch {
      setCatalogFeedback((t.settings as any).catalogCheckError || 'Failed to check for updates');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <h2 className="text-xl font-extrabold text-white tracking-wide">{t.settings.title}</h2>
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section 1: Language & Theme */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
            <Globe className="w-4 h-4 text-emerald-400" />
            <span>{t.settings.language} & {t.settings.theme}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Language */}
            <div>
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">{t.settings.language}</label>
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as any)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="es">Español (LatAm)</option>
                <option value="en">English (US)</option>
              </select>
            </div>

            {/* Theme */}
            <div>
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">{t.settings.theme}</label>
              <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`flex-1 py-1.5 flex justify-center items-center rounded-lg transition-all ${
                    theme === 'dark' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                  aria-label="Dark theme"
                >
                  <Moon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`flex-1 py-1.5 flex justify-center items-center rounded-lg transition-all ${
                    theme === 'light' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                  aria-label="Light theme"
                >
                  <Sun className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Goals */}
        <form onSubmit={handleSaveGoals} className="space-y-4 pt-2 border-t border-slate-800">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
            <Target className="w-4 h-4 text-emerald-400" />
            <span>Nutritional Targets</span>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1 font-medium">{t.settings.dailyTarget}</label>
            <input
              type="number"
              value={calorieTarget}
              onChange={(e) => setCalorieTarget(parseInt(e.target.value) || 0)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-rose-400 block mb-1 font-medium">Protein (g)</label>
              <input
                type="number"
                value={proteinTarget}
                onChange={(e) => setProteinTarget(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-rose-500"
              />
            </div>
            <div>
              <label className="text-xs text-amber-400 block mb-1 font-medium">Carbs (g)</label>
              <input
                type="number"
                value={carbsTarget}
                onChange={(e) => setCarbsTarget(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-cyan-400 block mb-1 font-medium">Fats (g)</label>
              <input
                type="number"
                value={fatsTarget}
                onChange={(e) => setFatsTarget(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-400 font-semibold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
          >
            <Save className="w-4 h-4" />
            <span>{isSaved ? 'Goals Saved!' : 'Save Targets'}</span>
          </button>
        </form>

        {/* Section 3: BYOS Sync Info */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
              <Cloud className="w-4 h-4 text-emerald-400" />
              <span>{t.sync?.panel?.title || t.settings.syncTitle}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsSettingsOpen(false);
                setIsStorageSettingsOpen(true);
              }}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 hover:underline"
            >
              <span>{t.sync?.actions?.storageSettings || 'Storage Settings →'}</span>
            </button>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
            <div className="text-xs text-slate-300 font-semibold flex items-center justify-between">
              <span>Storage Adapter</span>
              <span className="text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800/50">
                {activeProvider && activeProvider.isInitialized() && activeProvider.getStatus() !== 'disconnected'
                  ? activeProvider.name
                  : 'Local Only (No Adapter)'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Quomida runs 100% offline in your browser using RxDB IndexedDB. You can connect your personal Google Drive / Sheets account anytime.
            </p>
            <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-900 flex justify-between items-center">
              <span>{t.settings.syncLastSynced.replace('{{time}}', lastSyncedTime || 'Now')}</span>
              <button
                type="button"
                onClick={() => {
                  setIsSettingsOpen(false);
                  setIsStorageSettingsOpen(true);
                }}
                className="text-emerald-400 hover:underline text-[11px] font-medium"
              >
                Manage Storage
              </button>
            </div>
          </div>
        </div>

        {/* Section 4: Built-in Catalog Management [APP-208] */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
            <Database className="w-4 h-4 text-emerald-400" />
            <span>{(t.settings as any).catalogTitle || 'Food Catalog & Ingredients'}</span>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                {((t.settings as any).catalogVersion || 'Catalog Version: {{version}}').replace(
                  '{{version}}',
                  catalogVersion || 'seed_v1'
                )}
              </span>
            </div>

            <button
              type="button"
              onClick={handleCheckCatalogUpdates}
              disabled={isHydratingCatalog}
              className="w-full min-h-[44px] py-2.5 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-emerald-400 font-semibold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
              aria-label={(t.settings as any).checkCatalogUpdates || 'Check for Catalog Updates'}
            >
              <RefreshCw className={`w-4 h-4 ${isHydratingCatalog ? 'animate-spin' : ''}`} />
              <span>
                {isHydratingCatalog
                  ? (t.settings as any).checkingCatalog || 'Checking for updates...'
                  : (t.settings as any).checkCatalogUpdates || 'Check for Catalog Updates'}
              </span>
            </button>

            {catalogFeedback && (
              <div
                aria-live="polite"
                className="text-xs text-center p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 font-medium"
              >
                {catalogFeedback}
              </div>
            )}
          </div>
        </div>

        {/* Section 5: App Version */}
        <div className="pt-2 border-t border-slate-800/80 text-center">
          <span className="text-xs text-slate-500 font-mono">
            Version {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}
          </span>
        </div>

      </div>
    </div>
  );
};
