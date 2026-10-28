// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { CustomDialog } from '../src/components/common/CustomDialog.js';
import { DialogProvider, useDialog } from '../src/context/DialogContext.js';

describe('CustomDialog & DialogContext Suite', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('1. CustomDialog Direct Component Tests', () => {
    it('does not render when isOpen is false', () => {
      render(
        <CustomDialog
          isOpen={false}
          title="Test Dialog"
          message="This is a test message"
          onConfirm={vi.fn()}
        />
      );

      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('renders with accessibility attributes and proper content when isOpen is true', () => {
      render(
        <CustomDialog
          isOpen={true}
          title="Delete Confirmation"
          message="Are you sure you want to delete this item?"
          variant="danger"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeDefined();
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.getAttribute('aria-labelledby')).toBe('custom-dialog-title');
      expect(dialog.getAttribute('aria-describedby')).toBe('custom-dialog-desc');

      expect(screen.getByText('Delete Confirmation')).toBeDefined();
      expect(screen.getByText('Are you sure you want to delete this item?')).toBeDefined();
    });

    it('renders single OK button for alert mode (isAlert: true)', () => {
      const handleConfirm = vi.fn();
      render(
        <CustomDialog
          isOpen={true}
          isAlert={true}
          title="Information"
          message="Operation completed successfully."
          variant="info"
          confirmText="Got it"
          onConfirm={handleConfirm}
        />
      );

      expect(screen.queryByTestId('btn-dialog-cancel')).toBeNull();
      const confirmBtn = screen.getByTestId('btn-dialog-confirm');
      expect(confirmBtn).toBeDefined();
      expect(confirmBtn.textContent).toBe('Got it');

      fireEvent.click(confirmBtn);
      expect(handleConfirm).toHaveBeenCalledTimes(1);
    });

    it('renders both Cancel and Confirm buttons in confirm mode and responds to clicks', () => {
      const handleConfirm = vi.fn();
      const handleCancel = vi.fn();

      render(
        <CustomDialog
          isOpen={true}
          isAlert={false}
          title="Confirm Action"
          message="Do you want to proceed?"
          variant="warning"
          confirmText="Proceed"
          cancelText="Dismiss"
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      );

      const cancelBtn = screen.getByTestId('btn-dialog-cancel');
      const confirmBtn = screen.getByTestId('btn-dialog-confirm');

      expect(cancelBtn.textContent).toBe('Dismiss');
      expect(confirmBtn.textContent).toBe('Proceed');

      // Click cancel
      fireEvent.click(cancelBtn);
      expect(handleCancel).toHaveBeenCalledTimes(1);
      expect(handleConfirm).not.toHaveBeenCalled();

      // Click confirm
      fireEvent.click(confirmBtn);
      expect(handleConfirm).toHaveBeenCalledTimes(1);
    });

    it('guarantees touch targets meet the minimum 44px height requirement for mobile', () => {
      render(
        <CustomDialog
          isOpen={true}
          title="Touch Target Check"
          message="Testing mobile button dimensions"
          variant="danger"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const cancelBtn = screen.getByTestId('btn-dialog-cancel');
      const confirmBtn = screen.getByTestId('btn-dialog-confirm');

      expect(cancelBtn.className).toContain('min-h-[44px]');
      expect(confirmBtn.className).toContain('min-h-[44px]');
    });
  });

  describe('2. DialogProvider & useDialog Hook Tests', () => {
    const TestConsumer: React.FC<{
      onResult?: (val: any) => void;
    }> = ({ onResult }) => {
      const { confirm, alert } = useDialog();

      return (
        <div>
          <button
            data-testid="trigger-confirm"
            onClick={async () => {
              const res = await confirm({
                title: 'Hook Confirm',
                message: 'Confirm via hook?',
                variant: 'danger',
                confirmText: 'Yes, Delete',
                cancelText: 'No, Keep'
              });
              onResult?.(res);
            }}
          >
            Trigger Confirm
          </button>
          <button
            data-testid="trigger-alert"
            onClick={async () => {
              await alert({
                title: 'Hook Alert',
                message: 'Notice via hook',
                variant: 'info',
                confirmText: 'Acknowledge'
              });
              onResult?.('alert-closed');
            }}
          >
            Trigger Alert
          </button>
        </div>
      );
    };

    it('resolves confirm() with true when user clicks confirm button', async () => {
      const resultSpy = vi.fn();
      render(
        <DialogProvider>
          <TestConsumer onResult={resultSpy} />
        </DialogProvider>
      );

      fireEvent.click(screen.getByTestId('trigger-confirm'));

      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByText('Hook Confirm')).toBeDefined();
      expect(screen.getByText('Confirm via hook?')).toBeDefined();

      const confirmBtn = screen.getByTestId('btn-dialog-confirm');
      expect(confirmBtn.textContent).toBe('Yes, Delete');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(resultSpy).toHaveBeenCalledWith(true);
        expect(screen.queryByRole('dialog')).toBeNull();
      });
    });

    it('resolves confirm() with false when user clicks cancel button', async () => {
      const resultSpy = vi.fn();
      render(
        <DialogProvider>
          <TestConsumer onResult={resultSpy} />
        </DialogProvider>
      );

      fireEvent.click(screen.getByTestId('trigger-confirm'));

      const cancelBtn = screen.getByTestId('btn-dialog-cancel');
      expect(cancelBtn.textContent).toBe('No, Keep');
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(resultSpy).toHaveBeenCalledWith(false);
        expect(screen.queryByRole('dialog')).toBeNull();
      });
    });

    it('resolves alert() when user clicks OK button', async () => {
      const resultSpy = vi.fn();
      render(
        <DialogProvider>
          <TestConsumer onResult={resultSpy} />
        </DialogProvider>
      );

      fireEvent.click(screen.getByTestId('trigger-alert'));

      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByText('Hook Alert')).toBeDefined();
      expect(screen.queryByTestId('btn-dialog-cancel')).toBeNull();

      const confirmBtn = screen.getByTestId('btn-dialog-confirm');
      expect(confirmBtn.textContent).toBe('Acknowledge');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(resultSpy).toHaveBeenCalledWith('alert-closed');
        expect(screen.queryByRole('dialog')).toBeNull();
      });
    });
  });
});
