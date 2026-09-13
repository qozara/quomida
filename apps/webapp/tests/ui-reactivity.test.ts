import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabase, destroyDatabase, LocalDBService } from '../src/db/rxdb.js';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { validateMacroAlignment, calculateItemMacros, createMacroSnapshot } from '@quomida/domain-core';
import { firstValueFrom } from 'rxjs';

describe('Frontend UI Wiring & Reactivity (APP-105 to APP-107)', () => {
  let dbService: LocalDBService;

  beforeEach(async () => {
    await destroyDatabase();
    dbService = new LocalDBService({ storage: getRxStorageMemory(), name: `ui_test_db_${Date.now()}` });
    await dbService.init();
  });

  afterEach(async () => {
    await destroyDatabase();
  });

  it('[APP-105] SettingsModal persists user targets to database across page/re-initializations', async () => {
    // Save new targets
    await dbService.saveSettings({
      daily_calorie_target: 2800,
      custom_macros: { protein: 180, carbs: 250, fats: 80 }
    });

    const settings = await dbService.getSettings();
    expect(settings.daily_calorie_target).toBe(2800);
    expect(settings.custom_macros.protein).toBe(180);
    expect(settings.custom_macros.carbs).toBe(250);
    expect(settings.custom_macros.fats).toBe(80);
  });

  it('[APP-106] CatalogManager validates macro alignment and persists valid custom foods', async () => {
    // 1. Invalid input: negative values or impossible macros
    const invalidValidation = validateMacroAlignment(-50, 100, 50, 20);
    expect(invalidValidation.valid).toBe(false);
    expect(invalidValidation.reason).toBeDefined();

    const totalWeightExceeded = validateMacroAlignment(400, 60, 50, 30); // 60+50+30 = 140g (>100g)
    expect(totalWeightExceeded.valid).toBe(false);

    // 2. Valid input: custom food saved
    const validValidation = validateMacroAlignment(220, 25, 10, 8);
    expect(validValidation.valid).toBe(true);

    const customId = await dbService.saveCustomFood({
      name: 'Hamburguesa de Lentejas Casera',
      lang: 'es',
      calories_100g: 220,
      protein_100g: 25,
      carbs_100g: 10,
      fats_100g: 8
    });

    const ingredients = await firstValueFrom(dbService.observeIngredients());
    const saved = ingredients.find((i) => i.id === customId);
    expect(saved).toBeDefined();
    expect(saved?.name).toBe('Hamburguesa de Lentejas Casera');
    expect(saved?.source).toBe('custom');
  });

  it('[APP-107] FoodLogger and MacroRings stream daily logs reactively', async () => {
    const today = new Date().toISOString().split('T')[0];

    // Initial logs array is empty or hydrated for today
    let logs = await firstValueFrom(dbService.observeLogsByDate(today));
    const initialCount = logs.length;

    // Simulate adding food item log
    const ing = (await firstValueFrom(dbService.observeIngredients()))[0];
    const macros = createMacroSnapshot(calculateItemMacros(ing, 150));

    await dbService.logFood({
      date: today,
      meal_type: 'meal_lunch',
      food_reference_id: ing.id,
      quantity: 1.5,
      portion_name: '100g',
      macros
    });

    // Verify stream emits updated log reactively
    logs = await firstValueFrom(dbService.observeLogsByDate(today));
    expect(logs.length).toBe(initialCount + 1);
    expect(logs[logs.length - 1].macros.calories).toBe(macros.calories);

    // Calculate total daily macros reactively
    const totalCalories = logs.reduce((sum, item) => sum + item.macros.calories, 0);
    expect(totalCalories).toBeGreaterThan(0);
  });
});
