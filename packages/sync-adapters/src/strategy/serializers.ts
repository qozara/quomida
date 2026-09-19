import type { TabularRow } from './types.js';

export interface CollectionSerializer {
  headers: string[];
  docToRow(doc: Record<string, any>): TabularRow;
  rowToDoc(row: TabularRow): Record<string, any>;
}

function createFieldGetter(row: TabularRow) {
  const headers = row.headers;
  const v = row.values;
  return (colName: string, fallbackIndex: number) => {
    if (headers && headers.length > 0) {
      const idx = headers.indexOf(colName);
      if (idx !== -1) return v[idx];
    }
    return v[fallbackIndex];
  };
}

const parseBool = (val: any) => {
  if (typeof val === 'string') return val.toLowerCase() === 'true';
  return Boolean(val);
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
        doc.id,
        doc.timestamp,
        doc.date,
        doc.meal_type,
        doc.food_reference_id,
        doc.food_name ?? '',
        doc.quantity,
        doc.portion_name,
        macros.calories ?? 0,
        macros.protein ?? 0,
        macros.carbs ?? 0,
        macros.fats ?? 0,
        denormalized,
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
      id: String(idVal || row.id),
      timestamp: String(timestampVal || ''),
      date: String(dateVal || ''),
      meal_type: String(mealTypeVal || 'meal_lunch'),
      food_reference_id: String(foodRefIdVal || ''),
      quantity: Number(quantityVal || 0),
      portion_name: String(portionNameVal || ''),
      macros: {
        calories: Number(caloriesVal || 0),
        protein: Number(proteinVal || 0),
        carbs: Number(carbsVal || 0),
        fats: Number(fatsVal || 0)
      }
    };
    if (foodNameVal) {
      doc.food_name = String(foodNameVal);
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
        doc.id,
        doc.name,
        doc.source,
        doc.lang,
        doc.calories_100g,
        doc.protein_100g,
        doc.carbs_100g,
        doc.fats_100g,
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
      id: String(idVal || row.id),
      name: String(nameVal || ''),
      source: String(sourceVal || 'custom'),
      lang: String(langVal || 'en'),
      calories_100g: Number(caloriesVal || 0),
      protein_100g: Number(proteinVal || 0),
      carbs_100g: Number(carbsVal || 0),
      fats_100g: Number(fatsVal || 0),
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
        doc.id,
        doc.name,
        typeof doc.ingredients === 'string' ? doc.ingredients : JSON.stringify(doc.ingredients || []),
        doc.yield_factor ?? 1.0,
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
      id: String(idVal || row.id),
      name: String(nameVal || ''),
      ingredients,
      yield_factor: Number(yieldFactorVal || 1.0),
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
        doc.id,
        doc.base_food_id,
        doc.name,
        doc.equivalent_weight_g,
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
      id: String(idVal || row.id),
      base_food_id: String(baseFoodIdVal || ''),
      name: String(nameVal || ''),
      equivalent_weight_g: Number(weightVal || 0),
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
