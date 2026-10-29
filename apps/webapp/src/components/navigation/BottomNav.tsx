import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { CalendarDays, BarChart3, FolderHeart, Target } from 'lucide-react';

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
      icon: BarChart3,
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
      label: (t.nav as any).goals || (t.nav as any).profileGoals || 'Goals',
      icon: Target,
      testId: 'btn-open-settings'
    }
  ];

  return (
    <div className="fixed bottom-3 sm:bottom-4 left-0 right-0 z-30 flex justify-center px-3 sm:px-4 pointer-events-none">
      <nav
        role="tablist"
        aria-label="Main Navigation"
        className="floating-bottom-nav pointer-events-auto w-full max-w-md rounded-[28px] sm:rounded-full px-2 py-1.5 transition-all duration-300"
      >
        <div className="flex items-center justify-around gap-1">
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
                className={`flex-1 flex flex-col items-center justify-center min-h-[44px] min-w-[44px] py-1 px-1 rounded-2xl transition-all duration-200 active:scale-95 group focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
                  isActive
                    ? 'active-nav-label text-emerald-400 font-bold'
                    : 'text-slate-400 hover:text-slate-200 font-medium'
                }`}
              >
                <div
                  className={`px-3 py-1 rounded-full transition-all duration-200 flex items-center justify-center ${
                    isActive
                      ? 'active-nav-pill bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm'
                      : 'text-slate-400 dark:text-slate-400 group-hover:bg-slate-800/40 dark:group-hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-5 h-5 transition-transform group-active:scale-90" />
                </div>
                <span className="text-[10px] sm:text-[11px] leading-tight tracking-tight mt-0.5 truncate max-w-[72px]">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
