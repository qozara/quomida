import React, { useState } from 'react';
import { useApp } from '../context/AppContext.js';
import {
  X,
  Globe,
  Moon,
  Sun,
  Monitor,
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
  LifeBuoy
} from 'lucide-react';
import { useCatalogDownload } from '../hooks/useCatalogDownload.js';

const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL || 'support@qozara.org';
const legalEmail = import.meta.env.VITE_LEGAL_EMAIL || 'legal@qozara.org';
const legalBaseUrl = (import.meta.env.VITE_LEGAL_BASE_URL || 'https://qozara.org').replace(/\/+$/, '');
const appWebsiteUrl = (import.meta.env.VITE_APP_WEBSITE_URL || 'https://quomida.qozara.org').replace(/\/+$/, '');

const tosUrl = `${legalBaseUrl}/legal/quomida/tos.html`;
const privacyUrl = `${legalBaseUrl}/legal/quomida/privacy.html`;
const licenseUrl = `${appWebsiteUrl}/LICENSE`;



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
    catalogGeneratedAt,
    catalogFileSizeBytes,
    refreshCatalog,
    t
  } = useApp();

  const {
    status: downloadStatus,
    progress: downloadProgress,
    error: downloadError,
    downloadCatalog
  } = useCatalogDownload();

  const [catalogFeedback, setCatalogFeedback] = useState<string | null>(null);


  const [calorieTarget, setCalorieTarget] = useState(userSettings.daily_calorie_target || 2000);
  const [proteinTarget, setProteinTarget] = useState(userSettings.custom_macros?.protein || 150);
  const [carbsTarget, setCarbsTarget] = useState(userSettings.custom_macros?.carbs || 200);
  const [fatsTarget, setFatsTarget] = useState(userSettings.custom_macros?.fats || 65);
  const [isSaved, setIsSaved] = useState(false);

  const [isChecking, setIsChecking] = useState(false);

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
    if (isChecking) return;
    setCatalogFeedback(null);
    setIsChecking(true);
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
    } finally {
      setIsChecking(false);
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

        {/* Section 4: Offline Catalog Download */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Offline Database</span>
            </div>
            {catalogVersion && (
              <span className="text-[10px] text-slate-500 font-mono uppercase bg-slate-950 px-1.5 py-0.5 rounded">
                v: {catalogVersion.substring(0, 8)}
              </span>
            )}
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Quomida supports downloading the massive 1.1 million item database directly to your device for instant sub-millisecond offline searches without using your cellular data.
            </p>
            
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/50">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-300">Status</span>
                <span className="text-[11px] font-mono mt-0.5 text-emerald-400">
                  {downloadStatus === 'idle' && 'Not Downloaded'}
                  {downloadStatus === 'fetching' && `Downloading ${downloadProgress}%`}
                  {downloadStatus === 'decompressing_and_writing' && 'Installing...'}
                  {downloadStatus === 'complete' && 'Available Offline'}
                  {downloadStatus === 'error' && 'Download Failed'}
                </span>
                {downloadError && <span className="text-[10px] text-rose-400 mt-1 max-w-[150px] truncate" title={downloadError}>{downloadError}</span>}
              </div>

              {downloadStatus === 'idle' || downloadStatus === 'error' ? (
                <button
                  type="button"
                  onClick={() => {
                    const baseUrl = import.meta.env?.VITE_CATALOG_BASE_URL?.replace(/\/+$/, '') || '';
                    const targetUrl = baseUrl ? `${baseUrl}/catalog.sqlite.gz` : '/catalog.sqlite.gz';
                    downloadCatalog(targetUrl);
                  }}
                  className="px-3 py-1.5 text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg shadow active:scale-95 transition-all flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download (~55MB)
                </button>
              ) : downloadStatus === 'complete' ? (
                <span className="px-3 py-1.5 text-xs font-bold bg-slate-800 text-emerald-400 rounded-lg shadow-inner flex items-center gap-1.5 border border-emerald-900/50">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Installed
                </span>
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

        {/* Section 5: Support & Assistance */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
            <HelpCircle className="w-4 h-4 text-emerald-400" />
            <span>{(t.settings as any).supportTitle || 'Support & Assistance'}</span>
          </div>

          <div className="grid grid-cols-1 gap-2">
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
        </div>

        {/* Section 6: Legal & Licensing */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
            <Scale className="w-4 h-4 text-emerald-400" />
            <span>{(t.settings as any).legalTitle || 'Legal & Licensing'}</span>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="grid grid-cols-1 gap-2.5">
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
          </div>
        </div>

        {/* Section 7: About, Attribution & Version Info */}
        <div className="pt-2 border-t border-slate-800 text-center flex flex-col gap-1 text-slate-400">
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
  );
};
