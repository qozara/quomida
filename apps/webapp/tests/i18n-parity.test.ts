import { describe, it, expect } from 'vitest';
import { en, es } from '@quomida/i18n-locales';

function getObjectKeyPaths(obj: Record<string, any>, prefix = ''): string[] {
  let keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys = keys.concat(getObjectKeyPaths(v, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

describe('i18n Key Parity (en vs es)', () => {
  it('has identical keys in English and Spanish dictionaries', () => {
    const enKeys = getObjectKeyPaths(en).sort();
    const esKeys = getObjectKeyPaths(es).sort();

    const missingInEs = enKeys.filter(k => !esKeys.includes(k));
    const missingInEn = esKeys.filter(k => !enKeys.includes(k));

    expect(missingInEs, 'Keys present in EN but missing in ES').toEqual([]);
    expect(missingInEn, 'Keys present in ES but missing in EN').toEqual([]);
    expect(enKeys).toEqual(esKeys);
  });
});
