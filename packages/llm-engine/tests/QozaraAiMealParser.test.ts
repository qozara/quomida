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
});
