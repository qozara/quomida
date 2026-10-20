import { describe, it, expect } from 'vitest';
import {
  baseIngredientsSchema,
  recipesSchema,
  portionsSchema,
  dailyLogsSchema,
  userSettingsSchema,
  systemMetadataSchema,
  weightLogsSchema
} from '../src/index.js';

describe('RxDB Schema Specs', () => {
  it('defines base_ingredients schema with primary key id', () => {
    expect(baseIngredientsSchema.title).toBe('base_ingredients');
    expect(baseIngredientsSchema.primaryKey).toBe('id');
    expect(baseIngredientsSchema.required).toContain('name');
    expect(baseIngredientsSchema.required).toContain('calories_100g');
    
    // Validate source enum contains 'system', 'custom', and 'ai'
    const sourceProp = baseIngredientsSchema.properties.source as any;
    expect(sourceProp.enum).toContain('system');
    expect(sourceProp.enum).toContain('custom');
    expect(sourceProp.enum).toContain('ai');
  });

  it('defines recipes schema with embedded ingredients array and version 1', () => {
    expect(recipesSchema.title).toBe('recipes');
    expect(recipesSchema.version).toBe(1);
    expect(recipesSchema.primaryKey).toBe('id');
    expect(recipesSchema.properties.ingredients.type).toBe('array');
  });

  it('defines portions schema referencing base food', () => {
    expect(portionsSchema.title).toBe('portions');
    expect(portionsSchema.primaryKey).toBe('id');
    expect(portionsSchema.required).toContain('base_food_id');
    expect(portionsSchema.required).toContain('equivalent_weight_g');
    
    // Validate source enum contains 'system', 'custom', and 'ai'
    const sourceProp = portionsSchema.properties.source as any;
    expect(sourceProp.enum).toContain('system');
    expect(sourceProp.enum).toContain('custom');
    expect(sourceProp.enum).toContain('ai');
    
    expect(portionsSchema.properties.is_generic).toBeDefined();
    expect((portionsSchema.properties.is_generic as any).type).toBe('boolean');
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
    expect(userSettingsSchema.properties.target_mode).toBeDefined();
    expect(userSettingsSchema.properties.biometrics).toBeDefined();
    expect(userSettingsSchema.properties.goal_config).toBeDefined();
    expect(userSettingsSchema.properties.adaptive_state).toBeDefined();
  });

  it('defines system_metadata schema with primary key key and version 0', () => {
    expect(systemMetadataSchema.title).toBe('system_metadata');
    expect(systemMetadataSchema.version).toBe(0);
    expect(systemMetadataSchema.primaryKey).toBe('key');
    expect(systemMetadataSchema.required).toContain('key');
    expect(systemMetadataSchema.required).toContain('value');
    expect(systemMetadataSchema.required).toContain('updatedAt');
  });

  it('defines weight_logs schema with primary key id and version 0', () => {
    expect(weightLogsSchema.title).toBe('weight_logs');
    expect(weightLogsSchema.version).toBe(0);
    expect(weightLogsSchema.primaryKey).toBe('id');
    expect(weightLogsSchema.required).toContain('id');
    expect(weightLogsSchema.required).toContain('date');
    expect(weightLogsSchema.required).toContain('timestamp');
    expect(weightLogsSchema.required).toContain('weight_kg');
    expect(weightLogsSchema.required).toContain('trend_weight_kg');
    expect(weightLogsSchema.properties.weight_kg.minimum).toBe(20);
    expect(weightLogsSchema.properties.weight_kg.maximum).toBe(500);
  });
});
