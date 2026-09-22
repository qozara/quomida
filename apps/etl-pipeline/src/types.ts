import type { BaseIngredient } from '@quomida/domain-core';

export type DataSourceOrigin = 'SYSTEM' | 'ARGENFOODS' | 'SARA2' | 'TBCA' | 'USDA' | 'OPENFOODFACTS';

export interface RawIngredientItem extends BaseIngredient {
  originSource: DataSourceOrigin;
  originalId?: string;
  barcode?: string;
}
