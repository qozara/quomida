import crypto from 'crypto';
import type { RawIngredientItem } from '../types.js';
import type { BaseIngredient } from '@quomida/domain-core';

export function computeContentHash(item: BaseIngredient): string {
  const data = `${item.id}|${item.name}|${item.calories_100g}|${item.protein_100g}|${item.carbs_100g}|${item.fats_100g}`;
  return crypto.createHash('md5').update(data, 'utf8').digest('hex');
}

export function computePortionHash(portion: { id: string; name: string; equivalent_weight_g: number }): string {
  const data = `${portion.id}|${portion.name}|${portion.equivalent_weight_g}`;
  return crypto.createHash('md5').update(data, 'utf8').digest('hex');
}

export function sanitizePortionWeight(val: number | null | undefined): number {
  if (val == null || isNaN(val) || val < 0.5) return 0;
  if (val > 2500) return 2500;
  return Number(val.toFixed(1));
}

export function sanitizeIngredient(item: RawIngredientItem): BaseIngredient {
  const clamp = (val: number | null | undefined, max: number = 100) => {
    if (val == null || isNaN(val) || val < 0) return 0;
    return val > max ? max : Number(val.toFixed(2));
  };
  
  const cals = (item.calories_100g == null || isNaN(item.calories_100g) || item.calories_100g < 0) 
    ? 0 
    : (item.calories_100g > 900 ? 900 : Number(item.calories_100g.toFixed(1)));

  return {
    id: item.id,
    name: item.name.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').replace(/<[^>]*>?/gm, '').trim(),
    source: (item.originSource.toLowerCase() as any),
    lang: item.lang,
    calories_100g: cals,
    protein_100g: clamp(item.protein_100g, 100),
    carbs_100g: clamp(item.carbs_100g, 100),
    fats_100g: clamp(item.fats_100g, 100)
  };
}
