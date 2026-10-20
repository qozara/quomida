import type {
  WeightLog,
  DailyLog,
  UserSettings,
  UserGoalConfig,
  UserBiometrics,
  UserSex,
  CalibrationStatus
} from '../types.js';

export interface CalculateTargetsInput {
  tdee: number;
  weightKg: number;
  sex: UserSex;
  goalConfig: UserGoalConfig;
}

export interface TargetMacros {
  daily_calorie_target: number;
  custom_macros: {
    protein: number;
    carbs: number;
    fats: number;
  };
}

export interface CalculateBaselineSeedInput {
  biometrics: UserBiometrics;
  goalConfig: UserGoalConfig;
  currentWeightKg: number;
  referenceDate?: string;
}

export interface BaselineSeedResult {
  bmr: number;
  seed_tdee: number;
  daily_calorie_target: number;
  custom_macros: {
    protein: number;
    carbs: number;
    fats: number;
  };
}

export interface SolveAdaptiveTdeeInput {
  today: string; // 'YYYY-MM-DD'
  previousEstimatedTdee: number;
  sex: UserSex;
  goalConfig: UserGoalConfig;
  weightLogs: WeightLog[];
  dailyLogs: DailyLog[];
}

export interface AdaptiveSufficiency {
  recent_weight_count: number;
  prior_weight_count: number;
  qualifying_intake_days: number;
  weight_sufficient: boolean;
  intake_sufficient: boolean;
}

export interface AdaptiveDiagnostics {
  window_start_date: string;
  window_end_date: string;
  avg_daily_intake_kcal: number;
  start_trend_weight_kg: number;
  end_trend_weight_kg: number;
  daily_weight_delta_kg: number;
  tissue_energy_delta_kcal: number;
  observed_tdee: number;
  blended_tdee: number;
  clamped_tdee: number;
}

export interface SolveAdaptiveTdeeResult {
  status: CalibrationStatus;
  estimated_tdee: number;
  recommended_targets?: TargetMacros;
  sufficiency: AdaptiveSufficiency;
  diagnostics?: AdaptiveDiagnostics;
}

export interface WeightTrendAnalytics {
  current_raw_weight_kg?: number;
  current_trend_weight_kg?: number;
  weekly_trend_rate_kg: number;
  weekly_trend_rate_pct: number;
  rolling_14d_intake_avg: number;
  qualifying_intake_days_14d: number;
  recent_weight_count_7d: number;
  prior_weight_count_7d: number;
  calibration_status: CalibrationStatus;
  days_until_next_calibration: number;
  goal_type?: 'lose' | 'maintain' | 'gain';
  target_weekly_rate_kg?: number;
}

export interface EnergyTrendDataPoint {
  date: string;
  intakeKcal?: number;
  isQualifyingIntake: boolean;
  intakeTrendKcal?: number;
  expenditureKcal: number;
  macros?: {
    protein: number;
    carbs: number;
    fats: number;
  };
}

export interface ComputeEnergyTrendSeriesInput {
  today: string;
  rangeDays: 14 | 30 | 90;
  weightLogs: WeightLog[];
  dailyLogs: DailyLog[];
  userSettings: UserSettings;
}

/**
 * Calculates completed years of age from an ISO birth date string (YYYY-MM-DD).
 * Timezone-safe date arithmetic.
 */
export function calculateAgeFromBirthDate(birthDate: string, referenceDate?: string): number {
  const [bYear, bMonth, bDay] = birthDate.split('-').map(Number);
  let refYear: number, refMonth: number, refDay: number;
  if (referenceDate) {
    [refYear, refMonth, refDay] = referenceDate.split('-').map(Number);
  } else {
    const now = new Date();
    refYear = now.getFullYear();
    refMonth = now.getMonth() + 1;
    refDay = now.getDate();
  }

  let age = refYear - bYear;
  if (refMonth < bMonth || (refMonth === bMonth && refDay < bDay)) {
    age--;
  }
  return Math.max(0, age);
}

/**
 * Calculates Basal Metabolic Rate (BMR) using the Mifflin-St Jeor equation.
 * Male: 10 * W + 6.25 * H - 5 * A + 5
 * Female: 10 * W + 6.25 * H - 5 * A - 161
 */
