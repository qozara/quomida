/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IngredientBuilder } from '../src/components/IngredientBuilder.js';
import * as AppContext from '../src/context/AppContext.js';
import { dictionaries } from '@quomida/i18n-locales';

const en = dictionaries.en;

describe('IngredientBuilder Portion-First Workflow & Editing Bug Fixes', () => {
  const onSave = vi.fn().mockResolvedValue('new-food-id');
  const onSaveAndLog = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();

  const mockDb = {
    portions: {
      find: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          { id: 'port-1', base_food_id: 'food-edit-1', name: '1 bar', equivalent_weight_g: 45 }
        ])
      })
    }
  };

  beforeEach(() => {
    onSave.mockClear();
    onSaveAndLog.mockClear();
    onClose.mockClear();
    mockDb.portions.find.mockClear();

    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      t: en,
      locale: 'en',
      selectedDate: '2026-11-01',
      setSelectedDate: vi.fn(),
      dailyLogs: [],
      db: mockDb as any
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('switches between Per 100g and Per Portion mode cleanly without losing typed macros', async () => {
    render(
      <IngredientBuilder
        mode="catalog"
        onClose={onClose}
        onSave={onSave}
      />
    );

    // Type name
    fireEvent.change(screen.getByPlaceholderText(en.catalog.foodNamePlaceholder), {
      target: { value: 'Whey Protein' }
    });

    // Default is 100g mode
    expect(screen.queryByTestId('input-basis-weight')).toBeNull();

    // Switch to Per Portion mode
    fireEvent.click(screen.getByTestId('btn-basis-portion'));

    // Weight and portion name inputs now appear
    const weightInput = screen.getByTestId('input-basis-weight');
    const nameInput = screen.getByTestId('input-basis-portion-name');
    expect(weightInput).toBeDefined();

    // Set portion to 30g and name to "1 scoop"
    fireEvent.change(weightInput, { target: { value: '30' } });
    fireEvent.change(nameInput, { target: { value: '1 scoop' } });

    // Enter macros per 30g scoop: 120 kcal, 24g protein, 3g carbs, 1g fat
    const spinInputs = screen.getAllByRole('spinbutton');
    // spinInputs contains: [weightInput (30), cal, p, c, f, pendingPortionWeight]
    const cal = screen.getByPlaceholderText('kcal');
    const [p, c, f] = screen.getAllByPlaceholderText('g').slice(0, 3);

    fireEvent.change(cal, { target: { value: '120' } });
    fireEvent.change(p, { target: { value: '24' } });
    fireEvent.change(c, { target: { value: '3' } });
    fireEvent.change(f, { target: { value: '1' } });

    // Check that normalized 100g preview computes correctly:
    // Factor = 100 / 30 = 3.33333
    // cal: 120 * 3.3333 = 400
    // p: 24 * 3.3333 = 80
    // c: 3 * 3.3333 = 10
    // f: 1 * 3.3333 = 3.3
    const preview = screen.getByTestId('preview-normalized-100g');
    expect(preview.textContent).toContain('400 kcal');
    expect(preview.textContent).toContain('P: 80g');
    expect(preview.textContent).toContain('C: 10g');
    expect(preview.textContent).toContain('F: 3.3g');

    // Save
    fireEvent.click(screen.getByTestId('btn-save-ingredient'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });

    // Verified saved ingredient has normalized 100g values and the auto-created primary portion
    const [savedIngredient, savedPortions] = onSave.mock.calls[0];
    expect(savedIngredient).toMatchObject({
      name: 'Whey Protein',
      calories_100g: 400,
      protein_100g: 80,
      carbs_100g: 10,
      fats_100g: 3.3,
      lang: 'en'
    });

    expect(savedPortions).toEqual([
      { name: '1 scoop', equivalent_weight_g: 30 }
    ]);
  });

  it('validates macro weight against the portion weight in Per Portion mode', async () => {
    render(
      <IngredientBuilder
        mode="catalog"
        onClose={onClose}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(en.catalog.foodNamePlaceholder), {
      target: { value: 'Dense Bar' }
    });

    fireEvent.click(screen.getByTestId('btn-basis-portion'));
    fireEvent.change(screen.getByTestId('input-basis-weight'), { target: { value: '40' } });

    // Entering 50g protein for a 40g portion is physically impossible
    const cal = screen.getByPlaceholderText('kcal');
    const [p, c, f] = screen.getAllByPlaceholderText('g').slice(0, 3);

    fireEvent.change(cal, { target: { value: '250' } });
    fireEvent.change(p, { target: { value: '50' } });
    fireEvent.change(c, { target: { value: '0' } });
    fireEvent.change(f, { target: { value: '0' } });

    fireEvent.click(screen.getByTestId('btn-save-ingredient'));

    await waitFor(() => {
      expect(screen.getByText(/Total macro weight \(50g\) cannot exceed portion weight \(40g\)/i)).toBeDefined();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('uses default fallback portion name if user leaves portion name blank', async () => {
    render(
      <IngredientBuilder
        mode="catalog"
        onClose={onClose}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(en.catalog.foodNamePlaceholder), {
      target: { value: 'Snack Biscuit' }
    });

    fireEvent.click(screen.getByTestId('btn-basis-portion'));
    fireEvent.change(screen.getByTestId('input-basis-weight'), { target: { value: '25' } });
    // Left name blank

    const cal = screen.getByPlaceholderText('kcal');
    const [p, c, f] = screen.getAllByPlaceholderText('g').slice(0, 3);

    fireEvent.change(cal, { target: { value: '100' } });
    fireEvent.change(p, { target: { value: '2' } });
    fireEvent.change(c, { target: { value: '15' } });
    fireEvent.change(f, { target: { value: '3' } });

    fireEvent.click(screen.getByTestId('btn-save-ingredient'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });

    const [, savedPortions] = onSave.mock.calls[0];
    expect(savedPortions).toEqual([
      { name: '1 serving', equivalent_weight_g: 25 }
    ]);
  });

  it('loads existing portions from RxDB when editing an ingredient (Bug 1 fix)', async () => {
    render(
      <IngredientBuilder
        mode="catalog"
        initialIngredient={{
          id: 'food-edit-1',
          name: 'Protein Bar',
          calories_100g: 350,
          protein_100g: 30,
          carbs_100g: 30,
          fats_100g: 10
        } as any}
        onClose={onClose}
        onSave={onSave}
      />
    );

    // Should have queried mockDb.portions for base_food_id: 'food-edit-1'
    await waitFor(() => {
      expect(screen.getByText('1 bar')).toBeDefined();
      expect(screen.getByText('45g')).toBeDefined();
    });
  });
});
