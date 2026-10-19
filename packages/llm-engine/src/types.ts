import type { RagCatalogCandidate } from '@quomida/domain-core';

export interface ParsedMealItem {
  foodQuery: string;
  quantity: number;
  unit: string;
  candidateId?: string;
  mealType?: string;
}

export interface ParsedNaturalLanguageMeal {
  rawInput: string;
  items: ParsedMealItem[];
  detectedMealType?: string;
  compositeDishName?: string;
  isCompositeDish?: boolean;
}

export interface LLMParseContext {
  candidates?: RagCatalogCandidate[];
  locale?: string;
}

export interface LLMProvider {
  parse(input: string, context?: LLMParseContext): Promise<ParsedNaturalLanguageMeal>;
}
