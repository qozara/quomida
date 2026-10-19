import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QozaraAiMealParser } from '../src/QozaraAiMealParser.js';
import { AiProviderFactory } from '@qozara/ai-client';

describe('QozaraAiMealParser', () => {
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

  it('should return empty items when input is empty or whitespace', async () => {
    const parser = new QozaraAiMealParser({ proxyUrl: 'https://test-proxy.local' });
    const result = await parser.parse('   ');
    expect(result.items).toEqual([]);
    expect(mockChat).not.toHaveBeenCalled();
  });

  it('should parse structured items from tool_call response', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'log_meal',
      arguments: {
        items: [
          { foodQuery: 'Empanada de carne', quantity: 2, unit: 'unit' },
          { foodQuery: 'Ensalada mixta', quantity: 1, unit: 'portion' },
        ],
      },
    });

    const parser = new QozaraAiMealParser({
      proxyUrl: 'https://test-proxy.local',
      provider: 'qozara-intelligence',
    });

    const result = await parser.parse('Comí dos empanadas y una ensalada');

    expect(result.rawInput).toBe('Comí dos empanadas y una ensalada');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      foodQuery: 'Empanada de carne',
      quantity: 2,
      unit: 'unit',
    });
    expect(result.items[1]).toEqual({
      foodQuery: 'Ensalada mixta',
      quantity: 1,
      unit: 'portion',
    });
  });

  it('should parse items from JSON markdown block in text response as fallback', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'text',
      content: '```json\n[{"foodQuery": "Manzana", "quantity": 1, "unit": "unit"}]\n```',
    });

    const parser = new QozaraAiMealParser({
      proxyUrl: 'https://test-proxy.local',
      provider: 'ollama',
      ollamaBaseUrl: 'http://localhost:11434/api',
      ollamaModel: 'llama3.2',
    });

    const result = await parser.parse('Comí una manzana');

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      foodQuery: 'Manzana',
      quantity: 1,
      unit: 'unit',
    });
  });

  it('should throw when the AI provider reports an error', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'text',
      error: 'Daily limit exceeded',
    });

    const parser = new QozaraAiMealParser({
      proxyUrl: 'https://test-proxy.local',
    });

    await expect(parser.parse('Comí una manzana')).rejects.toThrow('AI Provider returned error: Daily limit exceeded');
  });

  it('should map provider configurations properly to AiProviderFactory', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'log_meal',
      arguments: { items: [] },
    });

    const parser = new QozaraAiMealParser({
      proxyUrl: 'https://test-proxy.local',
      provider: 'byok',
      ciphertext: 'encrypted-secret-key',
    });

    await parser.parse('Comí arroz');

    expect(AiProviderFactory.createProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        providerPreference: 'byok',
        proxyUrl: 'https://test-proxy.local',
        encryptedApiKey: 'encrypted-secret-key',
      }),
      undefined
    );
  });

  it('should parse real proxy food_items structure with food_name and meal_type', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'log_meal',
      arguments: {
        meal_type: 'breakfast',
        food_items: [
          { food_name: 'empanada', quantity: 2, unit: 'unit' }
        ],
      },
    });

    const parser = new QozaraAiMealParser({
      proxyUrl: 'https://test-proxy.local',
      provider: 'qozara-intelligence',
    });

    const result = await parser.parse('desayuné dos empanadas');

    expect(result.rawInput).toBe('desayuné dos empanadas');
    expect(result.detectedMealType).toBe('breakfast');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      foodQuery: 'empanada',
      quantity: 2,
      unit: 'unit',
    });
  });

  it('should parse stringified JSON tool_call arguments', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'log_meal',
      arguments: JSON.stringify({
        meal_type: 'dinner',
        food_items: [
          { food_name: 'pizza', quantity: 3, unit: 'slice' }
        ],
      }),
    });

    const parser = new QozaraAiMealParser({
      proxyUrl: 'https://test-proxy.local',
    });

    const result = await parser.parse('cené 3 porciones de pizza');

    expect(result.detectedMealType).toBe('dinner');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      foodQuery: 'pizza',
      quantity: 3,
      unit: 'slice',
    });
  });

  it('should normalize alternate key names like alimento, nombre, cantidad, unidad', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'log_meal',
      arguments: {
        alimentos: [
          { alimento: 'manzana roja', cantidad: '1.5', medida: 'unidad' }
        ],
      },
    });

    const parser = new QozaraAiMealParser({
      proxyUrl: 'https://test-proxy.local',
    });

    const result = await parser.parse('una manzana roja y media');

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      foodQuery: 'manzana roja',
      quantity: 1.5,
      unit: 'unidad',
    });
  });

  it('should split compound meals like "milanesa con puré de papas" into separate main and side items', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'log_meal',
      arguments: {
        meal_type: 'dinner',
        food_items: [
          { food_name: 'milanesa con puré de papas', quantity: 1, unit: 'plato' }
        ],
      },
    });

    const parser = new QozaraAiMealParser({
      proxyUrl: 'https://test-proxy.local',
    });

    const result = await parser.parse('cené una milanesa con puré de papas.');

    expect(result.detectedMealType).toBe('dinner');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      foodQuery: 'milanesa',
      quantity: 1,
      unit: 'unit',
    });
    expect(result.items[1]).toEqual({
      foodQuery: 'puré de papas',
      quantity: 1,
      unit: 'portion',
    });
  });

  it('should preserve indivisible compound dishes like "café con leche"', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'log_meal',
      arguments: {
        meal_type: 'breakfast',
        food_items: [
          { food_name: 'café con leche', quantity: 1, unit: 'taza' }
        ],
      },
    });

    const parser = new QozaraAiMealParser({
      proxyUrl: 'https://test-proxy.local',
    });

    const result = await parser.parse('desayuné un café con leche');

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      foodQuery: 'café con leche',
      quantity: 1,
      unit: 'taza',
    });
  });

  it('should handle multiple tool calls array in response.tool_calls', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_calls',
      tool_calls: [
        {
          function: {
            name: 'log_meal',
            arguments: JSON.stringify({ food_items: [{ food_name: 'milanesa', quantity: 1, unit: 'unit' }], meal_type: 'dinner' })
          }
        },
        {
          function: {
            name: 'log_meal',
            arguments: JSON.stringify({ food_items: [{ food_name: 'puré de papas', quantity: 1, unit: 'portion' }] })
          }
        }
      ]
    });

    const parser = new QozaraAiMealParser({
      proxyUrl: 'https://test-proxy.local',
    });

    const result = await parser.parse('cené una milanesa con puré de papas');

    expect(result.detectedMealType).toBe('dinner');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].foodQuery).toBe('milanesa');
    expect(result.items[1].foodQuery).toBe('puré de papas');
  });

  it('should extract plain text bullet points when model replies in conversational text without tool calls', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'text',
      content: 'He registrado para tu cena:\n- 1 milanesa\n- 1 porción de puré de papas',
    });

    const parser = new QozaraAiMealParser({
      proxyUrl: 'https://test-proxy.local',
    });

    const result = await parser.parse('cené una milanesa con puré de papas');

    expect(result.items).toHaveLength(2);
    expect(result.items[0].foodQuery).toBe('milanesa');
    expect(result.items[1].foodQuery).toBe('puré de papas');
    expect(result.items[1].unit).toBe('porción');
  });

  it('should format user prompt with available catalog candidates when context is provided', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'log_meal',
      arguments: {
        food_items: [
          { food_name: 'Huevo frito', quantity: 2, unit: 'unit', candidate_id: 'egg-1' }
        ],
      },
    });

    const parser = new QozaraAiMealParser({ proxyUrl: 'https://test-proxy.local' });
    const candidates = [
      {
        id: 'egg-1',
        name: 'Huevo frito',
        kind: 'ingredient' as const,
        calories_100g: 196.2,
        protein_100g: 13.6,
        carbs_100g: 0.8,
        fats_100g: 15.3,
      },
      {
        id: 'toast-1',
        name: 'Tostada de pan blanco',
        kind: 'ingredient' as const,
        calories_100g: 265,
        protein_100g: 9,
        carbs_100g: 49,
        fats_100g: 3.2,
      }
    ];

    const result = await parser.parse('dos huevos fritos', { candidates });

    expect(mockChat).toHaveBeenCalledTimes(1);
    const chatCallArgs = mockChat.mock.calls[0][0];
    const userMsg = chatCallArgs.messages[0].content;
    expect(userMsg).toContain('User description: "dos huevos fritos"');
    expect(userMsg).toContain('Available Catalog Candidates (use exact `id` in `candidate_id` if applicable):');
    expect(userMsg).toContain('- id: "egg-1" | name: "Huevo frito" (196 kcal/100g, P:13.6g, C:0.8g, F:15.3g)');
    expect(userMsg).toContain('- id: "toast-1" | name: "Tostada de pan blanco" (265 kcal/100g, P:9g, C:49g, F:3.2g)');

    expect(result.items[0]).toEqual({
      foodQuery: 'Huevo frito',
      quantity: 2,
      unit: 'unit',
      candidateId: 'egg-1',
    });
  });

  it('should extract composite_dish_name and candidate_id from tool call arguments', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'log_meal',
      arguments: {
        composite_dish_name: 'Milanesa con puré de papas',
        food_items: [
          { food_name: 'milanesa', quantity: 1, unit: 'unit', candidate_id: 'rec-milanesa-1' },
          { food_name: 'puré de papas', quantity: 1, unit: 'portion', candidate_id: 'ing-pure-1' }
        ],
      },
    });

    const parser = new QozaraAiMealParser({ proxyUrl: 'https://test-proxy.local' });
    const result = await parser.parse('milanesa con puré de papas');

    expect(result.compositeDishName).toBe('Milanesa con puré de papas');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].candidateId).toBe('rec-milanesa-1');
    expect(result.items[1].candidateId).toBe('ing-pure-1');
  });

  it('should support camelCase compositeDishName and candidateId', async () => {
    mockChat.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'log_meal',
      arguments: {
        compositeDishName: 'Arroz con pollo',
        foodItems: [
          { foodName: 'arroz', quantity: 100, unit: 'g', candidateId: 'ing-arroz-1' },
          { foodName: 'pollo', quantity: 150, unit: 'g', candidateId: 'ing-pollo-1' }
        ]
      }
    });

    const parser = new QozaraAiMealParser({ proxyUrl: 'https://test-proxy.local' });
    const result = await parser.parse('arroz con pollo');

    expect(result.compositeDishName).toBe('Arroz con pollo');
    expect(result.items[0].candidateId).toBe('ing-arroz-1');
    expect(result.items[1].candidateId).toBe('ing-pollo-1');
  });

  describe('Clause Splitting, Multi-Meal Verbs, Comma Lists, and Per-Segment Quantities', () => {
    it('Issue 1: parses "comi un puré de papas con una hamburguesa" with composite dish recognition', async () => {
      mockChat.mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'log_meal',
        arguments: {
          composite_dish_name: 'Puré de papas con hamburguesa',
          food_items: [
            { food_name: 'puré de papas', quantity: 1, unit: 'portion' },
            { food_name: 'hamburguesa', quantity: 1, unit: 'unit' }
          ]
        }
      });

      const parser = new QozaraAiMealParser({ proxyUrl: 'https://test-proxy.local' });
      const result = await parser.parse('comi un puré de papas con una hamburguesa');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].foodQuery).toBe('puré de papas');
      expect(result.items[1].foodQuery).toBe('hamburguesa');
      expect(result.compositeDishName).toBe('Puré de papas con hamburguesa');
      expect(result.isCompositeDish).toBe(true);
    });

    it('Issue 2: parses multi-meal "almorcé mora congelada y cené queso" and marks meal_type on items', async () => {
      // Simulate LLM returning multi-meal extraction
      mockChat.mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'log_meal',
        arguments: {
          food_items: [
            { food_name: 'mora congelada', quantity: 1, unit: 'unit', meal_type: 'lunch' },
            { food_name: 'queso', quantity: 1, unit: 'unit', meal_type: 'dinner' }
          ]
        }
      });

      const parser = new QozaraAiMealParser({ proxyUrl: 'https://test-proxy.local' });
      const result = await parser.parse('almorcé mora congelada y cené queso');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].foodQuery).toBe('mora congelada');
      expect(result.items[0].mealType).toBe('lunch');
      expect(result.items[1].foodQuery).toBe('queso');
      expect(result.items[1].mealType).toBe('dinner');
      expect(result.isCompositeDish).toBe(false);
    });

    it('Issue 2: merges missing second meal item when LLM partially extracted only the first meal item', async () => {
      // LLM only returned mora congelada, missed cené queso
      mockChat.mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'log_meal',
        arguments: {
          meal_type: 'lunch',
          food_items: [
            { food_name: 'mora congelada', quantity: 1, unit: 'unit', meal_type: 'lunch' }
          ]
        }
      });

      const parser = new QozaraAiMealParser({ proxyUrl: 'https://test-proxy.local' });
      const result = await parser.parse('almorcé mora congelada y cené queso');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].foodQuery).toBe('mora congelada');
      expect(result.items[0].mealType).toBe('lunch');
      expect(result.items[1].foodQuery).toBe('queso');
      expect(result.items[1].mealType).toBe('dinner');
      expect(result.isCompositeDish).toBe(false);
    });

    it('Issue 3: parses comma-separated food list "comí queso, pan, hamburquesa y mora congelada en la cena"', async () => {
      mockChat.mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'log_meal',
        arguments: {
          meal_type: 'dinner',
          food_items: [
            { food_name: 'queso', quantity: 1, unit: 'unit' },
            { food_name: 'pan', quantity: 1, unit: 'unit' },
            { food_name: 'hamburquesa', quantity: 1, unit: 'unit' },
            { food_name: 'mora congelada', quantity: 1, unit: 'unit' }
          ]
        }
      });

      const parser = new QozaraAiMealParser({ proxyUrl: 'https://test-proxy.local' });
      const result = await parser.parse('comí queso, pan, hamburquesa y mora congelada en la cena');

      expect(result.items).toHaveLength(4);
      expect(result.items.map(i => i.foodQuery)).toEqual(['queso', 'pan', 'hamburquesa', 'mora congelada']);
      expect(result.detectedMealType).toBe('dinner');
      expect(result.isCompositeDish).toBe(false);
    });

    it('Issue 3: plain text / zero-item fallback splits comma lists cleanly and assigns dinner mealType', async () => {
      mockChat.mockResolvedValueOnce({
        type: 'text',
        content: 'He registrado tu comida:\n- comí queso, pan, hamburquesa y mora congelada en la cena'
      });

      const parser = new QozaraAiMealParser({ proxyUrl: 'https://test-proxy.local' });
      const result = await parser.parse('comí queso, pan, hamburquesa y mora congelada en la cena');

      expect(result.items).toHaveLength(4);
      expect(result.items[0].foodQuery).toBe('queso');
      expect(result.items[1].foodQuery).toBe('pan');
      expect(result.items[2].foodQuery).toBe('hamburquesa');
      expect(result.items[3].foodQuery).toBe('mora congelada');
      for (const item of result.items) {
        expect(item.mealType).toBe('dinner');
      }
    });

    it('Issue 4: correctly associates distinct quantities and units for "caracolitos sabor asado y 2 porciones de pizza"', async () => {
      // Suppose LLM returned food_name with embedded quantity or returned combined string
      mockChat.mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'log_meal',
        arguments: {
          food_items: [
            { food_name: 'caracolitos sabor asado', quantity: 1, unit: 'unit' },
            { food_name: '2 porciones de pizza', quantity: 1, unit: 'unit' }
          ]
        }
      });

      const parser = new QozaraAiMealParser({ proxyUrl: 'https://test-proxy.local' });
      const result = await parser.parse('caracolitos sabor asado y 2 porciones de pizza');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].foodQuery).toBe('caracolitos sabor asado');
      expect(result.items[0].quantity).toBe(1);

      // Embedded quantity 2 and unit porciones in item 2 should be cleaned and extracted
      expect(result.items[1].foodQuery).toBe('pizza');
      expect(result.items[1].quantity).toBe(2);
      expect(['portion', 'porción', 'porciones']).toContain(result.items[1].unit);
      expect(result.isCompositeDish).toBe(false);
    });

    it('Issue 4 (Reconciliation): recovers explicit clause quantity (2) when LLM hallucinated quantity 1 on item 2', async () => {
      mockChat.mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'log_meal',
        arguments: {
          food_items: [
            { food_name: 'caracolitos sabor asado', quantity: 1, unit: 'portion' },
            { food_name: 'pizza', quantity: 1, unit: 'portion' }
          ]
        }
      });

      const parser = new QozaraAiMealParser({ proxyUrl: 'https://test-proxy.local' });
      const result = await parser.parse('caracolitos sabor asado y 2 porciones de pizza');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].foodQuery).toBe('caracolitos sabor asado');
      expect(result.items[0].quantity).toBe(1);
      expect(result.items[1].foodQuery).toBe('pizza');
      expect(result.items[1].quantity).toBe(2);
      expect(result.isCompositeDish).toBe(false);
    });

    it('Multilingual (EN) Issue 1: parses "I ate mashed potatoes with a burger" as a composite dish', async () => {
      mockChat.mockResolvedValueOnce({
        type: 'text',
        content: 'I have logged:\n- I ate mashed potatoes with a burger'
      });

      const parser = new QozaraAiMealParser({ proxyUrl: 'https://test-proxy.local' });
      const result = await parser.parse('I ate mashed potatoes with a burger');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].foodQuery).toBe('mashed potatoes');
      expect(result.items[1].foodQuery).toBe('burger');
      expect(result.isCompositeDish).toBe(true);
    });

    it('Multilingual (EN) Issue 2: parses "I had frozen blackberries for lunch and ate cheese for dinner" with per-item mealType', async () => {
      // Simulate LLM only extracting the first item without meal_type
      mockChat.mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'log_meal',
        arguments: {
          food_items: [
            { food_name: 'frozen blackberries', quantity: 1, unit: 'portion' }
          ]
        }
      });

      const parser = new QozaraAiMealParser({ proxyUrl: 'https://test-proxy.local' });
      const result = await parser.parse('I had frozen blackberries for lunch and ate cheese for dinner');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].foodQuery).toBe('frozen blackberries');
      expect(result.items[0].mealType).toBe('lunch');
      expect(result.items[1].foodQuery).toBe('cheese');
      expect(result.items[1].mealType).toBe('dinner');
      expect(result.isCompositeDish).toBe(false);
    });

    it('Multilingual (EN) Issue 3: parses comma list "I ate cheese, bread, burger and frozen blackberries for dinner"', async () => {
      mockChat.mockResolvedValueOnce({
        type: 'text',
        content: 'Here are your items:\n- I ate cheese, bread, burger and frozen blackberries for dinner'
      });

      const parser = new QozaraAiMealParser({ proxyUrl: 'https://test-proxy.local' });
      const result = await parser.parse('I ate cheese, bread, burger and frozen blackberries for dinner');

      expect(result.items).toHaveLength(4);
      expect(result.items.map(i => i.foodQuery)).toEqual(['cheese', 'bread', 'burger', 'frozen blackberries']);
      for (const item of result.items) {
        expect(item.mealType).toBe('dinner');
      }
      expect(result.isCompositeDish).toBe(false);
    });

    it('Multilingual (EN) Issue 4: parses "barbecue snacks and 2 slices of pizza" with exact quantities and units', async () => {
      mockChat.mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'log_meal',
        arguments: {
          food_items: [
            { food_name: 'barbecue snacks and 2 slices of pizza', quantity: 1, unit: 'portion' }
          ]
        }
      });

      const parser = new QozaraAiMealParser({ proxyUrl: 'https://test-proxy.local' });
      const result = await parser.parse('barbecue snacks and 2 slices of pizza');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].foodQuery).toBe('barbecue snacks');
      expect(result.items[0].quantity).toBe(1);
      expect(result.items[1].foodQuery).toBe('pizza');
      expect(result.items[1].quantity).toBe(2);
      expect(result.items[1].unit).toBe('slice');
      expect(result.isCompositeDish).toBe(false);
    });
  });
});

