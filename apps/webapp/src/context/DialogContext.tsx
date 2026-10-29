import React, { createContext, useContext, useState, useCallback } from 'react';
import { CustomDialog } from '../components/common/CustomDialog.js';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  variant?: 'danger' | 'warning' | 'info' | 'success';
  confirmText?: string;
  cancelText?: string;
  confirmTestId?: string;
  cancelTestId?: string;
  dialogTestId?: string;
}

export interface AlertDialogOptions {
  title: string;
  message: string;
  variant?: 'info' | 'warning' | 'danger' | 'success';
  confirmText?: string;
  confirmTestId?: string;
  dialogTestId?: string;
}

interface DialogContextValue {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  alert: (options: AlertDialogOptions) => Promise<void>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    isAlert: boolean;
    title: string;
    message: string;
    variant: 'danger' | 'warning' | 'info' | 'success';
    confirmText?: string;
    cancelText?: string;
    confirmTestId?: string;
    cancelTestId?: string;
    dialogTestId?: string;
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirm = useCallback((options: ConfirmDialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        isAlert: false,
        title: options.title,
        message: options.message,
        variant: options.variant || 'danger',
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        confirmTestId: options.confirmTestId || 'btn-dialog-confirm',
        cancelTestId: options.cancelTestId || 'btn-dialog-cancel',
        dialogTestId: options.dialogTestId || 'custom-dialog',
        resolve
      });
    });
  }, []);

  const alert = useCallback((options: AlertDialogOptions): Promise<void> => {
    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        isAlert: true,
        title: options.title,
        message: options.message,
        variant: options.variant || 'info',
        confirmText: options.confirmText || 'OK',
        confirmTestId: options.confirmTestId || 'btn-dialog-confirm',
        dialogTestId: options.dialogTestId || 'custom-dialog',
        resolve: () => resolve()
      });
    });
  }, []);

  const handleConfirm = () => {
    if (dialogState) {
      dialogState.resolve(true);
      setDialogState(null);
    }
  };

  const handleCancel = () => {
    if (dialogState) {
      dialogState.resolve(false);
      setDialogState(null);
    }
  };

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
      {dialogState && (
        <CustomDialog
          isOpen={dialogState.isOpen}
          isAlert={dialogState.isAlert}
          title={dialogState.title}
          message={dialogState.message}
          variant={dialogState.variant}
          confirmText={dialogState.confirmText}
          cancelText={dialogState.cancelText}
          confirmTestId={dialogState.confirmTestId}
          cancelTestId={dialogState.cancelTestId}
          dialogTestId={dialogState.dialogTestId}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </DialogContext.Provider>
  );
};

export const useDialog = (): DialogContextValue => {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return ctx;
};
