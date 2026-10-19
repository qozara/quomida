import { describe, it, expect } from 'vitest';
import {
  RecipeManager,
  type Recipe,
  type RecipeComponent,
  type RecipeEquivalenceOptions,
  type NutrientDensity
} from '../src/index.js';

describe('Recipe Deduplication & Nutritional Equivalence Engine (ADR 0022)', () => {
  const manager = new RecipeManager();

  describe('extractCanonicalTokens', () => {
    it('normalizes accents, lowercases, and removes punctuation', () => {
      const tokens = manager.extractCanonicalTokens('¡Puré de Papás con Limón!');
      expect(tokens).toEqual(['limon', 'papa', 'pure']);
    });

    it('filters out Spanish and English culinary stop words', () => {
      const tokens = manager.extractCanonicalTokens(
        'ensalada de tomate con lechuga y un toque de aceite al horno para dos'
      );
      // Stop words: de, con, y, un, al, para
      // Notice: "aceite", "ensalada", "horno", "lechuga", "tomate", "toque"
      expect(tokens).not.toContain('de');
      expect(tokens).not.toContain('con');
      expect(tokens).not.toContain('y');
      expect(tokens).not.toContain('un');
      expect(tokens).not.toContain('al');
      expect(tokens).not.toContain('para');
      expect(tokens).toContain('ensalada');
      expect(tokens).toContain('lechuga');
      expect(tokens).toContain('aceite');
    });

    it('singularizes plurals ending in s after vowel or es after consonant', () => {
      expect(manager.extractCanonicalTokens('papas')).toEqual(['papa']);
      expect(manager.extractCanonicalTokens('milanesas')).toEqual(['milanesa']);
      expect(manager.extractCanonicalTokens('empanadas')).toEqual(['empanada']);
      expect(manager.extractCanonicalTokens('huevos')).toEqual(['huevo']);
      expect(manager.extractCanonicalTokens('frijoles')).toEqual(['frijol']);
      expect(manager.extractCanonicalTokens('panes')).toEqual(['pan']);
      expect(manager.extractCanonicalTokens('limones')).toEqual(['limon']);
    });

    it('singularizes English plurals (consonant+s, -ies, -oes, -ches/-shes, silent-e+s)', () => {
      expect(manager.extractCanonicalTokens('eggs')).toEqual(['egg']);
      expect(manager.extractCanonicalTokens('burgers')).toEqual(['burger']);
      expect(manager.extractCanonicalTokens('carrots')).toEqual(['carrot']);
      expect(manager.extractCanonicalTokens('apples')).toEqual(['apple']);
      expect(manager.extractCanonicalTokens('oranges')).toEqual(['orange']);
      expect(manager.extractCanonicalTokens('cheeses')).toEqual(['cheese']);
      expect(manager.extractCanonicalTokens('blackberries')).toEqual(['blackberry']);
      expect(manager.extractCanonicalTokens('strawberries')).toEqual(['strawberry']);
      expect(manager.extractCanonicalTokens('potatoes')).toEqual(['potato']);
      expect(manager.extractCanonicalTokens('tomatoes')).toEqual(['tomato']);
      expect(manager.extractCanonicalTokens('sandwiches')).toEqual(['sandwich']);
      expect(manager.extractCanonicalTokens('cookies')).toEqual(['cookie']);
    });

    it('handles empty, null, or punctuation-only strings gracefully', () => {
      expect(manager.extractCanonicalTokens('')).toEqual([]);
      expect(manager.extractCanonicalTokens('   ')).toEqual([]);
      expect(manager.extractCanonicalTokens('... - , !?')).toEqual([]);
    });

    it('returns unique, sorted tokens', () => {
      const tokens = manager.extractCanonicalTokens('papa con puré de papas y papas');
      expect(tokens).toEqual(['papa', 'pure']);
    });
  });

  describe('computeTokenSimilarity', () => {
    it('returns 1.0 for identically phrased recipes or normalized equivalents', () => {
      const sim = manager.computeTokenSimilarity(
        'Milanesa con puré de papas',
        'Milanesas con pure de papa'
      );
      expect(sim).toBe(1.0);
    });

    it('computes correct Jaccard similarity across partial overlap', () => {
      // nameA: "milanesa", "pure" (2 tokens)
      // nameB: "milanesa", "papa", "pure" (3 tokens)
      // Intersection = 2, Union = 3 => 2/3 ≈ 0.667
      const sim = manager.computeTokenSimilarity(
        'Milanesa con puré',
        'Milanesa con puré de papas'
      );
      expect(sim).toBeCloseTo(2 / 3, 3);
    });

    it('returns 0 for completely disjoint food names', () => {
      const sim = manager.computeTokenSimilarity('Café con leche', 'Sopa de verduras');
      expect(sim).toBe(0);
    });

    it('returns 0 when either or both names have no valid tokens', () => {
      expect(manager.computeTokenSimilarity('', '')).toBe(0);
      expect(manager.computeTokenSimilarity('con de y', 'de al')).toBe(0);
    });
  });

  describe('computeComponentJaccard', () => {
    it('returns 1.0 when component food_id sets are identical regardless of order', () => {
      const a: RecipeComponent[] = [
        { food_id: 'ing-1', name: 'A', weight_g: 100, calories_100g: 100, protein_100g: 10, carbs_100g: 10, fats_100g: 5 },
        { food_id: 'ing-2', name: 'B', weight_g: 50, calories_100g: 50, protein_100g: 5, carbs_100g: 5, fats_100g: 2 }
      ];
      const b: RecipeComponent[] = [
        { food_id: 'ing-2', name: 'B', weight_g: 60, calories_100g: 50, protein_100g: 5, carbs_100g: 5, fats_100g: 2 },
        { food_id: 'ing-1', name: 'A', weight_g: 120, calories_100g: 100, protein_100g: 10, carbs_100g: 10, fats_100g: 5 }
      ];
      expect(manager.computeComponentJaccard(a, b)).toBe(1.0);
    });

    it('computes accurate set overlap ratio', () => {
      const makeComp = (id: string): RecipeComponent => ({
        food_id: id,
        name: id,
        weight_g: 100,
        calories_100g: 100,
        protein_100g: 10,
        carbs_100g: 10,
        fats_100g: 2
      });

      const a = [makeComp('1'), makeComp('2'), makeComp('3'), makeComp('4'), makeComp('5')];
      const b = [makeComp('1'), makeComp('2'), makeComp('3'), makeComp('4')];
      // Intersection = 4, Union = 5 => 4/5 = 0.8
      expect(manager.computeComponentJaccard(a, b)).toBe(0.8);
    });

    it('returns 0 when components are completely disjoint or empty', () => {
      const makeComp = (id: string): RecipeComponent => ({
        food_id: id,
        name: id,
        weight_g: 100,
        calories_100g: 100,
        protein_100g: 10,
        carbs_100g: 10,
        fats_100g: 2
      });
      expect(manager.computeComponentJaccard([], [])).toBe(0);
      expect(manager.computeComponentJaccard([makeComp('1')], [makeComp('2')])).toBe(0);
    });
  });

  describe('isNutritionallyEquivalent', () => {
    it('returns true when calories and macros are within default tolerances (8% kcal, 10g L1)', () => {
      const a: NutrientDensity = {
        calories_100g: 200,
        protein_100g: 20,
        carbs_100g: 20,
        fats_100g: 5
      };
      // 210 kcal is 5% delta (<= 8%)
      // delta P: 2, C: 2, F: 1 => L1 sum = 5g (<= 10g)
      const b: NutrientDensity = {
        calories_100g: 210,
        protein_100g: 22,
        carbs_100g: 18,
        fats_100g: 6
      };
      expect(manager.isNutritionallyEquivalent(a, b)).toBe(true);
    });

    it('returns false when calorie delta exceeds tolerance ratio', () => {
      const a: NutrientDensity = {
        calories_100g: 200,
        protein_100g: 20,
        carbs_100g: 20,
        fats_100g: 5
      };
      // 225 kcal is 12.5% delta (> 8%)
      const b: NutrientDensity = {
        calories_100g: 225,
        protein_100g: 21,
        carbs_100g: 21,
        fats_100g: 5
      };
      expect(manager.isNutritionallyEquivalent(a, b)).toBe(false);
    });

    it('returns false when macro L1 delta exceeds 10g tolerance', () => {
      const a: NutrientDensity = {
        calories_100g: 200,
        protein_100g: 25,
        carbs_100g: 10,
        fats_100g: 5
      };
      // Calories identical, but delta P: 6, C: 6, F: 0 => L1 sum = 12g (> 10g)
      const b: NutrientDensity = {
        calories_100g: 200,
        protein_100g: 19,
        carbs_100g: 16,
        fats_100g: 5
      };
      expect(manager.isNutritionallyEquivalent(a, b)).toBe(false);
    });

    it('respects custom equivalence options', () => {
      const a: NutrientDensity = {
        calories_100g: 200,
        protein_100g: 20,
        carbs_100g: 20,
        fats_100g: 5
      };
      const b: NutrientDensity = {
        calories_100g: 230, // 15% delta
        protein_100g: 26,
        carbs_100g: 26,
        fats_100g: 5 // L1 = 12g
      };

      expect(manager.isNutritionallyEquivalent(a, b)).toBe(false);
      expect(manager.isNutritionallyEquivalent(a, b, {
        calorieToleranceRatio: 0.20,
        macroDeltaToleranceG: 15
      })).toBe(true);
    });
  });

  describe('findEquivalentRecipe', () => {
    const compMilanesa: RecipeComponent = {
      food_id: 'ing-milanesa',
      name: 'Milanesa de Carne',
      weight_g: 150,
      calories_100g: 215,
      protein_100g: 15,
      carbs_100g: 18,
      fats_100g: 10
    };

    const compPure: RecipeComponent = {
      food_id: 'ing-pure',
      name: 'Puré de Papas',
      weight_g: 150,
      calories_100g: 85,
      protein_100g: 2,
      carbs_100g: 15,
      fats_100g: 1.5
    };

    const existingMilanesaPure: Recipe = {
      id: 'rec-milanesa-pure-saved',
      name: 'Milanesa con puré de papas',
      ingredients: [compMilanesa, compPure],
      yield_factor: 1.0,
      updatedAt: 1000
    };

    it('matches when canonical token arrays are identical (tokenSim === 1.0)', () => {
      const candidate: Recipe = {
        id: 'rec-new-temp',
        name: 'Milanesas con pure de papa', // singular vs plural, no accents
        ingredients: [compMilanesa, compPure],
        yield_factor: 1.0
      };

      const match = manager.findEquivalentRecipe(candidate, [existingMilanesaPure]);
      expect(match).not.toBeNull();
      expect(match?.id).toBe('rec-milanesa-pure-saved');
    });

    it('matches when component Jaccard >= 0.80 and nutritionally equivalent', () => {
      // Name is completely different ("Plato clásico de la casa"), but same ingredients
      const candidate: Recipe = {
        id: 'rec-new-temp',
        name: 'Plato clásico de la casa',
        ingredients: [compMilanesa, compPure],
        yield_factor: 1.0
      };

      const match = manager.findEquivalentRecipe(candidate, [existingMilanesaPure]);
      expect(match).not.toBeNull();
      expect(match?.id).toBe('rec-milanesa-pure-saved');
    });

    it('matches when token similarity >= 0.75 and nutritionally equivalent', () => {
      // 4 tokens: "arroz", "pechuga", "plancha", "pollo"
      // vs 3 tokens: "arroz", "plancha", "pollo"
      // Jaccard = 3/4 = 0.75
      const compPollo: RecipeComponent = {
        food_id: 'ing-pollo-a',
        name: 'Pollo',
        weight_g: 150,
        calories_100g: 165,
        protein_100g: 31,
        carbs_100g: 0,
        fats_100g: 3.6
      };
      const compArroz: RecipeComponent = {
        food_id: 'ing-arroz-a',
        name: 'Arroz',
        weight_g: 150,
        calories_100g: 130,
        protein_100g: 2.7,
        carbs_100g: 28,
        fats_100g: 0.3
      };

      const existingPolloArroz: Recipe = {
        id: 'rec-pollo-arroz',
        name: 'Pollo a la plancha con arroz',
        ingredients: [compPollo, compArroz],
        yield_factor: 1.0
      };

      // Candidate has different food_id for chicken (e.g. ing-pollo-b) so component Jaccard is 0.5 (< 0.8),
      // but token sim is 0.75 and nutrition is identical!
      const compPolloB: RecipeComponent = {
        ...compPollo,
        food_id: 'ing-pollo-b'
      };

      const candidate: Recipe = {
        id: 'rec-cand-pechuga',
        name: 'Pechuga de pollo a la plancha con arroz',
        ingredients: [compPolloB, compArroz],
        yield_factor: 1.0
      };

      const match = manager.findEquivalentRecipe(candidate, [existingPolloArroz]);
      expect(match).not.toBeNull();
      expect(match?.id).toBe('rec-pollo-arroz');
    });

    it('ignores deleted recipes (_deleted: true)', () => {
      const deletedRecipe: Recipe = {
        ...existingMilanesaPure,
        id: 'rec-deleted',
        // @ts-expect-error RxDB soft delete field
        _deleted: true
      };

      const candidate: Recipe = {
        id: 'rec-new-temp',
        name: 'Milanesa con puré de papas',
        ingredients: [compMilanesa, compPure],
        yield_factor: 1.0
      };

      const match = manager.findEquivalentRecipe(candidate, [deletedRecipe]);
      expect(match).toBeNull();
    });

    it('returns null when neither token similarity nor component overlap match', () => {
      const candidate: Recipe = {
        id: 'rec-new-temp',
        name: 'Guiso de lentejas',
        ingredients: [
          {
            food_id: 'ing-lentejas',
            name: 'Lentejas',
            weight_g: 200,
            calories_100g: 116,
            protein_100g: 9,
            carbs_100g: 20,
            fats_100g: 0.4
          }
        ],
        yield_factor: 1.0
      };

      const match = manager.findEquivalentRecipe(candidate, [existingMilanesaPure]);
      expect(match).toBeNull();
    });

    it('returns null when component overlap is high but nutrition is completely different', () => {
      const heavyOilComp: RecipeComponent = {
        ...compPure,
        calories_100g: 500, // Very heavy calories
        fats_100g: 45
      };

      const candidate: Recipe = {
        id: 'rec-new-temp',
        name: 'Plato desconocido',
        ingredients: [compMilanesa, heavyOilComp],
        yield_factor: 1.0
      };

      const match = manager.findEquivalentRecipe(candidate, [existingMilanesaPure]);
      expect(match).toBeNull();
    });
  });
});
