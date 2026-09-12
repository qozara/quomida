import type { LLMProvider, ParsedNaturalLanguageMeal } from './types.js';

export class MockLLMProvider implements LLMProvider {
  async parse(input: string): Promise<ParsedNaturalLanguageMeal> {
    const lower = input.toLowerCase();
    const items = [];

    if (lower.includes('empanada')) {
      items.push({ foodQuery: 'Empanada de carne', quantity: 2, unit: 'unit' });
    }
    if (lower.includes('ensalada')) {
      items.push({ foodQuery: 'Ensalada mixta', quantity: 1, unit: 'medium portion' });
    }
    if (lower.includes('asado') || lower.includes('vacío')) {
      items.push({ foodQuery: 'Vacío vacuno', quantity: 250, unit: 'g' });
    }
    if (items.length === 0) {
      items.push({ foodQuery: input.trim(), quantity: 1, unit: 'unit' });
    }

    return {
      rawInput: input,
      items
    };
  }
}

/**
 * Parses natural language meal text with graceful degradation.
 * Returns null if the LLM provider times out or throws an error.
 */
export async function parseNaturalLanguageLog(
  input: string,
  provider: LLMProvider
): Promise<ParsedNaturalLanguageMeal | null> {
  try {
    return await provider.parse(input);
  } catch (error) {
    console.warn('[LLM Engine] Parsing failed or timed out. Degrading to fallback search bar.', error);
    return null;
  }
}
