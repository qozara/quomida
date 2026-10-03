import type { BaseIngredient, Portion } from '../types.js';

export interface CreateCustomIngredientInput {
  name: string;
  calories_100g: number;
  protein_100g?: number;
  carbs_100g?: number;
  fats_100g?: number;
  lang?: string;
}

export interface CreateCustomPortionInput {
  base_food_id: string;
  name: string;
  equivalent_weight_g: number;
}

export class FoodCatalogManager {
  /**
   * Validates and constructs a custom BaseIngredient entity.
   */
  validateAndCreateCustomIngredient(input: CreateCustomIngredientInput): BaseIngredient {
    const trimmedName = (input.name || '').trim();
    if (!trimmedName) {
      throw new Error('Food name is required');
    }

    const calories = Number(input.calories_100g);
    const protein = Number(input.protein_100g || 0);
    const carbs = Number(input.carbs_100g || 0);
    const fats = Number(input.fats_100g || 0);

    if (isNaN(calories) || calories < 0 || protein < 0 || carbs < 0 || fats < 0) {
      throw new Error('Nutritional values cannot be negative');
    }

    const id = `ing-custom-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    return {
      id,
      name: trimmedName,
      source: 'custom',
      lang: input.lang || 'es',
      calories_100g: Math.round(calories * 10) / 10,
      protein_100g: Math.round(protein * 10) / 10,
      carbs_100g: Math.round(carbs * 10) / 10,
      fats_100g: Math.round(fats * 10) / 10,
      updatedAt: Date.now()
    };
  }

  /**
   * Validates and constructs a custom Portion entity.
   */
  validateAndCreateCustomPortion(input: CreateCustomPortionInput): Portion {
    const trimmedName = (input.name || '').trim();
    if (!trimmedName) {
      throw new Error('Portion name is required');
    }

    const weight = Number(input.equivalent_weight_g);
    if (isNaN(weight) || weight <= 0) {
      throw new Error('Portion equivalent weight must be greater than zero');
    }

    const id = `port-custom-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    return {
      id,
      base_food_id: input.base_food_id,
      name: trimmedName,
      equivalent_weight_g: Math.round(weight * 10) / 10,
      source: 'custom',
      updatedAt: Date.now()
    };
  }
}
