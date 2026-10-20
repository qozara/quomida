import { describe, it, expect } from 'vitest';
import {
  calculateAgeFromBirthDate,
  calculateBmr,
  calculateSeedTdee,
  calculateTargetsFromTdee,
  calculateBaselineSeed,
  daysBetween,
  roundTo2Decimals,
  previewNextTrendWeight,
  recalculateEWMAWeightTrend,
  solveAdaptiveTdee,
  computeWeightTrendAnalytics
} from '../src/index.js';
import type { WeightLog, DailyLog, UserSettings, UserGoalConfig, UserBiometrics } from '../src/index.js';

describe('Energy Expenditure & Weight Tracking Engine', () => {
  describe('calculateAgeFromBirthDate', () => {
    it('calculates age correctly when birthday has already passed in the current year', () => {
      const age = calculateAgeFromBirthDate('1990-05-15', '2026-10-20');
      expect(age).toBe(36);
    });

    it('calculates age correctly when birthday has not yet occurred in the current year', () => {
      const age = calculateAgeFromBirthDate('1990-11-15', '2026-10-20');
      expect(age).toBe(35);
    });

    it('calculates age correctly on the exact day of the birthday', () => {
      const age = calculateAgeFromBirthDate('1990-10-20', '2026-10-20');
      expect(age).toBe(36);
    });

    it('handles same-year births or newborn edge cases gracefully', () => {
      const age = calculateAgeFromBirthDate('2026-01-01', '2026-10-20');
      expect(age).toBe(0);
    });

    it('defaults referenceDate to current date without throwing', () => {
      const age = calculateAgeFromBirthDate('1990-01-01');
      expect(age).toBeGreaterThanOrEqual(30);
    });
  });

  describe('calculateBmr (Mifflin-St Jeor)', () => {
    it('calculates male BMR accurately: 10*W + 6.25*H - 5*A + 5', () => {
      // 10 * 80 + 6.25 * 180 - 5 * 30 + 5 = 800 + 1125 - 150 + 5 = 1780
      const bmr = calculateBmr(80, 180, 30, 'male');
      expect(bmr).toBe(1780);
    });

    it('calculates female BMR accurately: 10*W + 6.25*H - 5*A - 161', () => {
      // 10 * 60 + 6.25 * 160 - 5 * 25 - 161 = 600 + 1000 - 125 - 161 = 1314
      const bmr = calculateBmr(60, 160, 25, 'female');
      expect(bmr).toBe(1314);
    });
  });

  describe('calculateSeedTdee', () => {
    it('scales BMR by activity multiplier and rounds to nearest integer', () => {
      const tdee = calculateSeedTdee(1780, 1.55);
      // 1780 * 1.55 = 2759
      expect(tdee).toBe(2759);
    });
  });

  describe('calculateTargetsFromTdee', () => {
    const maleGoal: UserGoalConfig = {
      goal_type: 'lose',
      weekly_rate_pct: -0.5, // 0.5% weight loss / week
      protein_g_per_kg: 2.0,
      fat_calorie_pct: 0.25
    };

    it('computes target calories, protein, fats, and remainder carbs', () => {
      const targets = calculateTargetsFromTdee({
        tdee: 2759,
        weightKg: 80,
        sex: 'male',
        goalConfig: maleGoal
      });

      // Deficit: (-0.5 / 100) * 80 * 7700 / 7 = -440 kcal
      // Target kcal: round(2759 - 440) = 2319 kcal
      expect(targets.daily_calorie_target).toBe(2319);

      // Protein: round(80 * 2.0) = 160g (160 * 4 = 640 kcal)
      expect(targets.custom_macros.protein).toBe(160);

      // Fat: max(80 * 0.7 * 9 = 504, 2319 * 0.25 = 579.75) => round(579.75 / 9) = 64g (64 * 9 = 576 kcal)
      expect(targets.custom_macros.fats).toBe(64);

      // Carbs: max(0, round((2319 - (640 + 576)) / 4)) = round(1103 / 4) = 276g
      expect(targets.custom_macros.carbs).toBe(276);
    });

    it('enforces safety floors: 1500 kcal for males, 1200 kcal for females', () => {
      const aggressiveFemaleGoal: UserGoalConfig = {
        goal_type: 'lose',
        weekly_rate_pct: -2.0,
        protein_g_per_kg: 1.8,
        fat_calorie_pct: 0.25
      };

      const femaleTargets = calculateTargetsFromTdee({
        tdee: 1400,
        weightKg: 55,
        sex: 'female',
        goalConfig: aggressiveFemaleGoal
      });
      expect(femaleTargets.daily_calorie_target).toBe(1200);

      const aggressiveMaleGoal: UserGoalConfig = {
        goal_type: 'lose',
        weekly_rate_pct: -2.5,
        protein_g_per_kg: 2.0,
        fat_calorie_pct: 0.25
      };

      const maleTargets = calculateTargetsFromTdee({
        tdee: 1800,
        weightKg: 75,
        sex: 'male',
        goalConfig: aggressiveMaleGoal
      });
      expect(maleTargets.daily_calorie_target).toBe(1500);
    });

    it('enforces essential fatty acid floor (0.7g/kg * 9 kcal)', () => {
      const lowFatGoal: UserGoalConfig = {
        goal_type: 'maintain',
        weekly_rate_pct: 0,
        protein_g_per_kg: 2.0,
        fat_calorie_pct: 0.10 // Very low fat request
      };

      const targets = calculateTargetsFromTdee({
        tdee: 2000,
        weightKg: 80,
        sex: 'male',
        goalConfig: lowFatGoal
      });

      // 10% of 2000 is 200 kcal, but floor is 80 * 0.7 * 9 = 504 kcal
      // Fat g = round(504 / 9) = 56g
      expect(targets.custom_macros.fats).toBe(56);
    });
  });

  describe('calculateBaselineSeed', () => {
    it('calculates full baseline profile deterministically', () => {
      const biometrics: UserBiometrics = {
        sex: 'male',
        birth_date: '1996-10-20',
        height_cm: 180,
        activity_multiplier: 1.55
      };
      const goalConfig: UserGoalConfig = {
        goal_type: 'maintain',
        weekly_rate_pct: 0,
        protein_g_per_kg: 2.0,
        fat_calorie_pct: 0.25
      };

      const result = calculateBaselineSeed({
        biometrics,
        goalConfig,
        currentWeightKg: 80,
        referenceDate: '2026-10-20' // exactly 30 years old
      });

      expect(result.bmr).toBe(1780);
      expect(result.seed_tdee).toBe(2759);
      expect(result.daily_calorie_target).toBe(2759);
      expect(result.custom_macros.protein).toBe(160);
      expect(result.custom_macros.fats).toBe(77);
      expect(result.custom_macros.carbs).toBe(357);
    });
  });

  describe('daysBetween & roundTo2Decimals', () => {
    it('computes days elapsed between two ISO date strings', () => {
      expect(daysBetween('2026-10-01', '2026-10-01')).toBe(0);
      expect(daysBetween('2026-10-01', '2026-10-05')).toBe(4);
      expect(daysBetween('2026-10-15', '2026-10-01')).toBe(-14);
    });

    it('rounds to 2 decimals accurately', () => {
      expect(roundTo2Decimals(75.556)).toBe(75.56);
      expect(roundTo2Decimals(75.554)).toBe(75.55);
      expect(roundTo2Decimals(80)).toBe(80);
    });
  });

  describe('previewNextTrendWeight & recalculateEWMAWeightTrend', () => {
    it('sets initial trend weight to raw weight on first observation', () => {
      const trend = previewNextTrendWeight(undefined, undefined, 80.5, '2026-10-01');
      expect(trend).toBe(80.5);
    });

    it('applies alpha = 0.12 when exactly 1 day elapses', () => {
      // alpha = 1 - (1 - 0.12)^1 = 0.12
      // 80.0 + 0.12 * (81.0 - 80.0) = 80.12
      const trend = previewNextTrendWeight(80.0, '2026-10-01', 81.0, '2026-10-02');
      expect(trend).toBe(80.12);
    });

    it('scales alpha dynamically over multi-day logging gaps', () => {
      // 5 days elapsed: alpha_eff = 1 - (1 - 0.12)^5 = 1 - (0.88)^5 ~= 0.472273
      // 80.0 + 0.472273 * (81.0 - 80.0) ~= 80.47
      const trend = previewNextTrendWeight(80.0, '2026-10-01', 81.0, '2026-10-06');
      expect(trend).toBe(80.47);
    });

    it('recalculates full EWMA series in chronological order', () => {
      const logs: WeightLog[] = [
        { id: 'w3', date: '2026-10-03', timestamp: '2026-10-03T08:00:00Z', weight_kg: 82.0, trend_weight_kg: 0, updatedAt: 1 },
        { id: 'w1', date: '2026-10-01', timestamp: '2026-10-01T08:00:00Z', weight_kg: 80.0, trend_weight_kg: 0, updatedAt: 1 },
        { id: 'w2', date: '2026-10-02', timestamp: '2026-10-02T08:00:00Z', weight_kg: 81.0, trend_weight_kg: 0, updatedAt: 1 }
      ];

      const smoothed = recalculateEWMAWeightTrend(logs);
      expect(smoothed.map(s => s.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
      expect(smoothed[0].trend_weight_kg).toBe(80.0);
      expect(smoothed[1].trend_weight_kg).toBe(80.12);
      expect(smoothed[2].trend_weight_kg).toBe(80.35); // 80.12 + 0.12 * (82 - 80.12) = 80.3456 => 80.35
    });
  });

  describe('solveAdaptiveTdee', () => {
    const goal: UserGoalConfig = {
      goal_type: 'maintain',
      weekly_rate_pct: 0,
      protein_g_per_kg: 2.0,
      fat_calorie_pct: 0.25
    };

    const makeDailyLog = (date: string, calories: number): DailyLog => ({
      id: `log_${date}`,
      timestamp: `${date}T12:00:00Z`,
      date,
      meal_type: 'meal_lunch',
      food_reference_id: 'ref1',
      quantity: 1,
      portion_name: 'serving',
      macros: { calories, protein: 50, carbs: 200, fats: 30 },
      updatedAt: 1
    });

    const makeWeightLog = (date: string, weight: number, trend: number): WeightLog => ({
      id: `weight_${date}`,
      date,
      timestamp: `${date}T07:00:00Z`,
      weight_kg: weight,
      trend_weight_kg: trend,
      updatedAt: 1
    });

    it('rejects calibration when weight entries in recent 7 days are insufficient (< 4)', () => {
      // 14-day window: 2026-10-01 to 2026-10-14 (today = 2026-10-14)
      // Recent 7 days: 2026-10-08 to 2026-10-14
      const weightLogs: WeightLog[] = [
        makeWeightLog('2026-10-02', 80, 80),
        makeWeightLog('2026-10-10', 80, 80),
        makeWeightLog('2026-10-12', 80, 80) // only 2 in recent 7 days
      ];

      // 12 intake days >= 800 kcal
      const dailyLogs: DailyLog[] = [];
      for (let d = 1; d <= 12; d++) {
        const dayStr = d < 10 ? `0${d}` : `${d}`;
        dailyLogs.push(makeDailyLog(`2026-10-${dayStr}`, 2400));
      }

      const result = solveAdaptiveTdee({
        today: '2026-10-14',
        previousEstimatedTdee: 2500,
        sex: 'male',
        goalConfig: goal,
        weightLogs,
        dailyLogs
      });

      expect(result.sufficiency.weight_sufficient).toBe(false);
      expect(result.status).not.toBe('ready');
      expect(result.estimated_tdee).toBe(2500);
    });

    it('rejects calibration when intake days are insufficient (< 10 days with >= 800 kcal)', () => {
      // 5 weights in recent 7 days, 2 in prior 7 days
      const weightLogs: WeightLog[] = [
        makeWeightLog('2026-10-02', 80, 80),
        makeWeightLog('2026-10-05', 80, 80),
        makeWeightLog('2026-10-08', 80, 80),
        makeWeightLog('2026-10-10', 80, 80),
        makeWeightLog('2026-10-11', 80, 80),
        makeWeightLog('2026-10-12', 80, 80),
        makeWeightLog('2026-10-14', 80, 80)
      ];

      // Only 8 days logged
      const dailyLogs: DailyLog[] = [];
      for (let d = 1; d <= 8; d++) {
        const dayStr = d < 10 ? `0${d}` : `${d}`;
        dailyLogs.push(makeDailyLog(`2026-10-${dayStr}`, 2400));
      }

      const result = solveAdaptiveTdee({
        today: '2026-10-14',
        previousEstimatedTdee: 2500,
        sex: 'male',
        goalConfig: goal,
        weightLogs,
        dailyLogs
      });

      expect(result.sufficiency.intake_sufficient).toBe(false);
      expect(result.status).not.toBe('ready');
      expect(result.estimated_tdee).toBe(2500);
    });

    it('solves adaptive TDEE, blends 30/70, and clamps to +/- 150 kcal when fully sufficient', () => {
      // Slices:
      // Window: 2026-10-01 to 2026-10-14
      // Weight logs: start at 2026-10-01 (trend 80.0), end at 2026-10-14 (trend 80.0) -> zero trend change
      const weightLogs: WeightLog[] = [
        makeWeightLog('2026-10-01', 80.0, 80.0), // prior 7d
        makeWeightLog('2026-10-04', 80.0, 80.0), // prior 7d
        makeWeightLog('2026-10-08', 80.0, 80.0), // recent 7d (1)
        makeWeightLog('2026-10-10', 80.0, 80.0), // recent 7d (2)
        makeWeightLog('2026-10-12', 80.0, 80.0), // recent 7d (3)
        makeWeightLog('2026-10-14', 80.0, 80.0)  // recent 7d (4)
      ];

      // 14 days of intake exactly 2400 kcal/day
      const dailyLogs: DailyLog[] = [];
      for (let d = 1; d <= 14; d++) {
        const dayStr = d < 10 ? `0${d}` : `${d}`;
        dailyLogs.push(makeDailyLog(`2026-10-${dayStr}`, 2400));
      }

      // Delta weight = 0 => delta tissue = 0 => observed TDEE = 2400
      // Previous TDEE = 2500
      // Blended = 0.30 * 2400 + 0.70 * 2500 = 720 + 1750 = 2470
      // Clamped in [2500 - 150, 2500 + 150] = [2350, 2650] => 2470
      const result = solveAdaptiveTdee({
        today: '2026-10-14',
        previousEstimatedTdee: 2500,
        sex: 'male',
        goalConfig: goal,
        weightLogs,
        dailyLogs
      });

      expect(result.status).toBe('ready');
      expect(result.sufficiency.weight_sufficient).toBe(true);
      expect(result.sufficiency.intake_sufficient).toBe(true);
      expect(result.diagnostics?.observed_tdee).toBe(2400);
      expect(result.estimated_tdee).toBe(2470);
      expect(result.recommended_targets?.daily_calorie_target).toBe(2470);
    });

    it('enforces +/- 150 kcal clamp on massive observed expenditure swings', () => {
      // Prior TDEE: 2000 kcal
      // Sudden apparent weight drop in trend from 80.0 to 78.0 over 13 days
      // delta_w_daily = -2 / 13 ~= -0.1538 kg/day => tissue delta = -0.1538 * 7700 = -1184 kcal/day
      // Intake: 2500 kcal/day => Observed TDEE: 2500 - (-1184) = 3684 kcal!
      // Blended = 0.30 * 3684 + 0.70 * 2000 = 1105.2 + 1400 = 2505.2 kcal
      // Clamp ceiling is 2000 + 150 = 2150 kcal!
      const weightLogs: WeightLog[] = [
        makeWeightLog('2026-10-01', 80.0, 80.0),
        makeWeightLog('2026-10-03', 79.5, 79.7),
        makeWeightLog('2026-10-08', 78.8, 79.0),
        makeWeightLog('2026-10-10', 78.5, 78.6),
        makeWeightLog('2026-10-12', 78.2, 78.3),
        makeWeightLog('2026-10-14', 78.0, 78.0)
      ];

      const dailyLogs: DailyLog[] = [];
      for (let d = 1; d <= 14; d++) {
        const dayStr = d < 10 ? `0${d}` : `${d}`;
        dailyLogs.push(makeDailyLog(`2026-10-${dayStr}`, 2500));
      }

      const result = solveAdaptiveTdee({
        today: '2026-10-14',
        previousEstimatedTdee: 2000,
        sex: 'male',
        goalConfig: goal,
        weightLogs,
        dailyLogs
      });

      expect(result.status).toBe('ready');
      expect(result.estimated_tdee).toBe(2150); // strictly clamped
    });
  });

  describe('computeWeightTrendAnalytics', () => {
    it('summarizes 7-day rate, compliance, and calibration readiness for UI', () => {
      const userSettings: UserSettings = {
        id: 'global_settings',
        locale: 'en',
        theme: 'dark',
        daily_calorie_target: 2000,
        custom_macros: { protein: 150, carbs: 200, fats: 60 },
        biometrics: {
          sex: 'female',
          birth_date: '1995-01-01',
          height_cm: 165,
          activity_multiplier: 1.4
        },
        goal_config: {
          goal_type: 'lose',
          weekly_rate_pct: -0.5,
          protein_g_per_kg: 1.8,
          fat_calorie_pct: 0.25
        }
      };

      const weightLogs: WeightLog[] = [
        { id: 'w1', date: '2026-10-07', timestamp: '2026-10-07T08:00:00Z', weight_kg: 65.0, trend_weight_kg: 65.0, updatedAt: 1 },
        { id: 'w2', date: '2026-10-14', timestamp: '2026-10-14T08:00:00Z', weight_kg: 64.5, trend_weight_kg: 64.7, updatedAt: 1 }
      ];

      const dailyLogs: DailyLog[] = [];

      const analytics = computeWeightTrendAnalytics({
        today: '2026-10-14',
        weightLogs,
        dailyLogs,
        userSettings
      });

      expect(analytics.current_raw_weight_kg).toBe(64.5);
      expect(analytics.current_trend_weight_kg).toBe(64.7);
      // Delta: 64.7 - 65.0 = -0.30 kg over 7 days => -0.30 kg/week
      expect(analytics.weekly_trend_rate_kg).toBe(-0.3);
      expect(analytics.calibration_status).toBe('collecting_data');
      expect(analytics.days_until_next_calibration).toBeGreaterThan(0);
    });
  });
});
