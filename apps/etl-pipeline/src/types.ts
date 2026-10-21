import type { BaseIngredient } from '@quomida/domain-core';

export type DataSourceOrigin = 'SYSTEM' | 'SARA2' | 'TBCA' | 'USDA' | 'OPENFOODFACTS';

export interface RawIngredientItem extends BaseIngredient {
  originSource: DataSourceOrigin;
  originalId?: string;
  barcode?: string;
  brandTag?: string;
  categoryTag?: string;
  cleanName?: string;
  qualityScore?: number;
}

export interface RawPortionItem {
  _type: 'portion';
  id: string;
  base_food_id: string;
  name: string;
  equivalent_weight_g: number;
  source: string;
  is_generic?: boolean;
  originSource: DataSourceOrigin;
  contentHash?: string;
}
