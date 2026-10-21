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

export interface ParserLocalePack {
  readonly locale: string;
  readonly numberWords: Record<string, number>;
  readonly canonicalUnits: Record<string, string>;
  readonly mealVerbsAndTimeRegex: RegExp;
  readonly delimiterRegex: RegExp;
  readonly inseparableCompounds: Set<string>;
  readonly stopWords: Set<string>;
  detectMealFromClause(clause: string): string | undefined;
}

export interface MealParserOptions {
  locale?: string;
  fallbackLocale?: string;
}
