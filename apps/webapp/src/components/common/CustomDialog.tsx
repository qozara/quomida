import React from 'react';
import { Trash2, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

export interface CustomDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  variant?: 'danger' | 'warning' | 'info' | 'success';
  isAlert?: boolean;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  confirmTestId?: string;
  cancelTestId?: string;
  dialogTestId?: string;
}

export const CustomDialog: React.FC<CustomDialogProps> = ({
  isOpen,
  title,
  message,
  variant = 'danger',
  isAlert = false,
  confirmText,
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  confirmTestId = 'btn-dialog-confirm',
  cancelTestId = 'btn-dialog-cancel',
  dialogTestId = 'custom-dialog'
}) => {
  if (!isOpen) return null;

  const titleId = 'custom-dialog-title';
  const descId = 'custom-dialog-desc';

  const defaultConfirmText = isAlert ? 'OK' : variant === 'danger' ? 'Delete' : 'Confirm';
  const resolvedConfirmText = confirmText || defaultConfirmText;

  const renderIcon = () => {
    switch (variant) {
      case 'danger':
        return (
          <div className="p-3 bg-rose-950/60 text-rose-400 rounded-full mb-3 border border-rose-800/50 shadow-inner">
            <Trash2 className="w-6 h-6" />
          </div>
        );
      case 'warning':
        return (
          <div className="p-3 bg-amber-950/60 text-amber-400 rounded-full mb-3 border border-amber-800/50 shadow-inner">
            <AlertTriangle className="w-6 h-6" />
          </div>
        );
      case 'success':
        return (
          <div className="p-3 bg-emerald-950/60 text-emerald-400 rounded-full mb-3 border border-emerald-800/50 shadow-inner">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        );
      case 'info':
      default:
        return (
          <div className="p-3 bg-emerald-950/60 text-emerald-400 rounded-full mb-3 border border-emerald-800/50 shadow-inner">
            <Info className="w-6 h-6" />
          </div>
        );
    }
  };

  const getConfirmButtonClasses = () => {
    if (variant === 'danger') {
      return 'bg-rose-600 hover:bg-rose-500 text-white font-bold';
    }
    if (variant === 'warning') {
      return 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold';
    }
    return 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={isAlert && onCancel ? onCancel : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        data-testid={dialogTestId}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-150"
      >
        {renderIcon()}

        <h3 id={titleId} className="text-base font-bold text-white mb-2 tracking-tight">
          {title}
        </h3>

        <p id={descId} className="text-xs text-slate-300 max-w-xs mb-6 leading-relaxed">
          {message}
        </p>

        <div className="flex gap-3 w-full">
          {!isAlert && onCancel && (
            <button
              type="button"
              id={cancelTestId}
              data-testid={cancelTestId}
              onClick={onCancel}
              className="flex-1 py-2.5 px-4 min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors active:scale-95 flex items-center justify-center"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            id={confirmTestId}
            data-testid={confirmTestId}
            onClick={onConfirm}
            className={`flex-1 py-2.5 px-4 min-h-[44px] rounded-xl text-xs transition-all shadow-sm active:scale-95 flex items-center justify-center ${getConfirmButtonClasses()}`}
          >
            {resolvedConfirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
