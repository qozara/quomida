import { describe, it, expect } from 'vitest';
import {
  RecipeManager,
  calculateItemMacros,
  type BaseIngredient,
  type Recipe,
  type RecipeFoodItem,
  type IngredientFoodItem
} from '../src/index.js';

describe('RecipeManager & Composite Food Calculations', () => {
  const manager = new RecipeManager();

  const eggIngredient: BaseIngredient = {
    id: 'ing-egg',
    name: 'Egg',
    source: 'system',
    lang: 'en',
    calories_100g: 143,
    protein_100g: 12.6,
    carbs_100g: 0.7,
    fats_100g: 9.5
  };

  const flourIngredient: BaseIngredient = {
    id: 'ing-flour',
    name: 'Wheat Flour',
    source: 'system',
    lang: 'en',
    calories_100g: 364,
    protein_100g: 10,
    carbs_100g: 76,
    fats_100g: 1
  };

  const eggFoodItem: IngredientFoodItem = {
    ...eggIngredient,
    kind: 'ingredient'
  };

  const flourFoodItem: IngredientFoodItem = {
    ...flourIngredient,
    kind: 'ingredient'
  };

  it('builds a snapshot component from an atomic ingredient', () => {
    const comp = manager.buildComponent(eggFoodItem, 100, { quantity: 2, portionName: 'unit' });

    expect(comp.food_id).toBe('ing-egg');
    expect(comp.name).toBe('Egg');
    expect(comp.weight_g).toBe(100);
    expect(comp.quantity).toBe(2);
    expect(comp.portion_name).toBe('unit');
    expect(comp.calories_100g).toBe(143);
    expect(comp.protein_100g).toBe(12.6);
    expect(comp.carbs_100g).toBe(0.7);
    expect(comp.fats_100g).toBe(9.5);
    expect(comp.from_recipe).toBe(false);
  });

  it('validates and creates a valid composite recipe document', () => {
    const comp1 = manager.buildComponent(eggFoodItem, 100);
    const comp2 = manager.buildComponent(flourFoodItem, 200);

    const recipe = manager.createRecipe({
      name: '  Simple Pancake Dough  ',
      ingredients: [comp1, comp2],
      yield_factor: 0.9
    });

    expect(recipe.id).toMatch(/^recipe-custom-/);
    expect(recipe.name).toBe('Simple Pancake Dough');
    expect(recipe.ingredients.length).toBe(2);
    expect(recipe.yield_factor).toBe(0.9);
    expect(recipe.updatedAt).toBeGreaterThan(0);
  });

  it('validates recipe creation constraints and errors cleanly', () => {
    const comp = manager.buildComponent(eggFoodItem, 100);

    // Empty name
    expect(() => manager.createRecipe({ name: '   ', ingredients: [comp] }))
      .toThrow('ERR_RECIPE_NAME_REQUIRED');

    // Overly long name
    expect(() => manager.createRecipe({ name: 'A'.repeat(101), ingredients: [comp] }))
      .toThrow('ERR_RECIPE_NAME_TOO_LONG');

    // No ingredients
    expect(() => manager.createRecipe({ name: 'Empty', ingredients: [] }))
      .toThrow('ERR_RECIPE_INGREDIENTS_EMPTY');

    // Invalid yield factor
    expect(() => manager.createRecipe({ name: 'Test', ingredients: [comp], yield_factor: 0 }))
      .toThrow('ERR_RECIPE_INVALID_YIELD');
    expect(() => manager.createRecipe({ name: 'Test', ingredients: [comp], yield_factor: 5.5 }))
      .toThrow('ERR_RECIPE_INVALID_YIELD');

    // Invalid component weight
    const invalidComp = { ...comp, weight_g: 0 };
    expect(() => manager.createRecipe({ name: 'Test', ingredients: [invalidComp] }))
      .toThrow('ERR_RECIPE_INVALID_WEIGHT');
  });

  it('computes cooked weight, total macros, and per-100g density accurately', () => {
    // 100g egg: 143 kcal, 12.6g P, 0.7g C, 9.5g F
    // 200g flour: 728 kcal, 20g P, 152g C, 2g F
    // Raw weight: 300g. Total calories: 871 kcal, P: 32.6g, C: 152.7g, F: 11.5g
    // Yield: 0.9 -> Cooked weight = 270g
    // Per 100g cooked: (871 / 270) * 100 = 322.6 kcal
    const comp1 = manager.buildComponent(eggFoodItem, 100);
    const comp2 = manager.buildComponent(flourFoodItem, 200);

    const recipe = manager.createRecipe({
      name: 'Pancake Dough',
      ingredients: [comp1, comp2],
      yield_factor: 0.9
    });

    const nutrition = manager.computeNutrition(recipe);

    expect(nutrition.raw_weight_g).toBe(300);
    expect(nutrition.cooked_weight_g).toBe(270);
    expect(nutrition.total_macros.calories).toBeCloseTo(871, 0);
    expect(nutrition.total_macros.protein).toBeCloseTo(32.6, 1);
    expect(nutrition.total_macros.carbs).toBeCloseTo(152.7, 1);
    expect(nutrition.total_macros.fats).toBeCloseTo(11.5, 1);

    expect(nutrition.density.calories_100g).toBeCloseTo(322.6, 1);
    expect(nutrition.contributions.length).toBe(2);
    expect(nutrition.contributions[0].macros.calories).toBeCloseTo(143, 0);
    expect(nutrition.contributions[1].macros.calories).toBeCloseTo(728, 0);
  });

  it('converts Recipe to FoodItem and verifies polymorphic macro calculation', () => {
    const comp1 = manager.buildComponent(eggFoodItem, 100);
    const comp2 = manager.buildComponent(flourFoodItem, 200);

    const recipe = manager.createRecipe({
      name: 'Pancake Dough',
      ingredients: [comp1, comp2],
      yield_factor: 0.9
    });

    const foodItem: RecipeFoodItem = manager.toFoodItem(recipe);

    expect(foodItem.kind).toBe('recipe');
    expect(foodItem.id).toBe(recipe.id);
    expect(foodItem.name).toBe('Pancake Dough');
    expect(foodItem.source).toBe('custom');
    expect(foodItem.cooked_weight_g).toBe(270);

    // Verify polymorphic calculateItemMacros: calculating for full cooked weight yields total macros
    const fullMacros = calculateItemMacros(foodItem, foodItem.cooked_weight_g);
    expect(fullMacros.calories).toBeCloseTo(foodItem.total_macros.calories, 0);
    expect(fullMacros.protein).toBeCloseTo(foodItem.total_macros.protein, 1);
    expect(fullMacros.carbs).toBeCloseTo(foodItem.total_macros.carbs, 1);
    expect(fullMacros.fats).toBeCloseTo(foodItem.total_macros.fats, 1);
  });

  it('flattens composition when creating a new recipe based on another recipe', () => {
    // 1. Base Recipe A: Pancake Dough (270g cooked, ~322.6 kcal/100g)
    const doughRecipe = manager.createRecipe({
      name: 'Pancake Dough',
      ingredients: [
        manager.buildComponent(eggFoodItem, 100),
        manager.buildComponent(flourFoodItem, 200)
      ],
      yield_factor: 0.9
    });
    const doughFoodItem = manager.toFoodItem(doughRecipe);

    // 2. Extra ingredient: 50g Butter (717 kcal/100g, 0.9g P, 0.1g C, 81g F)
    const butterIngredient: BaseIngredient = {
      id: 'ing-butter',
      name: 'Butter',
      source: 'system',
      lang: 'en',
      calories_100g: 717,
      protein_100g: 0.9,
      carbs_100g: 0.1,
      fats_100g: 81
    };
    const butterFoodItem: IngredientFoodItem = { ...butterIngredient, kind: 'ingredient' };

    // 3. Build component from Dough Recipe (say using 135g of cooked dough)
    const doughComp = manager.buildComponent(doughFoodItem, 135);
    expect(doughComp.from_recipe).toBe(true);
    expect(doughComp.calories_100g).toBeCloseTo(322.6, 1);

    const butterComp = manager.buildComponent(butterFoodItem, 50);

    // 4. Assemble Recipe B: Fried Pancakes
    const friedPancakes = manager.createRecipe({
      name: 'Fried Pancakes',
      ingredients: [doughComp, butterComp],
      yield_factor: 0.95
    });

    // Structure is completely flat - exactly 2 components
    expect(friedPancakes.ingredients.length).toBe(2);
    expect(friedPancakes.ingredients[0].name).toBe('Pancake Dough');
    expect(friedPancakes.ingredients[0].from_recipe).toBe(true);
    expect(friedPancakes.ingredients[1].name).toBe('Butter');
    expect(friedPancakes.ingredients[1].from_recipe).toBe(false);

    // Nutrition computes deterministically without consulting Recipe A again
    const friedNutrition = manager.computeNutrition(friedPancakes);
    expect(friedNutrition.raw_weight_g).toBe(185);
    expect(friedNutrition.cooked_weight_g).toBeCloseTo(175.8, 1);
    // 135g dough @ 322.6 kcal/100g = 435.5 kcal
    // 50g butter @ 717 kcal/100g = 358.5 kcal
    // Total: ~794 kcal
    expect(friedNutrition.total_macros.calories).toBeCloseTo(794, 0);
  });

  it('normalizes stored legacy and partial recipe records safely', () => {
    const rawLegacyDoc = {
      id: 'legacy-1',
      name: 'Legacy Cake',
      ingredients: [
        { ingredient_id: 'ing-1', raw_weight_g: 150 }
      ],
      yield_factor: 1.0
    };

    const normalized = manager.normalizeStoredRecipe(rawLegacyDoc);
    expect(normalized.id).toBe('legacy-1');
    expect(normalized.name).toBe('Legacy Cake');
    expect(normalized.ingredients.length).toBe(1);
    expect(normalized.ingredients[0].food_id).toBe('ing-1');
    expect(normalized.ingredients[0].weight_g).toBe(150);
    expect(normalized.ingredients[0].calories_100g).toBe(0);
  });

  it('computes virtual whole recipe portion and splits into servings accurately', () => {
    const recipe = manager.createRecipe({
      name: 'Quiche',
      ingredients: [
        manager.buildComponent(eggFoodItem, 200),
        manager.buildComponent(flourFoodItem, 200)
      ],
      yield_factor: 0.85
    });
    const foodItem = manager.toFoodItem(recipe);

    // Whole portion
    const wholePortion = manager.getWholeRecipePortion(foodItem);
    expect(wholePortion.id).toBe(`port-whole-${recipe.id}`);
    expect(wholePortion.name).toBe('Whole recipe');
    expect(wholePortion.equivalent_weight_g).toBe(foodItem.cooked_weight_g);

    // Split into 4 portions
    const weightPerPortion = manager.splitIntoPortions(foodItem, 4);
    expect(weightPerPortion).toBe(Math.round((foodItem.cooked_weight_g / 4) * 10) / 10);

    // Split validation
    expect(() => manager.splitIntoPortions(foodItem, 1)).toThrow();
    expect(() => manager.splitIntoPortions(foodItem, 101)).toThrow();
  });
});
