import { describe, it, expect } from 'vitest';
import { parseNaturalLanguageLog, MockLLMProvider } from '../src/index.js';

describe('LLM Natural Language Parser & Fallback Strategy', () => {
  it('parses structured meal entities using MockLLMProvider', async () => {
    const mockProvider = new MockLLMProvider();
    const result = await parseNaturalLanguageLog('Comí 2 empanadas de carne y ensalada', mockProvider);

    expect(result).not.toBeNull();
    if (result) {
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0]).toHaveProperty('foodQuery');
      expect(result.items[0]).toHaveProperty('quantity');
    }
  });

  it('gracefully degrades and returns null on timeout or error', async () => {
    const failingProvider = {
      parse: async () => {
        throw new Error('LLM Endpoint Timeout');
      }
    };

    const result = await parseNaturalLanguageLog('Comí un asado', failingProvider);
    expect(result).toBeNull();
  });
});
