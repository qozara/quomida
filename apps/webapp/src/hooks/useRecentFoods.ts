import { useState, useEffect, useMemo } from 'react';
import {
  addDaysToDate,
  type BaseIngredient,
  type FoodItem,
  type RecipeFoodItem,
  type DailyLog,
  type MealType
} from '@quomida/domain-core';
import { useApp } from '../context/AppContext.js';
import { RemoteCatalogService } from '../services/RemoteCatalogService.js';

const EMPTY_ARRAY: any[] = [];
const RECENT_DAYS = 60;

/**
 * Computes recently used foods/recipes (logged, created or edited within the last 60 days),
 * sorted by most recent interaction. When `mealType` is provided, only daily logs of that
 * meal type are considered (custom items edited recently are included regardless only when
 * no meal type filter is applied).
 */
export function useRecentFoods(mealType?: MealType): { recentItems: FoodItem[] } {
  const {
    ingredients = EMPTY_ARRAY,
    recipes = EMPTY_ARRAY,
    recipeFoods = EMPTY_ARRAY,
    db
  } = useApp();

  const [recentLogs, setRecentLogs] = useState<DailyLog[]>([]);
  const [recentSystemFoods, setRecentSystemFoods] = useState<Record<string, BaseIngredient>>({});
  const [remoteService] = useState(() => RemoteCatalogService.getInstance());

  const cutoffDate = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return addDaysToDate(today, -RECENT_DAYS);
  }, []);

  const cutoffTimestamp = useMemo(() => Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000, []);

  // Subscribe to daily logs from the last 60 days (optionally filtered by meal type)
  useEffect(() => {
    if (!db?.daily_logs?.find) return;

    let sub: any;
    try {
      const selector: Record<string, unknown> = { date: { $gte: cutoffDate } };
      if (mealType) selector.meal_type = mealType;
      sub = db.daily_logs.find({ selector }).$.subscribe((docs: any[]) => {
        setRecentLogs(docs.map((d: any) => (d.toJSON ? d.toJSON() : d) as DailyLog));
      });
    } catch (e) {
      console.warn('[useRecentFoods] Failed to subscribe to recent daily logs:', e);
    }

    return () => {
      sub?.unsubscribe?.();
    };
  }, [db, cutoffDate, mealType]);

  // Batch-resolve system food items used in recent logs that are not custom
  useEffect(() => {
    if (!recentLogs || recentLogs.length === 0) return;

    const customIdSet = new Set<string>([
      ...(ingredients as BaseIngredient[]).map(i => i.id),
      ...(recipes as { id: string }[]).map(r => r.id)
    ]);

    const systemIdsToFetch = Array.from(
      new Set(
        recentLogs
          .map(l => l.food_reference_id)
          .filter(id => id && !customIdSet.has(id) && !recentSystemFoods[id])
      )
    );

    if (systemIdsToFetch.length === 0) return;

    let active = true;
    remoteService
      .getIngredientsByIds(systemIdsToFetch)
      .then(items => {
        if (!active || items.length === 0) return;
        setRecentSystemFoods(prev => {
          const next = { ...prev };
          for (const item of items) next[item.id] = item;
          return next;
        });
      })
      .catch(err => {
        console.warn('[useRecentFoods] Failed to batch-fetch recent system ingredients:', err);
      });

    return () => {
      active = false;
    };
  }, [recentLogs, ingredients, recipes, remoteService, recentSystemFoods]);

  const recentItems: FoodItem[] = useMemo(() => {
    const interactionTimes = new Map<string, number>();

    for (const log of recentLogs) {
      const foodId = log.food_reference_id;
      if (!foodId) continue;
      const logTime = log.updatedAt || (log.timestamp ? new Date(log.timestamp).getTime() : 0);
      if (logTime > (interactionTimes.get(foodId) || 0)) {
        interactionTimes.set(foodId, logTime);
      }
    }

    // Created/edited custom items only count when not scoped to a meal type
    if (!mealType) {
      for (const entry of [...(recipes as { id: string; updatedAt?: number }[]), ...(ingredients as BaseIngredient[])]) {
        const updatedTime = (entry as { updatedAt?: number }).updatedAt || 0;
        if (updatedTime >= cutoffTimestamp && updatedTime > (interactionTimes.get(entry.id) || 0)) {
          interactionTimes.set(entry.id, updatedTime);
        }
      }
    }

    if (interactionTimes.size === 0) return [];

    const recipeFoodMap = new Map<string, RecipeFoodItem>();
    for (const rf of recipeFoods as RecipeFoodItem[]) recipeFoodMap.set(rf.id, rf);

    const ingredientMap = new Map<string, BaseIngredient>();
    for (const ing of ingredients as BaseIngredient[]) ingredientMap.set(ing.id, ing);

    const logFallbackMap = new Map<string, DailyLog>();
    for (const log of recentLogs) {
      if (log.food_reference_id && !logFallbackMap.has(log.food_reference_id)) {
        logFallbackMap.set(log.food_reference_id, log);
      }
    }

    const resolvedItems: { item: FoodItem; timestamp: number }[] = [];

    for (const [id, timestamp] of interactionTimes.entries()) {
      if (recipeFoodMap.has(id)) {
        resolvedItems.push({ item: recipeFoodMap.get(id)!, timestamp });
      } else if (ingredientMap.has(id)) {
        resolvedItems.push({ item: { ...ingredientMap.get(id)!, kind: 'ingredient' }, timestamp });
      } else if (recentSystemFoods[id]) {
        resolvedItems.push({ item: { ...recentSystemFoods[id], kind: 'ingredient' }, timestamp });
      } else if (logFallbackMap.has(id)) {
        const log = logFallbackMap.get(id)!;
        resolvedItems.push({
          item: {
            id,
            name: log.food_name || id,
            source: 'system',
            lang: 'es',
            kind: 'ingredient',
            calories_100g: log.macros?.calories ?? 0,
            protein_100g: log.macros?.protein ?? 0,
            carbs_100g: log.macros?.carbs ?? 0,
            fats_100g: log.macros?.fats ?? 0
          },
          timestamp
        });
      }
    }

    resolvedItems.sort((a, b) => b.timestamp - a.timestamp);
    return resolvedItems.map(r => r.item);
  }, [recentLogs, recipes, ingredients, recipeFoods, recentSystemFoods, cutoffTimestamp, mealType]);

  return { recentItems };
}
