export interface ParsedMealItem {
  foodQuery: string;
  quantity: number;
  unit: string;
}

export interface ParsedNaturalLanguageMeal {
  rawInput: string;
  items: ParsedMealItem[];
}

export interface LLMProvider {
  parse(input: string): Promise<ParsedNaturalLanguageMeal>;
}
