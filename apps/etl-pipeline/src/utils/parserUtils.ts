import crypto from 'crypto';

/**
 * Safely parses string or numeric input into a finite float.
 * Handles comma-separated decimals, trace markers ('< 0.1', 'Tr', 'Vestígios'),
 * and strips extraneous measurement units.
 */
export function parseFloatSafe(val: unknown, fallback: number = 0): number {
  if (val === null || val === undefined) {
    return fallback;
  }

  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : fallback;
  }

  const str = String(val).trim();
  if (!str || str === '-' || str === '--') {
    return fallback;
  }

  // Detect trace values like '< 0.1', 'Tr', 'Traças', 'Vestígios'
  if (/^<\s*[\d,.]+/i.test(str) || /^(tr|traças|vestigios|vestígios)$/i.test(str)) {
    return 0;
  }

  // Replace comma with dot
  const normalizedStr = str.replace(',', '.');

  // Extract numeric portion (optional sign, digits, optional decimal, optional exponent)
  const match = normalizedStr.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  if (!match) {
    return fallback;
  }

  const parsed = parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Normalizes a food name for deduplication and matching:
 * - Converts to lowercase
 * - Strips diacritics / accents (NFD decomposition)
 * - Collapses consecutive whitespace into a single space
 * - Trims leading and trailing whitespace
 */
export function normalizeFoodName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generates a deterministic ingredient identifier using a source prefix
 * and a 10-character MD5 hash of the original item identifier or raw name.
 * Format: 'ing-<sourcePrefix>-<hash>'
 */
export function generateDeterministicId(sourcePrefix: string, originalIdOrName: string): string {
  const prefix = sourcePrefix.toLowerCase().trim();
  const rawKey = originalIdOrName.trim();
  const hash = crypto.createHash('md5').update(rawKey, 'utf8').digest('hex').substring(0, 10);
  return `ing-${prefix}-${hash}`;
}
