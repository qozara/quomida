import type { BaseIngredient } from '@quomida/domain-core';

export * from './types.js';
export * from './utils/parserUtils.js';
export * from './sources/sara2.js';
export * from './sources/tbca.js';
export * from './sources/usda.js';
export * from './sources/openfoodfacts.js';
export * from './sources/system.js';

export interface CatalogItem extends BaseIngredient {
  contentHash: string;
}

export interface CatalogPayload {
  catalogVersion: string;
  generatedAt: string;
  items: CatalogItem[];
}

export interface CatalogMetaPayload {
  catalogVersion: string;
  generatedAt: string;
  itemCount: number;
  sources: string[];
  fileSizeBytes: number;
}
