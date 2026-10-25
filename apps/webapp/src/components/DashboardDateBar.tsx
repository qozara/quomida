import React from 'react';
import { useApp } from '../context/AppContext.js';
import { ChevronLeft, ChevronRight, Cloud } from 'lucide-react';
import { HeaderSyncTrigger } from './sync/index.js';

export const DashboardDateBar: React.FC = () => {
  const {
    selectedDate,
    setSelectedDate,
    locale,
    activeProvider,
    userSettings,
    setIsSettingsOpen,
    t
  } = useApp();

  const handlePrevDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const formattedDate = new Intl.DateTimeFormat(locale === 'es' ? 'es-AR' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(new Date(selectedDate + 'T00:00:00'));

  // Cloud Connection & Profile Picture
  const isCloudConnected = Boolean(
    (activeProvider && activeProvider.getStatus() !== 'disconnected' && activeProvider.name !== 'Mock Storage') ||
    (userSettings?.active_cloud_provider?.id && userSettings.active_cloud_provider.id !== 'mock')
  );

  const userPicture =
    userSettings?.active_cloud_provider?.credentials?.userPicture ||
    activeProvider?.getUserPicture?.() ||
    null;

  return (
    <div
      data-testid="dashboard-date-bar"
      className="sticky top-0 z-30 w-full bg-slate-950/90 backdrop-blur-md border-b border-slate-800/40"
    >
      <div className="max-w-md mx-auto px-4 py-2 flex items-center justify-between">
        {/* Left: Quomida Favicon / Cloud Avatar Action */}
        <div className="w-10 flex items-center justify-start shrink-0">
          <button
            id="btn-open-settings-avatar"
            data-testid="btn-open-settings-avatar"
            onClick={() => setIsSettingsOpen(true)}
            aria-label={t.settings.title}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-0.5 rounded-full text-slate-300 hover:text-white transition-all active:scale-95 group focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            {isCloudConnected && userPicture ? (
              <img
                src={userPicture}
                alt="Profile"
                className="w-8 h-8 rounded-full object-cover border-2 border-emerald-500/50 group-hover:border-emerald-400 shadow-md transition-colors"
                referrerPolicy="no-referrer"
              />
            ) : isCloudConnected ? (
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold flex items-center justify-center text-xs shadow-md group-hover:bg-emerald-500/30 transition-colors">
                <Cloud className="w-4 h-4" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-900 border border-emerald-500/30 flex items-center justify-center p-1 shadow-md group-hover:border-emerald-400/50 transition-colors">
                <img src="/favicon.svg" alt="Quomida" className="w-5 h-5 object-contain" />
              </div>
            )}
          </button>
        </div>

        {/* Center: Centered Thumb-friendly Date Selector */}
        <div className="flex items-center gap-1 bg-slate-900/90 px-2 py-0.5 rounded-full border border-slate-800 shadow-md backdrop-blur-md">
          <button
            onClick={handlePrevDay}
            aria-label="Previous day"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-1 text-slate-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs sm:text-sm font-semibold text-slate-100 capitalize min-w-[85px] sm:min-w-[95px] text-center select-none">
            {formattedDate}
          </span>
          <button
            onClick={handleNextDay}
            aria-label="Next day"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-1 text-slate-400 hover:text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Sync Status Badge */}
        <div className="w-10 flex items-center justify-end shrink-0">
          <HeaderSyncTrigger />
        </div>
      </div>
    </div>
  );
};
