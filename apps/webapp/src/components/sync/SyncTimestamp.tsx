import React from 'react';
import { useApp } from '../../context/AppContext.js';

export interface SyncTimestampProps {
  timestamp: string | null;
  className?: string;
}

export function formatRelativeTime(isoString: string | null, justNowLabel: string = 'Just now', neverLabel: string = 'Never'): string {
  if (!isoString) return neverLabel;

  const date = new Date(isoString);
  if (isNaN(date.getTime())) {
    // If it's already a formatted string like "20:00:00" or similar
    return isoString;
  }

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0 || diffMs < 60000) {
    return justNowLabel;
  }

  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export const SyncTimestamp: React.FC<SyncTimestampProps> = ({ timestamp, className = '' }) => {
  const { t } = useApp();
  const formatted = formatRelativeTime(
    timestamp,
    t.sync?.diagnostics?.justNow || 'Just now',
    t.sync?.diagnostics?.never || 'Never'
  );

  return <span className={className}>{formatted}</span>;
};
