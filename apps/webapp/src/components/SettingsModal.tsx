import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext.js';
import {
  X,
  Globe,
  Moon,
  Sun,
  Target,
  Cloud,
  Save,
  Database,
  RefreshCw,
  Download,
  CheckCircle,
  HelpCircle,
  Mail,
  Shield,
  FileText,
  Scale,
  ExternalLink,
  LifeBuoy,
  Wifi,
  Trash2,
  Sparkles,
  Key,
  Cpu,
  ChevronDown,
  User,
  Activity,
  Flame,
  Zap
} from 'lucide-react';
import { useCatalogDownload } from '../hooks/useCatalogDownload.js';
import { SYSTEM_CATALOG_META } from '../services/RemoteCatalogService.js';
import { AiKeyEncryptionService } from '@quomida/ai-services';
import { AI_CONFIG } from '../config/ai.js';
import {
  calculateBaselineSeed,
  type AiProviderType,
  type UserSex,
  type GoalType
} from '@quomida/domain-core';

const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL || 'support@qozara.org';
const legalEmail = import.meta.env.VITE_LEGAL_EMAIL || 'legal@qozara.org';
const legalBaseUrl = (import.meta.env.VITE_LEGAL_BASE_URL || 'https://qozara.org').replace(/\/+$/, '');
const appWebsiteUrl = (import.meta.env.VITE_APP_WEBSITE_URL || 'https://quomida.qozara.org').replace(/\/+$/, '');

const tosUrl = `${legalBaseUrl}/legal/quomida/tos.html`;
const privacyUrl = `${legalBaseUrl}/legal/quomida/privacy.html`;
const licenseUrl = `${appWebsiteUrl}/LICENSE`;

