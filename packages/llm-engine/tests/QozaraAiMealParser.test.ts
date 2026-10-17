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
});
