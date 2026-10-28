import React, { useState, useEffect } from 'react';
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
import { UserProfileGoalsScreen } from './components/profile/UserProfileGoalsScreen.js';
import type { BaseIngredient, FoodItem, MealType } from '@quomida/domain-core';
import { Cloud, X, Settings, Target, BarChart3, FolderHeart } from 'lucide-react';

export const DashboardContent: React.FC = () => {
  const {
    t,
    isSettingsOpen,
    setIsSettingsOpen,
    isCatalogOpen,
    setIsCatalogOpen,
    isAnalyticsOpen,
    setIsAnalyticsOpen,
    isProfileOpen,
    setIsProfileOpen,
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

  const [portionOrigin, setPortionOrigin] = useState<'add_food' | 'catalog' | 'diary'>('diary');
  const [previousScreenBeforeSettings, setPreviousScreenBeforeSettings] = useState<'diary' | 'catalog' | 'analytics' | 'profile' | 'add_food'>('diary');

  // Track the active screen before settings is opened
  useEffect(() => {
    if (!isSettingsOpen) {
      if (isAddFoodModalOpen) {
        setPreviousScreenBeforeSettings('add_food');
      } else if (isProfileOpen) {
        setPreviousScreenBeforeSettings('profile');
      } else if (isCatalogOpen) {
        setPreviousScreenBeforeSettings('catalog');
      } else if (isAnalyticsOpen) {
        setPreviousScreenBeforeSettings('analytics');
      } else {
        setPreviousScreenBeforeSettings('diary');
      }
    }
  }, [isSettingsOpen, isAddFoodModalOpen, isProfileOpen, isCatalogOpen, isAnalyticsOpen]);

  const handleOpenPortionModal = (
    ingredient: FoodItem | BaseIngredient,
    mealType: MealType,
    origin?: 'add_food' | 'catalog' | 'diary'
  ) => {
    const resolvedOrigin = origin || (isAddFoodModalOpen ? 'add_food' : isCatalogOpen ? 'catalog' : 'diary');
    setPortionOrigin(resolvedOrigin);
    setSelectedIngredient(ingredient);
    setTargetMealType(mealType);
  };

  const handlePortionBack = () => {
    setSelectedIngredient(null);
    if (portionOrigin === 'add_food') {
      setIsAddFoodModalOpen(true);
    } else if (portionOrigin === 'catalog') {
      setIsCatalogOpen(true);
      setIsAnalyticsOpen(false);
      setIsProfileOpen(false);
    }
  };

  const handlePortionClose = () => {
    setSelectedIngredient(null);
    setIsAddFoodModalOpen(false);
  };

  const handleSettingsBack = () => {
    setIsSettingsOpen(false);
    if (previousScreenBeforeSettings === 'profile') {
      setIsProfileOpen(true);
      setIsCatalogOpen(false);
      setIsAnalyticsOpen(false);
    } else if (previousScreenBeforeSettings === 'catalog') {
      setIsCatalogOpen(true);
      setIsAnalyticsOpen(false);
      setIsProfileOpen(false);
    } else if (previousScreenBeforeSettings === 'analytics') {
      setIsAnalyticsOpen(true);
      setIsCatalogOpen(false);
      setIsProfileOpen(false);
    } else if (previousScreenBeforeSettings === 'add_food') {
      setIsAddFoodModalOpen(true);
    } else {
      setIsCatalogOpen(false);
      setIsAnalyticsOpen(false);
      setIsProfileOpen(false);
    }
  };

  const handleOpenAddModal = (mealType: MealType) => {
    setTargetMealType(mealType);
    setIsAddFoodModalOpen(true);
  };

  // 4-Tab Bottom Navigation State
  let activeTab: NavTab = 'diary';
  if (isProfileOpen) activeTab = 'settings';
  else if (isCatalogOpen) activeTab = 'catalog';
  else if (isAnalyticsOpen) activeTab = 'analytics';

  const handleSelectTab = (tab: NavTab) => {
    if (tab === 'diary') {
      setIsSettingsOpen(false);
      setIsCatalogOpen(false);
      setIsAnalyticsOpen(false);
      setIsProfileOpen(false);
      setIsAddFoodModalOpen(false);
      setSelectedIngredient(null);
    } else if (tab === 'analytics') {
      setIsSettingsOpen(false);
      setIsCatalogOpen(false);
      setIsProfileOpen(false);
      setIsAnalyticsOpen(true);
      setIsAddFoodModalOpen(false);
      setSelectedIngredient(null);
    } else if (tab === 'catalog') {
      setIsSettingsOpen(false);
      setIsProfileOpen(false);
      setIsAnalyticsOpen(false);
      setIsCatalogOpen(true);
      setIsAddFoodModalOpen(false);
      setSelectedIngredient(null);
    } else if (tab === 'settings') {
      setIsSettingsOpen(false);
      setIsCatalogOpen(false);
      setIsAnalyticsOpen(false);
      setIsProfileOpen(true);
      setIsAddFoodModalOpen(false);
      setSelectedIngredient(null);
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
            <div className="w-10">
              {activeTab === 'settings' && (
                <button
                  id="btn-profile-open-settings"
                  data-testid="btn-profile-open-settings"
                  onClick={() => setIsSettingsOpen(true)}
                  aria-label={t.settings.title}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-full text-slate-400 hover:text-white transition-all active:scale-95"
                >
                  <Settings className="w-5 h-5" />
                </button>
              )}
            </div>
            <h1 className="text-sm font-bold text-white tracking-tight flex items-center justify-center gap-1.5">
              {activeTab === 'analytics' ? (
                <>
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  <span>{t.analytics?.title || t.nav?.analytics || 'Progress'}</span>
                </>
              ) : activeTab === 'catalog' ? (
                <>
                  <FolderHeart className="w-4 h-4 text-emerald-400" />
                  <span>{t.nav?.catalog || t.catalog?.title || 'My Foods'}</span>
                </>
              ) : (
                <>
                  <Target className="w-4 h-4 text-emerald-400" />
                  <span>{(t.nav as any)?.goals || (t.goals as any)?.title || 'Goals'}</span>
                </>
              )}
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
          <CatalogManager onSelectFood={(item) => handleOpenPortionModal(item, 'meal_lunch', 'catalog')} />
        ) : activeTab === 'settings' ? (
          <UserProfileGoalsScreen onOpenSettings={() => setIsSettingsOpen(true)} />
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
        onSelectIngredient={(ingredient, mealType) => handleOpenPortionModal(ingredient, mealType, 'add_food')}
      />
      <PortionBottomSheet
        ingredient={selectedIngredient}
        defaultMealType={targetMealType}
        onClose={handlePortionClose}
        onBack={handlePortionBack}
      />
      <SettingsModal onBack={handleSettingsBack} />
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
