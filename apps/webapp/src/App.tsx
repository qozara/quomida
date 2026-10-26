import React, { useState } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AppProvider, useApp } from './context/AppContext.js';
import { DashboardDateBar } from './components/DashboardDateBar.js';
import { MacroRings } from './components/MacroRings.js';
import { MealSection } from './components/MealSection.js';
import { PortionBottomSheet } from './components/PortionBottomSheet.js';
import { SettingsModal } from './components/SettingsModal.js';
import { CatalogManager } from './components/CatalogManager.js';
import { DashboardWeightPill } from './components/DashboardWeightPill.js';
import { WeightQuickLogModal } from './components/WeightQuickLogModal.js';
import { AnalyticsScreen } from './components/analytics/AnalyticsScreen.js';
import { StorageSettingsPanel, SchemaRemediationModal, HeaderSyncTrigger } from './components/sync/index.js';
import { DatabaseRecoveryScreen } from './components/DatabaseRecoveryScreen.js';
import { BottomNav, type NavTab } from './components/navigation/BottomNav.js';
import { AddFoodModal } from './components/AddFoodModal.js';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt.js';
import type { BaseIngredient, FoodItem, MealType } from '@quomida/domain-core';
import { Cloud, X } from 'lucide-react';

export const DashboardContent: React.FC = () => {
  const {
    t,
    isSettingsOpen,
    setIsSettingsOpen,
    isCatalogOpen,
    setIsCatalogOpen,
    isAnalyticsOpen,
    setIsAnalyticsOpen,
    isStorageSettingsOpen,
    setIsStorageSettingsOpen,
    dbInitError,
    dbVersion,
    uxSyncState,
    itemCounts,
    activeProvider,
    userSettings
  } = useApp();
  const [selectedIngredient, setSelectedIngredient] = useState<FoodItem | BaseIngredient | null>(null);

  const [targetMealType, setTargetMealType] = useState<MealType>('meal_lunch');
  const [isAddFoodModalOpen, setIsAddFoodModalOpen] = useState(false);

  const [isBannerDismissed, setIsBannerDismissed] = useState(() => {
    return localStorage.getItem('quomida_onboarding_dismissed') === 'true';
  });

  React.useEffect(() => {
    if (activeProvider || uxSyncState !== 'local' || userSettings?.active_cloud_provider) {
      setIsBannerDismissed(true);
      localStorage.setItem('quomida_onboarding_dismissed', 'true');
    }
  }, [activeProvider, uxSyncState, userSettings?.active_cloud_provider]);

  if (dbInitError) {
    return <DatabaseRecoveryScreen error={dbInitError} dbVersion={dbVersion} />;
  }

  const handleDismissBanner = () => {
    setIsBannerDismissed(true);
    localStorage.setItem('quomida_onboarding_dismissed', 'true');
  };

  const handleConnectFromBanner = () => {
    setIsBannerDismissed(true);
    localStorage.setItem('quomida_onboarding_dismissed', 'true');
    setIsStorageSettingsOpen(true);
  };

  const handleOpenPortionModal = (ingredient: FoodItem | BaseIngredient, mealType: MealType) => {
    setSelectedIngredient(ingredient);
    setTargetMealType(mealType);
  };

  const handleOpenAddModal = (mealType: MealType) => {
    setTargetMealType(mealType);
    setIsAddFoodModalOpen(true);
  };

  // 4-Tab Bottom Navigation State
  let activeTab: NavTab = 'diary';
  if (isSettingsOpen) activeTab = 'settings';
  else if (isCatalogOpen) activeTab = 'catalog';
  else if (isAnalyticsOpen) activeTab = 'analytics';

  const handleSelectTab = (tab: NavTab) => {
    if (tab === 'diary') {
      setIsSettingsOpen(false);
      setIsCatalogOpen(false);
      setIsAnalyticsOpen(false);
    } else if (tab === 'analytics') {
      setIsSettingsOpen(false);
      setIsCatalogOpen(false);
      setIsAnalyticsOpen(true);
    } else if (tab === 'catalog') {
      setIsSettingsOpen(false);
      setIsAnalyticsOpen(false);
      setIsCatalogOpen(true);
    } else if (tab === 'settings') {
      setIsCatalogOpen(false);
      setIsAnalyticsOpen(false);
      setIsSettingsOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-28">
      {/* Sticky Header Navigation */}
      {activeTab === 'diary' ? (
        <DashboardDateBar />
      ) : (
        <div className="sticky top-0 z-30 w-full bg-slate-950/90 backdrop-blur-md border-b border-slate-800/40">
          <div className="max-w-md mx-auto px-4 py-2 flex items-center justify-between">
            <div className="w-10" />
            <h1 className="text-sm font-bold text-white tracking-tight">
              {activeTab === 'analytics'
                ? (t.analytics?.title || 'Analytics')
                : (t.catalog?.title || t.nav?.catalog || 'Catalog')}
            </h1>
            <div className="w-10 flex items-center justify-end">
              <HeaderSyncTrigger />
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="max-w-md mx-auto px-4 pt-4 space-y-5">
        {activeTab === 'analytics' ? (
          <AnalyticsScreen />
        ) : activeTab === 'catalog' ? (
          <CatalogManager onSelectFood={(item) => handleOpenPortionModal(item, 'meal_lunch')} />
        ) : (
          <>
            {/* Onboarding Banner for Fresh Devices */}
            {uxSyncState === 'local' && itemCounts.logs === 0 && !isBannerDismissed && !activeProvider && !userSettings?.active_cloud_provider && (
              <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-4 shadow-lg flex flex-col gap-3 animate-in fade-in zoom-in-95 relative">
                <button 
                  onClick={handleDismissBanner}
                  className="absolute top-2 right-2 p-1 text-slate-400 hover:text-slate-200 transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex gap-3 items-start pr-6">
                  <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-full shrink-0">
                    <Cloud className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{t.dashboard.onboarding?.title || 'Returning User?'}</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {t.dashboard.onboarding?.description || 'Connect a cloud storage provider to restore your data and sync seamlessly across devices.'}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={handleConnectFromBanner}
                  className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-sm active:scale-[0.98]"
                >
                  {t.dashboard.onboarding?.connect || 'Connect Cloud Storage'}
                </button>
              </div>
            )}

            {/* Dynamic Macro Summary Rings */}
            <MacroRings />

            {/* Quick Weight Entry Widget */}
            <DashboardWeightPill />

            {/* Meal Categories Accordion */}
            <div className="space-y-3">
              <MealSection
                mealType="meal_breakfast"
                title={t.dashboard.meals.breakfast}
                onOpenPortionModal={handleOpenPortionModal}
                onOpenAddModal={handleOpenAddModal}
              />
              <MealSection
                mealType="meal_lunch"
                title={t.dashboard.meals.lunch}
                onOpenPortionModal={handleOpenPortionModal}
                onOpenAddModal={handleOpenAddModal}
              />
              <MealSection
                mealType="meal_dinner"
                title={t.dashboard.meals.dinner}
                onOpenPortionModal={handleOpenPortionModal}
                onOpenAddModal={handleOpenAddModal}
              />
              <MealSection
                mealType="meal_snack"
                title={t.dashboard.meals.snack}
                onOpenPortionModal={handleOpenPortionModal}
                onOpenAddModal={handleOpenAddModal}
              />
            </div>
          </>
        )}
      </main>

      {/* 4-Tab Bottom Navigation Bar */}
      <BottomNav activeTab={activeTab} onSelectTab={handleSelectTab} />

      {/* Non-Disruptive PWA Update Prompt Toast */}
      <PwaUpdatePrompt />

      {/* Modals & Bottom Sheets */}
      <AddFoodModal
        isOpen={isAddFoodModalOpen}
        targetMealType={targetMealType}
        onClose={() => setIsAddFoodModalOpen(false)}
        onSelectIngredient={handleOpenPortionModal}
      />
      <PortionBottomSheet
        ingredient={selectedIngredient}
        defaultMealType={targetMealType}
        onClose={() => setSelectedIngredient(null)}
      />
      <SettingsModal />
      <WeightQuickLogModal />
      <StorageSettingsPanel
        isOpen={isStorageSettingsOpen}
        onClose={() => setIsStorageSettingsOpen(false)}
      />
      <SchemaRemediationModal />
    </div>
  );
};

export const App: React.FC = () => {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'dummy_client_id';

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <AppProvider>
        <DashboardContent />
      </AppProvider>
    </GoogleOAuthProvider>
  );
};

export default App;
