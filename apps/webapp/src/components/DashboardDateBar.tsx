import React from 'react';
import { HeaderSyncTrigger } from './sync/index.js';
import { DateSelector } from './DateSelector.js';
import { HeaderAvatarButton } from './HeaderAvatarButton.js';

export const DashboardDateBar: React.FC = () => {
  return (
    <div
      data-testid="dashboard-date-bar"
      className="sticky top-0 z-30 w-full bg-slate-950/90 backdrop-blur-md border-b border-slate-800/40"
    >
      <div className="max-w-md mx-auto px-4 py-2 flex items-center justify-between">
        {/* Left: Quomida Favicon / Cloud Avatar Action */}
        <div className="w-10 flex items-center justify-start shrink-0">
          <HeaderAvatarButton />
        </div>

        {/* Center: Reusable Thumb-friendly Date Selector */}
        <DateSelector />

        {/* Right: Sync Status Badge */}
        <div className="w-10 flex items-center justify-end shrink-0">
          <HeaderSyncTrigger />
        </div>
      </div>
    </div>
  );
};
