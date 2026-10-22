# 27. Open Food Facts Catalog Reduction and Cross-Language Deduplication

Date: 2026-10-21

## Status

Accepted

## Context

Quomida provides a local-first offline SQLite food catalog (`catalog.sqlite.gz`) ingested from open datasets, primarily Open Food Facts (OFF) and national composition tables (USDA, Bedca, Argenfoods).

In earlier iterations, the uncompressed Open Food Facts catalog generated over 1.1 million SQLite rows and exceeded 120 MB compressed (`catalog.sqlite.gz`), leading to slow downloads over mobile networks, higher client storage footprints in OPFS/IndexedDB, and search result clutter from hundreds of duplicate package sizes (e.g. 30+ barcodes for identical Oreo biscuits) and multilingual duplicates across US, European, and Latin American regional exports.

Empirical profiling on a representative 250,000 raw OFF JSONL sample revealed:
1. **LatAm/Spain Underrepresentation in Export Products**: Export items sold across both Europe/US and Latin America (e.g., Spain, Mexico, Argentina) often list `en:france` or `en:united-states` first in `countries_tags`. Checking primary LatAm/Spain markets before US/EU tags increased matched LatAm/Spain products by +95.5%.
2. **Extreme Popularity Skew in US/EU Data**: 72.1% of US/EU-only records had 0 unique scans (`unique_scans_n == 0` or null), whereas only 4.1% had `unique_scans_n >= 5`.
3. **Data Quality Issues**: Numerous records contained unphysical macro totals (`calories > 900`, `P+C+F > 105g`, serving-level calories incorrectly entered into 100g fields), pet foods, or non-food items.
4. **Package Size Clutter & Inline Weights**: Product names frequently included raw package sizes (e.g., `"Galleta María Dorada 200g"`), creating redundant duplicate entries for each packaging variant.
5. **Webapp Schema Invariants**: The client engine (`RemoteCatalogService.ts`) expects fixed table definitions (`base_ingredients`, `base_ingredients_fts`, `portions`) and exact column ordering (`b.contentHash`, `portions.contentHash`).

## Decision

We implement a 4-stage build-time ETL reduction, normalization, and deduplication architecture in `apps/etl-pipeline`:

1. **Geographic Priority & Popularity Gate (`openfoodfacts.ts`)**:
   - `PRIMARY_COUNTRIES` (Latin America & Spain: Argentina, Brazil, Uruguay, Chile, Paraguay, Bolivia, Peru, Colombia, Venezuela, Mexico, Spain): 100% of valid foods are retained without any scan threshold (`minScans = 0`).
   - `SECONDARY_COUNTRIES` (US & EU: USA, UK, France, Germany, Italy): Kept only if `unique_scans_n > 5` (at least 6 scans, configurable via `OFF_US_EU_MIN_SCANS`).
   - LatAm/Spain tags take precedence when a product matches both primary and secondary country tags.
   - Dual nutrition schemas are supported (`nutriments` and `product.nutrition.aggregated_set.nutrients`), with fallback calculation `energy-kj_100g / 4.184` when `energy-kcal_100g` is missing.

2. **Nutritional & Category Quality Gate (`openfoodfacts.ts`, `sanitizer.ts`)**:
   - Reject non-food categories (`en:pet-food`, `en:non-food-products`).
   - Reject invalid macros: require `0 < calories <= 900`, `0 <= protein, carbs, fats <= 100`, `0 < (protein + carbs + fats) <= 105`.
   - Apply Atwater physical consistency check: `|calories - (4*P + 4*C + 9*F)| <= max(75, 0.35 * calories)`.
   - Sanitize portion sizes: require `0.5 <= servingQty <= 2500g` and round to 1 decimal place.

3. **Inline Weight Stripping & Brand Suffix Hygiene (`openfoodfacts.ts`)**:
   - Strip inline package quantities/weights (e.g., `500g`, `1.5L`, `6 x 330ml`, `12 oz`) from product names.
   - For branded items, append primary brand as a hyphenated suffix (e.g. `"Mayonesa - Danica"`), unless any comma-separated brand token (e.g., `"Oreo"` in `"Oreo, Mondelez"`) is already present inside the clean product name (`"Galletitas Oreo Rellenas"`).
   - Generic items remain unmodified without suffixes.

4. **Two-Pass Deduplication & Portion Merging (`SQLiteExporter.ts`)**:
   - **Leader Election Score**: Deterministic ranking based on LatAm/Spain priority (`+10000`), scan count (`min(unique_scans_n, 5000)`), completeness score, and modification timestamp.
   - **Pass 4A (Package Size Collapsing)**: Products sharing normalized `cleanName + brandTag + macroBucket` collapse into the winning leader barcode. Distinct valid portions from merged variants are re-pointed to the winning `base_food_id`.
   - **Pass 4B (Cross-Language Deduplication)**: Branded products sharing `brandTag + leafCategoryTag + tightMacroBucket` across languages (e.g. French `"Oréo Biscuit Cacaoté"` and Spanish `"Galletitas Oreo"`) collapse into the higher-ranking Spanish/LatAm leader.
   - Catalog SQLite database configured with `PRAGMA page_size = 4096` to maximize compression density.

## Consequences

### Positive
- **Drastic Payload Reduction**: Decreases `catalog.sqlite.gz` from 122.4 MB to ~9–11 MB (>90% reduction), enabling lightning-fast mobile downloads and instant OPFS hydration.
- **Maximized Regional Coverage**: Retains 100% of validated Latin American and Spanish products, while preserving the top ~50,000 most popular US/EU grocery items.
- **Superior Search Quality**: Eliminates duplicate packaging variants from search results while preserving all distinct portion weights under unified entries.
- **Cross-Language Cleanliness**: Prevents redundant international clones from bloating the catalog.
- **Zero Webapp Breaking Changes**: Full backwards compatibility with existing SQLite tables and client queries.

### Negative / Trade-offs
- Obscure, low-scan US/EU regional items (< 6 scans) are excluded from the prebuilt offline catalog.
- Build-time ETL requires two streaming/in-memory deduplication passes during SQLite export.
