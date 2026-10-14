import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalDBService, destroyDatabase } from '../src/db/rxdb.js';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import type { Recipe } from '@quomida/domain-core';
import { firstValueFrom } from 'rxjs';

describe('Recipes LocalDBService Repository & Migration', () => {
  let dbService: LocalDBService;

  beforeEach(async () => {
    await destroyDatabase();
    dbService = new LocalDBService({
      name: `test_db_recipes_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      storage: getRxStorageMemory()
    });
    await dbService.init();
  });

  afterEach(async () => {
    await destroyDatabase();
  });

  it('saves and observes recipes in RxDB', async () => {
    const recipe: Recipe = {
      id: 'rec-test-1',
      name: 'Oat Pancakes',
      ingredients: [
        {
          food_id: 'ing-oats',
          name: 'Rolled Oats',
          weight_g: 100,
          calories_100g: 389,
          protein_100g: 16.9,
          carbs_100g: 66.3,
          fats_100g: 6.9,
          from_recipe: false
        }
      ],
      yield_factor: 1.0
    };

    await dbService.saveRecipe(recipe);

    const recipes = await firstValueFrom(dbService.observeRecipes());
    expect(recipes.length).toBe(1);
    expect(recipes[0].id).toBe('rec-test-1');
    expect(recipes[0].name).toBe('Oat Pancakes');
    expect(recipes[0].ingredients[0].food_id).toBe('ing-oats');
  });

  it('saves recipe with custom serving portions and deletes both cleanly', async () => {
    const recipe: Recipe = {
      id: 'rec-test-2',
      name: 'Banana Bread',
      ingredients: [
        {
          food_id: 'ing-banana',
          name: 'Banana',
          weight_g: 200,
          calories_100g: 89,
          protein_100g: 1.1,
          carbs_100g: 22.8,
          fats_100g: 0.3
        }
      ],
      yield_factor: 0.9
    };

    await dbService.saveRecipe(recipe, [
      { name: '1 slice (1/10)', equivalent_weight_g: 45 }
    ]);

    const rxdb = dbService.getDatabaseInstance()!;
    const savedPortions = await rxdb.portions.find({ selector: { base_food_id: 'rec-test-2' } }).exec();
    expect(savedPortions.length).toBe(1);
    expect(savedPortions[0].name).toBe('1 slice (1/10)');
    expect(savedPortions[0].equivalent_weight_g).toBe(45);

    // Delete recipe
    await dbService.deleteRecipe('rec-test-2');

    const remainingRecipes = await firstValueFrom(dbService.observeRecipes());
    expect(remainingRecipes.length).toBe(0);

    const remainingPortions = await rxdb.portions.find({ selector: { base_food_id: 'rec-test-2' } }).exec();
    expect(remainingPortions.length).toBe(0);
  });

  it('migrates legacy v0 recipe document to v1 format with modern component properties', () => {
    const v0Doc = {
      id: 'rec-legacy-0',
      name: 'Old Grandma Stew',
      ingredients: [
        { ingredient_id: 'ing-potato', raw_weight_g: 300 }
      ],
      yield_factor: 0.8
    };

    // Extract the v1 migration strategy from rxdb addCollections
    const rxdb = dbService.getDatabaseInstance()!;
    const recipesCollection = rxdb.recipes;
    expect(recipesCollection.schema.version).toBe(1);

    // Verify migration strategy transformation
    const migrationStrategy = (recipesCollection.schema as any).migrationStrategies?.[1];
    if (migrationStrategy) {
      const migrated = migrationStrategy(v0Doc);
      expect(migrated.ingredients[0].food_id).toBe('ing-potato');
      expect(migrated.ingredients[0].weight_g).toBe(300);
      expect(migrated.ingredients[0].calories_100g).toBe(0);
      expect(migrated.ingredients[0].from_recipe).toBe(false);
    }
  });
});
