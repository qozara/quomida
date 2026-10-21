import type { ParserLocalePack } from '../types.js';

export const esLocalePack: ParserLocalePack = {
  locale: 'es',

  numberWords: {
    un: 1,
    una: 1,
    uno: 1,
    par: 2,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
    medio: 0.5,
    media: 0.5
  },

  canonicalUnits: {
    unidad: 'unit',
    unidades: 'unit',
    pieza: 'unit',
    piezas: 'unit',
    porcion: 'porción',
    porciones: 'porción',
    'porción': 'porción',
    plato: 'plato',
    platos: 'plato',
    bol: 'bowl',
    cuenco: 'bowl',
    taza: 'taza',
    tazas: 'taza',
    vaso: 'vaso',
    vasos: 'vaso',
    rebanada: 'rebanada',
    rebanadas: 'rebanada',
    rodaja: 'rodaja',
    rodajas: 'rodaja',
    feta: 'feta',
    fetas: 'feta',
    cucharada: 'tbsp',
    cucharadas: 'tbsp',
    cucharadita: 'tsp',
    cucharaditas: 'tsp',
    g: 'g',
    gramo: 'g',
    gramos: 'g',
    oz: 'oz',
    ml: 'ml'
  },

  mealVerbsAndTimeRegex:
    /(?<=^|[^\p{L}\p{N}])(?:en la cena|en el almuerzo|en el desayuno|en la merienda|para la cena|para el almuerzo|para el desayuno|para la merienda|para cenar|para almorzar|para desayunar|para merendar|he comido|he cenado|he almorzado|he desayunado|desayun[eéó]|desayuno|almorc[eé]|almuerzo|cen[eé]|cena|merend[eé]|merienda|com[ií]|tom[eé]|beb[ií]|ayer|hoy)(?=[^\p{L}\p{N}]|$)/giu,

  delimiterRegex: /,\s*|\s+(?:y|e|\+|con)\s+/gi,

  inseparableCompounds: new Set([
    'cafe con leche',
    'café con leche',
    'arroz con leche',
    'dulce de leche',
    'te con limon',
    'té con limón',
    'te con leche',
    'té con leche',
    'mate con leche',
    'chile con carne',
    'chocolate con mani',
    'chocolate con maní',
    'arepas con queso',
    'arepa con queso',
    'panchos con queso',
    'pancho con queso',
    'gnocchis con papa',
    'gnocchi con papa',
    'tallarin con huevo',
    'tallarines con huevo',
    'mortadela con pistacho',
    'wrap con salvado',
    'tostadas con manteca',
    'tostada con manteca',
    'pan con manteca',
    'flan con dulce de leche'
  ]),

  stopWords: new Set([
    'de',
    'del',
    'la',
    'el',
    'los',
    'las',
    'un',
    'una',
    'uno',
    'y',
    'e',
    'con',
    'en',
    'para',
    'por',
    'al'
  ]),

  detectMealFromClause(clause: string): string | undefined {
    if (!clause) return undefined;
    if (/(?<=^|[^\p{L}\p{N}])(?:desayun[eéó]|desayuno)(?=[^\p{L}\p{N}]|$)/iu.test(clause)) {
      return 'breakfast';
    }
    if (/(?<=^|[^\p{L}\p{N}])(?:almorc[eé]|almuerzo)(?=[^\p{L}\p{N}]|$)/iu.test(clause)) {
      return 'lunch';
    }
    if (/(?<=^|[^\p{L}\p{N}])(?:merend[eé]|merienda|colaci[oó]n)(?=[^\p{L}\p{N}]|$)/iu.test(clause)) {
      return 'snack';
    }
    if (/(?<=^|[^\p{L}\p{N}])(?:cen[eéa]|cena)(?=[^\p{L}\p{N}]|$)/iu.test(clause)) {
      return 'dinner';
    }
    return undefined;
  }
};
