# Catalog Localization, Aliases & Modular Multi-Language Guide

## 1. Architectural Philosophy: Decoupled Parsing vs. Resolution

Quomida enforces a strict architectural boundary between **Linguistic Syntax Parsing** and **Catalog Resolution**:

```
┌────────────────────────────────────────────────────────┐
│ 1. Linguistic Syntax Parsing (StandardMealParser)      │  <-- Language-Aware
│ Converts raw speech/text into clean tokens:            │
│ "cené 1 plato de locro" -> food: "locro", qty: 1, ...  │
└──────────────────────────┬─────────────────────────────┘
                           │ clean foodQuery token
┌──────────────────────────▼─────────────────────────────┐
│ 2. Catalog Resolution Layer (CatalogSearchManager)     │  <-- Catalog/Data-Aware
│ Matches "locro" or "rice" to database rows regardless   │
│ of whether the catalog is English, Spanish, or mixed   │
└────────────────────────────────────────────────────────┘
```

By decoupling these two stages:
- **Adding new spoken languages** (e.g., Portuguese, French, Italian) requires only adding a lightweight grammar pack to the parser.
- **Normalizing, translating, or migrating catalog databases** (e.g., adding multi-language aliases in SQLite or IndexedDB) requires changes only in the catalog search layer, leaving the query parser completely untouched.

---

## 2. Managing Today's Mixed-Language Catalogs

Today, Quomida's catalog contains entries from multiple regional sources:
- **USDA FoodData Central**: English taxonomy (e.g., *"Rice, white, cooked"*, *"Chicken breast"*).
- **Argenfoods / BEDCA**: Spanish regional taxonomy (e.g., *"Arroz blanco cocido"*, *"Pechuga de pollo"*).

To seamlessly resolve queries across both languages without requiring user intervention:
1. **Diacritic & Token Normalization**: `normalizeFoodName()` strips Unicode accents (`puré` -> `pure`, `maíz` -> `maiz`) and lowercases all tokens.
2. **Grammar Stemming & Singularization**: `singularizeWord()` collapses plural forms in both Spanish (`empanadas` -> `empanada`) and English (`apples` -> `apple`).
3. **Cross-Language Search Aliases**: In `LlmRecipeDecomposer`, base ingredients include an optional `search_alias` (e.g., `food_name: "maíz blanco"`, `search_alias: "white corn"`), ensuring that even if the active local database only contains USDA English records, regional recipes resolve cleanly.

---

## 3. Future Catalog Schema Upgrade Path: First-Class Aliases

When normalizing future catalog databases to support first-class multilingual aliases, follow this blueprint:

### 3.1. SQLite / IndexedDB Schema Extension
Add an `aliases` or `names_i18n` column to the base ingredients table:

```sql
-- Future SQLite catalog schema addition
ALTER TABLE base_ingredients ADD COLUMN aliases TEXT; -- JSON array: '["rice", "arroz", "riz"]'
-- Or structured localization:
ALTER TABLE base_ingredients ADD COLUMN names_i18n TEXT; -- JSON object: '{"en": "White rice", "es": "Arroz blanco"}'
CREATE INDEX idx_ingredients_aliases ON base_ingredients(aliases);
```

### 3.2. ETL Pipeline Ingestion
During the build-time ETL pipeline (`apps/etl-pipeline`):
- Join datasets using international FAO INFOODS tagnames or FoodEx2 codes.
- Populate the `aliases` column with known synonyms in English, Spanish, Portuguese, and Latin binomial names.

### 3.3. Catalog Search Manager Query Pattern
In `packages/domain-core/src/catalog/CatalogSearchManager.ts`:
Extend the query resolution logic:

```typescript
// Query searches canonical name AND the aliases array
const query = `
  SELECT * FROM base_ingredients
  WHERE name LIKE :term
     OR aliases LIKE :termJson
  LIMIT :limit
`;
```

Because `StandardMealParser` emits only the clean search term (e.g. `"arroz"` or `"rice"`), **zero modifications are needed in the parser when the catalog schema is updated.**

---

## 4. Contributor Guide: Adding a New Spoken Language

To add support for a new language (e.g., Portuguese `pt` or French `fr`) to the offline parser:

### Step 1: Implement `ParserLocalePack`
Create a new file in `packages/domain-core/src/parser/locales/<locale>.ts`:

```typescript
import type { ParserLocalePack } from '../types.js';

export const ptLocalePack: ParserLocalePack = {
  locale: 'pt',

  numberWords: {
    um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
    meio: 0.5, meia: 0.5
  },

  canonicalUnits: {
    unidade: 'unit', unidades: 'unit', prato: 'plato', pratos: 'plato',
    xicara: 'cup', xicaras: 'cup', colher: 'tbsp', g: 'g', ml: 'ml'
  },

  mealVerbsAndTimeRegex:
    /(?<=^|[^\p{L}\p{N}])(?:no almoco|no jantar|no cafe da manha|almoc[eé]|jant[eé]|comi|bebi)(?=[^\p{L}\p{N}]|$)/giu,

  delimiterRegex: /,\s*|\s+(?:e|\+|com)\s+/gi,

  inseparableCompounds: new Set([
    'cafe com leite',
    'arroz com feijao',
    'pao de queijo'
  ]),

  stopWords: new Set(['de', 'do', 'da', 'os', 'as', 'um', 'uma', 'e', 'com', 'no', 'na', 'para']),

  detectMealFromClause(clause: string): string | undefined {
    if (!clause) return undefined;
    if (/cafe da manha|desjejum/i.test(clause)) return 'breakfast';
    if (/almoc[oe]/i.test(clause)) return 'lunch';
    if (/jantar|ceia/i.test(clause)) return 'dinner';
    if (/lanche/i.test(clause)) return 'snack';
    return undefined;
  }
};
```

### Step 2: Register in `StandardMealParser`
In `packages/domain-core/src/parser/StandardMealParser.ts`:
- Import `ptLocalePack`.
- Pass it into the default constructor array: `[esLocalePack, enLocalePack, ptLocalePack]`.

### Step 3: Add Dictionary Keys
In `packages/i18n-locales/locales/`:
- Create `pt.json` with matching keys for app UI strings.

### Step 4: Write Unit Tests
In `packages/domain-core/tests/standard-meal-parser.test.ts`:
- Add test cases verifying Portuguese parsing with `{ locale: 'pt' }`.