export function calculateBmr(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  sex: UserSex
): number {
  const s = sex === 'male' ? 5 : -161;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageYears + s;
  return Math.round(bmr);
}

/**
 * Calculates deterministic seed TDEE from BMR and activity multiplier.
 */
export function calculateSeedTdee(bmr: number, activityMultiplier: number): number {
  return Math.round(bmr * activityMultiplier);
}

/**
 * Calculates target calories and macronutrients from TDEE and goal configuration.
 * - Applies safety floor (1200 kcal for female, 1500 kcal for male).
 * - Protein based on g/kg.
 * - Fat based on percentage with essential fatty acid floor (0.7g/kg * 9 kcal).
 * - Remaining calories allocated to carbohydrates.
 */
export function calculateTargetsFromTdee({
  tdee,
  weightKg,
  sex,
  goalConfig
}: CalculateTargetsInput): TargetMacros {
  // Delta daily energy from target weekly rate %: (weekly_rate_pct / 100) * weight * 7700 / 7
  const deltaDailyEnergy = ((goalConfig.weekly_rate_pct / 100) * weightKg * 7700) / 7;
  const floorKcal = sex === 'female' ? 1200 : 1500;
  const rawTargetKcal = Math.round(tdee + deltaDailyEnergy);
  const daily_calorie_target = Math.max(floorKcal, rawTargetKcal);

  // Protein (round to nearest gram)
  const protein = Math.round(weightKg * goalConfig.protein_g_per_kg);
  const proteinKcal = protein * 4;

  // Fats: essential fatty acid floor vs user target percentage
  const fatFloorKcal = weightKg * 0.7 * 9;
  const targetFatKcal = daily_calorie_target * goalConfig.fat_calorie_pct;
  const finalFatKcal = Math.max(fatFloorKcal, targetFatKcal);
  const fats = Math.round(finalFatKcal / 9);
  const fatKcalActual = fats * 9;

  // Remainder to Carbs
  const remainderKcal = Math.max(0, daily_calorie_target - (proteinKcal + fatKcalActual));
  const carbs = Math.round(remainderKcal / 4);

  return {
    daily_calorie_target,
    custom_macros: {
      protein,
      carbs,
      fats
    }
  };
}

/**
 * Computes deterministic baseline seed: BMR, seed TDEE, and recommended targets.
 */
export function calculateBaselineSeed({
  biometrics,
  goalConfig,
  currentWeightKg,
  referenceDate
}: CalculateBaselineSeedInput): BaselineSeedResult {
  const age = calculateAgeFromBirthDate(biometrics.birth_date, referenceDate);
  const bmr = calculateBmr(currentWeightKg, biometrics.height_cm, age, biometrics.sex);
  const seed_tdee = calculateSeedTdee(bmr, biometrics.activity_multiplier);
  const targets = calculateTargetsFromTdee({
    tdee: seed_tdee,
    weightKg: currentWeightKg,
    sex: biometrics.sex,
    goalConfig
  });

  return {
    bmr,
    seed_tdee,
    daily_calorie_target: targets.daily_calorie_target,
    custom_macros: targets.custom_macros
  };
}

/**
 * Computes calendar days between two ISO dates (endDate - startDate).
 */
export function daysBetween(startDate: string, endDate: string): number {
  const [y1, m1, d1] = startDate.split('-').map(Number);
  const [y2, m2, d2] = endDate.split('-').map(Number);
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.round((utc2 - utc1) / MS_PER_DAY);
}

/**
 * Adds integer days to an ISO date string (YYYY-MM-DD).
 */
export function addDaysToDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/**
 * Rounds a number to 2 decimal places.
 */
