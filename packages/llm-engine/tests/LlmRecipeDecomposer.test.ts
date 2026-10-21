import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LlmRecipeDecomposer } from '../src/LlmRecipeDecomposer.js';
import { AiProviderFactory } from '@qozara/ai-client';

describe('LlmRecipeDecomposer', () => {
  const mockChat = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
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
});
