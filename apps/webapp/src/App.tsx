import React, { useState } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AppProvider, useApp } from './context/AppContext.js';
import { Header } from './components/Header.js';
import { MacroRings } from './components/MacroRings.js';
import { FoodLogger } from './components/FoodLogger.js';
import { MealSection } from './components/MealSection.js';
import { PortionBottomSheet } from './components/PortionBottomSheet.js';
import { SettingsModal } from './components/SettingsModal.js';
import { CatalogManager } from './components/CatalogManager.js';
import { StorageSettingsPanel, SchemaRemediationModal } from './components/sync/index.js';
import { DatabaseRecoveryScreen } from './components/DatabaseRecoveryScreen.js';
import type { BaseIngredient, MealType } from '@quomida/domain-core';
import { Plus } from 'lucide-react';

const DashboardContent: React.FC = () => {
  const { t, isStorageSettingsOpen, setIsStorageSettingsOpen, dbInitError, dbVersion, clearLocalDatabase } = useApp();
  const [selectedIngredient, setSelectedIngredient] = useState<BaseIngredient | null>(null);

  const [targetMealType, setTargetMealType] = useState<MealType>('meal_lunch');

  if (dbInitError) {
    return <DatabaseRecoveryScreen error={dbInitError} dbVersion={dbVersion} />;
  }

  const handleOpenPortionModal = (ingredient: BaseIngredient, mealType: MealType) => {
    setSelectedIngredient(ingredient);
    setTargetMealType(mealType);
  };

  const handleFabClick = () => {
    const searchInput = document.getElementById('input-food-search');
    if (searchInput) {
      searchInput.focus();
      searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">
      {/* Top Fixed Header */}
      <Header />

      {/* Main Container */}
      <main className="max-w-md mx-auto px-4 pt-4 space-y-5">
        
        {/* Dynamic Macro Summary Rings */}
        <MacroRings />

        {/* Search & Natural Language Input Switcher */}
        <FoodLogger onSelectIngredient={handleOpenPortionModal} />

        {/* Meal Categories Accordion */}
        <div className="space-y-3">
          <MealSection
            mealType="meal_breakfast"
            title={t.dashboard.meals.breakfast}
            onOpenPortionModal={handleOpenPortionModal}
          />
          <MealSection
            mealType="meal_lunch"
            title={t.dashboard.meals.lunch}
            onOpenPortionModal={handleOpenPortionModal}
          />
          <MealSection
            mealType="meal_dinner"
            title={t.dashboard.meals.dinner}
            onOpenPortionModal={handleOpenPortionModal}
          />
          <MealSection
            mealType="meal_snack"
            title={t.dashboard.meals.snack}
            onOpenPortionModal={handleOpenPortionModal}
          />
        </div>

      </main>

      {/* Floating Action Button (FAB "+") */}
      <button
        onClick={handleFabClick}
        id="fab-add-food"
        aria-label="Add Food Log"
        className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white rounded-full shadow-2xl shadow-emerald-950/80 flex items-center justify-center transition-all duration-200 border border-emerald-400/40"
      >
        <Plus className="w-7 h-7" />
      </button>

      {/* Modals & Bottom Sheets */}
      <PortionBottomSheet
        ingredient={selectedIngredient}
        defaultMealType={targetMealType}
        onClose={() => setSelectedIngredient(null)}
      />
      <SettingsModal />
      <CatalogManager />
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
