import { normalizeFoodName } from './utils/parserUtils.js';
import type { DataSourceOrigin, RawIngredientItem } from './types.js';

export const SOURCE_PRIORITY: Record<DataSourceOrigin, number> = {
  SYSTEM: 1,
  ARGENFOODS: 2,
  SARA2: 3,
  TBCA: 4,
  OPENFOODFACTS: 5
};

/**
 * Resolves conflicts and deduplicates ingredients across multiple data sources.
 *
 * Enforces hierarchy:
 * SYSTEM > ARGENFOODS > SARA 2 > TBCA > Open Food Facts.
 *
 * - Items with barcode/EAN use a barcode-specific key to preserve distinct commercial items.
 * - Generic food items are grouped by normalized name (lowercased, accents removed, extra spaces collapsed).
 * - On collision, the item with the highest priority source is retained.
 */
export function resolveIngredients(items: RawIngredientItem[]): RawIngredientItem[] {
  const resolvedMap = new Map<string, RawIngredientItem>();

  for (const item of items) {
    const key = item.barcode
      ? `barcode:${item.barcode.trim()}`
      : `name:${normalizeFoodName(item.name)}`;

    const existing = resolvedMap.get(key);
    if (!existing) {
      resolvedMap.set(key, item);
    } else {
      const existingPriority = SOURCE_PRIORITY[existing.originSource] ?? 999;
      const itemPriority = SOURCE_PRIORITY[item.originSource] ?? 999;

      if (itemPriority < existingPriority) {
        resolvedMap.set(key, item);
      }
    }
  }

  return Array.from(resolvedMap.values()).sort((a, b) => a.id.localeCompare(b.id));
}
