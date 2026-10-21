import { describe, it, expect } from 'vitest';
import { StandardMealParser } from '../src/parser/StandardMealParser.js';
import { esLocalePack } from '../src/parser/locales/es.js';
import { enLocalePack } from '../src/parser/locales/en.js';

describe('StandardMealParser (TDD)', () => {
  const parser = new StandardMealParser([esLocalePack, enLocalePack]);

  describe('Spanish Locale Parsing (es)', () => {
    it('parses single item with quantity, unit and meal verb: "cené 1 plato de locro"', () => {
      const result = parser.parse('cené 1 plato de locro', { locale: 'es' });
      expect(result.rawInput).toBe('cené 1 plato de locro');
      expect(result.detectedMealType).toBe('dinner');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].foodQuery.toLowerCase()).toBe('locro');
      expect(result.items[0].quantity).toBe(1);
      expect(result.items[0].unit).toBe('plato');
      expect(result.items[0].mealType).toBe('dinner');
    });

    it('parses number words and singularizes or normalizes: "dos empanadas de carne"', () => {
      const result = parser.parse('dos empanadas de carne', { locale: 'es' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].foodQuery.toLowerCase()).toBe('empanadas de carne');
      expect(result.items[0].quantity).toBe(2);
      expect(result.items[0].unit).toBe('unit');
    });

    it('parses fractions like "media manzana"', () => {
      const result = parser.parse('media manzana', { locale: 'es' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].foodQuery.toLowerCase()).toBe('manzana');
      expect(result.items[0].quantity).toBe(0.5);
      expect(result.items[0].unit).toBe('unit');
    });

    it('parses decimals like "1.5 tazas de arroz"', () => {
      const result = parser.parse('1.5 tazas de arroz', { locale: 'es' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].foodQuery.toLowerCase()).toBe('arroz');
      expect(result.items[0].quantity).toBe(1.5);
      expect(result.items[0].unit).toBe('taza');
    });

    it('decomposes composite dish joined by "con" into distinct items: "milanesa con puré de papas"', () => {
      const result = parser.parse('milanesa con puré de papas', { locale: 'es' });
      expect(result.isCompositeDish).toBe(true);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].foodQuery.toLowerCase()).toBe('milanesa');
      expect(result.items[1].foodQuery.toLowerCase()).toBe('puré de papas');
    });

    it('protects inseparable compounds: "desayuné café con leche y 2 medialunas"', () => {
      const result = parser.parse('desayuné café con leche y 2 medialunas', { locale: 'es' });
      expect(result.detectedMealType).toBe('breakfast');
      expect(result.items).toHaveLength(2);
      expect(result.items[0].foodQuery.toLowerCase()).toContain('café con leche');
      expect(result.items[0].quantity).toBe(1);
      expect(result.items[1].foodQuery.toLowerCase()).toBe('medialunas');
      expect(result.items[1].quantity).toBe(2);
    });

    it('handles multi-meal sentences: "almorcé ensalada y cené queso"', () => {
      const result = parser.parse('almorcé ensalada y cené queso', { locale: 'es' });
      expect(result.items).toHaveLength(2);
      expect(result.items[0].foodQuery.toLowerCase()).toBe('ensalada');
      expect(result.items[0].mealType).toBe('lunch');
      expect(result.items[1].foodQuery.toLowerCase()).toBe('queso');
      expect(result.items[1].mealType).toBe('dinner');
    });
  });

  describe('English Locale Parsing (en)', () => {
    it('parses single item with quantity, unit and meal verb: "I had 2 eggs for breakfast"', () => {
      const result = parser.parse('I had 2 eggs for breakfast', { locale: 'en' });
      expect(result.detectedMealType).toBe('breakfast');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].foodQuery.toLowerCase()).toBe('eggs');
      expect(result.items[0].quantity).toBe(2);
      expect(result.items[0].mealType).toBe('breakfast');
    });

    it('decomposes composite dish joined by "with": "burger with fries for lunch"', () => {
      const result = parser.parse('burger with fries for lunch', { locale: 'en' });
      expect(result.detectedMealType).toBe('lunch');
      expect(result.isCompositeDish).toBe(true);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].foodQuery.toLowerCase()).toBe('burger');
      expect(result.items[1].foodQuery.toLowerCase()).toBe('fries');
    });

    it('protects inseparable English compounds: "mac and cheese and an apple"', () => {
      const result = parser.parse('mac and cheese and an apple', { locale: 'en' });
      expect(result.items).toHaveLength(2);
      expect(result.items[0].foodQuery.toLowerCase()).toBe('mac and cheese');
      expect(result.items[1].foodQuery.toLowerCase()).toBe('apple');
      expect(result.items[1].quantity).toBe(1);
    });

    it('handles fractions like "half an apple"', () => {
      const result = parser.parse('half an apple', { locale: 'en' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].foodQuery.toLowerCase()).toBe('apple');
      expect(result.items[0].quantity).toBe(0.5);
    });
  });

  describe('Edge Cases and Locale Fallbacks', () => {
    it('returns empty items for empty or blank input', () => {
      const empty = parser.parse('   ', { locale: 'es' });
      expect(empty.items).toHaveLength(0);
      expect(empty.rawInput).toBe('   ');
    });

    it('gracefully handles English input when locale is set to "es" (heuristic detection)', () => {
      const result = parser.parse('2 slices of pizza for dinner', { locale: 'es' });
      expect(result.detectedMealType).toBe('dinner');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].foodQuery.toLowerCase()).toBe('pizza');
      expect(result.items[0].quantity).toBe(2);
      expect(result.items[0].unit).toBe('slice');
    });

    it('gracefully handles Spanish input when locale is set to "en" (heuristic detection)', () => {
      const result = parser.parse('1 plato de fideos para el almuerzo', { locale: 'en' });
      expect(result.detectedMealType).toBe('lunch');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].foodQuery.toLowerCase()).toBe('fideos');
      expect(result.items[0].quantity).toBe(1);
      expect(result.items[0].unit).toBe('plato');
    });
  });
});
