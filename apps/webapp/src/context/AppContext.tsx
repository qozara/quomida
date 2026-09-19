import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { LocalDBService, type QuomidaDatabase, type QuomidaDBError } from '../db/rxdb.js';
import {
  type BaseIngredient,
  type Portion,
  type DailyLog,
  type UserSettings,
  type MealType,
  calculateItemMacros,
  convertPortionToGrams,
  createMacroSnapshot,
  dailyLogsSchema
} from '@quomida/domain-core';
import {
  MockSyncAdapter,
  GoogleDriveSheetsSyncAdapter,
  resolveUXStatus,
  type SyncAdapter,
  type SyncStatus,
  type UXSyncState
} from '@quomida/sync-adapters';
import { dictionaries, type LocaleKey } from '@quomida/i18n-locales';

interface AppContextType {
  db: QuomidaDatabase | null;
  dbService: LocalDBService;
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
  uxSyncState: UXSyncState;
  activeAdapter: SyncAdapter | null;
  isOnline: boolean;
  lastSyncedTime: string | null;
  itemCounts: { logs: number; customFoods: number };
  forceSync: () => Promise<void>;
  reconnectAdapter: () => Promise<void>;
  disconnectAdapter: () => Promise<void>;
  connectAdapter: (adapterId: string, token?: string) => Promise<void>;
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
  isStorageSettingsOpen: boolean;
  setIsStorageSettingsOpen: (open: boolean) => void;
  dbInitError: QuomidaDBError | null;
  dbVersion: number;
  clearLocalDatabase: () => Promise<void>;
  repairSync: () => Promise<void>;
  migrateSync: () => Promise<void>;
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
  const [initialAdapter] = useState<SyncAdapter>(() => new MockSyncAdapter());
  const [dbService] = useState<LocalDBService>(() => new LocalDBService(undefined, initialAdapter));
  const [activeAdapter, setActiveAdapter] = useState<SyncAdapter | null>(initialAdapter);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(new Date().toLocaleTimeString());
  const [itemCounts, setItemCounts] = useState<{ logs: number; customFoods: number }>({ logs: 0, customFoods: 0 });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isStorageSettingsOpen, setIsStorageSettingsOpen] = useState(false);
  const [dbInitError, setDbInitError] = useState<QuomidaDBError | null>(null);

  const clearDatabase = useCallback(async () => {
    try {
      await dbService.resetDatabase();
      setDbInitError(null);
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (err) {
      console.error('[AppContext] Failed to reset database:', err);
      if (typeof window !== 'undefined' && 'indexedDB' in window) {
        try {
          window.indexedDB.deleteDatabase('quomidadb_v1');
        } catch {
          // ignore
        }
        window.location.reload();
      }
    }
  }, [dbService]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).quomidaResetDatabase = clearDatabase;
    }
  }, [clearDatabase]);


  // Initialize LocalDBService & RxDB Adapters
  // Subscribe to active adapter status changes
  useEffect(() => {
    if (!activeAdapter) {
      setSyncStatus('disconnected');
      return;
    }
    setSyncStatus(activeAdapter.getStatus());
    setLastSyncedTime(activeAdapter.getLastSyncedTime());
    if (activeAdapter.onStatusChange) {
      const unsub = activeAdapter.onStatusChange((newStatus) => {
        setSyncStatus(newStatus);
        setLastSyncedTime(activeAdapter.getLastSyncedTime());
      });
      return unsub;
    }
  }, [activeAdapter]);

  // Online/Offline & Heartbeat connectivity monitoring
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (activeAdapter && activeAdapter.isInitialized() && activeAdapter.getStatus() !== 'disconnected') {
        setSyncStatus(activeAdapter.getStatus());
      } else {
        setSyncStatus('disconnected');
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const checkHeartbeat = async () => {
      if (!navigator.onLine) {
        setIsOnline(false);
        return;
      }
      try {
        const response = await fetch('/', { method: 'HEAD', cache: 'no-store' });
        setIsOnline(response.ok);
      } catch {
        setIsOnline(false);
      }
    };

    checkHeartbeat();
    const interval = setInterval(checkHeartbeat, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [activeAdapter]);

  // Initialize LocalDBService & RxDB Adapters
  useEffect(() => {
    let subLogs: any = null;
    let subIngs: any = null;

    dbService.init().then(async (rxdb) => {
      setDb(rxdb);
      const adapter = dbService.getSyncAdapter() || null;
      setActiveAdapter(adapter);
      if (adapter && navigator.onLine) {
        setSyncStatus(adapter.getStatus());
      } else if (!navigator.onLine) {
        setSyncStatus('disconnected');
      }

      // Load settings from repository
      const settings = await dbService.getSettings();
      setUserSettings(settings);
      if (settings.locale?.startsWith('en')) setLocaleState('en');
      if (settings.theme) setThemeState(settings.theme as any);

      // Check if we need to auto-connect to Google
      const isInitialOrNone = !adapter || adapter.id === 'mock-sync-adapter';
      if (isInitialOrNone && settings.cloud_providers?.google?.accessToken) {
        const expiresAt = settings.cloud_providers.google.expiresAt;
        if (Date.now() < expiresAt) {
          const newAdapter = new GoogleDriveSheetsSyncAdapter();
          await newAdapter.initialize(settings.cloud_providers.google.accessToken);
          dbService.setSyncAdapter(newAdapter);
          setActiveAdapter(newAdapter);
          if (navigator.onLine) {
            setSyncStatus(newAdapter.getStatus());
          }
        }
      }

      // Load Portions
      const pDocs = await rxdb.portions.find().exec();
      setPortions(pDocs.map((d: any) => d.toJSON()));

      // Subscribe to Base Ingredients
      subIngs = dbService.observeIngredients().subscribe((docs: any[]) => {
        setIngredients(docs.map((d) => (d.toJSON ? d.toJSON() : d)));
      });

      // Subscribe to Daily Logs for selected date
      subLogs = dbService.observeLogsByDate(selectedDate).subscribe((docs: any[]) => {
        setDailyLogs(docs.map((d) => (d.toJSON ? d.toJSON() : d)));
      });
    }).catch((err: any) => {
      console.error('[AppContext] Failed to initialize local database:', err);
      // Ensure the error is cast to QuomidaDBError if it isn't already
      const customError = err as QuomidaDBError;
      if (!customError.type) {
        customError.type = 'UNKNOWN';
      }
      setDbInitError(customError);
    });

    return () => {
      subLogs?.unsubscribe();
      subIngs?.unsubscribe();
    };
  }, [selectedDate, dbService]);

  // Update item counts for storage settings panel
  const updateItemCounts = useCallback(async () => {
    try {
      const counts = await dbService.getItemCounts();
      setItemCounts(counts);
    } catch {
      // Ignore if db not ready
    }
  }, [dbService]);

  useEffect(() => {
    if (db) {
      updateItemCounts();
    }
  }, [db, dailyLogs.length, ingredients.length, updateItemCounts]);

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
    dbService.saveSettings({ locale: lang === 'es' ? 'es-AR' : 'en-US' });
  };

  const setTheme = (t: 'dark' | 'light' | 'system') => {
    setThemeState(t);
    dbService.saveSettings({ theme: t });
  };

  const updateUserSettings = async (newSettings: Partial<UserSettings>) => {
    await dbService.saveSettings(newSettings);
    const updated = await dbService.getSettings();
    setUserSettings(updated);
    setLastSyncedTime(activeAdapter?.getLastSyncedTime() || new Date().toLocaleTimeString());
  };

  const forceSync = async () => {
    if (!activeAdapter || !isOnline || syncStatus === 'syncing') return;
    setSyncStatus('syncing');
    if (activeAdapter.forceSync) {
      await activeAdapter.forceSync();
    }
    setSyncStatus(activeAdapter.getStatus());
    setLastSyncedTime(activeAdapter.getLastSyncedTime() || new Date().toLocaleTimeString());
  };

  const reconnectAdapter = async () => {
    if (!activeAdapter) return;
    if (activeAdapter.reauthenticate) {
      await activeAdapter.reauthenticate();
    }
    setSyncStatus(activeAdapter.getStatus());
    setLastSyncedTime(activeAdapter.getLastSyncedTime() || new Date().toLocaleTimeString());
  };

  const repairSync = async () => {
    if (!activeAdapter || !activeAdapter.repair) return;
    await activeAdapter.repair();
    setSyncStatus(activeAdapter.getStatus());
    setLastSyncedTime(activeAdapter.getLastSyncedTime() || new Date().toLocaleTimeString());
  };

  const migrateSync = async () => {
    if (!activeAdapter || !activeAdapter.migrate) return;
    await activeAdapter.migrate();
    setSyncStatus(activeAdapter.getStatus());
    setLastSyncedTime(activeAdapter.getLastSyncedTime() || new Date().toLocaleTimeString());
  };

  const disconnectAdapter = async () => {
    if (activeAdapter && activeAdapter.disconnect) {
      await activeAdapter.disconnect();
    }
    dbService.setSyncAdapter(undefined);
    setActiveAdapter(null);
    setSyncStatus('disconnected');
    
    // Clear cloud tokens
    if (userSettings) {
      await updateUserSettings({
        cloud_providers: undefined
      });
    }
  };

  const connectAdapter = async (adapterId: string, token?: string) => {
    let newAdapter: SyncAdapter;
    if (adapterId === 'google-drive-sheets') {
      newAdapter = new GoogleDriveSheetsSyncAdapter();
      // Store token if provided
      if (token) {
        await updateUserSettings({
          cloud_providers: {
            ...userSettings?.cloud_providers,
            google: { accessToken: token, expiresAt: Date.now() + 3500000 }
          }
        });
      }
      const activeToken = token || userSettings?.cloud_providers?.google?.accessToken || '';
      await newAdapter.initialize(activeToken);
    } else {
      newAdapter = new MockSyncAdapter();
      await newAdapter.initialize();
    }
    dbService.setSyncAdapter(newAdapter);
    setActiveAdapter(newAdapter);
    setSyncStatus(newAdapter.getStatus());
    setLastSyncedTime(newAdapter.getLastSyncedTime() || new Date().toLocaleTimeString());
  };

  const logFoodItem = async (
    ingredient: BaseIngredient,
    mealType: MealType,
    quantity: number,
    portionName: string
  ) => {
    const weightGrams = convertPortionToGrams(quantity, portionName, portions);
    const rawMacros = calculateItemMacros(ingredient, weightGrams);
    const macrosSnapshot = createMacroSnapshot(rawMacros);

    await dbService.logFood({
      date: selectedDate,
      meal_type: mealType,
      food_reference_id: ingredient.id,
      food_name: ingredient.name,
      quantity,
      portion_name: portionName,
      macros: macrosSnapshot
    });

    setLastSyncedTime(activeAdapter?.getLastSyncedTime() || new Date().toLocaleTimeString());
  };

  const deleteLogItem = async (id: string) => {
    await dbService.deleteLogItem(id);
    setLastSyncedTime(activeAdapter?.getLastSyncedTime() || new Date().toLocaleTimeString());
  };

  const addCustomIngredient = async (ingData: Omit<BaseIngredient, 'id' | 'source'>) => {
    await dbService.saveCustomFood(ingData);
  };

  const hasActiveAdapter = Boolean(
    activeAdapter &&
    activeAdapter.isInitialized() &&
    activeAdapter.getStatus() !== 'disconnected'
  );

  const uxSyncState: UXSyncState = resolveUXStatus({
    isOnline,
    adapter: hasActiveAdapter ? activeAdapter : null,
    adapterStatus: hasActiveAdapter ? syncStatus : 'disconnected'
  });

  const t = dictionaries[locale] || dictionaries.es;

  return (
    <AppContext.Provider
      value={{
        db,
        dbService,
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
        uxSyncState,
        activeAdapter,
        isOnline,
        lastSyncedTime,
        itemCounts,
        forceSync,
        reconnectAdapter,
        disconnectAdapter,
        connectAdapter,
        repairSync,
        migrateSync,
        logFoodItem,
        deleteLogItem,
        addCustomIngredient,
        isSettingsOpen,
        setIsSettingsOpen,
        isCatalogOpen,
        setIsCatalogOpen,
        isStorageSettingsOpen,
        setIsStorageSettingsOpen,
        dbInitError,
        dbVersion: dailyLogsSchema.version,
        clearLocalDatabase: clearDatabase
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

