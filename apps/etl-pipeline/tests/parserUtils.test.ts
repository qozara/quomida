import { describe, it, expect } from 'vitest';
import { parseFloatSafe, normalizeFoodName, generateDeterministicId } from '../src/utils/parserUtils.js';

describe('parserUtils [ETL-UTIL]', () => {
  describe('parseFloatSafe', () => {
    it('parses standard integer and float strings', () => {
      expect(parseFloatSafe('12')).toBe(12);
      expect(parseFloatSafe('12.5')).toBe(12.5);
      expect(parseFloatSafe(42.8)).toBe(42.8);
    });

    it('converts comma decimal separators to dots', () => {
      expect(parseFloatSafe('12,5')).toBe(12.5);
      expect(parseFloatSafe('0,75')).toBe(0.75);
    });

    it('handles trace markers by returning 0.0', () => {
      expect(parseFloatSafe('< 0.1')).toBe(0);
      expect(parseFloatSafe('<0.01')).toBe(0);
      expect(parseFloatSafe('Tr')).toBe(0);
      expect(parseFloatSafe('tr')).toBe(0);
      expect(parseFloatSafe('Traças')).toBe(0);
      expect(parseFloatSafe('Vestígios')).toBe(0);
    });

    it('handles dashes, empty values, null, and undefined by returning fallback (default 0)', () => {
      expect(parseFloatSafe('-')).toBe(0);
      expect(parseFloatSafe('--')).toBe(0);
      expect(parseFloatSafe('')).toBe(0);
      expect(parseFloatSafe('   ')).toBe(0);
      expect(parseFloatSafe(null)).toBe(0);
      expect(parseFloatSafe(undefined)).toBe(0);
      expect(parseFloatSafe('N/A')).toBe(0);
      expect(parseFloatSafe('invalid', 5)).toBe(5);
    });

    it('strips non-numeric characters and units', () => {
      expect(parseFloatSafe('15.4 g')).toBe(15.4);
      expect(parseFloatSafe(' 250 kcal ')).toBe(250);
      expect(parseFloatSafe('12,3 mg')).toBe(12.3);
    });
  });

  describe('normalizeFoodName', () => {
    it('lowercases strings', () => {
      expect(normalizeFoodName('MANZANA ROJA')).toBe('manzana roja');
    });

    it('strips accents and diacritics', () => {
      expect(normalizeFoodName('Vacío vacuno (crudo)')).toBe('vacio vacuno (crudo)');
      expect(normalizeFoodName('Café con Leche')).toBe('cafe con leche');
      expect(normalizeFoodName('Pão de queijo')).toBe('pao de queijo');
    });

    it('collapses extra spaces and trims', () => {
      expect(normalizeFoodName('  Arroz   blanco   ')).toBe('arroz blanco');
    });
  });

  describe('generateDeterministicId', () => {
    it('creates deterministic IDs using source prefix and MD5 hash', () => {
      const id1 = generateDeterministicId('argen', '01001');
      const id2 = generateDeterministicId('argen', '01001');
      expect(id1).toBe(id2);
      expect(id1.startsWith('ing-argen-')).toBe(true);
      expect(id1.length).toBe('ing-argen-'.length + 10);
    });

    it('produces different IDs for different inputs', () => {
      const id1 = generateDeterministicId('argen', '01001');
      const id2 = generateDeterministicId('argen', '01002');
      const id3 = generateDeterministicId('sara', '01001');
      expect(id1).not.toBe(id2);
      expect(id1).not.toBe(id3);
    });
  });
});
