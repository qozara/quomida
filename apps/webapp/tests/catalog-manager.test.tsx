/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CatalogManager } from '../src/components/CatalogManager.js';
import * as AppContext from '../src/context/AppContext.js';

describe('CatalogManager - Custom Portions UI', () => {
  let addCustomIngredientMock: any;

  beforeEach(() => {
    addCustomIngredientMock = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      isCatalogOpen: true,
      ingredients: [],
      addCustomIngredient: addCustomIngredientMock,
      removeCustomIngredient: vi.fn(),
      setIsCatalogOpen: vi.fn(),
      db: {}
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('allows user to define custom portions via Plus button and passes them to addCustomIngredient', async () => {
    const { container } = render(<CatalogManager />);

    // Click "New" button to open the form
    const addBtn = screen.getByText('New');
    fireEvent.click(addBtn);

    // Fill macro fields
    fireEvent.change(screen.getByPlaceholderText('e.g. Milanesa de soya casera'), { target: { value: 'My Chicken' } });
    fireEvent.change(screen.getByPlaceholderText('kcal'), { target: { value: '165' } });
    const numberInputs = container.querySelectorAll('input[type="number"]');
    // 0: calories, 1: protein, 2: carbs, 3: fats, 4: portionWeight
    fireEvent.change(numberInputs[1], { target: { value: '31' } }); // protein
    fireEvent.change(numberInputs[2], { target: { value: '0' } }); // carbs
    fireEvent.change(numberInputs[3], { target: { value: '3.6' } }); // fats

    // Add a custom portion
    fireEvent.change(screen.getByPlaceholderText('E.g., Slice, Cup, Tbsp'), { target: { value: 'Breast' } });
    fireEvent.change(screen.getByPlaceholderText('Grams'), { target: { value: '200' } });
    
    // Find Add Portion Button
    const buttons = container.querySelectorAll('button');
    const addPortionBtn = Array.from(buttons).find(b => b.innerHTML.includes('lucide-circle-plus'));
    if (addPortionBtn) fireEvent.click(addPortionBtn);

    // Check if it was added to the list visually
    expect(screen.getByText('Breast')).toBeDefined();
    expect(screen.getByText('200g')).toBeDefined();

    // Click Save
    const saveBtn = screen.getByText('Save');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(addCustomIngredientMock).toHaveBeenCalled();
    });

    const callArgs = addCustomIngredientMock.mock.calls[0];
    expect(callArgs[0]).toMatchObject({
      name: 'My Chicken',
      calories_100g: 165,
      protein_100g: 31,
      carbs_100g: 0,
      fats_100g: 3.6
    });
    
    expect(callArgs[1]).toEqual([
      { name: 'Breast', equivalent_weight_g: 200 }
    ]);
  });

  it('automatically includes pending typed portion if user clicks Save without clicking Plus button', async () => {
    const { container } = render(<CatalogManager />);

    const addBtn = screen.getByText('New');
    fireEvent.click(addBtn);

    fireEvent.change(screen.getByPlaceholderText('e.g. Milanesa de soya casera'), { target: { value: 'Beef Steak' } });
    fireEvent.change(screen.getByPlaceholderText('kcal'), { target: { value: '250' } });
    const numberInputs = container.querySelectorAll('input[type="number"]');
    fireEvent.change(numberInputs[1], { target: { value: '26' } }); // protein
    fireEvent.change(numberInputs[2], { target: { value: '0' } }); // carbs
    fireEvent.change(numberInputs[3], { target: { value: '15' } }); // fats

    // Type portion directly into fields WITHOUT clicking plus button
    fireEvent.change(screen.getByPlaceholderText('E.g., Slice, Cup, Tbsp'), { target: { value: '1 bife' } });
    fireEvent.change(screen.getByPlaceholderText('Grams'), { target: { value: '180' } });

    // Click Save directly
    const saveBtn = screen.getByText('Save');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(addCustomIngredientMock).toHaveBeenCalled();
    });

    const callArgs = addCustomIngredientMock.mock.calls[0];
    expect(callArgs[0]).toMatchObject({
      name: 'Beef Steak',
      calories_100g: 250,
      protein_100g: 26,
      carbs_100g: 0,
      fats_100g: 15
    });
    
    // Verifies pending portion was auto-included
    expect(callArgs[1]).toEqual([
      { name: '1 bife', equivalent_weight_g: 180 }
    ]);
  });
});
