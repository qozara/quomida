import React from 'react';
import { Loader2, CloudOff, AlertCircle, CheckCircle2, HardDrive, Pause } from 'lucide-react';
import type { UXSyncState } from '@quomida/cloud-providers';

export interface SyncGlyphProps {
  state: UXSyncState;
  className?: string;
}

export const SyncGlyph: React.FC<SyncGlyphProps> = ({ state, className = 'w-6 h-6' }) => {
  switch (state) {
    case 'syncing':
      return <Loader2 className={`${className} animate-spin text-emerald-400`} aria-hidden="true" />;
    case 'offline':
      return <CloudOff className={`${className} text-zinc-400`} aria-hidden="true" />;
    case 'waiting':
      return (
        <span className="relative inline-flex items-center justify-center">
          <CloudOff className={`${className} text-zinc-400`} aria-hidden="true" />
          <Pause className="w-2.5 h-2.5 text-zinc-300 absolute bottom-0 right-0 bg-slate-900 rounded-full" aria-hidden="true" />
        </span>
      );
    case 'error':
      return (
        <span className="relative inline-flex items-center justify-center">
          <AlertCircle className={`${className} text-amber-400`} aria-hidden="true" />
          <span
            className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full ring-2 ring-slate-900 animate-pulse"
            aria-hidden="true"
          />
        </span>
      );
    case 'idle':
      return <CheckCircle2 className={`${className} text-emerald-400`} aria-hidden="true" />;
    case 'local':
    default:
      return <HardDrive className={`${className} text-slate-400`} aria-hidden="true" />;
  }
};
