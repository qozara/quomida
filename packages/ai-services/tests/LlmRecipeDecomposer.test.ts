import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LlmRecipeDecomposer } from '../src/LlmRecipeDecomposer.js';
import { AiProviderFactory } from '@qozara/ai-client';

describe('LlmRecipeDecomposer', () => {
  const mockChat = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    LlmRecipeDecomposer.clearCache();
    vi.spyOn(AiProviderFactory, 'createProvider').mockResolvedValue({
      id: 'mock-provider',
      mode: 'cloud',
      chat: mockChat,
      checkAvailability: vi.fn().mockResolvedValue(true),
      getSetupMessage: vi.fn().mockReturnValue(null),
    } as any);
  });

  it('returns null when dish name is empty or whitespace', async () => {
    const decomposer = new LlmRecipeDecomposer({ proxyUrl: 'https://test.local' });
    const result = await decomposer.decomposeDish('   ');
    expect(result).toBeNull();
    expect(mockChat).not.toHaveBeenCalled();
  });

  it('decomposes locro into standard agricultural ingredients from tool_call response', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'decompose_dish',
      arguments: {
        dish_name: 'Locro criollo',
        estimated_total_weight_g: 350,
        rationale: 'Traditional corn and meat stew',
        ingredients: [
          { food_name: 'maíz blanco partido', search_alias: 'white corn', quantity: 80, unit: 'g' },
          { food_name: 'poroto alubia', search_alias: 'white beans', quantity: 50, unit: 'g' },
          { food_name: 'carne vacuna', search_alias: 'beef stew meat', quantity: 70, unit: 'g' },
          { food_name: 'zapallo', search_alias: 'pumpkin', quantity: 100, unit: 'g' },
          { food_name: 'chorizo colorado', search_alias: 'chorizo', quantity: 30, unit: 'g' },
        ]
      }
    });

    const decomposer = new LlmRecipeDecomposer({
      proxyUrl: 'https://test.local',
      provider: 'qozara-intelligence'
    });

    const result = await decomposer.decomposeDish('locro', '1 plato', 'es');

    expect(result).not.toBeNull();
    expect(result!.dishName).toBe('Locro criollo');
    expect(result!.estimatedTotalWeightGrams).toBe(350);
    expect(result!.ingredients).toHaveLength(5);
    expect(result!.ingredients[0]).toEqual({
      food_name: 'maíz blanco partido',
      search_alias: 'white corn',
      quantity: 80,
      unit: 'g'
    });
    expect(result!.ingredients[3]).toEqual({
      food_name: 'zapallo',
      search_alias: 'pumpkin',
      quantity: 100,
      unit: 'g'
    });
  });

  it('handles fallback markdown JSON response', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'text',
      content: '```json\n{\n  "dish_name": "Pastel de papa",\n  "estimated_total_weight_g": 300,\n  "ingredients": [\n    { "food_name": "papa", "quantity": 150, "unit": "g" },\n    { "food_name": "carne picada vacuna", "quantity": 100, "unit": "g" },\n    { "food_name": "huevo", "quantity": 50, "unit": "g" }\n  ]\n}\n```'
    });

    const decomposer = new LlmRecipeDecomposer({ proxyUrl: 'https://test.local' });
    const result = await decomposer.decomposeDish('pastel de papa', '1 porción', 'es');

    expect(result).not.toBeNull();
    expect(result!.dishName).toBe('Pastel de papa');
    expect(result!.ingredients).toHaveLength(3);
    expect(result!.ingredients[0].food_name).toBe('papa');
    expect(result!.ingredients[0].quantity).toBe(150);
  });

  it('throws when AI provider returns an error', async () => {
    mockChat.mockResolvedValueOnce({
      error: 'Rate limit exceeded (429)'
    });

    const decomposer = new LlmRecipeDecomposer({ proxyUrl: 'https://test.local' });
    await expect(decomposer.decomposeDish('locro')).rejects.toThrow('AI Provider returned error');
  });

  it('returns null when AI response contains no valid ingredients', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      arguments: {
        dish_name: 'Unknown food',
        ingredients: []
      }
    });

    const decomposer = new LlmRecipeDecomposer({ proxyUrl: 'https://test.local' });
    const result = await decomposer.decomposeDish('asdfasdf');
    expect(result).toBeNull();
  });

  it('reuses in-memory cached decomposition on repeat queries without calling remote provider', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'decompose_dish',
      arguments: {
        dish_name: 'Locro Criollo',
        ingredients: [
          { food_name: 'maíz blanco', quantity: 100, unit: 'g' }
        ]
      }
    });

    const decomposer = new LlmRecipeDecomposer({ proxyUrl: 'https://test.local' });

    // First call -> misses cache, calls chat
    const firstResult = await decomposer.decomposeDish('locro', '1 plato', 'es');
    expect(firstResult).not.toBeNull();
    expect(mockChat).toHaveBeenCalledTimes(1);

    // Second call -> hits cache, 0 chat calls
    const secondResult = await decomposer.decomposeDish('locro', '1 plato', 'es');
    expect(secondResult).toEqual(firstResult);
    expect(mockChat).toHaveBeenCalledTimes(1);

    // Third call with uppercase and extra spaces -> hits cache
    const thirdResult = await decomposer.decomposeDish('  LOCRO  ', '1 plato', 'es');
    expect(thirdResult).toEqual(firstResult);
    expect(mockChat).toHaveBeenCalledTimes(1);
  });

  it('does NOT cache transient provider errors so retries can succeed', async () => {
    mockChat
      .mockResolvedValueOnce({ error: 'High demand (503)' })
      .mockResolvedValueOnce({
        type: 'tool_call',
        arguments: {
          dish_name: 'Locro Criollo',
          ingredients: [{ food_name: 'maíz blanco', quantity: 100, unit: 'g' }]
        }
      });

    const decomposer = new LlmRecipeDecomposer({ proxyUrl: 'https://test.local' });

    // First call fails with error
    await expect(decomposer.decomposeDish('locro', '1 plato', 'es')).rejects.toThrow('High demand (503)');
    expect(mockChat).toHaveBeenCalledTimes(1);

    // Second call succeeds because error was not cached
    const result = await decomposer.decomposeDish('locro', '1 plato', 'es');
    expect(result).not.toBeNull();
    expect(mockChat).toHaveBeenCalledTimes(2);
  });

  it('bypasses caching completely when cache is explicitly disabled with null', async () => {
    mockChat
      .mockResolvedValueOnce({
        type: 'tool_call',
        arguments: { dish_name: 'Locro', ingredients: [{ food_name: 'maíz', quantity: 100, unit: 'g' }] }
      })
      .mockResolvedValueOnce({
        type: 'tool_call',
        arguments: { dish_name: 'Locro', ingredients: [{ food_name: 'maíz', quantity: 100, unit: 'g' }] }
      });

    const decomposer = new LlmRecipeDecomposer({ proxyUrl: 'https://test.local', cache: null });

    await decomposer.decomposeDish('locro', '1 plato', 'es');
    await decomposer.decomposeDish('locro', '1 plato', 'es');

    expect(mockChat).toHaveBeenCalledTimes(2);
  });

  it('parses single-ingredient inference with kind, per-100g macros, and domestic portions', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'decompose_dish',
      arguments: {
        dish_name: 'Rúcula',
        kind: 'ingredient',
        estimated_total_weight_g: 100,
        rationale: 'Fresh arugula leaves',
        ingredients: [
          {
            food_name: 'Rúcula',
            search_alias: 'arugula',
            quantity: 100,
            unit: 'g',
            calories_100g: 25,
            protein_100g: 2.6,
            carbs_100g: 3.7,
            fats_100g: 0.7,
            portions: [
              { name: '1 taza', equivalent_weight_g: 20 },
              { name: '1 porción', equivalent_weight_g: 50 }
            ]
          }
        ]
      }
    });

    const decomposer = new LlmRecipeDecomposer({ proxyUrl: 'https://test.local' });
    const result = await decomposer.decomposeDish('rúcula', '1 unit', 'es');

    expect(result).not.toBeNull();
    expect(result!.kind).toBe('ingredient');
    expect(result!.dishName).toBe('Rúcula');
    expect(result!.ingredients).toHaveLength(1);
    expect(result!.ingredients[0]).toEqual({
      food_name: 'Rúcula',
      search_alias: 'arugula',
      quantity: 100,
      unit: 'g',
      calories_100g: 25,
      protein_100g: 2.6,
      carbs_100g: 3.7,
      fats_100g: 0.7,
      portions: [
        { name: '1 taza', equivalent_weight_g: 20 },
        { name: '1 porción', equivalent_weight_g: 50 }
      ]
    });
  });

  it('parses composite recipe with kind="recipe" and fallback per-100g macros on constituent ingredients', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'decompose_dish',
      arguments: {
        dish_name: 'Ensalada de Rúcula y Parmesano',
        kind: 'recipe',
        estimated_total_weight_g: 120,
        ingredients: [
          {
            food_name: 'Rúcula',
            quantity: 80,
            unit: 'g',
            calories_100g: 25,
            protein_100g: 2.6,
            carbs_100g: 3.7,
            fats_100g: 0.7
          },
          {
            food_name: 'Queso parmesano',
            quantity: 40,
            unit: 'g',
            calories_100g: 431,
            protein_100g: 38,
            carbs_100g: 4.1,
            fats_100g: 29
          }
        ]
      }
    });

    const decomposer = new LlmRecipeDecomposer({ proxyUrl: 'https://test.local' });
    const result = await decomposer.decomposeDish('ensalada de rucula y parmesano', '1 porción', 'es');

    expect(result).not.toBeNull();
    expect(result!.kind).toBe('recipe');
    expect(result!.ingredients).toHaveLength(2);
    expect(result!.ingredients[0].calories_100g).toBe(25);
    expect(result!.ingredients[1].protein_100g).toBe(38);
  });
});