export function roundTo2Decimals(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Computes preview or next trend weight for a new observation using gap-aware EWMA (alpha = 0.12).
 * alpha_eff = 1 - (1 - alpha)^delta_days
 */
export function previewNextTrendWeight(
  previousTrendWeightKg: number | undefined,
  previousDate: string | undefined,
  newWeightKg: number,
  newDate: string
): number {
  if (previousTrendWeightKg === undefined || previousDate === undefined) {
    return roundTo2Decimals(newWeightKg);
  }

  const elapsedDays = Math.max(1, daysBetween(previousDate, newDate));
  const alpha = 0.12;
  const alphaEff = 1 - Math.pow(1 - alpha, elapsedDays);
  const trend = previousTrendWeightKg + alphaEff * (newWeightKg - previousTrendWeightKg);
  return roundTo2Decimals(trend);
}

/**
 * Recalculates the EWMA trend weight for an entire array of weight logs in chronological order.
 */
export function recalculateEWMAWeightTrend(logs: WeightLog[]): WeightLog[] {
  const activeLogs = logs.filter((l) => !(l as any)._deleted);
  if (activeLogs.length === 0) return [];

  const sorted = [...activeLogs].sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    if (cmp !== 0) return cmp;
    return (a.timestamp || '').localeCompare(b.timestamp || '');
  });

  const result: WeightLog[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const log = sorted[i];
    if (i === 0) {
      result.push({
        ...log,
        trend_weight_kg: roundTo2Decimals(log.weight_kg)
      });
    } else {
      const prev = result[i - 1];
      const nextTrend = previewNextTrendWeight(
        prev.trend_weight_kg,
        prev.date,
        log.weight_kg,
        log.date
      );
      result.push({
        ...log,
        trend_weight_kg: nextTrend
      });
    }
  }
  return result;
}

/**
 * 14-day rolling energy balance TDEE solver.
 * Analysis window: [today - 13 days, today]
 * Gate 1: >= 4 weight logs in [today - 6, today] AND >= 1 weight log in [today - 13, today - 7]
 * Gate 2: >= 10 distinct days in 14-day window with logged intake >= 800 kcal
 *
 * When gates pass:
 * TDEE_obs = avg_intake_14d - delta_tissue
 * TDEE_blended = 0.30 * TDEE_obs + 0.70 * TDEE_prev
 * TDEE_new = clamp(round(TDEE_blended), TDEE_prev - 150, TDEE_prev + 150)
 */