export const SettingsModal: React.FC = () => {
  const {
    selectedDate,
    weightLogs,
    logWeight,
    locale,
    setLocale,
    theme,
    setTheme,
    userSettings,
    updateUserSettings,
    syncStatus: _syncStatus,
    activeProvider,
    lastSyncedTime,
    isSettingsOpen,
    setIsSettingsOpen,
    setIsStorageSettingsOpen,
    catalogVersion,
    catalogGeneratedAt: _catalogGeneratedAt,
    catalogFileSizeBytes,
    catalogItemCount,
    refreshCatalog,
    isOnline,
    t,
    resetCatalogState
  } = useApp();

  const {
    status: downloadStatus,
    progress: downloadProgress,
    error: downloadError,
    isDeleting,
    downloadCatalog,
    deleteCatalog,
    checkAndTriggerAutoDownload,
    refreshStatus
  } = useCatalogDownload();

  useEffect(() => {
    if (isSettingsOpen && typeof refreshStatus === 'function') {
      refreshStatus();
    }
  }, [isSettingsOpen, refreshStatus]);

  const prevDownloadStatusRef = useRef(downloadStatus);
  useEffect(() => {
    if (prevDownloadStatusRef.current !== 'complete' && downloadStatus === 'complete') {
      setCatalogFeedback(null);
    }
    prevDownloadStatusRef.current = downloadStatus;
  }, [downloadStatus]);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    'app-settings': false,
    'profile-goals': false,
    'ai': false,
    'data-sync': false,
    'about-legal': false
  });

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const [showConfirmDownload, setShowConfirmDownload] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const approximateSizeMb = catalogFileSizeBytes && catalogFileSizeBytes > 0
    ? String(Math.round(catalogFileSizeBytes / (1024 * 1024)) || 2)
    : '2';

  const [catalogFeedback, setCatalogFeedback] = useState<string | null>(null);

  const [calorieTarget, setCalorieTarget] = useState(userSettings?.daily_calorie_target || 2000);
  const [proteinTarget, setProteinTarget] = useState(userSettings?.custom_macros?.protein || 150);
  const [carbsTarget, setCarbsTarget] = useState(userSettings?.custom_macros?.carbs || 200);
  const [fatsTarget, setFatsTarget] = useState(userSettings?.custom_macros?.fats || 65);
  const [isSaved, setIsSaved] = useState(false);

  // Smart / Adaptive Goals State
  const [targetMode, setTargetMode] = useState<'manual' | 'smart'>(
    userSettings?.target_mode === 'manual' ? 'manual' : 'smart'
  );
  const [isAdaptive, setIsAdaptive] = useState<boolean>(
    userSettings?.target_mode === 'adaptive'
  );
  const [sex, setSex] = useState<UserSex>(userSettings?.biometrics?.sex || 'male');
  const [birthDate, setBirthDate] = useState<string>(
    userSettings?.biometrics?.birth_date || '1990-01-01'
  );
  const [heightCm, setHeightCm] = useState<number>(
    userSettings?.biometrics?.height_cm || 170
  );
  const initialWeight = useMemo(() => {
    if (weightLogs && weightLogs.length > 0) {
      return weightLogs[weightLogs.length - 1].weight_kg;
    }
    return 75.0;
  }, [weightLogs]);
  const [currentWeightKg, setCurrentWeightKg] = useState<number>(initialWeight);
  const [activityMultiplier, setActivityMultiplier] = useState<number>(
    userSettings?.biometrics?.activity_multiplier || 1.375
  );

  const [goalType, setGoalType] = useState<GoalType>(
    userSettings?.goal_config?.goal_type || 'lose'
  );
  const [weeklyRatePct, setWeeklyRatePct] = useState<number>(
    userSettings?.goal_config?.weekly_rate_pct !== undefined
      ? userSettings.goal_config.weekly_rate_pct
      : -0.5
  );
  const [proteinGPerKg, setProteinGPerKg] = useState<number>(
    userSettings?.goal_config?.protein_g_per_kg || 2.2
  );
  const [fatCaloriePct, setFatCaloriePct] = useState<number>(
    userSettings?.goal_config?.fat_calorie_pct || 0.25
  );

  const handleGoalTypeChange = (newGoal: GoalType) => {
    setGoalType(newGoal);
    if (newGoal === 'lose') {
      setWeeklyRatePct(-0.5);
      setProteinGPerKg(2.2);
      setFatCaloriePct(0.25);
    } else if (newGoal === 'maintain') {
      setWeeklyRatePct(0);
      setProteinGPerKg(1.8);
      setFatCaloriePct(0.25);
    } else if (newGoal === 'gain') {
      setWeeklyRatePct(0.25);
      setProteinGPerKg(2.0);
      setFatCaloriePct(0.25);
    }
  };

  const baselinePreview = useMemo(() => {
    return calculateBaselineSeed({
      biometrics: {
        sex,
        birth_date: birthDate,
        height_cm: heightCm,
        activity_multiplier: activityMultiplier
      },
      goalConfig: {
        goal_type: goalType,
        weekly_rate_pct: weeklyRatePct,
        protein_g_per_kg: proteinGPerKg,
        fat_calorie_pct: fatCaloriePct
      },
      currentWeightKg,
      referenceDate: selectedDate
    });
  }, [
    sex,
    birthDate,
    heightCm,
    activityMultiplier,
    goalType,
    weeklyRatePct,
    proteinGPerKg,
    fatCaloriePct,
    currentWeightKg,
    selectedDate
  ]);

  const [isChecking, setIsChecking] = useState(false);

  // AI & Qozara Intelligence State
  const [aiEnabled, setAiEnabled] = useState<boolean>(
    userSettings?.ai_settings?.enabled !== false
  );
  const [aiProvider, setAiProvider] = useState<AiProviderType>(
    userSettings?.ai_settings?.provider || AI_CONFIG.defaultProvider
  );
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState(
    userSettings?.ai_settings?.ollama_base_url || AI_CONFIG.defaultOllamaBaseUrl
  );
  const [ollamaModel, setOllamaModel] = useState(
    userSettings?.ai_settings?.ollama_model || AI_CONFIG.defaultOllamaModel
  );
  const [isEncryptingKey, setIsEncryptingKey] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (userSettings?.ai_settings?.enabled !== undefined) {
      setAiEnabled(userSettings.ai_settings.enabled !== false);
    }
  }, [userSettings?.ai_settings?.enabled]);

  // Extract User Info
  const connectedAccount = activeProvider?.getConnectedAccount?.();
  let userName = userSettings?.active_cloud_provider?.credentials?.userName;
  let userEmail = userSettings?.active_cloud_provider?.credentials?.userEmail;

  if (!userName && connectedAccount) {
    if (connectedAccount.includes('(')) {
      userName = connectedAccount.split('(')[0].trim();
      userEmail = userEmail || connectedAccount.split('(')[1].replace(')', '').trim();
    } else {
      userName = connectedAccount;
    }
  }

  const displayUserName = userName || t.settings?.accountLocalUser || 'Local Profile';
  const displayUserEmail = userEmail || t.settings?.accountLocalSubtitle || 'Offline mode (no cloud connected)';

  const handleToggleAiEnabled = async (enabled: boolean) => {
    setAiEnabled(enabled);
    await updateUserSettings({
      ai_settings: {
        provider: aiProvider,
        enabled,
        ciphertext: userSettings?.ai_settings?.ciphertext,
        ollama_base_url: ollamaUrl,
        ollama_model: ollamaModel,
      },
    });
  };

  const handleSaveAiProvider = async (newProvider: AiProviderType) => {
    setAiProvider(newProvider);
    await updateUserSettings({
      ai_settings: {
        provider: newProvider,
        enabled: aiEnabled,
        ciphertext: userSettings?.ai_settings?.ciphertext,
        ollama_base_url: ollamaUrl,
        ollama_model: ollamaModel,
      },
    });
  };

  const handleEncryptAndSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;
    setIsEncryptingKey(true);
    setAiFeedback(null);
    try {
      const ciphertext = await AiKeyEncryptionService.encryptApiKey(apiKeyInput.trim(), AI_CONFIG.proxyUrl);
      await updateUserSettings({
        ai_settings: {
          provider: 'byok',
          enabled: aiEnabled,
          ciphertext,
          ollama_base_url: ollamaUrl,
          ollama_model: ollamaModel,
        },
      });
      setAiProvider('byok');
      setApiKeyInput('');
      setAiFeedback(t.ai?.keyEncryptedSuccess);
    } catch (err: any) {
      setAiFeedback(err?.message || t.ai?.keyEncryptError);
    } finally {
      setIsEncryptingKey(false);
    }
  };

  const handleClearApiKey = async () => {
    await updateUserSettings({
      ai_settings: {
        provider: AI_CONFIG.defaultProvider,
        enabled: aiEnabled,
        ciphertext: undefined,
        ollama_base_url: ollamaUrl,
        ollama_model: ollamaModel,
      },
    });
    setAiProvider(AI_CONFIG.defaultProvider);
    setAiFeedback(null);
  };

  const handleSaveOllamaSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateUserSettings({
      ai_settings: {
        provider: 'ollama',
        enabled: aiEnabled,
        ciphertext: userSettings?.ai_settings?.ciphertext,
        ollama_base_url: ollamaUrl.trim(),
        ollama_model: ollamaModel.trim(),
      },
    });
    setAiProvider('ollama');
    setAiFeedback(t.ai?.ollamaSavedSuccess);
  };

  const handleSaveGoals = async (e: React.FormEvent) => {
    e.preventDefault();
    if (targetMode === 'manual') {
      await updateUserSettings({
        target_mode: 'manual',
        daily_calorie_target: calorieTarget,
        custom_macros: {
          protein: proteinTarget,
          carbs: carbsTarget,
          fats: fatsTarget
        }
      });
    } else {
      const existingLog = weightLogs.find((w) => w.date === selectedDate);
      if (!existingLog || weightLogs.length === 0) {
        await logWeight(selectedDate, currentWeightKg);
      }

      const mode = isAdaptive ? 'adaptive' : 'deterministic_seed';
      await updateUserSettings({
        target_mode: mode,
        biometrics: {
          sex,
          birth_date: birthDate,
          height_cm: heightCm,
          activity_multiplier: activityMultiplier
        },
        goal_config: {
          goal_type: goalType,
          weekly_rate_pct: weeklyRatePct,
          protein_g_per_kg: proteinGPerKg,
          fat_calorie_pct: fatCaloriePct
        },
        adaptive_state: {
          estimated_tdee: baselinePreview.seed_tdee,
          prior_tdee: baselinePreview.seed_tdee,
          calibration_status: 'collecting_data',
          last_calibrated_date: selectedDate
        },
        daily_calorie_target: baselinePreview.daily_calorie_target,
        custom_macros: baselinePreview.custom_macros
      });
    }
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleCheckCatalogUpdates = async () => {
    if (isChecking) return;
    setCatalogFeedback(null);
    setIsChecking(true);
    console.log('[SettingsModal] Checking for catalog updates...');
    try {
      const res = await refreshCatalog({ force: true });
      console.log('[SettingsModal] Catalog refresh result:', res);
      const currentStatus = typeof refreshStatus === 'function' ? await refreshStatus() : downloadStatus;
      const count = res.itemCount ?? res.itemsUpserted ?? (currentStatus === 'complete' ? catalogItemCount : SYSTEM_CATALOG_META.itemCount);
      const shortVersion = res.version ? res.version.substring(0, 8) : '';

      const userPref = typeof window !== 'undefined' ? localStorage.getItem('catalog_auto_download_enabled') !== 'false' : true;
      const baseUrl = ((import.meta as any).env?.VITE_CATALOG_BASE_URL || '').replace(/\/+$/, '');
      const downloadUrl = baseUrl ? `${baseUrl}/catalog.sqlite.gz` : '/catalog.sqlite.gz';

      const isUpdateAvailable = currentStatus !== 'complete' || res.status === 'UPDATED';
      let autoTriggered = false;
      if (userPref && isUpdateAvailable && typeof checkAndTriggerAutoDownload === 'function') {
        autoTriggered = checkAndTriggerAutoDownload({
          downloadUrl,
          fileSizeBytes: res.fileSizeBytes,
          isOnline: isOnline && navigator.onLine !== false,
          userAutoDownloadPref: userPref,
          isUpdateAvailable: true
        });
      }

      if (autoTriggered) {
        setCatalogFeedback(
          (t.settings as any).catalogDownloadingUpdate || 'Downloading catalog update...'
        );
      } else if (currentStatus !== 'complete' || res.status === 'UPDATED') {
        const availableText = (t.settings as any).catalogUpdateAvailable
          ?.replace('{{version}}', shortVersion)
          ?.replace('{{count}}', count !== null && count !== undefined ? count.toLocaleString() : '') ||
          `Update available: v: ${shortVersion}${count ? ` (${count.toLocaleString()} items)` : ''}`;
        setCatalogFeedback(availableText);
      } else if (res.status === 'UP_TO_DATE') {
        const itemsLabel = (t.settings as any).catalogItems || 'items';
        setCatalogFeedback(
          (t.settings as any).catalogUpToDate
            ? `${(t.settings as any).catalogUpToDate}${shortVersion ? ` (v: ${shortVersion}${count ? `, ${count.toLocaleString()} ${itemsLabel}` : ''})` : ''}`
            : `Catalog is up to date${shortVersion ? ` (v: ${shortVersion}${count ? `, ${count.toLocaleString()} ${itemsLabel}` : ''})` : ''}`
        );
      } else if (res.status === 'SKIPPED') {
        setCatalogFeedback(res.error || (t.settings as any).catalogCheckError || 'Catalog update skipped');
      } else {
        setCatalogFeedback(res.error || (t.settings as any).catalogCheckError || 'Failed to check for updates');
      }
    } catch (err: any) {
      console.error('[SettingsModal] Failed to check for catalog updates:', err);
      setCatalogFeedback((t.settings as any).catalogCheckError || 'Failed to check for updates');
    } finally {
      setIsChecking(false);
    }
  };

  if (!isSettingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-extrabold text-white tracking-wide">{t.settings.title}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {t.settings.accordionAppSettingsSubtitle || 'Manage your preferences, account and sync'}
            </p>
          </div>
          <button
            onClick={() => setIsSettingsOpen(false)}
            aria-label="Close"
            className="min-w-[44px] min-h-[44px] p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 5-Segment Accordion Menu List */}
        <div className="space-y-3">
          
          {/* SEGMENT 1: App Settings & User Account */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 overflow-hidden shadow-sm transition-all">
            <button
              type="button"
              id="accordion-header-app-settings"
              data-testid="accordion-header-app-settings"
              aria-expanded={Boolean(openSections['app-settings'])}
              aria-controls="accordion-panel-app-settings"
              onClick={() => toggleSection('app-settings')}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors text-left min-h-[44px]"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-slate-800 text-emerald-400 border border-slate-700/60">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {t.settings.accordionAppSettings || 'App Settings & User Account'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {t.settings.accordionAppSettingsSubtitle || 'Language, theme, and user credentials'}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-slate-400 transition-transform duration-200 shrink-0 ${
                  openSections['app-settings'] ? 'rotate-180' : ''
                }`}
              />
            </button>

            <div
              id="accordion-panel-app-settings"
              role="region"
              aria-labelledby="accordion-header-app-settings"
              className={openSections['app-settings'] ? 'p-4 pt-1 border-t border-slate-800/60 space-y-4' : 'hidden'}
            >
              {/* Connected Account Info */}
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold flex items-center justify-center text-sm">
                    {displayUserName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <span>{displayUserName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-900 border border-slate-800 text-emerald-400">
                        {activeProvider && activeProvider.getStatus() !== 'disconnected' ? 'Cloud' : 'Local'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {displayUserEmail}
                    </div>
                  </div>
                </div>
              </div>

              {/* Language & Theme Controls */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">{t.settings.language}</label>
                  <select
                    value={locale}
                    onChange={(e) => setLocale(e.target.value as any)}
                    className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="es">Español (LatAm)</option>
                    <option value="en">English (US)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">{t.settings.theme}</label>
                  <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700 min-h-[44px] items-center">
                    <button
                      type="button"
                      onClick={() => setTheme('dark')}
                      className={`flex-1 min-h-[36px] flex justify-center items-center rounded-lg transition-all ${
                        theme === 'dark' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                      aria-label="Dark theme"
                    >
                      <Moon className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme('light')}
                      className={`flex-1 min-h-[36px] flex justify-center items-center rounded-lg transition-all ${
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
          </div>

          {/* SEGMENT 2: User Profile & Goals */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 overflow-hidden shadow-sm transition-all">
            <button
              type="button"
              id="accordion-header-profile-goals"
              data-testid="accordion-header-profile-goals"
              aria-expanded={Boolean(openSections['profile-goals'])}
              aria-controls="accordion-panel-profile-goals"
              onClick={() => toggleSection('profile-goals')}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors text-left min-h-[44px]"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-slate-800 text-emerald-400 border border-slate-700/60">
                  <Target className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {t.settings.accordionProfileGoals || 'User Profile & Goals'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {t.settings.accordionProfileGoalsSubtitle || 'Biometrics, activity, and adaptive targets'}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-slate-400 transition-transform duration-200 shrink-0 ${
                  openSections['profile-goals'] ? 'rotate-180' : ''
                }`}
              />
            </button>

            <div
              id="accordion-panel-profile-goals"
              role="region"
              aria-labelledby="accordion-header-profile-goals"
              className={openSections['profile-goals'] ? 'p-4 pt-1 border-t border-slate-800/60 space-y-4' : 'hidden'}
            >
              <form onSubmit={handleSaveGoals} className="space-y-4">
                {/* Segmented Control */}
                <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
                  <button
                    type="button"
                    id="btn-target-mode-manual"
                    data-testid="btn-target-mode-manual"
                    onClick={() => setTargetMode('manual')}
                    className={`flex-1 min-h-[44px] py-2 text-xs font-semibold rounded-lg transition-all ${
                      targetMode === 'manual'
                        ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {t.settings.targetModeManual}
                  </button>
                  <button
                    type="button"
                    id="btn-target-mode-smart"
                    data-testid="btn-target-mode-smart"
                    onClick={() => setTargetMode('smart')}
                    className={`flex-1 min-h-[44px] py-2 text-xs font-semibold rounded-lg transition-all ${
                      targetMode === 'smart'
                        ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {t.settings.targetModeSmart}
                  </button>
                </div>

                {targetMode === 'manual' ? (
                  <div className="space-y-3 bg-slate-950 p-4 rounded-2xl border border-slate-800">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1 font-medium">
                        {t.settings.dailyTarget}
                      </label>
                      <input
                        type="number"
                        min="500"
                        max="10000"
                        value={calorieTarget}
                        onChange={(e) => setCalorieTarget(Number(e.target.value))}
                        className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-bold"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">
                          {t.dashboard.protein} (g)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={proteinTarget}
                          onChange={(e) => setProteinTarget(Number(e.target.value))}
                          className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">
                          {t.dashboard.carbs} (g)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={carbsTarget}
                          onChange={(e) => setCarbsTarget(Number(e.target.value))}
                          className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">
                          {t.dashboard.fats} (g)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={fatsTarget}
                          onChange={(e) => setFatsTarget(Number(e.target.value))}
                          className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Biometrics Card */}
                    <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                        <Activity className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{t.settings.biometricsTitle}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {/* Sex */}
                        <div>
                          <label className="text-xs text-slate-400 block mb-1 font-medium">{t.settings.sexLabel}</label>
                          <select
                            data-testid="select-biometrics-sex"
                            value={sex}
                            onChange={(e) => setSex(e.target.value as UserSex)}
                            className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                          >
                            <option value="male">{t.settings.sexMale}</option>
                            <option value="female">{t.settings.sexFemale}</option>
                          </select>
                        </div>

                        {/* Birth Date */}
                        <div>
                          <label className="text-xs text-slate-400 block mb-1 font-medium">{t.settings.birthDateLabel}</label>
                          <input
                            data-testid="input-biometrics-birthdate"
                            type="date"
                            value={birthDate}
                            onChange={(e) => setBirthDate(e.target.value)}
                            className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        {/* Height */}
                        <div>
                          <label className="text-xs text-slate-400 block mb-1 font-medium">{t.settings.heightCmLabel}</label>
                          <input
                            data-testid="input-biometrics-height"
                            type="number"
                            min={50}
                            max={260}
                            value={heightCm}
                            onChange={(e) => setHeightCm(parseInt(e.target.value) || 170)}
                            className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        {/* Current Weight */}
                        <div>
                          <label className="text-xs text-slate-400 block mb-1 font-medium">{t.settings.currentWeightKgLabel}</label>
                          <input
                            data-testid="input-biometrics-weight"
                            type="number"
                            step="0.1"
                            min={20}
                            max={500}
                            value={currentWeightKg}
                            onChange={(e) => setCurrentWeightKg(parseFloat(e.target.value) || 75)}
                            className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>

                      {/* Activity Multiplier */}
                      <div>
                        <label className="text-xs text-slate-400 block mb-1 font-medium">{t.settings.activityLevelLabel}</label>
                        <select
                          data-testid="select-biometrics-activity"
                          value={activityMultiplier}
                          onChange={(e) => setActivityMultiplier(parseFloat(e.target.value) || 1.375)}
                          className="w-full min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                        >
                          <option value={1.2}>{t.settings.activitySedentary}</option>
                          <option value={1.375}>{t.settings.activityLight}</option>
                          <option value={1.55}>{t.settings.activityModerate}</option>
                          <option value={1.725}>{t.settings.activityVery}</option>
                          <option value={1.9}>{t.settings.activityExtreme}</option>
                        </select>
                      </div>
                    </div>

                    {/* Goal & Weekly Rate */}
                    <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                        <Target className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{t.settings.goalSelectorTitle}</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          id="btn-goal-lose"
                          data-testid="btn-goal-lose"
                          onClick={() => handleGoalTypeChange('lose')}
                          className={`min-h-[44px] py-1.5 px-2 text-xs font-semibold rounded-xl border transition-all ${
                            goalType === 'lose'
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {t.settings.goalLose}
                        </button>
                        <button
                          type="button"
                          id="btn-goal-maintain"
                          data-testid="btn-goal-maintain"
                          onClick={() => handleGoalTypeChange('maintain')}
                          className={`min-h-[44px] py-1.5 px-2 text-xs font-semibold rounded-xl border transition-all ${
                            goalType === 'maintain'
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {t.settings.goalMaintain}
                        </button>
                        <button
                          type="button"
                          id="btn-goal-gain"
                          data-testid="btn-goal-gain"
                          onClick={() => handleGoalTypeChange('gain')}
                          className={`min-h-[44px] py-1.5 px-2 text-xs font-semibold rounded-xl border transition-all ${
                            goalType === 'gain'
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {t.settings.goalGain}
                        </button>
                      </div>

                      {/* Sliders for Lose or Gain */}
                      {goalType === 'lose' && (
                        <div>
                          <div className="flex justify-between text-xs text-slate-400 mb-1">
                            <span>{t.settings.weeklyRateLabel}</span>
                            <span className="font-bold text-emerald-400">{weeklyRatePct}% / wk</span>
                          </div>
                          <input
                            data-testid="slider-weekly-rate"
                            type="range"
                            min="-1.0"
                            max="-0.25"
                            step="0.05"
                            value={weeklyRatePct}
                            onChange={(e) => setWeeklyRatePct(parseFloat(e.target.value))}
                            className="w-full accent-emerald-500"
                          />
                        </div>
                      )}

                      {goalType === 'gain' && (
                        <div>
                          <div className="flex justify-between text-xs text-slate-400 mb-1">
                            <span>{t.settings.weeklyRateLabel}</span>
                            <span className="font-bold text-emerald-400">+{weeklyRatePct}% / wk</span>
                          </div>
                          <input
                            data-testid="slider-weekly-rate"
                            type="range"
                            min="0.20"
                            max="0.50"
                            step="0.05"
                            value={weeklyRatePct}
                            onChange={(e) => setWeeklyRatePct(parseFloat(e.target.value))}
                            className="w-full accent-emerald-500"
                          />
                        </div>
                      )}
                    </div>

                    {/* Adaptive Toggle */}
                    <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800">
                      <label className="min-h-[44px] flex items-center gap-3 cursor-pointer select-none">
                        <input
                          data-testid="checkbox-adaptive-toggle"
                          type="checkbox"
                          checked={isAdaptive}
                          onChange={(e) => setIsAdaptive(e.target.checked)}
                          className="w-5 h-5 rounded accent-emerald-500 bg-slate-800 border-slate-700"
                        />
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">{t.settings.adaptiveToggleLabel}</span>
                          <span className="text-[11px] text-slate-400 mt-0.5">{t.settings.adaptiveToggleHint}</span>
                        </div>
                      </label>
                    </div>

                    {/* Calculated Output Preview */}
                    <div
                      data-testid="preview-seed-tdee"
                      className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-2 text-xs"
                    >
                      <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                        <Flame className="w-4 h-4" />
                        <span>{t.settings.previewTitle}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-slate-300">
                        <div>
                          <span className="text-slate-400 block">{t.settings.previewBmr}:</span>
                          <span data-testid="preview-bmr-value" className="font-mono font-bold text-white">{baselinePreview.bmr} kcal</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">{t.settings.previewTdee}:</span>
                          <span data-testid="preview-tdee-value" className="font-mono font-bold text-white">{baselinePreview.seed_tdee} kcal</span>
                        </div>
                        <div className="col-span-2 pt-1 border-t border-emerald-500/20 flex items-baseline justify-between">
                          <div>
                            <span className="text-slate-400 block">{t.settings.previewTargetKcal}:</span>
                            <span data-testid="preview-target-kcal-value" className="font-mono text-base font-black text-emerald-300">{baselinePreview.daily_calorie_target} kcal</span>
                          </div>
                          <div className="text-right font-mono text-[11px] text-slate-300">
                            P: <span data-testid="preview-protein-value" className="font-bold text-rose-300">{baselinePreview.custom_macros.protein}g</span> |{' '}
                            C: <span data-testid="preview-carbs-value" className="font-bold text-amber-300">{baselinePreview.custom_macros.carbs}g</span> |{' '}
                            F: <span data-testid="preview-fats-value" className="font-bold text-cyan-300">{baselinePreview.custom_macros.fats}g</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  id="btn-save-nutritional-targets"
                  data-testid="btn-save-nutritional-targets"
                  className="w-full min-h-[44px] py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-400 font-semibold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaved ? (t.settings.targetsSaved || 'Goals Saved!') : (t.settings.saveTargets || 'Save Targets')}</span>
                </button>
              </form>
            </div>
          </div>

          {/* SEGMENT 3: Intelligence & Edge AI */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 overflow-hidden shadow-sm transition-all">
            <button
              type="button"
              id="accordion-header-ai"
              data-testid="accordion-header-ai"
              aria-expanded={Boolean(openSections['ai'])}
              aria-controls="accordion-panel-ai"
              onClick={() => toggleSection('ai')}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors text-left min-h-[44px]"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-slate-800 text-emerald-400 border border-slate-700/60">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {t.settings.accordionAi || 'Intelligence & Edge AI'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {t.settings.accordionAiSubtitle || 'Private edge AI, BYOK encryption, and models'}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-slate-400 transition-transform duration-200 shrink-0 ${
                  openSections['ai'] ? 'rotate-180' : ''
                }`}
              />
            </button>

            <div
              id="accordion-panel-ai"
              role="region"
              aria-labelledby="accordion-header-ai"
              className={openSections['ai'] ? 'p-4 pt-1 border-t border-slate-800/60 space-y-4' : 'hidden'}
            >
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-4">
                {/* Master AI Toggle */}
                <div className="flex items-center justify-between p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl">
                  <div className="space-y-0.5 pr-3">
                    <label htmlFor="toggle-ai-enabled" className="text-xs font-semibold text-slate-200 block cursor-pointer">
                      {t.ai?.enableAi || 'Enable AI Features'}
                    </label>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      {t.ai?.enableAiDesc || 'Allows AI to estimate typical ingredients and recipes for uncataloged foods. When disabled, logging runs 100% locally.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    id="toggle-ai-enabled"
                    data-testid="toggle-ai-enabled"
                    role="switch"
                    aria-checked={aiEnabled}
                    onClick={() => handleToggleAiEnabled(!aiEnabled)}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center p-1 rounded-xl hover:bg-slate-800/60 transition-colors"
                  >
                    <div className={`w-11 h-6 rounded-full transition-colors relative p-0.5 pointer-events-none ${aiEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                      <div className={`w-5 h-5 rounded-full bg-white transition-transform ${aiEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                  </button>
                </div>

                {aiEnabled ? (
                  <>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {t.ai?.description || 'Configure natural language meal logging with Qozara Intelligence edge AI or your private model.'}
                    </p>

                    {/* Provider Selection */}
                    <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 block">
                    {t.ai?.providerLabel || 'Active AI Provider'}
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      {
                        id: 'qozara-intelligence' as const,
                        title: t.ai?.providers?.qozaraIntelligence || 'Qozara Intelligence (Default)',
                        desc: t.ai?.providers?.qozaraIntelligenceDesc || 'Managed Gemini 2.0 Flash edge AI'
                      },
                      {
                        id: 'byok' as const,
                        title: t.ai?.providers?.byok || 'Bring Your Own Key (BYOK)',
                        desc: t.ai?.providers?.byokDesc || 'Personal key envelope-encrypted at edge (AES-256-GCM)'
                      },
                      {
                        id: 'ollama' as const,
                        title: t.ai?.providers?.ollama || 'Local Ollama (Offline)',
                        desc: t.ai?.providers?.ollamaDesc || 'Private local offline inference'
                      },
                      {
                        id: 'window.ai' as const,
                        title: t.ai?.providers?.windowAi || 'Browser Built-in AI',
                        desc: t.ai?.providers?.windowAiDesc || 'Experimental browser Gemini Nano'
                      }
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSaveAiProvider(p.id)}
                        className={`w-full text-left p-2.5 rounded-xl border transition-all text-xs flex flex-col gap-0.5 ${
                          aiProvider === p.id
                            ? 'bg-emerald-950/40 border-emerald-500/80 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span className="font-bold flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${aiProvider === p.id ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                          {p.title}
                        </span>
                        <span className="text-[10px] text-slate-400 pl-3.5 leading-tight">{p.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* BYOK Section */}
                {aiProvider === 'byok' && (
                  <form onSubmit={handleEncryptAndSaveKey} className="space-y-2 pt-2 border-t border-slate-900">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                        <Key className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{t.ai?.apiKeyLabel || 'Personal Gemini API Key'}</span>
                      </label>
                      {userSettings?.ai_settings?.ciphertext && (
                        <button
                          type="button"
                          onClick={handleClearApiKey}
                          className="text-[10px] text-rose-400 hover:underline min-h-[44px] flex items-center"
                        >
                          {t.ai?.clearKeyBtn || 'Remove Key'}
                        </button>
                      )}
                    </div>

                    {userSettings?.ai_settings?.ciphertext && (
                      <div className="bg-emerald-950/50 border border-emerald-800/60 rounded-xl p-2 text-[11px] text-emerald-300 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                        <span>{t.ai?.keyConfigured || 'Encrypted Personal Key configured'}</span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder={t.ai?.apiKeyPlaceholder || 'AIzaSy...'}
                        className="flex-1 min-h-[44px] bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="submit"
                        disabled={isEncryptingKey || !apiKeyInput.trim()}
                        className="px-3 py-1.5 min-h-[44px] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs flex items-center gap-1 transition-all"
                      >
                        {isEncryptingKey ? (t.ai?.encryptingKey || 'Encrypting...') : (t.ai?.encryptKeyBtn || 'Save Key')}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">
                      {t.ai?.keyEncryptedNotice || 'Your key is envelope-encrypted at edge (AES-256-GCM) and stored only in local storage.'}
                    </p>
                  </form>
                )}

                {/* Ollama Section */}
                {aiProvider === 'ollama' && (
                  <form onSubmit={handleSaveOllamaSettings} className="space-y-2 pt-2 border-t border-slate-900">
                    <div className="flex items-center gap-1 text-xs font-semibold text-slate-300">
                      <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{t.ai?.providers?.ollama || 'Ollama Configuration'}</span>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">
                        {t.ai?.ollamaUrlLabel || 'Ollama Endpoint URL'}
                      </label>
                      <input
                        type="text"
                        value={ollamaUrl}
                        onChange={(e) => setOllamaUrl(e.target.value)}
                        placeholder={t.ai?.ollamaUrlPlaceholder || 'http://localhost:11434/api'}
                        className="w-full min-h-[44px] bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">
                        {t.ai?.ollamaModelLabel || 'Ollama Model Name'}
                      </label>
                      <input
                        type="text"
                        value={ollamaModel}
                        onChange={(e) => setOllamaModel(e.target.value)}
                        placeholder={t.ai?.ollamaModelPlaceholder || 'llama3.2'}
                        className="w-full min-h-[44px] bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full min-h-[44px] py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-semibold rounded-xl text-xs transition-all"
                    >
                      {t.ai?.saveOllamaBtn || 'Save Ollama Settings'}
                    </button>
                  </form>
                )}
                  </>
                ) : (
                  <div className="p-3 bg-slate-900/50 border border-slate-800/80 rounded-xl text-center">
                    <p className="text-xs text-slate-400">
                      {t.ai?.aiDisabled || 'AI features are disabled. Quomida is running 100% locally.'}
                    </p>
                  </div>
                )}

                {aiFeedback && (
                  <p className="text-[11px] text-emerald-400 font-medium pt-1 border-t border-slate-900">
                    {aiFeedback}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* SEGMENT 4: Data & Sync */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 overflow-hidden shadow-sm transition-all">
            <button
              type="button"
              id="accordion-header-data-sync"
              data-testid="accordion-header-data-sync"
              aria-expanded={Boolean(openSections['data-sync'])}
              aria-controls="accordion-panel-data-sync"
              onClick={() => toggleSection('data-sync')}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors text-left min-h-[44px]"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-slate-800 text-emerald-400 border border-slate-700/60">
                  <Cloud className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {t.settings.accordionDataSync || 'Data & Sync'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {t.settings.accordionDataSyncSubtitle || 'Cloud backup, offline database, and storage'}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-slate-400 transition-transform duration-200 shrink-0 ${
                  openSections['data-sync'] ? 'rotate-180' : ''
                }`}
              />
            </button>

            <div
              id="accordion-panel-data-sync"
              role="region"
              aria-labelledby="accordion-header-data-sync"
              className={openSections['data-sync'] ? 'p-4 pt-1 border-t border-slate-800/60 space-y-4' : 'hidden'}
            >
              {/* BYOS Cloud Storage Card */}
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
                    className="text-emerald-400 hover:underline text-[11px] font-medium min-h-[44px] flex items-center"
                  >
                    Manage Storage →
                  </button>
                </div>
              </div>

              {/* Food Catalog Updates Check Button */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">
                      {t.settings.catalogTitle || 'Food Catalog & Ingredients'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono uppercase bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                    {downloadStatus === 'complete' && catalogVersion
                      ? `v: ${catalogVersion.substring(0, 8)}`
                      : (SYSTEM_CATALOG_META.catalogVersion ? `v: ${SYSTEM_CATALOG_META.catalogVersion.substring(0, 8)}` : 'v: base')}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {catalogFeedback || (
                    downloadStatus === 'complete'
                      ? (catalogItemCount
                          ? ((t.settings as any).catalogFullInstalled
                              ? (t.settings as any).catalogFullInstalled.replace('{{count}}', catalogItemCount.toLocaleString())
                              : `Full catalog installed (${catalogItemCount.toLocaleString()} items)`)
                          : ((t.settings as any).offlineDbInstalled || 'Available Offline'))
                      : ((t.settings as any).catalogBaseInstalled
                          ? (t.settings as any).catalogBaseInstalled
                              .replace('{{count}}', (SYSTEM_CATALOG_META.itemCount || 0).toLocaleString())
                              .replace('{{size}}', approximateSizeMb)
                          : `Built-in catalog (${(SYSTEM_CATALOG_META.itemCount || 0).toLocaleString()} items). Full update available (~${approximateSizeMb}MB)`)
                  )}
                </p>
                <button
                  type="button"
                  onClick={handleCheckCatalogUpdates}
                  disabled={isChecking || !isOnline}
                  className="w-full min-h-[44px] py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-700 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                  <span>{isChecking ? (t.settings.checkingCatalog || 'Checking...') : (t.settings.checkCatalogUpdates || 'Check for Catalog Updates')}</span>
                </button>
              </div>

              {/* Offline Food Database */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span>{(t.settings as any).offlineDbTitle || 'Offline Food Database'}</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {(t.settings as any).offlineDbDescription || 'Quomida supports downloading the complete food database directly to your device for instant offline searches without using cellular data.'}
                </p>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/50">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-300">
                      {(t.settings as any).offlineDbAutoDownloadTitle || 'Auto-download updates'}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      {(t.settings as any).offlineDbAutoDownloadDesc || 'Automatically download database updates in background when under 10MB.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    data-testid="toggle-catalog-auto-download"
                    aria-label={(t.settings as any).offlineDbAutoDownloadTitle || 'Auto-download updates'}
                    aria-checked={typeof window !== 'undefined' ? localStorage.getItem('catalog_auto_download_enabled') !== 'false' : true}
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        const current = localStorage.getItem('catalog_auto_download_enabled') !== 'false';
                        localStorage.setItem('catalog_auto_download_enabled', (!current).toString());
                        // Trigger re-render
                        setIsSaved((s) => !s);
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                      (typeof window !== 'undefined' ? localStorage.getItem('catalog_auto_download_enabled') !== 'false' : true)
                        ? 'bg-emerald-500'
                        : 'bg-slate-700'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        (typeof window !== 'undefined' ? localStorage.getItem('catalog_auto_download_enabled') !== 'false' : true)
                          ? 'translate-x-5'
                          : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/50">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-300">
                      {(t.settings as any).offlineDbStatus || 'Status'}
                    </span>
                    <span className="text-[11px] font-mono mt-0.5 text-emerald-400">
                      {downloadStatus === 'idle' && ((t.settings as any).offlineDbNotDownloaded || 'Not Downloaded')}
                      {downloadStatus === 'fetching' && (((t.settings as any).offlineDbDownloading || 'Downloading {{progress}}%').replace('{{progress}}', String(downloadProgress)))}
                      {downloadStatus === 'decompressing_and_writing' && ((t.settings as any).offlineDbInstalling || 'Installing...')}
                      {downloadStatus === 'complete' && ((t.settings as any).offlineDbInstalled || 'Available Offline')}
                      {downloadStatus === 'error' && ((t.settings as any).offlineDbFailed || 'Download Failed')}
                    </span>
                    {downloadError && <span className="text-[10px] text-rose-400 mt-1 max-w-[150px] truncate" title={downloadError}>{downloadError}</span>}
                  </div>

                  {downloadStatus === 'idle' || downloadStatus === 'error' ? (
                    <button
                      type="button"
                      disabled={!isOnline}
                      title={!isOnline ? ((t.settings as any).offlineDbDownloadOfflineTooltip || 'Connect to the internet to download the offline database') : undefined}
                      onClick={() => setShowConfirmDownload(true)}
                      className={`px-3 py-1.5 min-h-[44px] text-xs font-bold rounded-lg shadow transition-all flex items-center gap-1.5 ${
                        !isOnline
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                          : 'bg-emerald-500 hover:bg-emerald-600 text-white active:scale-95'
                      }`}
                    >
                      <Download className="w-3.5 h-3.5" />
                      {((t.settings as any).offlineDbDownloadBtn || 'Download (~{{size}}MB)').replace('{{size}}', approximateSizeMb)}
                    </button>
                  ) : downloadStatus === 'complete' ? (
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1.5 min-h-[44px] text-xs font-bold bg-slate-800 text-emerald-400 rounded-lg shadow-inner flex items-center gap-1.5 border border-emerald-900/50">
                        <CheckCircle className="w-3.5 h-3.5" />
                        {(t.settings as any).offlineDbInstalled || 'Installed'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowConfirmDelete(true)}
                        disabled={isDeleting}
                        aria-label={(t.settings as any).offlineDbDeleteBtn || 'Delete Database'}
                        className="px-2.5 py-1.5 min-h-[44px] text-xs font-semibold bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-rose-200 border border-rose-900/40 rounded-lg transition-colors flex items-center gap-1.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {isDeleting ? ((t.settings as any).offlineDbDeleting || 'Removing...') : ((t.settings as any).offlineDbDeleteBtn || 'Delete')}
                      </button>
                    </div>
                  ) : (
                    <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 transition-all duration-300" 
                        style={{ width: `${downloadProgress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* SEGMENT 5: About & Legal */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 overflow-hidden shadow-sm transition-all">
            <button
              type="button"
              id="accordion-header-about-legal"
              data-testid="accordion-header-about-legal"
              aria-expanded={Boolean(openSections['about-legal'])}
              aria-controls="accordion-panel-about-legal"
              onClick={() => toggleSection('about-legal')}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors text-left min-h-[44px]"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-slate-800 text-emerald-400 border border-slate-700/60">
                  <Scale className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {t.settings.accordionAboutLegal || 'About & Legal'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {t.settings.accordionAboutLegalSubtitle || 'Open-source license, terms, privacy, and support'}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-slate-400 transition-transform duration-200 shrink-0 ${
                  openSections['about-legal'] ? 'rotate-180' : ''
                }`}
              />
            </button>

            <div
              id="accordion-panel-about-legal"
              role="region"
              aria-labelledby="accordion-header-about-legal"
              className={openSections['about-legal'] ? 'p-4 pt-1 border-t border-slate-800/60 space-y-4' : 'hidden'}
            >
              {/* Support & Assistance */}
              <div className="space-y-2">
                <a
                  href={`mailto:${supportEmail}`}
                  id="link-support-help"
                  className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900 transition-all group min-h-[44px]"
                  aria-label={(t.settings as any).supportHelp || 'Get Help & Support'}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-slate-900 group-hover:bg-emerald-950/60 text-emerald-400 border border-slate-800 transition-colors">
                      <LifeBuoy className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <div className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
                        {(t.settings as any).supportHelp || 'Get Help & Support'}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {supportEmail}
                      </div>
                    </div>
                  </div>
                  <Mail className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                </a>

                <a
                  href={`mailto:${legalEmail}`}
                  id="link-support-legal"
                  className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900 transition-all group min-h-[44px]"
                  aria-label={(t.settings as any).supportLegal || 'Legal & Privacy Inquiries'}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-slate-900 group-hover:bg-emerald-950/60 text-emerald-400 border border-slate-800 transition-colors">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <div className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
                        {(t.settings as any).supportLegal || 'Legal & Privacy Inquiries'}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {legalEmail}
                      </div>
                    </div>
                  </div>
                  <Mail className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                </a>
              </div>

              {/* Legal Links */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2.5">
                <a
                  href={tosUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  id="link-tos"
                  className="flex items-center justify-between text-xs text-slate-300 hover:text-white group transition-colors py-1 min-h-[44px]"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <FileText className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-400" />
                    {(t.settings as any).termsOfService || 'Terms of Service'}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400" />
                </a>

                <div className="border-t border-slate-900" />

                <a
                  href={privacyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  id="link-privacy"
                  className="flex items-center justify-between text-xs text-slate-300 hover:text-white group transition-colors py-1 min-h-[44px]"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Shield className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-400" />
                    <span>{(t.settings as any).privacyPolicy || 'Privacy Policy'}</span>
                    <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800/50 px-1.5 py-0.5 rounded font-mono">
                      {(t.settings as any).googleComplianceBadge || 'Google Limited Use Compliant'}
                    </span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400" />
                </a>

                <div className="border-t border-slate-900" />

                <a
                  href={licenseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  id="link-license"
                  className="flex items-center justify-between text-xs text-slate-300 hover:text-white group transition-colors py-1 min-h-[44px]"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <Scale className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-400" />
                    {(t.settings as any).license || 'Open Source License (Apache 2.0)'}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400" />
                </a>
              </div>

              {/* Attribution & Version Info */}
              <div className="pt-2 text-center flex flex-col gap-1 text-slate-400">
                <div className="text-xs font-medium text-slate-300">
                  <a
                    href="https://qozara.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-emerald-400 transition-colors inline-flex items-center gap-1 min-h-[44px] px-2 py-1 justify-center"
                  >
                    <span>{(t.settings as any).aboutNotice || 'Quomida is a research project by Qozara Lab'}</span>
                    <ExternalLink className="w-3 h-3 text-slate-500" />
                  </a>
                </div>
                <div className="text-[11px] text-slate-500">
                  © {new Date().getFullYear()} · {(t.settings as any).aboutCommunity || 'Built for the Open Source Community'}
                </div>
                <div className="text-[11px] text-slate-600 font-mono mt-1">
                  Version {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Confirmation Dialog: Download Offline Database */}
      {showConfirmDownload && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-download-title"
            className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-150"
          >
            <div className="p-3 bg-emerald-950/60 text-emerald-400 rounded-full mb-3 border border-emerald-800/50">
              <Wifi className="w-6 h-6" />
            </div>
            <h3 id="confirm-download-title" className="text-base font-bold text-white mb-2">
              {(t.settings as any).offlineDbConfirmDownloadTitle || 'Download Offline Database?'}
            </h3>
            <p className="text-xs text-slate-300 max-w-xs mb-6 leading-relaxed">
              {((t.settings as any).offlineDbConfirmDownloadDesc || 'You are about to download the complete offline food database (~{{size}}MB). We strongly recommend connecting to Wi-Fi to preserve mobile cellular data.').replace('{{size}}', approximateSizeMb)}
            </p>
            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={() => setShowConfirmDownload(false)}
                className="flex-1 py-2.5 px-4 min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                {(t.settings as any).offlineDbCancel || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmDownload(false);
                  const baseUrl = import.meta.env?.VITE_CATALOG_BASE_URL?.replace(/\/+$/, '') || '';
                  const targetUrl = baseUrl ? `${baseUrl}/catalog.sqlite.gz` : '/catalog.sqlite.gz';
                  console.log('[SettingsModal] User confirmed download. Starting download from:', targetUrl);
                  setCatalogFeedback(null);
                  downloadCatalog(targetUrl);
                }}
                className="flex-1 py-2.5 px-4 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-sm"
              >
                {(t.settings as any).offlineDbConfirmDownloadAction || 'Download Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog: Delete Offline Database */}
      {showConfirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-title"
            className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-150"
          >
            <div className="p-3 bg-rose-950/60 text-rose-400 rounded-full mb-3 border border-rose-800/50">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 id="confirm-delete-title" className="text-base font-bold text-white mb-2">
              {(t.settings as any).offlineDbConfirmDeleteTitle || 'Delete Offline Database?'}
            </h3>
            <p className="text-xs text-slate-300 max-w-xs mb-6 leading-relaxed">
              {((t.settings as any).offlineDbConfirmDeleteDesc || 'This will remove the downloaded database (~{{size}}MB) from local storage to free up disk space and revert to the lightweight built-in database.').replace('{{size}}', approximateSizeMb)}
            </p>
            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={() => setShowConfirmDelete(false)}
                className="flex-1 py-2.5 px-4 min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                {(t.settings as any).offlineDbCancel || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowConfirmDelete(false);
                  console.log('[SettingsModal] User confirmed delete. Removing downloaded catalog...');
                  setCatalogFeedback(null);
                  await deleteCatalog();
                  if (typeof resetCatalogState === 'function') {
                    await resetCatalogState();
                  }
                }}
                className="flex-1 py-2.5 px-4 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-sm"
              >
                {(t.settings as any).offlineDbConfirmDeleteAction || 'Delete and Free Space'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
