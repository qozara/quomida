/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BottomSheet } from '../src/components/common/BottomSheet.js';

describe('BottomSheet Component', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not render when isOpen is false', () => {
    render(
      <BottomSheet isOpen={false} onClose={vi.fn()} title="Test Sheet">
        <p>Sheet Content</p>
      </BottomSheet>
    );

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders with accessibility attributes when isOpen is true', () => {
    render(
      <BottomSheet isOpen={true} onClose={vi.fn()} title="Test Sheet" titleId="custom-title-id">
        <p>Sheet Content</p>
      </BottomSheet>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('custom-title-id');
    expect(screen.getByText('Test Sheet')).toBeTruthy();
    expect(screen.getByText('Sheet Content')).toBeTruthy();
  });

  it('calls onClose with smooth dismiss animation when backdrop is clicked (light dismiss)', async () => {
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen={true} onClose={onClose} animationDuration={50} title="Dismissible Sheet">
        <p>Content</p>
      </BottomSheet>
    );

    const backdrop = screen.getByTestId('bottom-sheet-backdrop');
    fireEvent.click(backdrop);

    // Verify backdrop starts fade-out and dialog slides down
    expect(backdrop.className).toContain('opacity-0');
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.transform).toBe('translate3d(0, 100%, 0)');

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('does not call onClose when sheet content is clicked', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen={true} onClose={onClose} title="Dismissible Sheet">
        <p data-testid="inner-content">Content</p>
      </BottomSheet>
    );

    fireEvent.click(screen.getByTestId('inner-content'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose with smooth dismiss animation when close button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen={true} onClose={onClose} animationDuration={50} title="Closeable Sheet">
        <p>Content</p>
      </BottomSheet>
    );

    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);

    const dialog = screen.getByRole('dialog');
    expect(dialog.style.transform).toBe('translate3d(0, 100%, 0)');

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('calls onBack if provided instead of onClose when back button is clicked', async () => {
    const onClose = vi.fn();
    const onBack = vi.fn();
    render(
      <BottomSheet isOpen={true} onClose={onClose} onBack={onBack} animationDuration={50} title="Backable Sheet">
        <p>Content</p>
      </BottomSheet>
    );

    const backBtn = screen.getByRole('button', { name: /back/i });
    fireEvent.click(backBtn);

    await waitFor(() => {
      expect(onBack).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it('calls onClose when Escape key is pressed', async () => {
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen={true} onClose={onClose} animationDuration={50} title="Escapable Sheet">
        <p>Content</p>
      </BottomSheet>
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('supports swipe-down gesture: tracks real-time touch drag and triggers smooth slide-down animation past threshold', async () => {
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen={true} onClose={onClose} animationDuration={50} title="Swipeable Sheet">
        <p>Swipe Content</p>
      </BottomSheet>
    );

    const dragHandle = screen.getByTestId('bottom-sheet-handle');
    const dialog = screen.getByRole('dialog');
    
    // Simulate touch start
    fireEvent.touchStart(dragHandle, {
      touches: [{ clientY: 100 }]
    });

    // Simulate drag down by 85px
    fireEvent.touchMove(dragHandle, {
      touches: [{ clientY: 185 }]
    });

    // While dragging: follows thumb in real-time
    expect(dialog.style.transform).toBe('translate3d(0, 85px, 0)');

    // Simulate touch end (release)
    fireEvent.touchEnd(dragHandle);

    // Released past 70px threshold: smoothly slides down off screen
    expect(dialog.style.transform).toBe('translate3d(0, 100%, 0)');

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('does not dismiss and springs back up when swipe-down distance is below threshold', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen={true} onClose={onClose} title="Swipeable Sheet">
        <p>Swipe Content</p>
      </BottomSheet>
    );

    const dragHandle = screen.getByTestId('bottom-sheet-handle');
    const dialog = screen.getByRole('dialog');
    
    fireEvent.touchStart(dragHandle, {
      touches: [{ clientY: 100 }]
    });

    // Drag down only 30px (below 70px threshold)
    fireEvent.touchMove(dragHandle, {
      touches: [{ clientY: 130 }]
    });

    expect(dialog.style.transform).toBe('translate3d(0, 30px, 0)');

    fireEvent.touchEnd(dragHandle);

    // Reset back to 0px
    expect(dialog.style.transform).not.toBe('translate3d(0, 100%, 0)');
    expect(onClose).not.toHaveBeenCalled();
  });
});
