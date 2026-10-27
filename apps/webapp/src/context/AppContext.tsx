import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { LocalDBService, type QuomidaDatabase, type QuomidaDBError } from '../db/rxdb.js';
import { syncDatabaseWithRemote } from '../db/replication.js';
import { CatalogHydrationService, type HydrationResult } from '../services/CatalogHydrationService.js';
import { DatabaseBootstrapper } from '../services/DatabaseBootstrapper.js';
import { useCatalogDownload, refreshCatalogDownloadStatus } from '../hooks/useCatalogDownload.js';
import { RemoteCatalogService } from '../services/RemoteCatalogService.js';
import {
  type BaseIngredient,
  type Recipe,
  type RecipeFoodItem,
  type FoodItem,
  type Portion,
  type DailyLog,
  type UserSettings,
  type MealType,
  type WeightLog,
  RecipeManager,
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
  recipes: Recipe[];
  recipeFoods: RecipeFoodItem[];
  dailyLogs: DailyLog[];
  weightLogs: WeightLog[];
  logWeight: (date: string, weightKg: number, note?: string) => Promise<void>;
  deleteWeightLog: (idOrDate: string) => Promise<void>;
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
    food: FoodItem | BaseIngredient,
    mealType: MealType,
    quantity: number,
    portionName: string,
    passedPortions?: Portion[],
    dateOverride?: string
  ) => Promise<void>;
  logBatchFoodItems: (
    items: Array<{
      food: FoodItem | BaseIngredient;
      quantity: number;
      portionName: string;
      availablePortions?: Portion[];
      mealType?: MealType;
    }>,
    mealType: MealType
  ) => Promise<void>;
  deleteLogItem: (id: string) => Promise<void>;
  addCustomIngredient: (ing: Omit<BaseIngredient, 'id' | 'source'> & { id?: string }, portions?: { name: string, equivalent_weight_g: number }[]) => Promise<string>;
  removeCustomIngredient: (id: string) => Promise<void>;
  addRecipe: (recipe: Recipe, portions?: { name: string, equivalent_weight_g: number }[]) => Promise<string>;
  removeRecipe: (id: string) => Promise<void>;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  isCatalogOpen: boolean;
  setIsCatalogOpen: (open: boolean) => void;
  isStorageSettingsOpen: boolean;
  setIsStorageSettingsOpen: (open: boolean) => void;
  isAnalyticsOpen: boolean;
  setIsAnalyticsOpen: (open: boolean) => void;
  isProfileOpen: boolean;
  setIsProfileOpen: (open: boolean) => void;
  isWeightModalOpen: boolean;
  setIsWeightModalOpen: (open: boolean) => void;
  dbInitError: QuomidaDBError | null;
  dbVersion: number;
  clearLocalDatabase: () => Promise<void>;
  repairSync: () => Promise<void>;
  migrateSync: () => Promise<void>;
  catalogVersion: string | null;
  catalogGeneratedAt: string | null;
  catalogFileSizeBytes: number | null;
  catalogItemCount: number | null;
  refreshCatalog: (options?: { force?: boolean; saveMetadata?: boolean }) => Promise<HydrationResult>;
  resetCatalogState?: () => Promise<void>;
}

const defaultSettings: UserSettings = {
  id: 'global_settings',
  locale: 'es-AR',
  theme: 'dark',
  daily_calorie_target: 2000,
  custom_macros: { protein: 150, carbs: 200, fats: 65 },
  target_mode: 'manual',
  updatedAt: 0
};

