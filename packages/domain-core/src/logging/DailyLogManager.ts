import type { BaseIngredient, Portion, DailyLog, MealType } from '../types.js';
import { calculatePortionMacros, createMacroSnapshot } from '../calculations/index.js';

export interface CreateLogEntryParams {
  id?: string;
  food: BaseIngredient;
  portion: Portion;
  quantity: number;
  mealType: MealType;
  date: string;
  timestamp?: string;
}

export class DailyLogManager {
  /**
   * Creates an immutable DailyLog document with hardcoded macro snapshot (ADR 0003).
   */
  createLogEntry(params: CreateLogEntryParams): DailyLog {
    const { food, portion, quantity, mealType, date } = params;
    const nowIso = new Date().toISOString();
    const timestamp = params.timestamp || nowIso;
    const id = params.id || `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const calculatedMacros = calculatePortionMacros(food, portion, quantity);
    const macroSnapshot = createMacroSnapshot(calculatedMacros);

    return {
      id,
      timestamp,
      date,
      meal_type: mealType,
      food_reference_id: food.id,
      food_name: food.name,
      quantity,
      portion_name: portion.name,
      macros: macroSnapshot,
      updatedAt: Date.now()
    };
  }

  /**
   * Updates log quantity and recalculates macro snapshot immutably.
   */
  updateLogQuantity(
    log: DailyLog,
    newQuantity: number,
    food: BaseIngredient,
    portion: Portion
  ): DailyLog {
    const calculatedMacros = calculatePortionMacros(food, portion, newQuantity);
    const macroSnapshot = createMacroSnapshot(calculatedMacros);

    return {
      ...log,
      quantity: newQuantity,
      macros: macroSnapshot,
      updatedAt: Date.now()
    };
  }

  /**
   * Removes a log entry by id immutably.
   */
  removeLogEntry(logId: string, currentLogs: DailyLog[]): DailyLog[] {
    return currentLogs.filter(log => log.id !== logId);
  }
}
