import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, ArrowLeft } from 'lucide-react';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  titleId?: string;
  onBack?: () => void;
  children: React.ReactNode;
  showHandle?: boolean;
  maxHeight?: string;
  zIndex?: string;
  testId?: string;
  closeAriaLabel?: string;
  backAriaLabel?: string;
  backTestId?: string;
  backId?: string;
  closeTestId?: string;
  closeId?: string;
  hideCloseButton?: boolean;
  disableBackdropClick?: boolean;
  className?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  titleId = 'bottom-sheet-title',
  onBack,
  children,
  showHandle = true,
  maxHeight = 'max-h-[88dvh]',
  zIndex = 'z-50',
  testId = 'bottom-sheet',
  closeAriaLabel = 'Close',
  backAriaLabel = 'Back',
  backTestId,
  backId,
  closeTestId,
  closeId,
  hideCloseButton = false,
  disableBackdropClick = false,
  className = ''
}) => {
  const [dragOffsetY, setDragOffsetY] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const startYRef = useRef<number>(0);
  const currentYRef = useRef<number>(0);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Touch gesture handlers for swipe-down-to-dismiss
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    startYRef.current = e.touches[0].clientY;
    currentYRef.current = e.touches[0].clientY;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const currentY = e.touches[0].clientY;
    currentYRef.current = currentY;
    const deltaY = currentY - startYRef.current;
    if (deltaY > 0) {
      setDragOffsetY(deltaY);
    } else {
      setDragOffsetY(0);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    const deltaY = currentYRef.current - startYRef.current;
    if (deltaY > 80) {
      onClose();
    }
    setDragOffsetY(0);
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 ${zIndex} flex flex-col justify-end overscroll-contain animate-fade-in`}
      style={{ overscrollBehavior: 'contain' }}
    >
      {/* Dimmed Backdrop (Light Dismiss) */}
      <div
        data-testid="bottom-sheet-backdrop"
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
        onClick={disableBackdropClick ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Slide-Up Rounded Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        data-testid={testId}
        style={{
          transform: dragOffsetY > 0 ? `translate3d(0, ${dragOffsetY}px, 0)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          overscrollBehavior: 'contain'
        }}
        onClick={(e) => e.stopPropagation()}
        className={`relative z-10 w-full max-w-lg mx-auto bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col ${maxHeight} animate-slide-in-up overflow-hidden ${className}`}
      >
        {/* Drag Handle Bar */}
        {showHandle && (
          <div
            data-testid="bottom-sheet-handle"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="w-full pt-3 pb-1 cursor-grab active:cursor-grabbing flex items-center justify-center shrink-0 touch-none"
            aria-hidden="true"
          >
            <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 transition-colors" />
          </div>
        )}

        {/* Header Row */}
        {(title || onBack || !hideCloseButton) && (
          <header
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="px-4 py-2.5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 shrink-0 touch-none"
          >
            {onBack ? (
              <button
                type="button"
                id={backId}
                data-testid={backTestId}
                onClick={onBack}
                aria-label={backAriaLabel}
                className="min-w-[44px] min-h-[44px] p-2 -ml-2 rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors flex items-center justify-center active:scale-95"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-8" aria-hidden="true" />
            )}

            {title && (
              <div className="flex-1 text-center px-2 min-w-0">
                {typeof title === 'string' ? (
                  <h2
                    id={titleId}
                    className="text-base font-bold text-slate-900 dark:text-white tracking-tight truncate"
                  >
                    {title}
                  </h2>
                ) : (
                  <div id={titleId}>{title}</div>
                )}
              </div>
            )}

            {!hideCloseButton ? (
              <button
                type="button"
                id={closeId}
                data-testid={closeTestId}
                onClick={onClose}
                aria-label={closeAriaLabel}
                className="min-w-[44px] min-h-[44px] p-2 -mr-2 rounded-full text-slate-400 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors flex items-center justify-center active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-8" aria-hidden="true" />
            )}
          </header>
        )}

        {/* Sheet Content Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
};