export async function runWithSyncLock<T>(
  action: () => Promise<T>,
  fallbackLock: React.MutableRefObject<boolean>,
  pendingSync?: React.MutableRefObject<boolean>
): Promise<T | null> {
  const executeWithTrailingQueue = async (): Promise<T> => {
    let result = await action();
    while (pendingSync?.current) {
      pendingSync.current = false;
      result = await action();
    }
    return result;
  };

  if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
    if (fallbackLock.current) {
      if (pendingSync) {
        pendingSync.current = true;
      }
      return null;
    }
    return navigator.locks.request('quomida_sync_lock', { ifAvailable: true }, async (lock) => {
      if (!lock) {
        if (pendingSync) {
          pendingSync.current = true;
        }
        return null;
      }
      fallbackLock.current = true;
      try {
        return await executeWithTrailingQueue();
      } finally {
        fallbackLock.current = false;
      }
    });
  }

  if (fallbackLock.current) {
    if (pendingSync) {
      pendingSync.current = true;
    }
    return null;
  }
  fallbackLock.current = true;
  try {
    return await executeWithTrailingQueue();
  } finally {
    fallbackLock.current = false;
  }
}

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
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeManager] = useState(() => new RecipeManager());
  const recipeFoods = React.useMemo(() => {
    return recipes.map(r => recipeManager.toFoodItem(r));
  }, [recipes, recipeManager]);
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(new Date().toLocaleTimeString());
  const [itemCounts, setItemCounts] = useState<{ logs: number; customFoods: number }>({ logs: 0, customFoods: 0 });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isStorageSettingsOpen, setIsStorageSettingsOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [dbInitError, setDbInitError] = useState<QuomidaDBError | null>(null);
  const [hydrationService] = useState(() => new CatalogHydrationService(dbService));
  const [catalogVersion, setCatalogVersion] = useState<string | null>(null);
  const [catalogGeneratedAt, setCatalogGeneratedAt] = useState<string | null>(null);
  const [catalogFileSizeBytes, setCatalogFileSizeBytes] = useState<number | null>(null);
  const [catalogItemCount, setCatalogItemCount] = useState<number | null>(null);
  const syncLock = React.useRef(false);
  const pendingSyncRef = React.useRef(false);
  const hasBootHydratedRef = useRef(false);
  const { checkAndTriggerAutoDownload } = useCatalogDownload();

  const refreshCatalog = useCallback(async (options?: { force?: boolean; saveMetadata?: boolean }): Promise<HydrationResult> => {
    try {
      console.log('[AppContext] Checking for catalog updates with options:', options);
      const currentOpfsStatus = await refreshCatalogDownloadStatus();
      const shouldSaveMetadata = options?.saveMetadata !== undefined
        ? options.saveMetadata
        : currentOpfsStatus === 'complete';

      const res = await hydrationService.hydrate({
        ...options,
        saveMetadata: shouldSaveMetadata
      });
      console.log('[AppContext] Catalog hydration result:', res);
      if (shouldSaveMetadata) {
        if (res.version) setCatalogVersion(res.version);
        if (res.generatedAt) setCatalogGeneratedAt(res.generatedAt);
        if (res.fileSizeBytes) setCatalogFileSizeBytes(res.fileSizeBytes);
        if (res.itemCount !== undefined || res.itemsUpserted !== undefined) {
          setCatalogItemCount(res.itemCount ?? res.itemsUpserted ?? null);
        }
      }
      return res;
    } catch (e: any) {
      console.error('[AppContext] Failed to refresh catalog:', e);
      return { status: 'ERROR', itemsUpserted: 0, error: e?.message };
    }
  }, [hydrationService]);

  const resetCatalogState = useCallback(async () => {
    try {
      await dbService.setMetadata('lastIngestedCatalogVersion', '');
      await dbService.setMetadata('lastIngestedCatalogGeneratedAt', '');
      await dbService.setMetadata('lastIngestedCatalogFileSizeBytes', '');
      await dbService.setMetadata('lastIngestedCatalogItemCount', '');
    } catch (e) {
      console.warn('[AppContext] Could not clear catalog metadata:', e);
    }
    setCatalogVersion(null);
    setCatalogGeneratedAt(null);
    setCatalogFileSizeBytes(null);
    setCatalogItemCount(null);
  }, [dbService]);

  useEffect(() => {
    const unsub = RemoteCatalogService.onCatalogDownloaded(async () => {
      console.log('[AppContext] Detected catalog change event.');
      const status = await refreshCatalogDownloadStatus();
      if (status === 'complete') {
        await refreshCatalog();
      } else {
        await resetCatalogState();
      }
    });
    return unsub;
  }, [refreshCatalog, resetCatalogState]);

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
  // Subscribe to active adapter status and credential changes
  useEffect(() => {
    if (!activeProvider) {
      setSyncStatus('disconnected');
      return;
    }
    setSyncStatus(activeProvider.getStatus());
    setLastSyncedTime(activeProvider.getLastSyncedTime());
    const unsubStatus = activeProvider.onStatusChange
      ? activeProvider.onStatusChange((newStatus) => {
          setSyncStatus(newStatus);
          setLastSyncedTime(activeProvider.getLastSyncedTime());
        })
      : undefined;
    const unsubCreds = activeProvider.onCredentialsChange
      ? activeProvider.onCredentialsChange((newCredentials) => {
          dbService
            .saveSettings({
              active_cloud_provider: {
                id: activeProvider.id,
                credentials: newCredentials
              }
            })
            .then(() => dbService.getSettings())
            .then((updated) => {
              setUserSettings(updated);
            })
            .catch(console.error);
        })
      : undefined;
    return () => {
      unsubStatus?.();
      unsubCreds?.();
    };
  }, [activeProvider, dbService]);

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
    let subRecipes: any = null;
    let subWeightLogs: any = null;
    let subSettings: any = null;

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
      else if (settings.locale?.startsWith('es')) setLocaleState('es');
      if (settings.theme) setThemeState(settings.theme as any);

      // Check if we need to auto-connect before running boot adaptive calibration
      const activeProviderSettings = settings.active_cloud_provider;
      let autoConnectedAndSynced = false;
      if (activeProviderSettings) {
        const factory = providerFactories.find((f: any) => f.id === activeProviderSettings.id);
        if (factory && !adapter) {
          try {
            const newAdapter = await factory.restore(activeProviderSettings.credentials);
            dbService.setCloudSyncProvider(newAdapter);
            setActiveAdapter(newAdapter);
            if (navigator.onLine) {
              autoConnectedAndSynced = true;
              setSyncStatus(newAdapter.getStatus());
              runWithSyncLock(async () => {
                setSyncStatus('syncing');
                try {
                  await syncDatabaseWithRemote(rxdb, newAdapter);
                  await dbService.runAdaptiveCalibrationIfNeeded(selectedDate, true);
                  const updated = await dbService.getSettings();
                  setUserSettings(updated);
                  if (updated.locale?.startsWith('en')) setLocaleState('en');
                  else if (updated.locale?.startsWith('es')) setLocaleState('es');
                  if (updated.theme) setThemeState(updated.theme as any);
                } finally {
                  setSyncStatus(newAdapter.getStatus());
                  setLastSyncedTime(newAdapter.getLastSyncedTime() || new Date().toLocaleTimeString());
                }
              }, syncLock, pendingSyncRef).catch(console.error);
            }
          } catch (err) {
            console.error('Failed to restore adapter', err);
          }
        }
      }

      // Adaptive calibration check on boot (only immediately if not already syncing with remote on boot)
      if (!autoConnectedAndSynced) {
        dbService.runAdaptiveCalibrationIfNeeded(selectedDate).then((calibratedSettings) => {
          if (calibratedSettings) {
            setUserSettings(calibratedSettings);
          }
        }).catch((err) => {
          console.warn('[AppContext] Boot adaptive calibration notice:', err);
        });
      }


      // Subscribe to Custom Ingredients only (prevent loading millions of system items into memory)
      subIngs = dbService.getDatabaseInstance()!.base_ingredients.find({ selector: { source: 'custom' } }).$.subscribe((docs: any[]) => {
        setIngredients(docs.map((d) => (d.toJSON ? d.toJSON() : d)));
      });

      // Subscribe to Recipes
      subRecipes = dbService.observeRecipes().subscribe((docs: any[]) => {
        setRecipes(docs.map((d) => (d.toJSON ? d.toJSON() : d)));
      });

      // Subscribe to Daily Logs for selected date
      subLogs = dbService.observeLogsByDate(selectedDate).subscribe((docs: any[]) => {
        setDailyLogs(docs.map((d) => (d.toJSON ? d.toJSON() : d)));
      });

      // Subscribe to Weight Logs
      subWeightLogs = dbService.observeWeightLogs().subscribe((docs: WeightLog[]) => {
        setWeightLogs(docs);
      });

      // Subscribe to user_settings changes (e.g. from background sync or adaptive calibration)
      if (rxdb.user_settings) {
        const settingsDoc = rxdb.user_settings.findOne('global_settings');
        if (settingsDoc) {
          subSettings = settingsDoc.$.subscribe((doc: any) => {
            if (doc) {
              const json: UserSettings = doc.toJSON ? doc.toJSON() : doc;
              setUserSettings((prev) => {
                if (
                  prev.updatedAt === json.updatedAt &&
                  JSON.stringify(prev.active_cloud_provider) === JSON.stringify(json.active_cloud_provider)
                ) {
                  return prev;
                }
                return json;
              });
              if (json.locale?.startsWith('en')) {
                setLocaleState((prev) => (prev !== 'en' ? 'en' : prev));
              } else if (json.locale?.startsWith('es')) {
                setLocaleState((prev) => (prev !== 'es' ? 'es' : prev));
              }
              if (json.theme) {
                setThemeState((prev) => (prev !== json.theme ? json.theme as any : prev));
              }
            }
          });
        }
      }

      if (!hasBootHydratedRef.current) {
        hasBootHydratedRef.current = true;
        // Background asynchronous catalog hydration on boot [APP-207]
        dbService.getMetadata('lastIngestedCatalogVersion').then((v) => {
          if (v) setCatalogVersion(v);
        });
        dbService.getMetadata('lastIngestedCatalogGeneratedAt').then((v) => {
          if (v) setCatalogGeneratedAt(v);
        });
        dbService.getMetadata('lastIngestedCatalogFileSizeBytes').then((v) => {
          if (v) setCatalogFileSizeBytes(Number(v));
        });
        dbService.getMetadata('lastIngestedCatalogItemCount').then((v) => {
          if (v) setCatalogItemCount(Number(v));
        });
        DatabaseBootstrapper.ensureSystemCatalogOPFS().then(async () => {
          const currentOpfsStatus = await refreshCatalogDownloadStatus();
          if (currentOpfsStatus !== 'complete') {
            await resetCatalogState();
          }
          const res = await refreshCatalog();
          const isUpdateAvailable = res.status === 'UPDATED';

          // Only trigger auto-download if:
          // 1. Full catalog is NOT installed locally yet (currentOpfsStatus !== 'complete'), OR
          // 2. A newer catalog version was found (isUpdateAvailable)
          if (
            (currentOpfsStatus !== 'complete' || isUpdateAvailable) &&
            typeof window !== 'undefined' &&
            typeof Worker !== 'undefined' &&
            typeof checkAndTriggerAutoDownload === 'function'
          ) {
            const userPref = localStorage.getItem('catalog_auto_download_enabled') !== 'false';
            const baseUrl = (import.meta as any).env?.VITE_CATALOG_BASE_URL?.replace(/\/+$/, '') || '';
            const downloadUrl = baseUrl ? `${baseUrl}/catalog.sqlite.gz` : '/catalog.sqlite.gz';
            checkAndTriggerAutoDownload({
              downloadUrl,
              fileSizeBytes: res.fileSizeBytes,
              isOnline: navigator.onLine !== false,
              userAutoDownloadPref: userPref,
              isUpdateAvailable
            });
          }
        }).catch((err) => {
          console.warn('[CatalogHydration] Background boot hydration notice:', err);
        });
      }
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
      subRecipes?.unsubscribe();
      subWeightLogs?.unsubscribe();
      subSettings?.unsubscribe();
    };
  }, [selectedDate, dbService]);

  const forceSync = useCallback(async () => {
    if (!activeProvider || !isOnline) return;

    await runWithSyncLock(async () => {
      setSyncStatus('syncing');
      try {
        if (db) {
          await syncDatabaseWithRemote(db, activeProvider);
          await dbService.runAdaptiveCalibrationIfNeeded(selectedDate, true);
          const updated = await dbService.getSettings();
          setUserSettings(updated);
        }
      } finally {
        setSyncStatus(activeProvider.getStatus());
        setLastSyncedTime(activeProvider.getLastSyncedTime() || new Date().toLocaleTimeString());
      }
    }, syncLock, pendingSyncRef);
  }, [activeProvider, isOnline, db, dbService, selectedDate]);

  // Recalibrate adaptive targets when opening analytics modal using effective latest horizon
  useEffect(() => {
    if (isAnalyticsOpen && db) {
      const maxWeightDate = weightLogs.length > 0 ? weightLogs[weightLogs.length - 1].date : undefined;
      const effectiveDate = [
        selectedDate,
        maxWeightDate,
        userSettings.adaptive_state?.last_calibrated_date
      ].filter(Boolean).reduce((max, d) => (d! > max! ? d : max), selectedDate);

      const prevUpdatedAt = userSettings.updatedAt;
      dbService.runAdaptiveCalibrationIfNeeded(effectiveDate).then((calibratedSettings) => {
        if (calibratedSettings) {
          setUserSettings(calibratedSettings);
          if (calibratedSettings.updatedAt !== prevUpdatedAt) {
            forceSync().catch(console.error);
          }
        }
      }).catch((err) => {
        console.warn('[AppContext] Analytics open adaptive calibration notice:', err);
      });
    }
  }, [isAnalyticsOpen, selectedDate, weightLogs, userSettings.adaptive_state?.last_calibrated_date, userSettings.updatedAt, db, dbService, forceSync]);

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
  }, [db, dailyLogs.length, ingredients.length, recipes.length, updateItemCounts]);

  // Update HTML tag lang & dark mode
  useEffect(() => {
    document.documentElement.lang = locale;
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [locale, theme]);

  const setLocale = useCallback((lang: LocaleKey) => {
    setLocaleState((prev) => (prev !== lang ? lang : prev));
    dbService.getSettings().then(async (current) => {
      const targetLocale = lang === 'es' ? 'es-AR' : 'en-US';
      if (current.locale !== targetLocale) {
        await dbService.saveSettings({ locale: targetLocale });
        const updated = await dbService.getSettings();
        setUserSettings(updated);
        forceSync().catch(console.error);
      }
    });
  }, [dbService, forceSync]);

  const setTheme = useCallback((t: 'dark' | 'light' | 'system') => {
    setThemeState((prev) => (prev !== t ? t : prev));
    dbService.getSettings().then(async (current) => {
      if (current.theme !== t) {
        await dbService.saveSettings({ theme: t });
        const updated = await dbService.getSettings();
        setUserSettings(updated);
        forceSync().catch(console.error);
      }
    });
  }, [dbService, forceSync]);

  const updateUserSettings = async (newSettings: Partial<UserSettings>) => {
    await dbService.saveSettings(newSettings);
    const updated = await dbService.getSettings();
    setUserSettings(updated);
    
    // Background sync - do not await to keep UI responsive
    forceSync().catch(console.error);
  };


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

  // Auto-sync when transitioning back to online
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (!prevOnlineRef.current && isOnline) {
      if (activeProvider && activeProvider.isInitialized()) {
        forceSync().catch(console.error);
      }
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, activeProvider, forceSync]);

  const reconnectProvider = async () => {
    if (!activeProvider) return;
    if (activeProvider.reauthenticate) {
      await activeProvider.reauthenticate();
    }
    setSyncStatus(activeProvider.getStatus());
    setLastSyncedTime(activeProvider.getLastSyncedTime() || new Date().toLocaleTimeString());
    forceSync().catch(console.error);
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
    
    // Clear cloud tokens locally without bumping updatedAt or triggering remote push
    if (userSettings) {
      await dbService.saveSettings({
        active_cloud_provider: undefined
      });
      const updated = await dbService.getSettings();
      setUserSettings(updated);
    }
  };

  const connectProvider = async (adapterId: string) => {
    const factory = providerFactories.find((f: any) => f.id === adapterId);
    if (!factory) return;
    
    const { adapter, credentials } = await factory.connect();
    
    // Persist credentials locally without bumping updatedAt or pushing local factory defaults before pulling remote
    await dbService.saveSettings({
      active_cloud_provider: { id: adapterId, credentials }
    });
    const localWithCreds = await dbService.getSettings();
    setUserSettings(localWithCreds);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('quomida_onboarding_dismissed', 'true');
    }

    dbService.setCloudSyncProvider(adapter);
    setActiveAdapter(adapter);
    setSyncStatus(adapter.getStatus());
    setLastSyncedTime(adapter.getLastSyncedTime() || new Date().toLocaleTimeString());

    // Immediately trigger initial bidirectional sync to pull existing cloud data
    if (db && isOnline) {
      await runWithSyncLock(async () => {
        setSyncStatus('syncing');
        try {
          await syncDatabaseWithRemote(db, adapter);
          await dbService.runAdaptiveCalibrationIfNeeded(selectedDate, true);
          const updated = await dbService.getSettings();
          setUserSettings(updated);
          if (updated.locale?.startsWith('en')) setLocaleState('en');
          else if (updated.locale?.startsWith('es')) setLocaleState('es');
          if (updated.theme) setThemeState(updated.theme as any);
        } finally {
          setSyncStatus(adapter.getStatus());
          setLastSyncedTime(adapter.getLastSyncedTime() || new Date().toLocaleTimeString());
        }
      }, syncLock, pendingSyncRef).catch(console.error);
    }
  };

  const logFoodItem = async (
    food: FoodItem | BaseIngredient,
    mealType: MealType,
    quantity: number,
    portionName: string,
    passedPortions?: Portion[],
    dateOverride?: string
  ) => {
    const targetDate = dateOverride || selectedDate;
    let relevantPortions: Portion[] = passedPortions || [];
    
    if (dbService) {
      const rxdb = dbService.getDatabaseInstance();
      if (rxdb) {
        // --- LAZY CACHING LOGIC REMOVED ---
        // RxDB strictly stores 'custom' items and daily logs.
        // The SQLite OPFS catalog is the sole source of truth for read-only catalog items.

        if (!passedPortions || passedPortions.length === 0) {
          const pdocs = await rxdb.portions.find({ selector: { base_food_id: food.id } }).exec();
          relevantPortions = pdocs.map((d: any) => d.toJSON ? d.toJSON() : d);
        }
      }
    }

    const isRecipe = 'kind' in food && food.kind === 'recipe';
    let portionsToUse = relevantPortions;
    if (isRecipe) {
      const recipeItem = food as RecipeFoodItem;
      const hasWhole = portionsToUse.some(p => p.name === 'Whole recipe');
      if (!hasWhole) {
        const wholePortion = recipeManager.getWholeRecipePortion(recipeItem);
        portionsToUse = [wholePortion, ...portionsToUse];
      }
    }

    const weightGrams = convertPortionToGrams(quantity, portionName, portionsToUse);
    const rawMacros = calculateItemMacros(food, weightGrams);
    const macrosSnapshot = createMacroSnapshot(rawMacros);

    await dbService.logFood({
      date: targetDate,
      meal_type: mealType,
      food_reference_id: food.id,
      food_name: food.name,
      quantity,
      portion_name: portionName,
      macros: macrosSnapshot
    });

    try {
      const updatedSettings = await dbService.runAdaptiveCalibrationIfNeeded(targetDate, true);
      if (updatedSettings) {
        setUserSettings(updatedSettings);
      }
    } catch (err) {
      console.warn('[AppContext] Adaptive recalculation notice after logFoodItem:', err);
    }

    // Background sync - do not await
    forceSync().catch(console.error);
  };

  const logBatchFoodItems = async (
    items: Array<{
      food: FoodItem | BaseIngredient;
      quantity: number;
      portionName: string;
      availablePortions?: Portion[];
      mealType?: MealType;
    }>,
    mealType: MealType
  ) => {
    if (!dbService || items.length === 0) return;

    for (const item of items) {
      const { food, quantity, portionName, availablePortions } = item;
      let relevantPortions: Portion[] = availablePortions || [];

      if (!availablePortions || availablePortions.length === 0) {
        const rxdb = dbService.getDatabaseInstance();
        if (rxdb) {
          try {
            const pdocs = await rxdb.portions.find({ selector: { base_food_id: food.id } }).exec();
            relevantPortions = pdocs.map((d: any) => d.toJSON ? d.toJSON() : d);
          } catch (e) {
            console.warn('[AppContext] Failed to query portions for batch item:', e);
          }
        }
      }

      const isRecipe = 'kind' in food && food.kind === 'recipe';
      let portionsToUse = relevantPortions;
      if (isRecipe) {
        const recipeItem = food as RecipeFoodItem;
        const hasWhole = portionsToUse.some(p => p.name === 'Whole recipe');
        if (!hasWhole) {
          const wholePortion = recipeManager.getWholeRecipePortion(recipeItem);
          portionsToUse = [wholePortion, ...portionsToUse];
        }
      }

      const weightGrams = convertPortionToGrams(quantity, portionName, portionsToUse);
      const rawMacros = calculateItemMacros(food, weightGrams);
      const macrosSnapshot = createMacroSnapshot(rawMacros);

      await dbService.logFood({
        date: selectedDate,
        meal_type: item.mealType || mealType,
        food_reference_id: food.id,
        food_name: food.name,
        quantity,
        portion_name: portionName,
        macros: macrosSnapshot
      });
    }

    try {
      const updatedSettings = await dbService.runAdaptiveCalibrationIfNeeded(selectedDate, true);
      if (updatedSettings) {
        setUserSettings(updatedSettings);
      }
    } catch (err) {
      console.warn('[AppContext] Adaptive recalculation notice after logBatchFoodItems:', err);
    }

    forceSync().catch(console.error);
  };

  const deleteLogItem = async (id: string) => {
    await dbService.deleteLogItem(id);
    try {
      const updatedSettings = await dbService.runAdaptiveCalibrationIfNeeded(selectedDate, true);
      if (updatedSettings) {
        setUserSettings(updatedSettings);
      }
    } catch (err) {
      console.warn('[AppContext] Adaptive recalculation notice after deleteLogItem:', err);
    }
    forceSync().catch(console.error);
  };

  const logWeight = async (date: string, weightKg: number, note?: string) => {
    await dbService.saveWeightLog({ date, weight_kg: weightKg, note });
    try {
      const updatedSettings = await dbService.runAdaptiveCalibrationIfNeeded(date, true);
      if (updatedSettings) {
        setUserSettings(updatedSettings);
      }
    } catch (err) {
      console.warn('[AppContext] Adaptive recalculation notice after logWeight:', err);
    }
    forceSync().catch(console.error);
  };

  const deleteWeightLog = async (idOrDate: string) => {
    await dbService.deleteWeightLog(idOrDate);
    try {
      const updatedSettings = await dbService.runAdaptiveCalibrationIfNeeded(selectedDate, true);
      if (updatedSettings) {
        setUserSettings(updatedSettings);
      }
    } catch (err) {
      console.warn('[AppContext] Adaptive recalculation notice after deleteWeightLog:', err);
    }
    forceSync().catch(console.error);
  };

  const addCustomIngredient = async (ingData: Omit<BaseIngredient, 'id' | 'source'> & { id?: string }, portions?: { name: string, equivalent_weight_g: number }[]): Promise<string> => {
    const id = await dbService.saveCustomFood(ingData, portions);
    forceSync().catch(console.error);
    return id;
  };

  const removeCustomIngredient = async (id: string) => {
    await dbService.deleteCustomFood(id);
    forceSync().catch(console.error);
  };

  const addRecipe = async (recipeData: Recipe, portions?: { name: string, equivalent_weight_g: number }[]) => {
    const id = await dbService.saveRecipe(recipeData, portions);
    forceSync().catch(console.error);
    return id;
  };

  const removeRecipe = async (id: string) => {
    await dbService.deleteRecipe(id);
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
        recipes,
        recipeFoods,
        dailyLogs,
        weightLogs,
        logWeight,
        deleteWeightLog,
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
        logBatchFoodItems,
        deleteLogItem,
        addCustomIngredient,
        removeCustomIngredient,
        addRecipe,
        removeRecipe,
        isSettingsOpen,
        setIsSettingsOpen,
        isCatalogOpen,
        setIsCatalogOpen,
        isStorageSettingsOpen,
        setIsStorageSettingsOpen,
        isAnalyticsOpen,
        setIsAnalyticsOpen,
        isProfileOpen,
        setIsProfileOpen,
        isWeightModalOpen,
        setIsWeightModalOpen,
        dbInitError,
        dbVersion: dailyLogsSchema.version,
        clearLocalDatabase: clearDatabase,
        catalogVersion,
        catalogGeneratedAt,
        catalogFileSizeBytes,
        catalogItemCount,
        refreshCatalog,
        resetCatalogState
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