export function solveAdaptiveTdee({
  today,
  previousEstimatedTdee,
  sex,
  goalConfig,
  weightLogs,
  dailyLogs
}: SolveAdaptiveTdeeInput): SolveAdaptiveTdeeResult {
  const windowStart = addDaysToDate(today, -13);
  const priorEnd = addDaysToDate(today, -7);
  const recentStart = addDaysToDate(today, -6);

  // 1. Weight Sufficiency
  const recentWeights = weightLogs.filter((w) => !(w as any)._deleted && w.date >= recentStart && w.date <= today);
  const priorWeights = weightLogs.filter((w) => !(w as any)._deleted && w.date >= windowStart && w.date <= priorEnd);

  const recent_weight_count = recentWeights.length;
  const prior_weight_count = priorWeights.length;
  const weight_sufficient = recent_weight_count >= 4 && prior_weight_count >= 1;

  // 2. Intake Sufficiency
  const dailyCaloriesByDate = new Map<string, number>();
  for (const log of dailyLogs) {
    if (!(log as any)._deleted && log.date >= windowStart && log.date <= today) {
      const current = dailyCaloriesByDate.get(log.date) || 0;
      dailyCaloriesByDate.set(log.date, current + (log.macros?.calories || 0));
    }
  }

  let qualifying_intake_days = 0;
  let totalQualifyingCalories = 0;
  for (const [, kcal] of dailyCaloriesByDate.entries()) {
    if (kcal >= 800) {
      qualifying_intake_days++;
      totalQualifyingCalories += kcal;
    }
  }
  const intake_sufficient = qualifying_intake_days >= 10;

  const sufficiency: AdaptiveSufficiency = {
    recent_weight_count,
    prior_weight_count,
    qualifying_intake_days,
    weight_sufficient,
    intake_sufficient
  };

  // Check if gated
  if (!weight_sufficient || !intake_sufficient) {
    // If user has very few total logs, status is 'collecting_data'; if they have enough history but missed the window, 'insufficient_logs'
    const totalWeights = weightLogs.filter((w) => !(w as any)._deleted && w.date <= today).length;
    const totalFoodDays = new Set(
      dailyLogs.filter((l) => !(l as any)._deleted && l.date <= today).map((l) => l.date)
    ).size;
    const isEarlyCollecting = totalWeights < 5 || totalFoodDays < 10;
    const status: CalibrationStatus = isEarlyCollecting ? 'collecting_data' : 'insufficient_logs';

    return {
      status,
      estimated_tdee: previousEstimatedTdee,
      sufficiency
    };
  }

  // Gates passed: solve empirical expenditure
  const avg_daily_intake_kcal = roundTo2Decimals(
    totalQualifyingCalories / qualifying_intake_days
  );

  // Find start and end weight logs in W14
  const windowWeights = weightLogs
    .filter((w) => !(w as any)._deleted && w.date >= windowStart && w.date <= today)
    .sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      return (a.timestamp || '').localeCompare(b.timestamp || '');
    });

  const startWeightLog = windowWeights[0];
  const endWeightLog = windowWeights[windowWeights.length - 1];

  const daysElapsed = Math.max(1, daysBetween(startWeightLog.date, endWeightLog.date));
  const daily_weight_delta_kg =
    (endWeightLog.trend_weight_kg - startWeightLog.trend_weight_kg) / daysElapsed;
  const tissue_energy_delta_kcal = daily_weight_delta_kg * 7700;

  const observed_tdee = Math.round(avg_daily_intake_kcal - tissue_energy_delta_kcal);
  const blended_tdee = 0.3 * observed_tdee + 0.7 * previousEstimatedTdee;
  const roundedBlended = Math.round(blended_tdee);

  // Safety clamp: +/- 150 kcal from previous
  const minClamped = previousEstimatedTdee - 150;
  const maxClamped = previousEstimatedTdee + 150;
  const clamped_tdee = Math.max(minClamped, Math.min(maxClamped, roundedBlended));

  // Recalculate targets using clamped TDEE and latest trend weight
  const recommended_targets = calculateTargetsFromTdee({
    tdee: clamped_tdee,
    weightKg: endWeightLog.trend_weight_kg,
    sex,
    goalConfig
  });

  const diagnostics: AdaptiveDiagnostics = {
    window_start_date: windowStart,
    window_end_date: today,
    avg_daily_intake_kcal: Math.round(avg_daily_intake_kcal),
    start_trend_weight_kg: startWeightLog.trend_weight_kg,
    end_trend_weight_kg: endWeightLog.trend_weight_kg,
    daily_weight_delta_kg: roundTo2Decimals(daily_weight_delta_kg),
    tissue_energy_delta_kcal: Math.round(tissue_energy_delta_kcal),
    observed_tdee,
    blended_tdee: Math.round(blended_tdee),
    clamped_tdee
  };

  return {
    status: 'ready',
    estimated_tdee: clamped_tdee,
    recommended_targets,
    sufficiency,
    diagnostics
  };
}

/**
 * Computes weight trend analytics and compliance metrics for UI dashboard.
 */
