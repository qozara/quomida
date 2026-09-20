import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { LocalDBService, type QuomidaDatabase, type QuomidaDBError } from '../db/rxdb.js';
import { syncDatabaseWithRemote } from '../db/replication.js';
import { CatalogHydrationService, type HydrationResult } from '../services/CatalogHydrationService.js';
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
  resolveUXStatus,
  type CloudSyncProvider,
  type SyncStatus,
  type UXSyncState
} from '@quomida/cloud-providers';
import { dictionaries, type LocaleKey } from '@quomida/i18n-locales';
import { useCloudProviderRegistry } from '../cloud-providers/index.js';

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
  activeProvider: CloudSyncProvider | null;
  isOnline: boolean;
  lastSyncedTime: string | null;
  itemCounts: { logs: number; customFoods: number };
  forceSync: () => Promise<void>;
  reconnectProvider: () => Promise<void>;
  disconnectProvider: () => Promise<void>;
  connectProvider: (adapterId: string, token?: string) => Promise<void>;
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
  catalogVersion: string | null;
  isHydratingCatalog: boolean;
  refreshCatalog: (options?: { force?: boolean }) => Promise<HydrationResult>;
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
  const providerFactories = useCloudProviderRegistry();
  const [dbService] = useState<LocalDBService>(() => new LocalDBService());
  const [activeProvider, setActiveAdapter] = useState<CloudSyncProvider | null>(null);
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
  const [hydrationService] = useState(() => new CatalogHydrationService(dbService));
  const [isHydratingCatalog, setIsHydratingCatalog] = useState(false);
  const [catalogVersion, setCatalogVersion] = useState<string | null>(null);
  const syncLock = React.useRef(false);

  const refreshCatalog = useCallback(async (options?: { force?: boolean }): Promise<HydrationResult> => {
    setIsHydratingCatalog(true);
    try {
      const res = await hydrationService.hydrate(options);
      if (res.version) {
        setCatalogVersion(res.version);
      }
      return res;
    } finally {
      setIsHydratingCatalog(false);
    }
  }, [hydrationService]);

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
    if (!activeProvider) {
      setSyncStatus('disconnected');
      return;
    }
    setSyncStatus(activeProvider.getStatus());
    setLastSyncedTime(activeProvider.getLastSyncedTime());
    if (activeProvider.onStatusChange) {
      const unsub = activeProvider.onStatusChange((newStatus) => {
        setSyncStatus(newStatus);
        setLastSyncedTime(activeProvider.getLastSyncedTime());
      });
      return unsub;
    }
  }, [activeProvider]);

  // Online/Offline & Heartbeat connectivity monitoring
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (activeProvider && activeProvider.isInitialized() && activeProvider.getStatus() !== 'disconnected') {
        setSyncStatus(activeProvider.getStatus());
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
  }, [activeProvider]);

  // Initialize LocalDBService & RxDB Adapters
  useEffect(() => {
    let subLogs: any = null;
    let subIngs: any = null;

    dbService.init().then(async (rxdb) => {
      setDb(rxdb);
      const adapter = dbService.getCloudSyncProvider() || null;
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

      // Check if we need to auto-connect
      const activeProviderSettings = settings.active_cloud_provider;
      if (activeProviderSettings) {
        const factory = providerFactories.find((f: any) => f.id === activeProviderSettings.id);
        if (factory && !adapter) {
          try {
            const newAdapter = await factory.restore(activeProviderSettings.credentials);
            dbService.setCloudSyncProvider(newAdapter);
            setActiveAdapter(newAdapter);
            if (navigator.onLine) {
              setSyncStatus(newAdapter.getStatus());
            }
          } catch (err) {
            console.error('Failed to restore adapter', err);
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

      // Background asynchronous catalog hydration on boot [APP-207]
      dbService.getMetadata('lastIngestedCatalogVersion').then((v) => {
        if (v) setCatalogVersion(v);
      });
      refreshCatalog().catch((err) => {
        console.warn('[CatalogHydration] Background boot hydration notice:', err);
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
    
    // Background sync - do not await to keep UI responsive
    forceSync().catch(console.error);
  };

  const forceSync = useCallback(async () => {
    if (!activeProvider || !isOnline || syncLock.current) return;
    syncLock.current = true;
    setSyncStatus('syncing');
    try {
      if (db) {
        await syncDatabaseWithRemote(db, activeProvider);
      }
    } finally {
      setSyncStatus(activeProvider.getStatus());
      setLastSyncedTime(activeProvider.getLastSyncedTime() || new Date().toLocaleTimeString());
      syncLock.current = false;
    }
  }, [activeProvider, isOnline, db]);

  // Transparent Background Sync: Polling and Visibility focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        forceSync().catch(console.error);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Poll for remote changes every 1 minute
    const syncInterval = setInterval(() => {
      forceSync().catch(console.error);
    }, 60000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(syncInterval);
    };
  }, [forceSync]);

  const reconnectProvider = async () => {
    if (!activeProvider) return;
    if (activeProvider.reauthenticate) {
      await activeProvider.reauthenticate();
    }
    setSyncStatus(activeProvider.getStatus());
    setLastSyncedTime(activeProvider.getLastSyncedTime() || new Date().toLocaleTimeString());
  };

  const repairSync = async () => {
    if (!activeProvider || !activeProvider.repair) return;
    await activeProvider.repair();
    setSyncStatus(activeProvider.getStatus());
    setLastSyncedTime(activeProvider.getLastSyncedTime() || new Date().toLocaleTimeString());
  };

  const migrateSync = async () => {
    if (!activeProvider || !activeProvider.migrate) return;
    await activeProvider.migrate();
    setSyncStatus(activeProvider.getStatus());
    setLastSyncedTime(activeProvider.getLastSyncedTime() || new Date().toLocaleTimeString());
  };

  const disconnectProvider = async () => {
    if (activeProvider && activeProvider.disconnect) {
      await activeProvider.disconnect();
    }
    dbService.setCloudSyncProvider(undefined);
    setActiveAdapter(null);
    setSyncStatus('disconnected');
    
    // Clear cloud tokens
    if (userSettings) {
      await updateUserSettings({
        active_cloud_provider: undefined
      });
    }
  };

  const connectProvider = async (adapterId: string) => {
    const factory = providerFactories.find((f: any) => f.id === adapterId);
    if (!factory) return;
    
    const { adapter, credentials } = await factory.connect();
    
    await updateUserSettings({
      active_cloud_provider: { id: adapterId, credentials }
    });

    dbService.setCloudSyncProvider(adapter);
    setActiveAdapter(adapter);
    setSyncStatus(adapter.getStatus());
    setLastSyncedTime(adapter.getLastSyncedTime() || new Date().toLocaleTimeString());
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

    // Background sync - do not await
    forceSync().catch(console.error);
  };

  const deleteLogItem = async (id: string) => {
    await dbService.deleteLogItem(id);
    forceSync().catch(console.error);
  };

  const addCustomIngredient = async (ingData: Omit<BaseIngredient, 'id' | 'source'>) => {
    await dbService.saveCustomFood(ingData);
    forceSync().catch(console.error);
  };

  const hasActiveAdapter = Boolean(
    activeProvider &&
    activeProvider.isInitialized() &&
    activeProvider.getStatus() !== 'disconnected'
  );

  const uxSyncState: UXSyncState = resolveUXStatus({
    isOnline,
    adapter: hasActiveAdapter ? activeProvider : null,
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
        activeProvider,
        isOnline,
        lastSyncedTime,
        itemCounts,
        forceSync,
        reconnectProvider,
        disconnectProvider,
        connectProvider,
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
        clearLocalDatabase: clearDatabase,
        catalogVersion,
        isHydratingCatalog,
        refreshCatalog
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

