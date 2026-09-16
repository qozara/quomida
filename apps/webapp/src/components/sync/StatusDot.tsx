import React from 'react';

export interface StatusDotProps {
  variant: 'online' | 'attention' | 'paused' | 'offline';
  className?: string;
  hasAlertBadge?: boolean;
}

export const StatusDot: React.FC<StatusDotProps> = ({
  variant,
  className = '',
  hasAlertBadge = false
}) => {
  const colorClass =
    variant === 'online'
      ? 'bg-emerald-500 ring-emerald-500/30'
      : variant === 'attention'
      ? 'bg-amber-500 ring-amber-500/30'
      : 'bg-zinc-400 ring-zinc-400/30';

  return (
    <span className="relative inline-flex items-center justify-center">
      <span className={`w-2.5 h-2.5 rounded-full ring-4 ${colorClass} ${className}`} />
      {hasAlertBadge && (
        <span
          className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-amber-500 text-slate-950 text-[9px] font-black rounded-full flex items-center justify-center leading-none shadow-sm"
          aria-hidden="true"
        >
          !
        </span>
      )}
    </span>
  );
};
