import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext.js';
import {
  X,
  ArrowLeft,
  Globe,
  Monitor,
  Moon,
  Sun,
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
  User
} from 'lucide-react';
import { useCatalogDownload } from '../hooks/useCatalogDownload.js';
import { usePwaUpdate } from '../hooks/usePwaUpdate.js';
import { SYSTEM_CATALOG_META } from '../services/RemoteCatalogService.js';
import { AiKeyEncryptionService } from '@quomida/ai-services';
import { AI_CONFIG } from '../config/ai.js';
import { type AiProviderType } from '@quomida/domain-core';

const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL || 'support@qozara.org';
const legalEmail = import.meta.env.VITE_LEGAL_EMAIL || 'legal@qozara.org';
const legalBaseUrl = (import.meta.env.VITE_LEGAL_BASE_URL || 'https://qozara.org').replace(/\/+$/, '');
const appWebsiteUrl = (import.meta.env.VITE_APP_WEBSITE_URL || 'https://quomida.qozara.org').replace(/\/+$/, '');

const tosUrl = `${legalBaseUrl}/legal/quomida/tos.html`;
const privacyUrl = `${legalBaseUrl}/legal/quomida/privacy.html`;
const licenseUrl = `${appWebsiteUrl}/LICENSE`;

interface SettingsModalProps {
  onBack?: () => void;
  onClose?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onBack, onClose }) => {
  const {
    locale,
    languagePreference,
    setLocale,
    theme,
    setTheme,
    userSettings,
    updateUserSettings,
    syncStatus: _syncStatus,
    uxSyncState,
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

  const {
    needRefresh: isAppUpdateReady,
    isChecking: isCheckingAppUpdate,
    isUpdating: isApplyingAppUpdate,
    lastCheckResult: appUpdateCheckResult,
    checkForUpdate: handleCheckAppUpdate,
    applyUpdate: handleApplyAppUpdate
  } = usePwaUpdate();

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
  const [autoDownloadEnabled, setAutoDownloadEnabled] = useState<boolean>(
    () => (typeof window !== 'undefined' ? localStorage.getItem('catalog_auto_download_enabled') !== 'false' : true)
  );

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

  const settingsSignature = useMemo(() => {
    if (!userSettings) return '';
    const { active_cloud_provider: _creds, ...domainSettings } = userSettings;
    return JSON.stringify(domainSettings);
  }, [userSettings]);

  useEffect(() => {
    if (!userSettings) return;
    if (userSettings.ai_settings) {
      setAiEnabled(userSettings.ai_settings.enabled !== false);
      if (userSettings.ai_settings.provider) {
        setAiProvider(userSettings.ai_settings.provider);
      }
      if (userSettings.ai_settings.ollama_base_url) {
        setOllamaUrl(userSettings.ai_settings.ollama_base_url);
      }
      if (userSettings.ai_settings.ollama_model) {
        setOllamaModel(userSettings.ai_settings.ollama_model);
      }
    }
  }, [settingsSignature, isSettingsOpen]);

  // Extract User Info
  const connectedAccount = activeProvider?.getConnectedAccount?.();
  let userName = userSettings?.active_cloud_provider?.credentials?.userName;
  let userEmail = userSettings?.active_cloud_provider?.credentials?.userEmail;
  const userPicture =
    userSettings?.active_cloud_provider?.credentials?.userPicture ||
    activeProvider?.getUserPicture?.() ||
    null;

  if (!userName && connectedAccount) {
    if (connectedAccount.includes('(')) {
      userName = connectedAccount.split('(')[0].trim();
      userEmail = userEmail || connectedAccount.split('(')[1].replace(')', '').trim();
    } else {
      userName = connectedAccount;
    }
  }

  const isCloudConnected = Boolean(
    (activeProvider && activeProvider.getStatus() !== 'disconnected') ||
    userSettings?.active_cloud_provider?.id
  );

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

  const handleBack = () => {
    if (onBack) onBack();
    else if (onClose) onClose();
    else setIsSettingsOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-screen-title"
      className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col overflow-y-auto animate-slide-in-left"
    >
      {/* Modern Sticky Navigation Header */}
      <header className="sticky top-0 z-20 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/80 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center justify-between shrink-0">
        <button
          id="btn-close-settings"
          data-testid="btn-back-settings"
          onClick={handleBack}
          aria-label="Back"
          className="min-w-[44px] min-h-[44px] p-2 -ml-2 rounded-full text-slate-600 dark:text-slate-300 transition-colors flex items-center justify-center active:scale-95"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 id="settings-screen-title" className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
          {t.settings.title}
        </h1>
        <div className="w-[44px]" aria-hidden="true" />
      </header>

      {/* Main Settings Content */}
      <div className="max-w-lg mx-auto w-full px-4 py-5 space-y-5 flex-1">
        {/* Top Hero: Connected Cloud User Info OR App Name */}
        {isCloudConnected ? (
          <div className="bg-gradient-to-br from-white via-slate-50 to-slate-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900/80 border border-slate-200 dark:border-slate-800/90 rounded-3xl p-5 shadow-xl flex items-center gap-4 relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

            {userPicture ? (
              <img
                src={userPicture}
                alt={displayUserName}
                className="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-500/40 shadow-md shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/30 to-emerald-600/10 border-2 border-emerald-500/40 text-emerald-600 dark:text-emerald-300 font-extrabold text-2xl flex items-center justify-center shadow-md shrink-0">
                {displayUserName.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-1">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">{displayUserName}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{displayUserEmail}</p>

              {/* Cloud Sync Status Pill */}
              <div className="pt-1 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                  {activeProvider?.name || 'Cloud'} • {t.sync?.header?.[uxSyncState] || t.sync?.header?.synced || 'Synced'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-white via-slate-50 to-slate-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900/80 border border-slate-200 dark:border-slate-800/90 rounded-3xl p-5 shadow-xl flex items-center gap-4 relative overflow-hidden">
            <img
              src="/favicon.svg"
              alt="Quomida"
              className="w-14 h-14 rounded-2xl object-cover border-2 border-emerald-500/40 shadow-md shrink-0"
            />
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Quomida</h2>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                  Local-first
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.settings?.accountLocalSubtitle || 'Offline mode (no cloud connected)'}
              </p>
            </div>
          </div>
        )}

        {/* 5-Segment Accordion Menu List */}
        <div className="space-y-3">
          
          {/* SEGMENT 1: App Settings & User Account */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 overflow-hidden shadow-sm transition-all">
            <button
              type="button"
              id="accordion-header-app-settings"
              data-testid="accordion-header-app-settings"
              aria-expanded={Boolean(openSections['app-settings'])}
              aria-controls="accordion-panel-app-settings"
              onClick={() => toggleSection('app-settings')}
              className="w-full flex items-center justify-between p-4 transition-colors text-left min-h-[44px]"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-slate-700/60">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t.settings.accordionAppSettings || 'App Settings & User Account'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
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
              className={openSections['app-settings'] ? 'p-4 pt-1 border-t border-slate-200 dark:border-slate-800/60 space-y-4' : 'hidden'}
            >
              {/* Language & Theme Controls */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label htmlFor="select-language" className="text-xs text-slate-600 dark:text-slate-400 block mb-1.5 font-medium">{t.settings.language}</label>
                  <select
                    id="select-language"
                    data-testid="select-language"
                    value={languagePreference || locale || 'system'}
                    onChange={(e) => setLocale(e.target.value as any)}
                    className="w-full min-h-[44px] bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="system">{t.settings.languageSystem || 'System default'}</option>
                    <option value="es">{t.settings.languageEs || 'Spanish'}</option>
                    <option value="en">{t.settings.languageEn || 'English'}</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1.5 font-medium">{t.settings.theme}</label>
                  <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-300 dark:border-slate-700 min-h-[44px] items-center gap-1">
                    <button
                      type="button"
                      id="btn-theme-system"
                      data-testid="btn-theme-system"
                      onClick={() => setTheme('system')}
                      className={`flex-1 min-h-[36px] flex justify-center items-center gap-1.5 rounded-lg text-xs font-semibold transition-all ${
                        theme === 'system' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
                      }`}
                      aria-label={t.settings.themeSystem || 'System'}
                      title={t.settings.themeSystem || 'System'}
                    >
                      <Monitor className="w-4 h-4 shrink-0" />
                      <span className="hidden sm:inline">{t.settings.themeSystem || 'System'}</span>
                    </button>
                    <button
                      type="button"
                      id="btn-theme-light"
                      data-testid="btn-theme-light"
                      onClick={() => setTheme('light')}
                      className={`flex-1 min-h-[36px] flex justify-center items-center gap-1.5 rounded-lg text-xs font-semibold transition-all ${
                        theme === 'light' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
                      }`}
                      aria-label={t.settings.themeLight || 'Light'}
                      title={t.settings.themeLight || 'Light'}
                    >
                      <Sun className="w-4 h-4 shrink-0" />
                      <span className="hidden sm:inline">{t.settings.themeLight || 'Light'}</span>
                    </button>
                    <button
                      type="button"
                      id="btn-theme-dark"
                      data-testid="btn-theme-dark"
                      onClick={() => setTheme('dark')}
                      className={`flex-1 min-h-[36px] flex justify-center items-center gap-1.5 rounded-lg text-xs font-semibold transition-all ${
                        theme === 'dark' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
                      }`}
                      aria-label={t.settings.themeDark || 'Dark'}
                      title={t.settings.themeDark || 'Dark'}
                    >
                      <Moon className="w-4 h-4 shrink-0" />
                      <span className="hidden sm:inline">{t.settings.themeDark || 'Dark'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SEGMENT 3: Intelligence & Edge AI */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 overflow-hidden shadow-sm transition-all">
            <button
              type="button"
              id="accordion-header-ai"
              data-testid="accordion-header-ai"
              aria-expanded={Boolean(openSections['ai'])}
              aria-controls="accordion-panel-ai"
              onClick={() => toggleSection('ai')}
              className="w-full flex items-center justify-between p-4 transition-colors text-left min-h-[44px]"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-slate-700/60">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t.settings.accordionAi || 'Intelligence & Edge AI'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
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
              className={openSections['ai'] ? 'p-4 pt-1 border-t border-slate-200 dark:border-slate-800/60 space-y-4' : 'hidden'}
            >
              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                {/* Master AI Toggle */}
                <div className="flex items-center justify-between p-3.5 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl">
                  <div className="space-y-0.5 pr-3">
                    <label htmlFor="toggle-ai-enabled" className="text-xs font-semibold text-slate-800 dark:text-slate-200 block cursor-pointer">
                      {t.ai?.enableAi || 'Enable AI Features'}
                    </label>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
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
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center p-1 rounded-xl transition-colors"
                  >
                    <div className={`w-11 h-6 rounded-full transition-colors relative p-0.5 pointer-events-none ${aiEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
                      <div className={`w-5 h-5 rounded-full bg-white transition-transform ${aiEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                  </button>
                </div>

                {aiEnabled ? (
                  <>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      {t.ai?.description || 'Configure natural language meal logging with Qozara Intelligence edge AI or your private model.'}
                    </p>

                    {/* Provider Selection */}
                    <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
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
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500/80 text-emerald-950 dark:text-white'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-400'
                        }`}
                      >
                        <span className="font-bold flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${aiProvider === p.id ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600'}`} />
                          {p.title}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 pl-3.5 leading-tight">{p.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* BYOK Section */}
                {aiProvider === 'byok' && (
                  <form onSubmit={handleEncryptAndSaveKey} className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-900">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                        <Key className="w-3.5 h-3.5 text-emerald-500" />
                        <span>{t.ai?.apiKeyLabel || 'Personal Gemini API Key'}</span>
                      </label>
                      {userSettings?.ai_settings?.ciphertext && (
                        <button
                          type="button"
                          onClick={handleClearApiKey}
                          className="text-[10px] text-rose-500 min-h-[44px] flex items-center"
                        >
                          {t.ai?.clearKeyBtn || 'Remove Key'}
                        </button>
                      )}
                    </div>

                    {userSettings?.ai_settings?.ciphertext && (
                      <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800/60 rounded-xl p-2 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 shrink-0 text-emerald-500" />
                        <span>{t.ai?.keyConfigured || 'Encrypted Personal Key configured'}</span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder={t.ai?.apiKeyPlaceholder || 'AIzaSy...'}
                        className="flex-1 min-h-[44px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="submit"
                        disabled={isEncryptingKey || !apiKeyInput.trim()}
                        className="px-3 py-1.5 min-h-[44px] bg-emerald-600 disabled:opacity-50 text-white font-semibold rounded-xl text-xs flex items-center gap-1 transition-all"
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
                  <form onSubmit={handleSaveOllamaSettings} className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-900">
                    <div className="flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <Cpu className="w-3.5 h-3.5 text-emerald-500" />
                      <span>{t.ai?.providers?.ollama || 'Ollama Configuration'}</span>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-0.5">
                        {t.ai?.ollamaUrlLabel || 'Ollama Endpoint URL'}
                      </label>
                      <input
                        type="text"
                        value={ollamaUrl}
                        onChange={(e) => setOllamaUrl(e.target.value)}
                        placeholder={t.ai?.ollamaUrlPlaceholder || 'http://localhost:11434/api'}
                        className="w-full min-h-[44px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-0.5">
                        {t.ai?.ollamaModelLabel || 'Ollama Model Name'}
                      </label>
                      <input
                        type="text"
                        value={ollamaModel}
                        onChange={(e) => setOllamaModel(e.target.value)}
                        placeholder={t.ai?.ollamaModelPlaceholder || 'llama3.2'}
                        className="w-full min-h-[44px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full min-h-[44px] py-1.5 bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-semibold rounded-xl text-xs transition-all border border-slate-300 dark:border-slate-700"
                    >
                      {t.ai?.saveOllamaBtn || 'Save Ollama Settings'}
                    </button>
                  </form>
                )}
                  </>
                ) : (
                  <div className="p-3 bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80 rounded-xl text-center">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t.ai?.aiDisabled || 'AI features are disabled. Quomida is running 100% locally.'}
                    </p>
                  </div>
                )}

                {aiFeedback && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium pt-1 border-t border-slate-200 dark:border-slate-900">
                    {aiFeedback}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* SEGMENT 4: Data & Sync */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 overflow-hidden shadow-sm transition-all">
            <button
              type="button"
              id="accordion-header-data-sync"
              data-testid="accordion-header-data-sync"
              aria-expanded={Boolean(openSections['data-sync'])}
              aria-controls="accordion-panel-data-sync"
              onClick={() => toggleSection('data-sync')}
              className="w-full flex items-center justify-between p-4 transition-colors text-left min-h-[44px]"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-slate-700/60">
                  <Cloud className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t.settings.accordionDataSync || 'Data & Sync'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
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
              className={openSections['data-sync'] ? 'p-4 pt-1 border-t border-slate-200 dark:border-slate-800/60 space-y-4' : 'hidden'}
            >
              {/* BYOS Cloud Storage Card */}
              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="text-xs text-slate-700 dark:text-slate-300 font-semibold flex items-center justify-between">
                  <span>Storage Adapter</span>
                  <span className="text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-800/50">
                    {activeProvider && activeProvider.isInitialized() && activeProvider.getStatus() !== 'disconnected'
                      ? activeProvider.name
                      : 'Local Only (No Adapter)'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Quomida runs 100% offline in your browser using RxDB IndexedDB. You can connect your personal Google Drive / Sheets account anytime.
                </p>
                <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200 dark:border-slate-900 flex justify-between items-center">
                  <span>{t.settings.syncLastSynced.replace('{{time}}', lastSyncedTime || 'Now')}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsStorageSettingsOpen(true);
                    }}
                    className="text-emerald-600 dark:text-emerald-400 text-[11px] font-medium min-h-[44px] flex items-center"
                  >
                    Manage Storage →
                  </button>
                </div>
              </div>

              {/* Food Catalog Updates Check Button */}
              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {t.settings.catalogTitle || 'Food Catalog & Ingredients'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-600 dark:text-slate-500 font-mono uppercase bg-slate-200 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-800">
                    {downloadStatus === 'complete' && catalogVersion
                      ? `v: ${catalogVersion.substring(0, 8)}`
                      : (SYSTEM_CATALOG_META.catalogVersion ? `v: ${SYSTEM_CATALOG_META.catalogVersion.substring(0, 8)}` : 'v: base')}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
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
                  className="w-full min-h-[44px] py-2 bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-300 dark:border-slate-700 transition-all disabled:opacity-50 shadow-sm"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                  <span>{isChecking ? (t.settings.checkingCatalog || 'Checking...') : (t.settings.checkCatalogUpdates || 'Check for Catalog Updates')}</span>
                </button>
              </div>

              {/* Offline Food Database */}
              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                  <Database className="w-4 h-4 text-emerald-500" />
                  <span>{(t.settings as any).offlineDbTitle || 'Offline Food Database'}</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  {(t.settings as any).offlineDbDescription || 'Quomida supports downloading the complete food database directly to your device for instant offline searches without using cellular data.'}
                </p>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800/50">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {(t.settings as any).offlineDbAutoDownloadTitle || 'Auto-download updates'}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {(t.settings as any).offlineDbAutoDownloadDesc || 'Automatically download database updates in background when under 10MB.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    data-testid="toggle-catalog-auto-download"
                    aria-label={(t.settings as any).offlineDbAutoDownloadTitle || 'Auto-download updates'}
                    aria-checked={autoDownloadEnabled}
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        const next = !autoDownloadEnabled;
                        localStorage.setItem('catalog_auto_download_enabled', next.toString());
                        setAutoDownloadEnabled(next);
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-100 dark:focus:ring-offset-slate-900 ${
                      autoDownloadEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        autoDownloadEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800/50">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {(t.settings as any).offlineDbStatus || 'Status'}
                    </span>
                    <span className="text-[11px] font-mono mt-0.5 text-emerald-600 dark:text-emerald-400">
                      {downloadStatus === 'idle' && ((t.settings as any).offlineDbNotDownloaded || 'Not Downloaded')}
                      {downloadStatus === 'fetching' && (((t.settings as any).offlineDbDownloading || 'Downloading {{progress}}%').replace('{{progress}}', String(downloadProgress)))}
                      {downloadStatus === 'decompressing_and_writing' && ((t.settings as any).offlineDbInstalling || 'Installing...')}
                      {downloadStatus === 'complete' && ((t.settings as any).offlineDbInstalled || 'Available Offline')}
                      {downloadStatus === 'error' && ((t.settings as any).offlineDbFailed || 'Download Failed')}
                    </span>
                    {downloadError && <span className="text-[10px] text-rose-500 dark:text-rose-400 mt-1 max-w-[150px] truncate" title={downloadError}>{downloadError}</span>}
                  </div>

                  {downloadStatus === 'idle' || downloadStatus === 'error' ? (
                    <button
                      type="button"
                      disabled={!isOnline}
                      title={!isOnline ? ((t.settings as any).offlineDbDownloadOfflineTooltip || 'Connect to the internet to download the offline database') : undefined}
                      onClick={() => setShowConfirmDownload(true)}
                      className={`px-3 py-1.5 min-h-[44px] text-xs font-bold rounded-lg shadow transition-all flex items-center gap-1.5 ${
                        !isOnline
                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60'
                          : 'bg-emerald-600 text-white active:scale-95'
                      }`}
                    >
                      <Download className="w-3.5 h-3.5" />
                      {((t.settings as any).offlineDbDownloadBtn || 'Download (~{{size}}MB)').replace('{{size}}', approximateSizeMb)}
                    </button>
                  ) : downloadStatus === 'complete' ? (
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1.5 min-h-[44px] text-xs font-bold bg-slate-100 dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 rounded-lg shadow-inner flex items-center gap-1.5 border border-emerald-300 dark:border-emerald-900/50">
                        <CheckCircle className="w-3.5 h-3.5" />
                        {(t.settings as any).offlineDbInstalled || 'Installed'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowConfirmDelete(true)}
                        disabled={isDeleting}
                        aria-label={(t.settings as any).offlineDbDeleteBtn || 'Delete Database'}
                        className="px-2.5 py-1.5 min-h-[44px] text-xs font-semibold bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-900/40 rounded-lg transition-colors flex items-center gap-1.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {isDeleting ? ((t.settings as any).offlineDbDeleting || 'Removing...') : ((t.settings as any).offlineDbDeleteBtn || 'Delete')}
                      </button>
                    </div>
                  ) : (
                    <div className="w-24 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
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
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 overflow-hidden shadow-sm transition-all">
            <button
              type="button"
              id="accordion-header-about-legal"
              data-testid="accordion-header-about-legal"
              aria-expanded={Boolean(openSections['about-legal'])}
              aria-controls="accordion-panel-about-legal"
              onClick={() => toggleSection('about-legal')}
              className="w-full flex items-center justify-between p-4 transition-colors text-left min-h-[44px]"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-slate-700/60">
                  <Scale className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t.settings.accordionAboutLegal || 'About & Legal'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
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
              className={openSections['about-legal'] ? 'p-4 pt-1 border-t border-slate-200 dark:border-slate-800/60 space-y-4' : 'hidden'}
            >
              {/* Support & Assistance */}
              <div className="space-y-2">
                <a
                  href={`mailto:${supportEmail}`}
                  id="link-support-help"
                  className="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 transition-all min-h-[44px]"
                  aria-label={(t.settings as any).supportHelp || 'Get Help & Support'}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-slate-800 transition-colors">
                      <LifeBuoy className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <div className="text-xs font-bold text-slate-900 dark:text-white transition-colors">
                        {(t.settings as any).supportHelp || 'Get Help & Support'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {supportEmail}
                      </div>
                    </div>
                  </div>
                  <Mail className="w-4 h-4 text-slate-400 dark:text-slate-500 transition-colors" />
                </a>

                <a
                  href={`mailto:${legalEmail}`}
                  id="link-support-legal"
                  className="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 transition-all min-h-[44px]"
                  aria-label={(t.settings as any).supportLegal || 'Legal & Privacy Inquiries'}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-slate-800 transition-colors">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <div className="text-xs font-bold text-slate-900 dark:text-white transition-colors">
                        {(t.settings as any).supportLegal || 'Legal & Privacy Inquiries'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {legalEmail}
                      </div>
                    </div>
                  </div>
                  <Mail className="w-4 h-4 text-slate-400 dark:text-slate-500 transition-colors" />
                </a>
              </div>

              {/* Legal Links */}
              <div className="bg-white dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                <a
                  href={tosUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  id="link-tos"
                  className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 transition-colors py-1 min-h-[44px]"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    {(t.settings as any).termsOfService || 'Terms of Service'}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                </a>

                <div className="border-t border-slate-100 dark:border-slate-900" />

                <a
                  href={privacyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  id="link-privacy"
                  className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 transition-colors py-1 min-h-[44px]"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Shield className="w-3.5 h-3.5 text-slate-400" />
                    <span>{(t.settings as any).privacyPolicy || 'Privacy Policy'}</span>
                    <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800/50 px-1.5 py-0.5 rounded font-mono">
                      {(t.settings as any).googleComplianceBadge || 'Google Limited Use Compliant'}
                    </span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                </a>

                <div className="border-t border-slate-100 dark:border-slate-900" />

                <a
                  href={licenseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  id="link-license"
                  className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 transition-colors py-1 min-h-[44px]"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <Scale className="w-3.5 h-3.5 text-slate-400" />
                    {(t.settings as any).license || 'Open Source License (Apache 2.0)'}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                </a>
              </div>

              {/* Attribution & Version Info */}
              <div className="pt-2 text-center flex flex-col gap-1 text-slate-600 dark:text-slate-400">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  <a
                    href="https://qozara.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-600 dark:text-emerald-400 transition-colors inline-flex items-center gap-1 min-h-[44px] px-2 py-1 justify-center"
                  >
                    <span>{(t.settings as any).aboutNotice || 'Quomida is a research project by Qozara Lab'}</span>
                    <ExternalLink className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                  </a>
                </div>
                <div className="text-[11px] text-slate-500">
                  © {new Date().getFullYear()} · {(t.settings as any).aboutCommunity || 'Built for the Open Source Community'}
                </div>

                {/* App Version & Manual Update Check */}
                <div className="mt-2 pt-2.5 border-t border-slate-200 dark:border-slate-800/60 flex flex-col items-center gap-2">
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono flex items-center gap-2">
                    <span>
                      {((t.settings as any).appVersionLabel || 'Version {{version}}').replace(
                        '{{version}}',
                        typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
                      )}
                    </span>
                    {appUpdateCheckResult === 'up_to_date' && !isAppUpdateReady && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-sans font-medium flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        {(t.settings as any).appUpToDate || 'Quomida is up to date'}
                      </span>
                    )}
                    {isAppUpdateReady && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-sans font-bold flex items-center gap-1">
                        {(t.settings as any).appUpdateAvailable || 'New version available!'}
                      </span>
                    )}
                    {appUpdateCheckResult === 'error' && !isAppUpdateReady && (
                      <span className="text-rose-500 dark:text-rose-400 font-sans">
                        {(t.settings as any).appUpdateCheckError || 'Could not check for app updates'}
                      </span>
                    )}
                  </div>

                  {isAppUpdateReady ? (
                    <button
                      type="button"
                      id="btn-install-app-update"
                      data-testid="btn-install-app-update"
                      disabled={isApplyingAppUpdate}
                      onClick={() => handleApplyAppUpdate()}
                      className="min-h-[44px] px-4 py-2 bg-emerald-500 active:scale-95 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-75"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isApplyingAppUpdate ? 'animate-spin' : ''}`} />
                      <span>{(t.settings as any).appUpdateInstallNow || 'Update & Reload Now'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      id="btn-check-app-update"
                      data-testid="btn-check-app-update"
                      onClick={() => handleCheckAppUpdate()}
                      disabled={isCheckingAppUpdate || !isOnline}
                      className="min-h-[44px] px-3.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-emerald-600 dark:text-emerald-400 font-semibold rounded-xl text-xs inline-flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 shadow-sm"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isCheckingAppUpdate ? 'animate-spin' : ''}`} />
                      <span>
                        {isCheckingAppUpdate
                          ? ((t.settings as any).checkingAppUpdate || 'Checking...')
                          : ((t.settings as any).checkAppUpdate || 'Check for App Update')}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Confirmation Dialog: Download Offline Database */}
      {showConfirmDownload && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 overscroll-contain"
          onClick={() => setShowConfirmDownload(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-download-title"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-150"
          >
            <div className="p-3 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full mb-3 border border-emerald-300 dark:border-emerald-800/50">
              <Wifi className="w-6 h-6" />
            </div>
            <h3 id="confirm-download-title" className="text-base font-bold text-slate-900 dark:text-white mb-2">
              {(t.settings as any).offlineDbConfirmDownloadTitle || 'Download Offline Database?'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xs mb-6 leading-relaxed">
              {((t.settings as any).offlineDbConfirmDownloadDesc || 'You are about to download the complete offline food database (~{{size}}MB). We strongly recommend connecting to Wi-Fi to preserve mobile cellular data.').replace('{{size}}', approximateSizeMb)}
            </p>
            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={() => setShowConfirmDownload(false)}
                className="flex-1 py-2.5 px-4 min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
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
                className="flex-1 py-2.5 px-4 min-h-[44px] rounded-xl bg-emerald-600 text-white text-xs font-bold transition-colors shadow-sm"
              >
                {(t.settings as any).offlineDbConfirmDownloadAction || 'Download Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog: Delete Offline Database */}
      {showConfirmDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 overscroll-contain"
          onClick={() => setShowConfirmDelete(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-title"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-150"
          >
            <div className="p-3 bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-full mb-3 border border-rose-300 dark:border-rose-800/50">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 id="confirm-delete-title" className="text-base font-bold text-slate-900 dark:text-white mb-2">
              {(t.settings as any).offlineDbConfirmDeleteTitle || 'Delete Offline Database?'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xs mb-6 leading-relaxed">
              {((t.settings as any).offlineDbConfirmDeleteDesc || 'This will remove the downloaded database (~{{size}}MB) from local storage to free up disk space and revert to the lightweight built-in database.').replace('{{size}}', approximateSizeMb)}
            </p>
            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={() => setShowConfirmDelete(false)}
                className="flex-1 py-2.5 px-4 min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
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
                className="flex-1 py-2.5 px-4 min-h-[44px] rounded-xl bg-rose-600 text-white text-xs font-bold transition-colors shadow-sm"
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
