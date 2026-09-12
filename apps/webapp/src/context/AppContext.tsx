import React, { createContext, useContext, useEffect, useState } from 'react';
import { getDatabase, type QuomidaDatabase } from '../db/rxdb.js';
import {
  type BaseIngredient,
  type Portion,
  type DailyLog,
  type UserSettings,
  type MealType,
  calculateItemMacros,
  convertPortionToGrams,
  createMacroSnapshot
} from '@quomida/domain-core';
import { MockSyncAdapter, type SyncAdapter, type SyncStatus } from '@quomida/sync-adapters';
import { dictionaries, type LocaleKey } from '@quomida/i18n-locales';

interface AppContextType {
  db: QuomidaDatabase | null;
  selectedDate: string; // YYYY-MM-DD
  setSelectedDate: (date: string) => void;
  locale: LocaleKey;
  setLocale: (lang: LocaleKey) => void;
  theme: 'dark' | 'light' | 'system';
  setTheme: (theme: 'dark' | 'light' | 'system') => void;
  t: typeof dictionaries['es'];
  userSettings: UserSettings;
  updateUserSettings: (newSettings: Partial<UserSettings>) => Promise<void>;
  ingredients: BaseIngredient[];
  portions: Portion[];
  dailyLogs: DailyLog[];
  syncStatus: SyncStatus;
  lastSyncedTime: string | null;
  logFoodItem: (
    ingredient: BaseIngredient,
    mealType: MealType,
    quantity: number,
    portionName: string
  ) => Promise<void>;
  deleteLogItem: (id: string) => Promise<void>;
  addCustomIngredient: (ing: Omit<BaseIngredient, 'id' | 'source'>) => Promise<void>;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  isCatalogOpen: boolean;
  setIsCatalogOpen: (open: boolean) => void;
}

const defaultSettings: UserSettings = {
  id: 'global_settings',
  locale: 'es-AR',
  theme: 'dark',
  daily_calorie_target: 2000,
  custom_macros: { protein: 150, carbs: 200, fats: 65 }
};

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<QuomidaDatabase | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [locale, setLocaleState] = useState<LocaleKey>('es');
  const [theme, setThemeState] = useState<'dark' | 'light' | 'system'>('dark');
  const [userSettings, setUserSettings] = useState<UserSettings>(defaultSettings);
  const [ingredients, setIngredients] = useState<BaseIngredient[]>([]);
  const [portions, setPortions] = useState<Portion[]>([]);
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [syncAdapter] = useState<SyncAdapter>(() => new MockSyncAdapter());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(new Date().toLocaleTimeString());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);

  // Initialize Database & Adapters
  useEffect(() => {
    let subLogs: any = null;
    let subIngs: any = null;

    getDatabase().then(async (rxdb) => {
      setDb(rxdb);
      await syncAdapter.initialize();
      setSyncStatus(syncAdapter.getStatus());

      // Load settings
      const settingsDoc = await rxdb.user_settings.findOne('global_settings').exec();
      if (settingsDoc) {
        const s = settingsDoc.toJSON() as UserSettings;
        setUserSettings(s);
        if (s.locale.startsWith('en')) setLocaleState('en');
        if (s.theme) setThemeState(s.theme as any);
      }

      // Load Portions
      const pDocs = await rxdb.portions.find().exec();
      setPortions(pDocs.map((d: any) => d.toJSON()));

      // Subscribe to Base Ingredients
      subIngs = rxdb.base_ingredients.find().$.subscribe((docs: any[]) => {
        setIngredients(docs.map((d) => d.toJSON()));
      });

      // Subscribe to Daily Logs for selected date
      subLogs = rxdb.daily_logs.find({ selector: { date: selectedDate } }).$.subscribe((docs: any[]) => {
        setDailyLogs(docs.map((d) => d.toJSON()));
      });
    });

    return () => {
      subLogs?.unsubscribe();
      subIngs?.unsubscribe();
    };
  }, [selectedDate]);

  // Update HTML tag lang & dark mode
  useEffect(() => {
    document.documentElement.lang = locale;
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [locale, theme]);

  const setLocale = (lang: LocaleKey) => {
    setLocaleState(lang);
    if (db) {
      db.user_settings.upsert({
        ...userSettings,
        locale: lang === 'es' ? 'es-AR' : 'en-US'
      });
    }
  };

  const setTheme = (t: 'dark' | 'light' | 'system') => {
    setThemeState(t);
    if (db) {
      db.user_settings.upsert({
        ...userSettings,
        theme: t
      });
    }
  };

  const updateUserSettings = async (newSettings: Partial<UserSettings>) => {
    const updated = { ...userSettings, ...newSettings };
    setUserSettings(updated);
    if (db) {
      await db.user_settings.upsert(updated);
      await syncAdapter.push({
        collection: 'user_settings',
        documents: [updated]
      });
      setLastSyncedTime(new Date().toLocaleTimeString());
    }
  };

  const logFoodItem = async (
    ingredient: BaseIngredient,
    mealType: MealType,
    quantity: number,
    portionName: string
  ) => {
    if (!db) return;
    const weightGrams = convertPortionToGrams(quantity, portionName, portions);
    const rawMacros = calculateItemMacros(ingredient, weightGrams);
    const macrosSnapshot = createMacroSnapshot(rawMacros);

    const logEntry: DailyLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      date: selectedDate,
      meal_type: mealType,
      food_reference_id: ingredient.id,
      quantity,
      portion_name: portionName,
      macros: macrosSnapshot
    };

    await db.daily_logs.insert(logEntry);
    await syncAdapter.push({
      collection: 'daily_logs',
      documents: [logEntry]
    });
    setLastSyncedTime(new Date().toLocaleTimeString());
  };

  const deleteLogItem = async (id: string) => {
    if (!db) return;
    const doc = await db.daily_logs.findOne(id).exec();
    if (doc) {
      await doc.remove();
      setLastSyncedTime(new Date().toLocaleTimeString());
    }
  };

  const addCustomIngredient = async (ingData: Omit<BaseIngredient, 'id' | 'source'>) => {
    if (!db) return;
    const customIng: BaseIngredient = {
      ...ingData,
      id: `custom_${Date.now()}`,
      source: 'custom'
    };
    await db.base_ingredients.insert(customIng);
  };

  const t = dictionaries[locale] || dictionaries.es;

  return (
    <AppContext.Provider
      value={{
        db,
        selectedDate,
        setSelectedDate,
        locale,
        setLocale,
        theme,
        setTheme,
        t,
        userSettings,
        updateUserSettings,
        ingredients,
        portions,
        dailyLogs,
        syncStatus,
        lastSyncedTime,
        logFoodItem,
        deleteLogItem,
        addCustomIngredient,
        isSettingsOpen,
        setIsSettingsOpen,
        isCatalogOpen,
        setIsCatalogOpen
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
