/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    vi.restoreAllMocks();
  });

  it('allows user to define custom portions and passes them to addCustomIngredient', async () => {
    const { container } = render(<CatalogManager />);

    // Click "Add Custom Ingredient"
    const addBtn = screen.getByText('Add Custom Ingredient');
    fireEvent.click(addBtn);

    // Fill macro fields
    fireEvent.change(screen.getByPlaceholderText('Ingredient Name'), { target: { value: 'My Chicken' } });
    fireEvent.change(screen.getByPlaceholderText('kcal'), { target: { value: '165' } });
    const numberInputs = container.querySelectorAll('input[type="number"]');
    // 0: calories, 1: protein, 2: carbs, 3: fats, 4: portionWeight
    fireEvent.change(numberInputs[1], { target: { value: '31' } }); // protein
    fireEvent.change(numberInputs[2], { target: { value: '0' } }); // carbs
    fireEvent.change(numberInputs[3], { target: { value: '3.6' } }); // fats

    // Add a custom portion
    fireEvent.change(screen.getByPlaceholderText('E.g., Slice, Cup, Tbsp'), { target: { value: 'Breast' } });
    fireEvent.change(screen.getByPlaceholderText('Grams'), { target: { value: '200' } });
    
    // Find Add Portion Button (it's the only disabled=false button after filling fields, or we can just find it by index)
    const buttons = container.querySelectorAll('button');
    const addPortionBtn = Array.from(buttons).find(b => b.innerHTML.includes('lucide-plus-circle'));
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

    // Check the payload passed to addCustomIngredient
    const callArgs = addCustomIngredientMock.mock.calls[0];
    expect(callArgs[0]).toMatchObject({
      name: 'My Chicken',
      calories_100g: 165,
      protein_100g: 31,
      carbs_100g: 0,
      fats_100g: 3.6
    });
    
    // Check portions array
    expect(callArgs[1]).toEqual([
      { name: 'Breast', equivalent_weight_g: 200 }
    ]);
  });
});
