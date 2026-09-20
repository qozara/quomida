import { describe, it, expect } from 'vitest';
import {
  baseIngredientsSchema,
  recipesSchema,
  portionsSchema,
  dailyLogsSchema,
  userSettingsSchema,
  systemMetadataSchema
} from '../src/index.js';

describe('RxDB Schema Specs', () => {
  it('defines base_ingredients schema with primary key id', () => {
    expect(baseIngredientsSchema.title).toBe('base_ingredients');
    expect(baseIngredientsSchema.primaryKey).toBe('id');
    expect(baseIngredientsSchema.required).toContain('name');
    expect(baseIngredientsSchema.required).toContain('calories_100g');
  });

  it('defines recipes schema with embedded ingredients array', () => {
    expect(recipesSchema.title).toBe('recipes');
    expect(recipesSchema.primaryKey).toBe('id');
    expect(recipesSchema.properties.ingredients.type).toBe('array');
  });

  it('defines portions schema referencing base food', () => {
    expect(portionsSchema.title).toBe('portions');
    expect(portionsSchema.primaryKey).toBe('id');
    expect(portionsSchema.required).toContain('base_food_id');
    expect(portionsSchema.required).toContain('equivalent_weight_g');
  });

  it('defines daily_logs schema with hardcoded macros snapshot and optional food_name', () => {
    expect(dailyLogsSchema.title).toBe('daily_logs');
    expect(dailyLogsSchema.version).toBe(0);
    expect(dailyLogsSchema.primaryKey).toBe('id');
    expect(dailyLogsSchema.required).toContain('date');
    expect(dailyLogsSchema.required).toContain('macros');
    expect(dailyLogsSchema.properties.food_name).toBeDefined();
    expect(dailyLogsSchema.properties.food_name.type).toBe('string');
  });

  it('defines user_settings schema with global_settings key and version 0', () => {
    expect(userSettingsSchema.title).toBe('user_settings');
    expect(userSettingsSchema.version).toBe(0);
    expect(userSettingsSchema.primaryKey).toBe('id');
  });

  it('defines system_metadata schema with primary key key and version 0', () => {
    expect(systemMetadataSchema.title).toBe('system_metadata');
    expect(systemMetadataSchema.version).toBe(0);
    expect(systemMetadataSchema.primaryKey).toBe('key');
    expect(systemMetadataSchema.required).toContain('key');
    expect(systemMetadataSchema.required).toContain('value');
    expect(systemMetadataSchema.required).toContain('updatedAt');
  });
});
