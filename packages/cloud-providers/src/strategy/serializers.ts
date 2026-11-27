import {
  createFieldGetter,
  parseBool,
  parseNumber,
  escapeFormulaInjection,
  sanitizeString,
  type CollectionSerializer,
  type TabularRow,
} from '@qozara/cloud-sync';

export {
  createFieldGetter,
  parseBool,
  parseNumber,
  escapeFormulaInjection,
  sanitizeString,
  type CollectionSerializer,
};

function mapFieldsToHeaders(
  doc: Record<string, any>,
  fields: Record<string, any>,
  defaultHeaders: string[],
  headers?: string[]
): TabularRow {
  const targetHeaders = headers && headers.length > 0 ? headers : defaultHeaders;
  const normalized = new Map<string, any>();
  for (const [key, value] of Object.entries(fields)) {
    normalized.set(key.trim().toLowerCase(), value);
  }
  const values = targetHeaders.map((header) => {
    const key = String(header ?? '').trim().toLowerCase();
    return normalized.has(key) ? normalized.get(key) : undefined;
  });
  return {
    id: doc.id,
    updatedAt: doc.updatedAt,
    _deleted: doc._deleted,
    values,
  };
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
  docToRow(doc: Record<string, any>, headers?: string[]): TabularRow {
    const macros = doc.macros || { calories: 0, protein: 0, carbs: 0, fats: 0 };
    const foodName = doc.food_name || 'Alimento';
    const denormalized = `${foodName} | ${macros.calories ?? 0}kcal | ${macros.protein ?? 0}g P, ${macros.carbs ?? 0}g C, ${macros.fats ?? 0}g F`;

    return mapFieldsToHeaders(
      doc,
      {
        id: escapeFormulaInjection(doc.id),
        timestamp: doc.timestamp,
        date: doc.date,
        meal_type: doc.meal_type,
        food_reference_id: doc.food_reference_id,
        food_name: escapeFormulaInjection(doc.food_name ?? ''),
        quantity: parseNumber(doc.quantity, 0),
        portion_name: escapeFormulaInjection(doc.portion_name ?? ''),
        calories: parseNumber(macros.calories, 0),
        protein: parseNumber(macros.protein, 0),
        carbs: parseNumber(macros.carbs, 0),
        fats: parseNumber(macros.fats, 0),
        food_details_readonly: escapeFormulaInjection(denormalized),
        updatedAt: doc.updatedAt ?? Date.now(),
        _deleted: Boolean(doc._deleted),
      },
      this.headers,
      headers
    );
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
  docToRow(doc: Record<string, any>, headers?: string[]): TabularRow {
    return mapFieldsToHeaders(
      doc,
      {
        id: escapeFormulaInjection(doc.id),
        name: escapeFormulaInjection(doc.name),
        source: doc.source,
        lang: doc.lang,
        calories_100g: parseNumber(doc.calories_100g, 0),
        protein_100g: parseNumber(doc.protein_100g, 0),
        carbs_100g: parseNumber(doc.carbs_100g, 0),
        fats_100g: parseNumber(doc.fats_100g, 0),
        updatedAt: doc.updatedAt ?? Date.now(),
        _deleted: Boolean(doc._deleted),
      },
      this.headers,
      headers
    );
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
  docToRow(doc: Record<string, any>, headers?: string[]): TabularRow {
    return mapFieldsToHeaders(
      doc,
      {
        id: escapeFormulaInjection(doc.id),
        name: escapeFormulaInjection(doc.name),
        ingredients:
          typeof doc.ingredients === 'string'
            ? doc.ingredients
            : JSON.stringify(doc.ingredients || []),
        yield_factor: parseNumber(doc.yield_factor, 1.0),
        updatedAt: doc.updatedAt ?? Date.now(),
        _deleted: Boolean(doc._deleted),
      },
      this.headers,
      headers
    );
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
  docToRow(doc: Record<string, any>, headers?: string[]): TabularRow {
    return mapFieldsToHeaders(
      doc,
      {
        id: escapeFormulaInjection(doc.id),
        base_food_id: escapeFormulaInjection(doc.base_food_id),
        name: escapeFormulaInjection(doc.name),
        equivalent_weight_g: parseNumber(doc.equivalent_weight_g, 0),
        updatedAt: doc.updatedAt ?? Date.now(),
        _deleted: Boolean(doc._deleted),
      },
      this.headers,
      headers
    );
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
      source: 'custom' as const,
      updatedAt: updatedAtVal !== undefined && updatedAtVal !== '' ? Number(updatedAtVal) : row.updatedAt,
      _deleted: parseBool(deletedVal ?? row._deleted)
    };
  }
};

export const weightLogHeaders = [
  'id',
  'date',
  'timestamp',
  'weight_kg',
  'trend_weight_kg',
  'note',
  'updatedAt',
  '_deleted'
];

export const weightLogsSerializer: CollectionSerializer = {
  headers: weightLogHeaders,
  docToRow(doc: Record<string, any>, headers?: string[]): TabularRow {
    return mapFieldsToHeaders(
      doc,
      {
        id: escapeFormulaInjection(doc.id),
        date: doc.date,
        timestamp: doc.timestamp,
        weight_kg: parseNumber(doc.weight_kg, 0),
        trend_weight_kg: parseNumber(doc.trend_weight_kg, 0),
        note: escapeFormulaInjection(sanitizeString(doc.note ?? '')),
        updatedAt: doc.updatedAt ?? Date.now(),
        _deleted: Boolean(doc._deleted),
      },
      this.headers,
      headers
    );
  },
  rowToDoc(row: TabularRow): Record<string, any> {
    const getField = createFieldGetter(row);
    const idVal = getField('id', 0);
    const dateVal = getField('date', 1);
    const timestampVal = getField('timestamp', 2);
    const weightVal = getField('weight_kg', 3);
    const trendWeightVal = getField('trend_weight_kg', 4);
    const noteVal = getField('note', 5);
    const updatedAtVal = getField('updatedAt', 6);
    const deletedVal = getField('_deleted', 7);

    const doc: Record<string, any> = {
      id: sanitizeString(idVal || row.id),
      date: String(dateVal || ''),
      timestamp: String(timestampVal || ''),
      weight_kg: parseNumber(weightVal, 0),
      trend_weight_kg: parseNumber(trendWeightVal, 0)
    };
    if (noteVal !== undefined && noteVal !== null && noteVal !== '') {
      doc.note = sanitizeString(noteVal);
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

export const collectionSerializers: Record<string, CollectionSerializer> = {
  daily_logs: dailyLogsSerializer,
  weight_logs: weightLogsSerializer,
  base_ingredients: baseIngredientsSerializer,
  recipes: recipesSerializer,
  portions: portionsSerializer
};
