import React from 'react';

export interface DiagnosticRowProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  statusBadge?: React.ReactNode;
  className?: string;
}

export const DiagnosticRow: React.FC<DiagnosticRowProps> = ({
  icon,
  label,
  value,
  statusBadge,
  className = ''
}) => {
  return (
    <div
      className={`flex items-center justify-between py-2 border-b border-slate-800/60 last:border-b-0 text-xs ${className}`}
    >
      <div className="flex items-center gap-2 text-slate-300">
        <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-slate-400">
          {icon}
        </span>
        <span className="font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-1.5 text-right">
        <span className="text-slate-200 font-semibold">{value}</span>
        {statusBadge}
      </div>
    </div>
  );
};
