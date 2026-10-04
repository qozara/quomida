import type { TabularRow } from './types.js';

export interface CollectionSerializer {
  headers: string[];
  docToRow(doc: Record<string, any>): TabularRow;
  rowToDoc(row: TabularRow): Record<string, any>;
}

export function createFieldGetter(row: TabularRow) {
  const headers = row.headers;
  const v = row.values;

  if (headers && headers.length > 0) {
    const map = new Map<string, number>();
    for (let i = 0; i < headers.length; i++) {
      const h = String(headers[i] ?? '').trim().toLowerCase();
      if (h && !map.has(h)) {
        map.set(h, i);
      }
    }
    return (colName: string, _fallbackIndex: number) => {
      const target = colName.trim().toLowerCase();
      const idx = map.get(target);
      return idx !== undefined ? v[idx] : undefined;
    };
  }

  return (_colName: string, fallbackIndex: number) => {
    return v[fallbackIndex];
  };
}

export const parseBool = (val: any) => {
  if (typeof val === 'string') return val.toLowerCase() === 'true';
  return Boolean(val);
};

export const parseNumber = (val: any, fallback: number = 0): number => {
  if (val === null || val === undefined || val === '') return fallback;
  const n = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const escapeFormulaInjection = (val: any): any => {
  if (typeof val !== 'string') return val;
  if (/^[=+\-@\t\r]/.test(val)) {
    return `'${val}`;
  }
  return val;
};

export const sanitizeString = (val: any, fallback: string = ''): string => {
  if (val === null || val === undefined) return fallback;
  let str = String(val);
  if (str.startsWith("'") && /^[=+\-@\t\r]/.test(str.slice(1))) {
    str = str.slice(1);
  }
  // Strip raw HTML / script tags
  return str.replace(/<[^>]*>/g, '').trim();
};

export const dailyLogsSerializer: CollectionSerializer = {
  headers: [
    'id',
    'timestamp',
    'date',
    'meal_type',
    'food_reference_id',
    'food_name',
    'quantity',
    'portion_name',
    'calories',
    'protein',
    'carbs',
    'fats',
    'food_details_readonly',
    'updatedAt',
    '_deleted'
  ],
  docToRow(doc: Record<string, any>): TabularRow {
    const macros = doc.macros || { calories: 0, protein: 0, carbs: 0, fats: 0 };
    const foodName = doc.food_name || 'Alimento';
    const denormalized = `${foodName} | ${macros.calories ?? 0}kcal | ${macros.protein ?? 0}g P, ${macros.carbs ?? 0}g C, ${macros.fats ?? 0}g F`;

    return {
      id: doc.id,
      updatedAt: doc.updatedAt,
      _deleted: doc._deleted,
      values: [
        escapeFormulaInjection(doc.id),
        doc.timestamp,
        doc.date,
        doc.meal_type,
        doc.food_reference_id,
        escapeFormulaInjection(doc.food_name ?? ''),
        parseNumber(doc.quantity, 0),
        escapeFormulaInjection(doc.portion_name ?? ''),
        parseNumber(macros.calories, 0),
        parseNumber(macros.protein, 0),
        parseNumber(macros.carbs, 0),
        parseNumber(macros.fats, 0),
        escapeFormulaInjection(denormalized),
        doc.updatedAt ?? Date.now(),
        Boolean(doc._deleted)
      ]
    };
  },
  rowToDoc(row: TabularRow): Record<string, any> {
    const getField = createFieldGetter(row);
    const idVal = getField('id', 0);
    const timestampVal = getField('timestamp', 1);
    const dateVal = getField('date', 2);
    const mealTypeVal = getField('meal_type', 3);
    const foodRefIdVal = getField('food_reference_id', 4);
    const foodNameVal = getField('food_name', 5);
    const quantityVal = getField('quantity', 6);
    const portionNameVal = getField('portion_name', 7);
    const caloriesVal = getField('calories', 8);
    const proteinVal = getField('protein', 9);
    const carbsVal = getField('carbs', 10);
    const fatsVal = getField('fats', 11);
    const updatedAtVal = getField('updatedAt', 13);
    const deletedVal = getField('_deleted', 14);

    const doc: Record<string, any> = {
      id: sanitizeString(idVal || row.id),
      timestamp: String(timestampVal || ''),
      date: String(dateVal || ''),
      meal_type: String(mealTypeVal || 'meal_lunch'),
      food_reference_id: sanitizeString(foodRefIdVal || ''),
      quantity: parseNumber(quantityVal, 0),
      portion_name: sanitizeString(portionNameVal || ''),
      macros: {
        calories: parseNumber(caloriesVal, 0),
        protein: parseNumber(proteinVal, 0),
        carbs: parseNumber(carbsVal, 0),
        fats: parseNumber(fatsVal, 0)
      }
    };
    if (foodNameVal !== undefined && foodNameVal !== null) {
      doc.food_name = sanitizeString(foodNameVal);
    }
    if (updatedAtVal !== undefined && updatedAtVal !== null && updatedAtVal !== '') {
      doc.updatedAt = Number(updatedAtVal);
    } else if (row.updatedAt) {
      doc.updatedAt = row.updatedAt;
    }
    if (deletedVal !== undefined && deletedVal !== null && deletedVal !== '') {
      doc._deleted = parseBool(deletedVal);
    }
    return doc;
  }
};

export const baseIngredientsSerializer: CollectionSerializer = {
  headers: [
    'id',
    'name',
    'source',
    'lang',
    'calories_100g',
    'protein_100g',
    'carbs_100g',
    'fats_100g',
    'updatedAt',
    '_deleted'
  ],
  docToRow(doc: Record<string, any>): TabularRow {
    return {
      id: doc.id,
      updatedAt: doc.updatedAt,
      _deleted: doc._deleted,
      values: [
        escapeFormulaInjection(doc.id),
        escapeFormulaInjection(doc.name),
        doc.source,
        doc.lang,
        parseNumber(doc.calories_100g, 0),
        parseNumber(doc.protein_100g, 0),
        parseNumber(doc.carbs_100g, 0),
        parseNumber(doc.fats_100g, 0),
        doc.updatedAt ?? Date.now(),
        Boolean(doc._deleted)
      ]
    };
  },
  rowToDoc(row: TabularRow): Record<string, any> {
    const getField = createFieldGetter(row);
    const idVal = getField('id', 0);
    const nameVal = getField('name', 1);
    const sourceVal = getField('source', 2);
    const langVal = getField('lang', 3);
    const caloriesVal = getField('calories_100g', 4);
    const proteinVal = getField('protein_100g', 5);
    const carbsVal = getField('carbs_100g', 6);
    const fatsVal = getField('fats_100g', 7);
    const updatedAtVal = getField('updatedAt', 8);
    const deletedVal = getField('_deleted', 9);

    return {
      id: sanitizeString(idVal || row.id),
      name: sanitizeString(nameVal || ''),
      source: String(sourceVal || 'custom'),
      lang: String(langVal || 'en'),
      calories_100g: parseNumber(caloriesVal, 0),
      protein_100g: parseNumber(proteinVal, 0),
      carbs_100g: parseNumber(carbsVal, 0),
      fats_100g: parseNumber(fatsVal, 0),
      updatedAt: updatedAtVal !== undefined && updatedAtVal !== '' ? Number(updatedAtVal) : row.updatedAt,
      _deleted: parseBool(deletedVal ?? row._deleted)
    };
  }
};

export const recipesSerializer: CollectionSerializer = {
  headers: ['id', 'name', 'ingredients', 'yield_factor', 'updatedAt', '_deleted'],
  docToRow(doc: Record<string, any>): TabularRow {
    return {
      id: doc.id,
      updatedAt: doc.updatedAt,
      _deleted: doc._deleted,
      values: [
        escapeFormulaInjection(doc.id),
        escapeFormulaInjection(doc.name),
        typeof doc.ingredients === 'string' ? doc.ingredients : JSON.stringify(doc.ingredients || []),
        parseNumber(doc.yield_factor, 1.0),
        doc.updatedAt ?? Date.now(),
        Boolean(doc._deleted)
      ]
    };
  },
  rowToDoc(row: TabularRow): Record<string, any> {
    const getField = createFieldGetter(row);
    const idVal = getField('id', 0);
    const nameVal = getField('name', 1);
    const ingredientsVal = getField('ingredients', 2);
    const yieldFactorVal = getField('yield_factor', 3);
    const updatedAtVal = getField('updatedAt', 4);
    const deletedVal = getField('_deleted', 5);

    let ingredients = [];
    try {
      ingredients = typeof ingredientsVal === 'string' ? JSON.parse(ingredientsVal) : ingredientsVal || [];
    } catch {
      ingredients = [];
    }
    return {
      id: sanitizeString(idVal || row.id),
      name: sanitizeString(nameVal || ''),
      ingredients,
      yield_factor: parseNumber(yieldFactorVal, 1.0),
      updatedAt: updatedAtVal !== undefined && updatedAtVal !== '' ? Number(updatedAtVal) : row.updatedAt,
      _deleted: parseBool(deletedVal ?? row._deleted)
    };
  }
};

export const portionsSerializer: CollectionSerializer = {
  headers: ['id', 'base_food_id', 'name', 'equivalent_weight_g', 'updatedAt', '_deleted'],
  docToRow(doc: Record<string, any>): TabularRow {
    return {
      id: doc.id,
      updatedAt: doc.updatedAt,
      _deleted: doc._deleted,
      values: [
        escapeFormulaInjection(doc.id),
        escapeFormulaInjection(doc.base_food_id),
        escapeFormulaInjection(doc.name),
        parseNumber(doc.equivalent_weight_g, 0),
        doc.updatedAt ?? Date.now(),
        Boolean(doc._deleted)
      ]
    };
  },
  rowToDoc(row: TabularRow): Record<string, any> {
    const getField = createFieldGetter(row);
    const idVal = getField('id', 0);
    const baseFoodIdVal = getField('base_food_id', 1);
    const nameVal = getField('name', 2);
    const weightVal = getField('equivalent_weight_g', 3);
    const updatedAtVal = getField('updatedAt', 4);
    const deletedVal = getField('_deleted', 5);

    return {
      id: sanitizeString(idVal || row.id),
      base_food_id: sanitizeString(baseFoodIdVal || ''),
      name: sanitizeString(nameVal || ''),
      equivalent_weight_g: parseNumber(weightVal, 0),
      updatedAt: updatedAtVal !== undefined && updatedAtVal !== '' ? Number(updatedAtVal) : row.updatedAt,
      _deleted: parseBool(deletedVal ?? row._deleted)
    };
  }
};

export const collectionSerializers: Record<string, CollectionSerializer> = {
  daily_logs: dailyLogsSerializer,
  base_ingredients: baseIngredientsSerializer,
  recipes: recipesSerializer,
  portions: portionsSerializer
};
