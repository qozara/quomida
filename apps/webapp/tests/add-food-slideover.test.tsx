/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AddFoodModal } from '../src/components/AddFoodModal.js';
import * as AppContext from '../src/context/AppContext.js';
import { dictionaries } from '@quomida/i18n-locales';

describe('AddFoodModal Modern Slide-Over UI/UX', () => {
  const onCloseMock = vi.fn();
  const onSelectIngredientMock = vi.fn();

  beforeEach(() => {
    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      t: dictionaries.en,
      userSettings: null,
      ingredients: [],
      recipes: [],
      recipeFoods: [],
      db: {}
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders as a full-screen slide-over modal with animate-slide-in-right class', () => {
    render(
      <AddFoodModal
        isOpen={true}
        targetMealType="meal_lunch"
        onClose={onCloseMock}
        onSelectIngredient={onSelectIngredientMock}
      />
    );

    const modal = screen.getByRole('dialog');
    expect(modal).toBeDefined();
    expect(modal.className).toContain('fixed inset-0');
    expect(modal.className).toContain('animate-slide-in-right');
    expect(modal.getAttribute('aria-modal')).toBe('true');
  });

  it('provides a WCAG compliant back button that triggers onClose', () => {
    render(
      <AddFoodModal
        isOpen={true}
        targetMealType="meal_lunch"
        onClose={onCloseMock}
        onSelectIngredient={onSelectIngredientMock}
      />
    );

    const backButton = screen.getByRole('button', { name: 'Back' });
    expect(backButton).toBeDefined();
    expect(backButton.className).toContain('min-w-[44px]');
    expect(backButton.className).toContain('min-h-[44px]');

    fireEvent.click(backButton);
    expect(onCloseMock).toHaveBeenCalled();
  });

  it('returns null when isOpen is false', () => {
    const { container } = render(
      <AddFoodModal
        isOpen={false}
        targetMealType="meal_lunch"
        onClose={onCloseMock}
        onSelectIngredient={onSelectIngredientMock}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
