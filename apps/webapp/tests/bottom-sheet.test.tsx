/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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

  it('calls onClose when backdrop is clicked (light dismiss)', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen={true} onClose={onClose} title="Dismissible Sheet">
        <p>Content</p>
      </BottomSheet>
    );

    const backdrop = screen.getByTestId('bottom-sheet-backdrop');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
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

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen={true} onClose={onClose} title="Closeable Sheet">
        <p>Content</p>
      </BottomSheet>
    );

    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onBack if provided instead of onClose when back button is clicked', () => {
    const onClose = vi.fn();
    const onBack = vi.fn();
    render(
      <BottomSheet isOpen={true} onClose={onClose} onBack={onBack} title="Backable Sheet">
        <p>Content</p>
      </BottomSheet>
    );

    const backBtn = screen.getByRole('button', { name: /back/i });
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen={true} onClose={onClose} title="Escapable Sheet">
        <p>Content</p>
      </BottomSheet>
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('supports swipe-down gesture to dismiss when dragging down past threshold', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen={true} onClose={onClose} title="Swipeable Sheet">
        <p>Swipe Content</p>
      </BottomSheet>
    );

    const dragHandle = screen.getByTestId('bottom-sheet-handle');
    
    // Simulate touch start
    fireEvent.touchStart(dragHandle, {
      touches: [{ clientY: 100 }]
    });

    // Simulate drag down by 100px (past 80px threshold)
    fireEvent.touchMove(dragHandle, {
      touches: [{ clientY: 200 }]
    });

    // Simulate touch end
    fireEvent.touchEnd(dragHandle);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not dismiss when swipe-down distance is below threshold', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen={true} onClose={onClose} title="Swipeable Sheet">
        <p>Swipe Content</p>
      </BottomSheet>
    );

    const dragHandle = screen.getByTestId('bottom-sheet-handle');
    
    fireEvent.touchStart(dragHandle, {
      touches: [{ clientY: 100 }]
    });

    // Drag down only 30px (below 80px threshold)
    fireEvent.touchMove(dragHandle, {
      touches: [{ clientY: 130 }]
    });

    fireEvent.touchEnd(dragHandle);

    expect(onClose).not.toHaveBeenCalled();
  });
});
