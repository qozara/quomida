import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext.js';
import { SyncGlyph } from './SyncGlyph.js';
import { SyncInspectorPopover } from './SyncInspectorPopover.js';
import type { UXSyncState } from '@quomida/cloud-providers';

export const HeaderSyncTrigger: React.FC = () => {
  const { uxSyncState, t } = useApp();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [a11yAnnouncement, setA11yAnnouncement] = useState<string>('');
  const prevStateRef = useRef<UXSyncState>(uxSyncState);

  // Announce only when transitioning between states (WCAG 2.2 SC 4.1.3)
  useEffect(() => {
    if (prevStateRef.current !== uxSyncState) {
      let message = '';
      switch (uxSyncState) {
        case 'syncing':
          message = t.sync?.a11y?.syncing || 'Syncing data to remote storage.';
          break;
        case 'offline':
          message = t.sync?.a11y?.offline || 'Internet disconnected. Operating in offline mode. Changes saved locally.';
          break;
        case 'error':
          message = t.sync?.a11y?.error || 'Cloud sync error. Action required to resume backup.';
          break;
        case 'idle':
          message = t.sync?.a11y?.synced || 'All changes saved to device and cloud.';
          break;
        case 'local':
        default:
          message = t.sync?.a11y?.local || 'Local storage only mode. Changes saved locally.';
          break;
      }
      setA11yAnnouncement(message);
      prevStateRef.current = uxSyncState;
    }
  }, [uxSyncState, t]);

  const togglePopover = () => {
    setIsPopoverOpen((prev) => !prev);
  };

  const getAriaLabel = () => {
    const title = t.sync?.header?.[uxSyncState] || 'Sync status';
    return `${title} - Open sync inspector`;
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        id="sync-status-badge"
        onClick={togglePopover}
        aria-haspopup="dialog"
        aria-expanded={isPopoverOpen}
        aria-label={getAriaLabel()}
        className="min-w-[44px] min-h-[44px] p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/50 flex items-center justify-center text-slate-300 transition-all duration-200 active:scale-95 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
      >
        <SyncGlyph state={uxSyncState} className="w-5 h-5" />

        {/* Text for screen readers and E2E status locators */}
        <span className="sr-only">
          {uxSyncState === 'offline'
            ? t.sync?.diagnostics?.offline || 'Sin conexión'
            : t.sync?.header?.[uxSyncState] || 'Sync'}
        </span>

        {/* Dynamic status announcements via aria-live="polite" */}
        <span aria-live="polite" className="sr-only">
          {a11yAnnouncement}
        </span>
      </button>

      <SyncInspectorPopover
        isOpen={isPopoverOpen}
        onClose={() => setIsPopoverOpen(false)}
        triggerRef={triggerRef}
      />
    </div>
  );
};

