import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { BookOpen, TrendingUp, FolderHeart, Settings, CalendarDays } from 'lucide-react';

export type NavTab = 'diary' | 'analytics' | 'catalog' | 'settings';

interface BottomNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onSelectTab }) => {
  const { t } = useApp();

  const tabs: Array<{
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    testId?: string;
  }> = [
    {
      id: 'diary',
      label: t.nav.dashboard,
      icon: CalendarDays,
      testId: 'btn-nav-diary'
    },
    {
      id: 'analytics',
      label: t.nav.analytics,
      icon: TrendingUp,
      testId: 'btn-open-analytics'
    },
    {
      id: 'catalog',
      label: t.nav.catalog,
      icon: FolderHeart,
      testId: 'btn-open-catalog'
    },
    {
      id: 'settings',
      label: t.nav.settings,
      icon: Settings,
      testId: 'btn-open-settings'
    }
  ];

  return (
    <nav
      role="tablist"
      aria-label="Main Navigation"
      className="fixed bottom-0 left-0 right-0 z-30 bg-slate-950/90 backdrop-blur-lg border-t border-slate-800/80 px-2 py-1 shadow-2xl"
    >
      <div className="max-w-md mx-auto flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              role="tab"
              id={tab.testId}
              data-testid={tab.testId}
              aria-selected={isActive}
              aria-label={tab.label}
              onClick={() => onSelectTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center min-h-[44px] min-w-[44px] py-1.5 px-1 rounded-2xl transition-all duration-200 active:scale-95 ${
                isActive
                  ? 'text-emerald-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200 font-medium'
              }`}
            >
              <div
                className={`p-1 rounded-xl transition-colors ${
                  isActive ? 'bg-emerald-950/60 text-emerald-400' : 'text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[11px] leading-tight tracking-tight mt-0.5 truncate max-w-[72px]">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
