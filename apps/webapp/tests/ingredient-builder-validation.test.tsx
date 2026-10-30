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

describe('IngredientBuilder validations (diary and catalog modes)', () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onSaveAndLog = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();

  beforeEach(() => {
    onSave.mockClear();
    onSaveAndLog.mockClear();
    onClose.mockClear();
    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      t: en,
      selectedDate: '2026-10-30',
      setSelectedDate: vi.fn(),
      dailyLogs: []
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const renderDiary = () =>
    render(
      <IngredientBuilder
        mode="diary"
        initialIngredient={{ id: 'x', name: 'Mystery food' } as any}
        onClose={onClose}
        onSave={onSave}
        onSaveAndLog={onSaveAndLog}
      />
    );

  const fill = (values: { cal?: string; p?: string; c?: string; f?: string }) => {
    const inputs = screen.getAllByRole('spinbutton');
    const [cal, p, c, f] = inputs;
    fireEvent.change(cal, { target: { value: values.cal ?? '' } });
    fireEvent.change(p, { target: { value: values.p ?? '' } });
    fireEvent.change(c, { target: { value: values.c ?? '' } });
    fireEvent.change(f, { target: { value: values.f ?? '' } });
  };

  it('blocks Save & Log in diary mode when macro fields are empty', async () => {
    renderDiary();
    fill({ cal: '100' });
    fireEvent.click(screen.getByTestId('btn-save-and-log-ingredient'));

    await waitFor(() => {
      expect(screen.getByText(en.catalog.ingredientMacrosRequired)).toBeDefined();
    });
    expect(onSaveAndLog).not.toHaveBeenCalled();
  });

  it('allows saving zero-calorie foods (all values explicitly 0)', async () => {
    renderDiary();
    fill({ cal: '0', p: '0', c: '0', f: '0' });
    fireEvent.click(screen.getByTestId('btn-save-catalog-ingredient'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
    expect(onSave.mock.calls[0][0]).toMatchObject({
      calories_100g: 0,
      protein_100g: 0,
      carbs_100g: 0,
      fats_100g: 0
    });
  });

  it('blocks saving when total macro weight exceeds 100g', async () => {
    renderDiary();
    fill({ cal: '500', p: '60', c: '50', f: '30' });
    fireEvent.click(screen.getByTestId('btn-save-and-log-ingredient'));

    await waitFor(() => {
      expect(screen.getByText(/Total macro weight/i)).toBeDefined();
    });
    expect(onSaveAndLog).not.toHaveBeenCalled();
  });

  it('allows saving valid values with explicit zeros for some macros', async () => {
    renderDiary();
    fill({ cal: '52', p: '0', c: '14', f: '0' });
    fireEvent.click(screen.getByTestId('btn-save-and-log-ingredient'));

    await waitFor(() => {
      expect(onSaveAndLog).toHaveBeenCalled();
    });
    expect(onSaveAndLog.mock.calls[0][0]).toMatchObject({
      calories_100g: 52,
      protein_100g: 0,
      carbs_100g: 14,
      fats_100g: 0
    });
  });

  it('applies the same required-field validation in catalog mode', async () => {
    render(
      <IngredientBuilder
        mode="catalog"
        initialIngredient={{ id: 'x', name: 'Mystery food' } as any}
        onClose={onClose}
        onSave={onSave}
      />
    );
    fill({ cal: '10', p: '', c: '', f: '' });
    fireEvent.click(screen.getByTestId('btn-save-ingredient'));

    // Native form validation (required fields) blocks the submit in catalog mode
    await new Promise((r) => setTimeout(r, 20));
    expect(onSave).not.toHaveBeenCalled();
  });
});
