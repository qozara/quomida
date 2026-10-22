import type { ParserLocalePack } from '../types.js';

export const enLocalePack: ParserLocalePack = {
  locale: 'en',

  numberWords: {
    one: 1,
    a: 1,
    an: 1,
    couple: 2,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    seis: 6,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    half: 0.5
  },

  canonicalUnits: {
    unit: 'unit',
    units: 'unit',
    piece: 'unit',
    pieces: 'unit',
    item: 'unit',
    items: 'unit',
    portion: 'portion',
    portions: 'portion',
    serving: 'portion',
    servings: 'portion',
    plate: 'plate',
    plates: 'plate',
    bowl: 'bowl',
    bowls: 'bowl',
    cup: 'cup',
    cups: 'cup',
    glass: 'glass',
    glasses: 'glass',
    slice: 'slice',
    slices: 'slice',
    tbsp: 'tbsp',
    tablespoon: 'tbsp',
    tablespoons: 'tbsp',
    tsp: 'tsp',
    teaspoon: 'tsp',
    teaspoons: 'tsp',
    g: 'g',
    gram: 'g',
    grams: 'g',
    oz: 'oz',
    ounce: 'oz',
    ounces: 'oz',
    ml: 'ml'
  },

  mealVerbsAndTimeRegex:
    /(?<=^|[^\p{L}\p{N}])(?:for breakfast|for lunch|for dinner|for a snack|for snack|at breakfast|at lunch|at dinner|in the morning|in the afternoon|in the evening|at night|i ate|i had|i drank|i consumed|ate|had|drank|eaten|breakfast|lunch|dinner|supper|snack|yesterday|today)(?=[^\p{L}\p{N}]|$)/giu,

  delimiterRegex: /,\s*|\s+(?:and|\+|with)\s+/gi,

  inseparableCompounds: new Set([
    'coffee with milk',
    'tea with milk',
    'tea with lemon',
    'iced tea with lemon',
    'mac and cheese',
    'macaroni and cheese',
    'fish and chips',
    'peanut butter and jelly',
    'bread and butter',
    'ham and cheese',
    'bacon and eggs',
    'pork and beans',
    'rice and beans',
    'biscuits and gravy',
    'chips and salsa',
    'chips and guacamole',
    'strawberries and cream',
    'cookies and cream'
  ]),

  stopWords: new Set([
    'of',
    'the',
    'a',
    'an',
    'and',
    'with',
    'in',
    'for',
    'at',
    'on'
  ]),

  detectMealFromClause(clause: string): string | undefined {
    if (!clause) return undefined;
    if (/(?<=^|[^\p{L}\p{N}])(?:breakfast)(?=[^\p{L}\p{N}]|$)/iu.test(clause)) {
      return 'breakfast';
    }
    if (/(?<=^|[^\p{L}\p{N}])(?:lunch)(?=[^\p{L}\p{N}]|$)/iu.test(clause)) {
      return 'lunch';
    }
    if (/(?<=^|[^\p{L}\p{N}])(?:snack)(?=[^\p{L}\p{N}]|$)/iu.test(clause)) {
      return 'snack';
    }
    if (/(?<=^|[^\p{L}\p{N}])(?:dinner|supper)(?=[^\p{L}\p{N}]|$)/iu.test(clause)) {
      return 'dinner';
    }
    return undefined;
  }
};
