import React from 'react';
import { useApp } from '../context/AppContext.js';
import { Cloud } from 'lucide-react';

export const HeaderAvatarButton: React.FC = () => {
  const {
    activeProvider,
    userSettings,
    setIsSettingsOpen,
    t
  } = useApp();

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
  );
};