export function computeWeightTrendAnalytics({
  today,
  weightLogs,
  dailyLogs,
  userSettings
}: {
  today: string;
  weightLogs: WeightLog[];
  dailyLogs: DailyLog[];
  userSettings: UserSettings;
}): WeightTrendAnalytics {
  const eligibleWeights = weightLogs
    .filter((w) => !(w as any)._deleted && w.date <= today)
    .sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      return (a.timestamp || '').localeCompare(b.timestamp || '');
    });

  const currentLog = eligibleWeights.length > 0 ? eligibleWeights[eligibleWeights.length - 1] : undefined;
  const current_raw_weight_kg = currentLog?.weight_kg;
  const current_trend_weight_kg = currentLog?.trend_weight_kg;

  // Calculate 7-day trend delta in kg/week
  let weekly_trend_rate_kg = 0;
  if (currentLog && eligibleWeights.length >= 2) {
    const target7dDate = addDaysToDate(currentLog.date, -7);
    // Find log on or closest before target7dDate
    let baselineLog = eligibleWeights[0];
    for (let i = eligibleWeights.length - 2; i >= 0; i--) {
      if (eligibleWeights[i].date <= target7dDate) {
        baselineLog = eligibleWeights[i];
        break;
      }
    }
    const elapsed = daysBetween(baselineLog.date, currentLog.date);
    if (elapsed > 0) {
      const deltaKg = currentLog.trend_weight_kg - baselineLog.trend_weight_kg;
      weekly_trend_rate_kg = roundTo2Decimals((deltaKg / elapsed) * 7);
    }
  }

  const weekly_trend_rate_pct = current_trend_weight_kg
    ? roundTo2Decimals((weekly_trend_rate_kg / current_trend_weight_kg) * 100)
    : 0;

  // Sufficiency metrics in 14-day window
  const windowStart = addDaysToDate(today, -13);
  const priorEnd = addDaysToDate(today, -7);
  const recentStart = addDaysToDate(today, -6);

  const recent_weight_count_7d = weightLogs.filter(
    (w) => !(w as any)._deleted && w.date >= recentStart && w.date <= today
  ).length;
  const prior_weight_count_7d = weightLogs.filter(
    (w) => !(w as any)._deleted && w.date >= windowStart && w.date <= priorEnd
  ).length;

  const dailyCaloriesByDate = new Map<string, number>();
  for (const log of dailyLogs) {
    if (!(log as any)._deleted && log.date >= windowStart && log.date <= today) {
      const current = dailyCaloriesByDate.get(log.date) || 0;
      dailyCaloriesByDate.set(log.date, current + (log.macros?.calories || 0));
    }
  }

  let qualifying_intake_days_14d = 0;
  let totalQualifyingCalories = 0;
  for (const [, kcal] of dailyCaloriesByDate.entries()) {
    if (kcal >= 800) {
      qualifying_intake_days_14d++;
      totalQualifyingCalories += kcal;
    }
  }

  const rolling_14d_intake_avg =
    qualifying_intake_days_14d > 0
      ? Math.round(totalQualifyingCalories / qualifying_intake_days_14d)
      : 0;

  const isWeightSufficient = recent_weight_count_7d >= 4 && prior_weight_count_7d >= 1;
  const isIntakeSufficient = qualifying_intake_days_14d >= 10;

  let calibration_status: CalibrationStatus;
  let days_until_next_calibration = 0;

  if (isWeightSufficient && isIntakeSufficient) {
    calibration_status = 'ready';
    days_until_next_calibration = 0;
  } else {
    const totalWeights = eligibleWeights.length;
    const totalFoodDays = new Set(
      dailyLogs.filter((l) => !(l as any)._deleted && l.date <= today).map((l) => l.date)
    ).size;
    const isEarly = totalWeights < 5 || totalFoodDays < 10;
    calibration_status = isEarly ? 'collecting_data' : 'insufficient_logs';
    const remainingIntake = Math.max(0, 10 - qualifying_intake_days_14d);
    const remainingRecentWeight = Math.max(0, 4 - recent_weight_count_7d);
    const remainingPriorWeight = Math.max(0, 1 - prior_weight_count_7d);
    days_until_next_calibration = Math.max(
      1,
      remainingIntake,
      remainingRecentWeight,
      remainingPriorWeight
    );
  }

  const goal_type = userSettings.goal_config?.goal_type;
  const target_weekly_rate_kg =
    userSettings.goal_config?.weekly_rate_pct !== undefined && current_trend_weight_kg
      ? roundTo2Decimals((userSettings.goal_config.weekly_rate_pct / 100) * current_trend_weight_kg)
      : undefined;

  return {
    current_raw_weight_kg,
    current_trend_weight_kg,
    weekly_trend_rate_kg,
    weekly_trend_rate_pct,
    rolling_14d_intake_avg,
    qualifying_intake_days_14d,
    recent_weight_count_7d,
    prior_weight_count_7d,
    calibration_status,
    days_until_next_calibration,
    goal_type,
    target_weekly_rate_kg
  };
}

/**
 * Reconstructs the Unified Energy Balance series (Expenditure / TDEE trend curve + Daily Intake dots + Smoothed Intake Trend)
 * deterministically over a 14, 30, or 90-day horizon without requiring extra database tables.
 *
 * - Daily Intake >= 800 kcal is marked `isQualifyingIntake: true` and updates the gap-aware EWMA intake trend.
 * - Partial logs (< 800 kcal) are preserved for visual scatter rendering (`isQualifyingIntake: false`) without pulling down the trend curve.
 * - Expenditure (`expenditureKcal`) dynamically evaluates the 14-day rolling adaptive energy balance on each day (or falls back to Mifflin-St Jeor baseline / user target).
 */
