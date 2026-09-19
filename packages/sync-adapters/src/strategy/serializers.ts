import type { TabularRow } from './types.js';

export interface CollectionSerializer {
  headers: string[];
  docToRow(doc: Record<string, any>): TabularRow;
  rowToDoc(row: TabularRow): Record<string, any>;
}

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
    const v = row.values;
    const parseBool = (val: any) => {
      if (typeof val === 'string') return val.toLowerCase() === 'true';
      return Boolean(val);
    };
    const doc: Record<string, any> = {
      id: String(v[0] || row.id),
      timestamp: String(v[1] || ''),
      date: String(v[2] || ''),
      meal_type: String(v[3] || 'meal_lunch'),
      food_reference_id: String(v[4] || ''),
      quantity: Number(v[6] || 0),
      portion_name: String(v[7] || ''),
      macros: {
        calories: Number(v[8] || 0),
        protein: Number(v[9] || 0),
        carbs: Number(v[10] || 0),
        fats: Number(v[11] || 0)
      }
    };
    if (v[5]) {
      doc.food_name = String(v[5]);
    }
    if (v[13] !== undefined && v[13] !== null) {
      doc.updatedAt = Number(v[13]);
    } else if (row.updatedAt) {
      doc.updatedAt = row.updatedAt;
    }
    if (v[14] !== undefined) {
      doc._deleted = parseBool(v[14]);
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
    const v = row.values;
    const parseBool = (val: any) => {
      if (typeof val === 'string') return val.toLowerCase() === 'true';
      return Boolean(val);
    };
    return {
      id: String(v[0] || row.id),
      name: String(v[1] || ''),
      source: String(v[2] || 'custom'),
      lang: String(v[3] || 'en'),
      calories_100g: Number(v[4] || 0),
      protein_100g: Number(v[5] || 0),
      carbs_100g: Number(v[6] || 0),
      fats_100g: Number(v[7] || 0),
      updatedAt: v[8] ? Number(v[8]) : row.updatedAt,
      _deleted: parseBool(v[9] ?? row._deleted)
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
    const v = row.values;
    let ingredients = [];
    try {
      ingredients = typeof v[2] === 'string' ? JSON.parse(v[2]) : v[2] || [];
    } catch {
      ingredients = [];
    }
    const parseBool = (val: any) => {
      if (typeof val === 'string') return val.toLowerCase() === 'true';
      return Boolean(val);
    };
    return {
      id: String(v[0] || row.id),
      name: String(v[1] || ''),
      ingredients,
      yield_factor: Number(v[3] || 1.0),
      updatedAt: v[4] ? Number(v[4]) : row.updatedAt,
      _deleted: parseBool(v[5] ?? row._deleted)
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
    const v = row.values;
    const parseBool = (val: any) => {
      if (typeof val === 'string') return val.toLowerCase() === 'true';
      return Boolean(val);
    };
    return {
      id: String(v[0] || row.id),
      base_food_id: String(v[1] || ''),
      name: String(v[2] || ''),
      equivalent_weight_g: Number(v[3] || 0),
      updatedAt: v[4] ? Number(v[4]) : row.updatedAt,
      _deleted: parseBool(v[5] ?? row._deleted)
    };
  }
};

export const collectionSerializers: Record<string, CollectionSerializer> = {
  daily_logs: dailyLogsSerializer,
  base_ingredients: baseIngredientsSerializer,
  recipes: recipesSerializer,
  portions: portionsSerializer
};
