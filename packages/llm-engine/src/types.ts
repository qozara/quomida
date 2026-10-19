import type { RagCatalogCandidate } from '@quomida/domain-core';

export interface ParsedMealItem {
  foodQuery: string;
  quantity: number;
  unit: string;
  candidateId?: string;
}

export interface ParsedNaturalLanguageMeal {
  rawInput: string;
  items: ParsedMealItem[];
  detectedMealType?: string;
  compositeDishName?: string;
}

export interface LLMParseContext {
  candidates?: RagCatalogCandidate[];
}

export interface LLMProvider {
  parse(input: string, context?: LLMParseContext): Promise<ParsedNaturalLanguageMeal>;
}
