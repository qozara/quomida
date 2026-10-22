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

export interface DecomposedDishIngredient {
  food_name: string;
  quantity: number;
  unit: string;
  search_alias?: string;
  notes?: string;
}

export interface DecomposedDishResult {
  dishName: string;
  rationale?: string;
  estimatedTotalWeightGrams?: number;
  ingredients: DecomposedDishIngredient[];
}

export interface IRecipeDecomposer {
  decomposeDish(
    dishName: string,
    portionContext?: string,
    locale?: string
  ): Promise<DecomposedDishResult | null>;
}