export function computeEnergyTrendSeries({
  today,
  rangeDays,
  weightLogs,
  dailyLogs,
  userSettings
}: ComputeEnergyTrendSeriesInput): EnergyTrendDataPoint[] {
  const activeWeights = weightLogs
    .filter((w) => !(w as any)._deleted && w.date <= today)
    .sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      return (a.timestamp || '').localeCompare(b.timestamp || '');
    });

  const activeFoodLogs = dailyLogs.filter((l) => !(l as any)._deleted && l.date <= today);

  if (activeWeights.length === 0 && activeFoodLogs.length === 0) {
    return [];
  }

  // Group daily food logs by date
  const dailySummaryMap = new Map<
    string,
    { calories: number; protein: number; carbs: number; fats: number }
  >();

  for (const log of activeFoodLogs) {
    const existing = dailySummaryMap.get(log.date) || {
      calories: 0,
      protein: 0,
      carbs: 0,
      fats: 0
    };
    existing.calories += log.macros?.calories || 0;
    existing.protein += log.macros?.protein || 0;
    existing.carbs += log.macros?.carbs || 0;
    existing.fats += log.macros?.fats || 0;
    dailySummaryMap.set(log.date, existing);
  }

  const rangeStartDate = addDaysToDate(today, -(rangeDays - 1));

  // Find earliest relevant date in range so we don't plot empty leading days before user started logging
  let earliestDataDate = today;
  if (activeWeights.length > 0 && activeWeights[0].date < earliestDataDate) {
    earliestDataDate = activeWeights[0].date;
  }
  for (const d of dailySummaryMap.keys()) {
    if (d < earliestDataDate) {
      earliestDataDate = d;
    }
  }

  // Start simulation 14 days prior to rangeStartDate so EWMA intake trend and rolling TDEE are warmed up
  const simStartDate =
    earliestDataDate > rangeStartDate ? earliestDataDate : addDaysToDate(rangeStartDate, -14);
  const effectivePlotStart = earliestDataDate > rangeStartDate ? earliestDataDate : rangeStartDate;

  // Determine initial baseline TDEE
  const initialWeightKg = activeWeights.length > 0 ? activeWeights[0].trend_weight_kg : 75;
  let runningEstimatedTdee = userSettings.daily_calorie_target || 2000;
  if (userSettings.biometrics && userSettings.goal_config) {
    const seed = calculateBaselineSeed({
      biometrics: userSettings.biometrics,
      goalConfig: userSettings.goal_config,
      currentWeightKg: initialWeightKg,
      referenceDate: simStartDate
    });
    runningEstimatedTdee = seed.seed_tdee;
  } else if (userSettings.adaptive_state?.prior_tdee) {
    runningEstimatedTdee = userSettings.adaptive_state.prior_tdee;
  } else if (userSettings.adaptive_state?.estimated_tdee) {
    runningEstimatedTdee = userSettings.adaptive_state.estimated_tdee;
  }

  let runningIntakeTrend: number | undefined = undefined;
  let lastQualifyingIntakeDate: string | undefined = undefined;
  let lastTrendWeight = initialWeightKg;
  let weightIdx = 0;

  const totalSimDays = Math.max(0, daysBetween(simStartDate, today));
  const series: EnergyTrendDataPoint[] = [];

  for (let offset = 0; offset <= totalSimDays; offset++) {
    const currentDate = addDaysToDate(simStartDate, offset);

    // Advance weight pointer up to currentDate
    while (weightIdx < activeWeights.length && activeWeights[weightIdx].date <= currentDate) {
      lastTrendWeight = activeWeights[weightIdx].trend_weight_kg;
      weightIdx++;
    }

    const dayFood = dailySummaryMap.get(currentDate);
    const intakeKcal = dayFood ? Math.round(dayFood.calories) : undefined;
    const isQualifyingIntake = intakeKcal !== undefined && intakeKcal >= 800;

    // Update gap-aware EWMA intake trend only on qualifying intake days (>= 800 kcal)
    if (isQualifyingIntake && intakeKcal !== undefined) {
      if (runningIntakeTrend === undefined || lastQualifyingIntakeDate === undefined) {
        runningIntakeTrend = intakeKcal;
      } else {
        const elapsed = Math.max(1, daysBetween(lastQualifyingIntakeDate, currentDate));
        const alphaEff = 1 - Math.pow(1 - 0.15, elapsed);
        runningIntakeTrend = Math.round(
          runningIntakeTrend + alphaEff * (intakeKcal - runningIntakeTrend)
        );
      }
      lastQualifyingIntakeDate = currentDate;
    }

    // Evaluate expenditure for currentDate
    let dayExpenditure = runningEstimatedTdee;
    if (userSettings.biometrics && userSettings.goal_config) {
      const seedForDay = calculateBaselineSeed({
        biometrics: userSettings.biometrics,
        goalConfig: userSettings.goal_config,
        currentWeightKg: lastTrendWeight,
        referenceDate: currentDate
      });

      if (userSettings.target_mode === 'deterministic_seed') {
        dayExpenditure = seedForDay.seed_tdee;
        runningEstimatedTdee = dayExpenditure;
      } else {
        // Attempt 14-day adaptive solve on currentDate
        const wStart = addDaysToDate(currentDate, -13);
        const pEnd = addDaysToDate(currentDate, -7);
        const rStart = addDaysToDate(currentDate, -6);

        let rCount = 0;
        let pCount = 0;
        let firstW: WeightLog | undefined;
        let lastW: WeightLog | undefined;

        for (let i = 0; i < weightIdx; i++) {
          const wl = activeWeights[i];
          if (wl.date >= wStart && wl.date <= currentDate) {
            if (!firstW) firstW = wl;
            lastW = wl;
            if (wl.date >= rStart) rCount++;
            else if (wl.date <= pEnd) pCount++;
          }
        }

        let qualDays = 0;
        let qualSum = 0;
        for (let d = 0; d < 14; d++) {
          const checkD = addDaysToDate(wStart, d);
          const f = dailySummaryMap.get(checkD);
          if (f && f.calories >= 800) {
            qualDays++;
            qualSum += f.calories;
          }
        }

        if (rCount >= 4 && pCount >= 1 && qualDays >= 10 && firstW && lastW) {
          const avgIntake = qualSum / qualDays;
          const elapsedW = Math.max(1, daysBetween(firstW.date, lastW.date));
          const dailyWeightDelta = (lastW.trend_weight_kg - firstW.trend_weight_kg) / elapsedW;
          const observedTdee = Math.round(avgIntake - dailyWeightDelta * 7700);
          // Smooth daily trajectory toward observed TDEE
          const blended = Math.round(0.25 * observedTdee + 0.75 * runningEstimatedTdee);
          const clamped = Math.max(
            runningEstimatedTdee - 150,
            Math.min(runningEstimatedTdee + 150, blended)
          );
          runningEstimatedTdee = clamped;
          dayExpenditure = clamped;
        } else {
          // Warm-up / insufficient window: track physiological BMR*activity baseline from trend weight
          dayExpenditure = seedForDay.seed_tdee;
          runningEstimatedTdee = dayExpenditure;
        }
      }
    } else if (runningIntakeTrend !== undefined && !userSettings.adaptive_state?.estimated_tdee) {
      dayExpenditure = runningIntakeTrend;
    }

    // If on the final day ('today') the user has an explicit calibrated TDEE in adaptive_state, anchor to it
    if (currentDate === today && userSettings.adaptive_state?.estimated_tdee) {
      dayExpenditure = userSettings.adaptive_state.estimated_tdee;
    }

    if (currentDate >= effectivePlotStart) {
      series.push({
        date: currentDate,
        intakeKcal,
        isQualifyingIntake,
        intakeTrendKcal: runningIntakeTrend,
        expenditureKcal: Math.round(dayExpenditure),
        macros: dayFood
          ? {
              protein: Math.round(dayFood.protein),
              carbs: Math.round(dayFood.carbs),
              fats: Math.round(dayFood.fats)
            }
          : undefined
      });
    }
  }

  return series;
}
