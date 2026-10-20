import { describe, it, expect } from 'vitest';
import {
  calculateAgeFromBirthDate,
  calculateBmr,
  calculateSeedTdee,
  calculateTargetsFromTdee,
  calculateBaselineSeed,
  daysBetween,
  addDaysToDate,
  roundTo2Decimals,
  previewNextTrendWeight,
  recalculateEWMAWeightTrend,
  solveAdaptiveTdee,
  computeWeightTrendAnalytics
} from '../src/index.js';
import type {
  WeightLog,
  DailyLog,
  UserSettings,
  UserGoalConfig,
  UserBiometrics,
  UserSex
} from '../src/index.js';

describe('Adaptive Expenditure & Weight Tracking Engine — Exhaustive & Destructive QA Suite', () => {
  // Helper factories
  const makeWeightLog = (
    date: string,
    weight_kg: number,
    trend_weight_kg: number = weight_kg,
    deleted: boolean = false
  ): WeightLog => ({
    id: `weight_${date}`,
    date,
    timestamp: `${date}T07:30:00Z`,
    weight_kg,
    trend_weight_kg,
    updatedAt: Date.now(),
    ...(deleted ? { _deleted: true } : {})
  });

  const makeDailyLog = (
    id: string,
    date: string,
    calories: number,
    deleted: boolean = false
  ): DailyLog => ({
    id,
    timestamp: `${date}T12:00:00Z`,
    date,
    meal_type: 'meal_lunch',
    food_reference_id: 'ref_food',
    quantity: 1,
    portion_name: 'portion',
    macros: {
      calories,
      protein: Math.round(calories * 0.25 / 4),
      carbs: Math.round(calories * 0.50 / 4),
      fats: Math.round(calories * 0.25 / 9)
    },
    updatedAt: Date.now(),
    ...(deleted ? { _deleted: true } : {})
  });

  // =========================================================================
  // SECTION 1: Exhaustive Matrix of Goals & Weekly Rhythms (weekly_rate_pct)
  // =========================================================================
  describe('1. Exhaustive Matrix of Goals & Weekly Rhythms', () => {
    const palMultipliers = [1.2, 1.375, 1.55, 1.725, 1.9];
    const sexes: UserSex[] = ['male', 'female'];

    describe('Lose Weight Matrix', () => {
      const lossRates = [-0.25, -0.5, -0.75, -1.0];

      sexes.forEach((sex) => {
        palMultipliers.forEach((pal) => {
          lossRates.forEach((rate) => {
            it(`verifies loss target for ${sex}, PAL ${pal}, rate ${rate}%/wk`, () => {
              const weightKg = sex === 'male' ? 82 : 64;
              const heightCm = sex === 'male' ? 178 : 165;
              const age = 30;
              const bmr = calculateBmr(weightKg, heightCm, age, sex);
              const seedTdee = calculateSeedTdee(bmr, pal);

              const goalConfig: UserGoalConfig = {
                goal_type: 'lose',
                weekly_rate_pct: rate,
                protein_g_per_kg: 2.0,
                fat_calorie_pct: 0.25
              };

              const targets = calculateTargetsFromTdee({
                tdee: seedTdee,
                weightKg,
                sex,
                goalConfig
              });

              // Expected daily energy delta: (rate / 100) * weight * 7700 / 7
              const expectedDeltaDaily = (rate / 100) * weightKg * 1100;
              const floorKcal = sex === 'female' ? 1200 : 1500;
              const expectedTargetKcal = Math.max(floorKcal, Math.round(seedTdee + expectedDeltaDaily));

              expect(targets.daily_calorie_target).toBe(expectedTargetKcal);
              expect(targets.daily_calorie_target).toBeGreaterThanOrEqual(floorKcal);

              // Protein verification
              const expectedProtein = Math.round(weightKg * 2.0);
              expect(targets.custom_macros.protein).toBe(expectedProtein);

              // Fats floor vs %
              const fatFloorKcal = weightKg * 0.7 * 9;
              const targetFatKcal = targets.daily_calorie_target * 0.25;
              const expectedFat = Math.round(Math.max(fatFloorKcal, targetFatKcal) / 9);
              expect(targets.custom_macros.fats).toBe(expectedFat);

              // Carbs remainder
              const remainderKcal = Math.max(
                0,
                targets.daily_calorie_target - (expectedProtein * 4 + expectedFat * 9)
              );
              const expectedCarbs = Math.round(remainderKcal / 4);
              expect(targets.custom_macros.carbs).toBe(expectedCarbs);
              expect(targets.custom_macros.carbs).toBeGreaterThanOrEqual(0);
            });
          });
        });
      });
    });

    describe('Maintain Weight Matrix', () => {
      sexes.forEach((sex) => {
        palMultipliers.forEach((pal) => {
          it(`verifies maintain target equals round(TDEE) for ${sex}, PAL ${pal}`, () => {
            const weightKg = sex === 'male' ? 78 : 58;
            const heightCm = sex === 'male' ? 175 : 162;
            const age = 28;
            const bmr = calculateBmr(weightKg, heightCm, age, sex);
            const seedTdee = calculateSeedTdee(bmr, pal);

            const goalConfig: UserGoalConfig = {
              goal_type: 'maintain',
              weekly_rate_pct: 0,
              protein_g_per_kg: 1.8,
              fat_calorie_pct: 0.28
            };

            const targets = calculateTargetsFromTdee({
              tdee: seedTdee,
              weightKg,
              sex,
              goalConfig
            });

            const floorKcal = sex === 'female' ? 1200 : 1500;
            const expectedTarget = Math.max(floorKcal, Math.round(seedTdee));
            expect(targets.daily_calorie_target).toBe(expectedTarget);
            expect(targets.custom_macros.protein).toBe(Math.round(weightKg * 1.8));
            expect(targets.custom_macros.fats).toBeGreaterThanOrEqual(Math.round(weightKg * 0.7));
            expect(targets.custom_macros.carbs).toBeGreaterThanOrEqual(0);
          });
        });
      });
    });

    describe('Gain Muscle Matrix', () => {
      const gainRates = [0.20, 0.25, 0.35, 0.50];

      gainRates.forEach((rate) => {
        it(`verifies gain target for rate +${rate}%/wk with 2.0 g/kg protein`, () => {
          const weightKg = 75;
          const seedTdee = 2600;
          const goalConfig: UserGoalConfig = {
            goal_type: 'gain',
            weekly_rate_pct: rate,
            protein_g_per_kg: 2.0,
            fat_calorie_pct: 0.25
          };

          const targets = calculateTargetsFromTdee({
            tdee: seedTdee,
            weightKg,
            sex: 'male',
            goalConfig
          });

          const expectedSurplus = (rate / 100) * weightKg * 1100;
          const expectedTarget = Math.round(seedTdee + expectedSurplus);
          expect(targets.daily_calorie_target).toBe(expectedTarget);
          expect(targets.daily_calorie_target).toBeGreaterThan(seedTdee);
          expect(targets.custom_macros.protein).toBe(150); // 75 * 2.0
          expect(targets.custom_macros.carbs).toBeGreaterThan(0);
        });
      });
    });

    describe('Macro Boundary & Edge Cases', () => {
      it('clamps female calorie target to 1200 kcal safety floor when deficit overshoots', () => {
        // Small sedentary female: 45 kg, 150 cm, 45 yo
        // BMR = 10*45 + 6.25*150 - 5*45 - 161 = 450 + 937.5 - 225 - 161 = 1001.5 => 1002
        // PAL 1.2 => TDEE = round(1002 * 1.2) = 1202
        // Aggressive -1.0%/wk deficit: -1.0/100 * 45 * 1100 = -495 kcal
        // Raw target: 1202 - 495 = 707 kcal!
        const goalConfig: UserGoalConfig = {
          goal_type: 'lose',
          weekly_rate_pct: -1.0,
          protein_g_per_kg: 1.8,
          fat_calorie_pct: 0.25
        };

        const targets = calculateTargetsFromTdee({
          tdee: 1202,
          weightKg: 45,
          sex: 'female',
          goalConfig
        });

        expect(targets.daily_calorie_target).toBe(1200);
        expect(targets.custom_macros.protein).toBe(Math.round(45 * 1.8)); // 81g
        expect(targets.custom_macros.fats).toBeGreaterThanOrEqual(Math.round(45 * 0.7)); // >= 32g
        expect(targets.custom_macros.carbs).toBeGreaterThanOrEqual(0);
      });

      it('clamps male calorie target to 1500 kcal safety floor when deficit overshoots', () => {
        // Small sedentary male: 54 kg, 160 cm, 50 yo
        // BMR = 10*54 + 6.25*160 - 5*50 + 5 = 540 + 1000 - 250 + 5 = 1295
        // PAL 1.2 => TDEE = 1554
        // Aggressive -1.0%/wk deficit: -1.0/100 * 54 * 1100 = -594 kcal
        // Raw target: 1554 - 594 = 960 kcal!
        const goalConfig: UserGoalConfig = {
          goal_type: 'lose',
          weekly_rate_pct: -1.0,
          protein_g_per_kg: 2.0,
          fat_calorie_pct: 0.25
        };

        const targets = calculateTargetsFromTdee({
          tdee: 1554,
          weightKg: 54,
          sex: 'male',
          goalConfig
        });

        expect(targets.daily_calorie_target).toBe(1500);
        expect(targets.custom_macros.protein).toBe(108); // 54 * 2.0
      });

      it('correctly transitions across the fat floor (0.7g/kg * 9 kcal) vs fat % crossover point', () => {
        // For W = 80 kg and fat_calorie_pct = 0.25:
        // Fat floor energy = 80 * 0.7 * 9 = 504 kcal
        // Crossover target energy = 504 / 0.25 = 2016 kcal
        const weightKg = 80;
        const goalConfig: UserGoalConfig = {
          goal_type: 'maintain',
          weekly_rate_pct: 0,
          protein_g_per_kg: 2.0,
          fat_calorie_pct: 0.25
        };

        // 1. Strictly below crossover: Target = 1800 kcal
        // 1800 * 0.25 = 450 kcal < 504 kcal => floor wins: round(504 / 9) = 56g
        const targetsBelow = calculateTargetsFromTdee({
          tdee: 1800,
          weightKg,
          sex: 'male',
          goalConfig
        });
        expect(targetsBelow.custom_macros.fats).toBe(56);

        // 2. Exactly at crossover: Target = 2016 kcal
        // 2016 * 0.25 = 504 kcal == 504 kcal => round(504 / 9) = 56g
        const targetsAt = calculateTargetsFromTdee({
          tdee: 2016,
          weightKg,
          sex: 'male',
          goalConfig
        });
        expect(targetsAt.custom_macros.fats).toBe(56);

        // 3. Strictly above crossover: Target = 2400 kcal
        // 2400 * 0.25 = 600 kcal > 504 kcal => percentage wins: round(600 / 9) = 67g
        const targetsAbove = calculateTargetsFromTdee({
          tdee: 2400,
          weightKg,
          sex: 'male',
          goalConfig
        });
        expect(targetsAbove.custom_macros.fats).toBe(67);
      });

      it('safely clamps carbohydrate grams to 0 (never negative) when P_kcal + F_kcal > Target_kcal', () => {
        // Extreme edge case: High body weight (150 kg), aggressive deficit, high protein (2.2 g/kg)
        // Protein: 150 * 2.2 = 330g => 330 * 4 = 1320 kcal
        // Fat floor: 150 * 0.7 * 9 = 945 kcal => round(945 / 9) = 105g => 945 kcal
        // Protein kcal + Fat kcal = 1320 + 945 = 2265 kcal!
        // Suppose Target calories is clamped to 1500 kcal
        const targets = calculateTargetsFromTdee({
          tdee: 1500,
          weightKg: 150,
          sex: 'male',
          goalConfig: {
            goal_type: 'lose',
            weekly_rate_pct: -1.0,
            protein_g_per_kg: 2.2,
            fat_calorie_pct: 0.20
          }
        });

        expect(targets.daily_calorie_target).toBe(1500);
        expect(targets.custom_macros.protein).toBe(330);
        expect(targets.custom_macros.fats).toBe(105);
        // Remainder would be 1500 - (1320 + 945) = -765 kcal => must be clamped to 0!
        expect(targets.custom_macros.carbs).toBe(0);
        expect(Number.isNaN(targets.custom_macros.carbs)).toBe(false);
      });
    });
  });

  // =========================================================================
  // SECTION 2: EWMA Smoothing Multi-Week Daily & Gap Scenarios
  // =========================================================================
  describe('2. EWMA Smoothing Multi-Week Daily & Gap Scenarios', () => {
    it('simulates 30 days of noisy scale weigh-ins and verifies trend dampens spikes (alpha = 0.12)', () => {
      // 30 days starting 2026-06-01
      // Underlying true weight slowly decreases from 85.0 kg to 82.1 kg (-0.1 kg/day)
      // Noise: weekend sodium spikes (+1.5 kg on Day 6, 13, 20, 27)
      //        mid-week dehydration (-0.8 kg on Day 3, 10, 17, 24)
      //        mild flutters on other days
      const rawWeights: number[] = [];
      const logs: WeightLog[] = [];

      for (let day = 1; day <= 30; day++) {
        const date = `2026-06-${day < 10 ? `0${day}` : day}`;
        const trueWeight = 85.0 - (day - 1) * 0.1;
        let noise = 0;
        if (day % 7 === 6) {
          noise = 1.5; // Weekend high-sodium restaurant spike
        } else if (day % 7 === 3) {
          noise = -0.8; // Dehydration post long-run
        } else if (day % 2 === 0) {
          noise = 0.3;
        } else {
          noise = -0.2;
        }
        const rawWeight = roundTo2Decimals(trueWeight + noise);
        rawWeights.push(rawWeight);
        logs.push(makeWeightLog(date, rawWeight, 0));
      }

      const smoothed = recalculateEWMAWeightTrend(logs);
      expect(smoothed.length).toBe(30);

      // Verify that the maximum single-day jump in trend weight is strictly smaller than the raw weight jump
      let maxRawDelta = 0;
      let maxTrendDelta = 0;
      const rawDiffs: number[] = [];
      const trendDiffs: number[] = [];

      for (let i = 1; i < 30; i++) {
        const rawDelta = Math.abs(smoothed[i].weight_kg - smoothed[i - 1].weight_kg);
        const trendDelta = Math.abs(smoothed[i].trend_weight_kg - smoothed[i - 1].trend_weight_kg);
        rawDiffs.push(rawDelta);
        trendDiffs.push(trendDelta);
        if (rawDelta > maxRawDelta) maxRawDelta = rawDelta;
        if (trendDelta > maxTrendDelta) maxTrendDelta = trendDelta;

        // Daily trend change must never exceed alpha * raw jump
        // trend_i - trend_{i-1} = 0.12 * (raw_i - trend_{i-1})
        const expectedDiff = roundTo2Decimals(0.12 * (smoothed[i].weight_kg - smoothed[i - 1].trend_weight_kg));
        const actualDiff = roundTo2Decimals(smoothed[i].trend_weight_kg - smoothed[i - 1].trend_weight_kg);
        expect(Math.abs(actualDiff - expectedDiff)).toBeLessThanOrEqual(0.02); // precision allowance
      }

      // Max raw spike (e.g. from -0.8 to +1.5) is > 2.0 kg, but trend jump must be dampened under 0.4 kg
      expect(maxRawDelta).toBeGreaterThan(1.5);
      expect(maxTrendDelta).toBeLessThan(0.40);

      // Variance/Mean absolute diff of trend must be significantly lower than raw
      const avgRawDiff = rawDiffs.reduce((a, b) => a + b, 0) / rawDiffs.length;
      const avgTrendDiff = trendDiffs.reduce((a, b) => a + b, 0) / trendDiffs.length;
      expect(avgTrendDiff).toBeLessThan(avgRawDiff * 0.35); // dampened by > 65%
    });

    it('verifies exact mathematical expectations for multi-day gaps (alpha_eff = 1 - (1 - alpha)^delta_days)', () => {
      const alpha = 0.12;
      const initialTrend = 80.0;
      const newWeight = 82.0; // +2.0 kg raw jump
      const startDate = '2026-06-01';

      const gapDays = [1, 2, 3, 5, 7, 10, 14, 21, 30];

      gapDays.forEach((days) => {
        const nextDate = addDaysToDate(startDate, days);
        const expectedAlphaEff = 1 - Math.pow(1 - alpha, days);
        const expectedTrend = roundTo2Decimals(initialTrend + expectedAlphaEff * (newWeight - initialTrend));

        const actualTrend = previewNextTrendWeight(initialTrend, startDate, newWeight, nextDate);
        expect(actualTrend).toBe(expectedTrend);

        // Verification of specific known values:
        if (days === 1) {
          expect(actualTrend).toBe(80.24); // 80.0 + 0.12 * 2.0
        } else if (days === 2) {
          // alpha_eff = 1 - 0.88^2 = 0.2256 => 80.0 + 0.2256 * 2.0 = 80.4512 => 80.45
          expect(actualTrend).toBe(80.45);
        } else if (days === 5) {
          // alpha_eff = 1 - 0.88^5 = 0.472268... => 80.0 + 0.472268 * 2.0 = 80.9445 => 80.94
          expect(actualTrend).toBe(80.94);
        } else if (days === 7) {
          // alpha_eff = 1 - 0.88^7 = 0.591324... => 80.0 + 0.591324 * 2.0 = 81.1826 => 81.18
          expect(actualTrend).toBe(81.18);
        } else if (days === 14) {
          // alpha_eff = 1 - 0.88^14 = 0.832984... => 80.0 + 0.832984 * 2.0 = 81.6659 => 81.67
          expect(actualTrend).toBe(81.67);
        }
      });
    });

    describe('Retroactive Historical Operations', () => {
      // Build a 14-day sequence
      const build14DayLogs = () => {
        const logs: WeightLog[] = [];
        for (let i = 1; i <= 14; i++) {
          const dayStr = i < 10 ? `0${i}` : `${i}`;
          logs.push(makeWeightLog(`2026-06-${dayStr}`, 80.0));
        }
        return logs;
      };

      it('correctly cascade-updates subsequent trends when a historical weight is modified in the middle of a 14-day series', () => {
        const baselineLogs = build14DayLogs();
        const baseCalculated = recalculateEWMAWeightTrend(baselineLogs);

        // Modify Day 7 from 80.0 to 85.0 (+5.0 kg)
        const modifiedLogs = baselineLogs.map((log) =>
          log.date === '2026-06-07' ? { ...log, weight_kg: 85.0 } : log
        );

        const updated = recalculateEWMAWeightTrend(modifiedLogs);

        // Days 1 through 6 MUST remain completely unaffected
        for (let i = 0; i < 6; i++) {
          expect(updated[i].trend_weight_kg).toBe(baseCalculated[i].trend_weight_kg);
          expect(updated[i].trend_weight_kg).toBe(80.0);
        }

        // Day 7 must jump by alpha * 5.0 = 0.12 * 5.0 = 0.60 kg => 80.60 kg
        expect(updated[6].trend_weight_kg).toBe(80.60);

        // Days 8 through 14 must cascade the higher trend, slowly converging back to 80.0
        for (let i = 7; i < 14; i++) {
          expect(updated[i].trend_weight_kg).toBeGreaterThan(80.0);
          expect(updated[i].trend_weight_kg).toBeLessThan(updated[i - 1].trend_weight_kg);
        }
      });

      it('correctly cascade-updates subsequent trends when a missing date is retroactively inserted', () => {
        // Initial series: Day 1, 2, 3, 4, 6, 7, 8 (Day 5 skipped)
        const initialLogs: WeightLog[] = [
          makeWeightLog('2026-06-01', 80.0),
          makeWeightLog('2026-06-02', 80.0),
          makeWeightLog('2026-06-03', 80.0),
          makeWeightLog('2026-06-04', 80.0),
          makeWeightLog('2026-06-06', 82.0), // Gap of 2 days from Day 4
          makeWeightLog('2026-06-07', 82.0),
          makeWeightLog('2026-06-08', 82.0)
        ];

        const initialSmoothed = recalculateEWMAWeightTrend(initialLogs);
        // Before insertion, Day 6 had a 2-day gap from Day 4 (alpha_eff = 0.2256):
        // 80.0 + 0.2256 * 2.0 = 80.45 kg
        expect(initialSmoothed.find((l) => l.date === '2026-06-06')?.trend_weight_kg).toBe(80.45);

        // Now retroactively insert Day 5 with weight 81.0 kg
        const insertedLogs = [
          ...initialLogs,
          makeWeightLog('2026-06-05', 81.0)
        ];

        const recalculated = recalculateEWMAWeightTrend(insertedLogs);
        expect(recalculated.length).toBe(8);

        // Days 1-4 remain unchanged
        expect(recalculated[0].trend_weight_kg).toBe(80.0);
        expect(recalculated[3].trend_weight_kg).toBe(80.0);

        // Day 5 newly computed: 80.0 + 0.12 * (81.0 - 80.0) = 80.12 kg
        const day5 = recalculated.find((l) => l.date === '2026-06-05');
        expect(day5?.trend_weight_kg).toBe(80.12);

        // Day 6 now calculates from Day 5 (1-day gap!):
        // 80.12 + 0.12 * (82.0 - 80.12) = 80.12 + 0.2256 = 80.35 kg (instead of 80.45!)
        const day6 = recalculated.find((l) => l.date === '2026-06-06');
        expect(day6?.trend_weight_kg).toBe(80.35);
      });

      it('correctly recalculates trends and skips soft-deleted logs (_deleted: true)', () => {
        const logs: WeightLog[] = [
          makeWeightLog('2026-06-01', 80.0),
          makeWeightLog('2026-06-02', 80.0),
          makeWeightLog('2026-06-03', 85.0, 85.0, true), // Soft-deleted spike!
          makeWeightLog('2026-06-04', 80.0)
        ];

        const result = recalculateEWMAWeightTrend(logs);
        // Deleted log must be omitted from output
        expect(result.length).toBe(3);
        expect(result.map((r) => r.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-04']);

        // Day 4 bridges from Day 2 (2-day gap) with weights 80.0 and 80.0 => trend is 80.0
        expect(result[2].trend_weight_kg).toBe(80.0);
      });
    });
  });

  // =========================================================================
  // SECTION 3: Multi-Week Longitudinal Simulation of the 14-Day Adaptive TDEE Solver
  // =========================================================================
  describe('3. Multi-Week Longitudinal Simulation (28-day / 4-cycle simulations)', () => {
    const goalLose: UserGoalConfig = {
      goal_type: 'lose',
      weekly_rate_pct: -0.5, // -0.5%/wk
      protein_g_per_kg: 2.0,
      fat_calorie_pct: 0.25
    };

    it('Scenario A: Weight Loss Plateau / Metabolic Adaptation over 28 days', () => {
      // User expects to lose weight eating 2000 kcal/day with initial estimated TDEE of 2500 kcal.
      // But weight stays flat at 80.0 kg for 28 straight days.
      // Solver should repeatedly detect lower actual expenditure, blend 30/70, clamp at -150 kcal/step,
      // and ratched down target calories and custom macros.

      const weightLogs: WeightLog[] = [];
      const dailyLogs: DailyLog[] = [];

      for (let day = 1; day <= 28; day++) {
        const date = addDaysToDate('2026-07-01', day - 1);
        weightLogs.push(makeWeightLog(date, 80.0, 80.0));
        dailyLogs.push(makeDailyLog(`d_${date}`, date, 2000));
      }

      // Calibration Cycle 1 (Day 14: 2026-07-14)
      const day14 = '2026-07-14';
      const cycle1 = solveAdaptiveTdee({
        today: day14,
        previousEstimatedTdee: 2500,
        sex: 'male',
        goalConfig: goalLose,
        weightLogs,
        dailyLogs
      });

      expect(cycle1.status).toBe('ready');
      expect(cycle1.diagnostics?.observed_tdee).toBe(2000); // 2000 intake - 0 tissue delta
      // Blended = 0.3 * 2000 + 0.7 * 2500 = 600 + 1750 = 2350 kcal
      // Clamp [-150, +150] from 2500 is [2350, 2650] => exactly 2350
      expect(cycle1.estimated_tdee).toBe(2350);
      // New target: 2350 - (0.5/100 * 80 * 1100) = 2350 - 440 = 1910 kcal
      expect(cycle1.recommended_targets?.daily_calorie_target).toBe(1910);
      expect(cycle1.recommended_targets?.custom_macros.protein).toBe(160);

      // Calibration Cycle 2 (Day 21: 2026-07-21)
      const day21 = '2026-07-21';
      const cycle2 = solveAdaptiveTdee({
        today: day21,
        previousEstimatedTdee: cycle1.estimated_tdee, // 2350
        sex: 'male',
        goalConfig: goalLose,
        weightLogs,
        dailyLogs
      });

      expect(cycle2.status).toBe('ready');
      expect(cycle2.diagnostics?.observed_tdee).toBe(2000);
      // Blended = 0.3 * 2000 + 0.7 * 2350 = 600 + 1645 = 2245 kcal
      // Clamp [-150, +150] from 2350 is [2200, 2500] => 2245
      expect(cycle2.estimated_tdee).toBe(2245);
      expect(cycle2.recommended_targets?.daily_calorie_target).toBe(2245 - 440); // 1805 kcal

      // Calibration Cycle 3 (Day 28: 2026-07-28)
      const day28 = '2026-07-28';
      const cycle3 = solveAdaptiveTdee({
        today: day28,
        previousEstimatedTdee: cycle2.estimated_tdee, // 2245
        sex: 'male',
        goalConfig: goalLose,
        weightLogs,
        dailyLogs
      });

      expect(cycle3.status).toBe('ready');
      expect(cycle3.diagnostics?.observed_tdee).toBe(2000);
      // Blended = 0.3 * 2000 + 0.7 * 2245 = 600 + 1571.5 = 2171.5 => round 2172 kcal
      expect(cycle3.estimated_tdee).toBe(2172);
      expect(cycle3.recommended_targets?.daily_calorie_target).toBe(2172 - 440); // 1732 kcal
    });

    it('Scenario B: Faster-Than-Expected Weight Loss / Underestimated TDEE', () => {
      // User eats 2200 kcal/day and loses 1.0 kg/week (raw weight drops by 0.143 kg/day)
      // Initial estimated TDEE = 2200 kcal.
      // Expected: solver detects higher actual TDEE, blends 30/70, clamps at +150 kcal ceiling per calibration cycle.

      const rawLogs: WeightLog[] = [];
      const dailyLogs: DailyLog[] = [];

      for (let day = 1; day <= 28; day++) {
        const date = addDaysToDate('2026-08-01', day - 1);
        const weight = roundTo2Decimals(85.0 - (day - 1) * (1.0 / 7));
        rawLogs.push(makeWeightLog(date, weight));
        dailyLogs.push(makeDailyLog(`d_${date}`, date, 2200));
      }

      const weightLogs = recalculateEWMAWeightTrend(rawLogs);

      // Cycle 1 at Day 14
      const day14 = '2026-08-14';
      const cycle1 = solveAdaptiveTdee({
        today: day14,
        previousEstimatedTdee: 2200,
        sex: 'male',
        goalConfig: goalLose,
        weightLogs,
        dailyLogs
      });

      expect(cycle1.status).toBe('ready');
      // Observed TDEE is high (~3000+ kcal because user lost 1.8+ kg on 2200 kcal)
      expect(cycle1.diagnostics?.observed_tdee).toBeGreaterThan(2800);
      // Blended would be high, but clamped strictly to previous + 150 kcal
      expect(cycle1.estimated_tdee).toBe(2200 + 150); // 2350 kcal
      expect(cycle1.recommended_targets?.daily_calorie_target).toBeGreaterThan(1800);

      // Cycle 2 at Day 21
      const day21 = '2026-08-21';
      const cycle2 = solveAdaptiveTdee({
        today: day21,
        previousEstimatedTdee: cycle1.estimated_tdee, // 2350
        sex: 'male',
        goalConfig: goalLose,
        weightLogs,
        dailyLogs
      });

      expect(cycle2.status).toBe('ready');
      // Stepped up by another +150 kcal clamp
      expect(cycle2.estimated_tdee).toBe(2350 + 150); // 2500 kcal

      // Cycle 3 at Day 28
      const day28 = '2026-08-28';
      const cycle3 = solveAdaptiveTdee({
        today: day28,
        previousEstimatedTdee: cycle2.estimated_tdee, // 2500
        sex: 'male',
        goalConfig: goalLose,
        weightLogs,
        dailyLogs
      });

      expect(cycle3.status).toBe('ready');
      expect(cycle3.estimated_tdee).toBe(2500 + 150); // 2650 kcal
    });

    it('Scenario C: Lean Muscle Gain with adapting trend weight and protein scaling', () => {
      // User is gaining weight as planned (+0.25%/wk)
      // Eats 2800 kcal/day, initial weight 70.0 kg, TDEE initial = 2600 kcal
      const goalGain: UserGoalConfig = {
        goal_type: 'gain',
        weekly_rate_pct: 0.25,
        protein_g_per_kg: 2.0,
        fat_calorie_pct: 0.25
      };

      const rawLogs: WeightLog[] = [];
      const dailyLogs: DailyLog[] = [];

      for (let day = 1; day <= 28; day++) {
        const date = addDaysToDate('2026-09-01', day - 1);
        // Gaining ~0.25 kg per week => ~0.0357 kg/day
        const weight = roundTo2Decimals(70.0 + (day - 1) * (0.25 / 7));
        rawLogs.push(makeWeightLog(date, weight));
        dailyLogs.push(makeDailyLog(`d_${date}`, date, 2800));
      }

      const weightLogs = recalculateEWMAWeightTrend(rawLogs);

      const day14 = '2026-09-14';
      const cycle1 = solveAdaptiveTdee({
        today: day14,
        previousEstimatedTdee: 2600,
        sex: 'male',
        goalConfig: goalGain,
        weightLogs,
        dailyLogs
      });

      expect(cycle1.status).toBe('ready');
      const startWeight = cycle1.diagnostics?.start_trend_weight_kg || 70.0;
      const endWeight = cycle1.diagnostics?.end_trend_weight_kg || 70.0;
      expect(endWeight).toBeGreaterThan(startWeight);

      // Protein scales with end trend weight: round(endWeight * 2.0)
      const expectedProtein = Math.round(endWeight * 2.0);
      expect(cycle1.recommended_targets?.custom_macros.protein).toBe(expectedProtein);
      expect(cycle1.recommended_targets?.custom_macros.protein).toBeGreaterThanOrEqual(140);
    });
  });

  // =========================================================================
  // SECTION 4: Exact Boundary Tests on the Data Sufficiency Gate
  // =========================================================================
  describe('4. Exact Boundary Tests on Data Sufficiency Gate', () => {
    const today = '2026-10-14';
    // Window: 2026-10-01 to 2026-10-14
    // Prior 7d: 2026-10-01 to 2026-10-07
    // Recent 7d: 2026-10-08 to 2026-10-14

    const goal: UserGoalConfig = {
      goal_type: 'maintain',
      weekly_rate_pct: 0,
      protein_g_per_kg: 2.0,
      fat_calorie_pct: 0.25
    };

    // Helper to generate 10 qualifying food days (2000 kcal each)
    const make10ValidFoodDays = (): DailyLog[] => {
      const logs: DailyLog[] = [];
      for (let d = 1; d <= 10; d++) {
        const dayStr = d < 10 ? `0${d}` : `${d}`;
        logs.push(makeDailyLog(`f_${d}`, `2026-10-${dayStr}`, 2000));
      }
      return logs;
    };

    it('boundary: exactly 3 vs 4 weigh-ins in [today-6, today]', () => {
      const dailyLogs = make10ValidFoodDays();
      const priorLog = makeWeightLog('2026-10-05', 80.0); // 1 prior weigh-in

      // Subcase 1: Exactly 3 recent weigh-ins
      const threeRecentLogs: WeightLog[] = [
        priorLog,
        makeWeightLog('2026-10-09', 80.0),
        makeWeightLog('2026-10-11', 80.0),
        makeWeightLog('2026-10-13', 80.0)
      ];

      const resFail = solveAdaptiveTdee({
        today,
        previousEstimatedTdee: 2500,
        sex: 'male',
        goalConfig: goal,
        weightLogs: threeRecentLogs,
        dailyLogs
      });

      expect(resFail.sufficiency.recent_weight_count).toBe(3);
      expect(resFail.sufficiency.weight_sufficient).toBe(false);
      expect(resFail.status).not.toBe('ready');

      // Subcase 2: Exactly 4 recent weigh-ins
      const fourRecentLogs: WeightLog[] = [
        ...threeRecentLogs,
        makeWeightLog('2026-10-14', 80.0)
      ];

      const resPass = solveAdaptiveTdee({
        today,
        previousEstimatedTdee: 2500,
        sex: 'male',
        goalConfig: goal,
        weightLogs: fourRecentLogs,
        dailyLogs
      });

      expect(resPass.sufficiency.recent_weight_count).toBe(4);
      expect(resPass.sufficiency.weight_sufficient).toBe(true);
      expect(resPass.status).toBe('ready');
    });

    it('boundary: exactly 0 vs 1 weigh-in in [today-13, today-7]', () => {
      const dailyLogs = make10ValidFoodDays();
      // 4 recent weigh-ins
      const recentLogs: WeightLog[] = [
        makeWeightLog('2026-10-08', 80.0),
        makeWeightLog('2026-10-10', 80.0),
        makeWeightLog('2026-10-12', 80.0),
        makeWeightLog('2026-10-14', 80.0)
      ];

      // Subcase 1: Exactly 0 prior weigh-ins
      const res0Prior = solveAdaptiveTdee({
        today,
        previousEstimatedTdee: 2500,
        sex: 'male',
        goalConfig: goal,
        weightLogs: recentLogs,
        dailyLogs
      });

      expect(res0Prior.sufficiency.prior_weight_count).toBe(0);
      expect(res0Prior.sufficiency.weight_sufficient).toBe(false);
      expect(res0Prior.status).not.toBe('ready');

      // Subcase 2: Exactly 1 prior weigh-in on boundary (today-7: 2026-10-07)
      const res1Prior = solveAdaptiveTdee({
        today,
        previousEstimatedTdee: 2500,
        sex: 'male',
        goalConfig: goal,
        weightLogs: [...recentLogs, makeWeightLog('2026-10-07', 80.0)],
        dailyLogs
      });

      expect(res1Prior.sufficiency.prior_weight_count).toBe(1);
      expect(res1Prior.sufficiency.weight_sufficient).toBe(true);
      expect(res1Prior.status).toBe('ready');
    });

    it('boundary: same-day multiple food logs summing to 799 kcal vs 800 kcal', () => {
      // 9 days with 2000 kcal
      const baseDailyLogs: DailyLog[] = [];
      for (let d = 1; d <= 9; d++) {
        baseDailyLogs.push(makeDailyLog(`f_${d}`, `2026-10-0${d}`, 2000));
      }

      // Sufficient weights (1 prior, 4 recent)
      const weightLogs: WeightLog[] = [
        makeWeightLog('2026-10-05', 80.0),
        makeWeightLog('2026-10-08', 80.0),
        makeWeightLog('2026-10-10', 80.0),
        makeWeightLog('2026-10-12', 80.0),
        makeWeightLog('2026-10-14', 80.0)
      ];

      // 10th day (2026-10-10) with 3 meals summing to 799 kcal (300 + 300 + 199)
      const logs799: DailyLog[] = [
        ...baseDailyLogs,
        makeDailyLog('m1', '2026-10-10', 300),
        makeDailyLog('m2', '2026-10-10', 300),
        makeDailyLog('m3', '2026-10-10', 199)
      ];

      const res799 = solveAdaptiveTdee({
        today,
        previousEstimatedTdee: 2500,
        sex: 'male',
        goalConfig: goal,
        weightLogs,
        dailyLogs: logs799
      });

      // Day 10 failed to qualify (799 < 800) => qualifying_intake_days is 9
      expect(res799.sufficiency.qualifying_intake_days).toBe(9);
      expect(res799.sufficiency.intake_sufficient).toBe(false);
      expect(res799.status).not.toBe('ready');

      // Now 10th day with 3 meals summing to 800 kcal (300 + 300 + 200)
      const logs800: DailyLog[] = [
        ...baseDailyLogs,
        makeDailyLog('m1', '2026-10-10', 300),
        makeDailyLog('m2', '2026-10-10', 300),
        makeDailyLog('m3', '2026-10-10', 200)
      ];

      const res800 = solveAdaptiveTdee({
        today,
        previousEstimatedTdee: 2500,
        sex: 'male',
        goalConfig: goal,
        weightLogs,
        dailyLogs: logs800
      });

      // Day 10 qualifies (800 >= 800) => qualifying_intake_days is 10
      expect(res800.sufficiency.qualifying_intake_days).toBe(10);
      expect(res800.sufficiency.intake_sufficient).toBe(true);
      expect(res800.status).toBe('ready');
    });

    it('boundary: exactly 9 valid food days (gate fails -> insufficient_logs) vs 10 valid food days (gate passes -> ready)', () => {
      // 5 valid weight logs (1 prior, 4 recent)
      const weightLogs: WeightLog[] = [
        makeWeightLog('2026-10-02', 80.0),
        makeWeightLog('2026-10-08', 80.0),
        makeWeightLog('2026-10-10', 80.0),
        makeWeightLog('2026-10-12', 80.0),
        makeWeightLog('2026-10-14', 80.0)
      ];

      // User has 10 total food days logged, but the 10th day is only 500 kcal (< 800 kcal)
      // Exactly 9 qualifying food days!
      const logs9Qualifying: DailyLog[] = [];
      for (let d = 1; d <= 9; d++) {
        logs9Qualifying.push(makeDailyLog(`f_${d}`, `2026-10-0${d}`, 1800));
      }
      logs9Qualifying.push(makeDailyLog('f_10', '2026-10-10', 500)); // Under 800 kcal!

      const res9 = solveAdaptiveTdee({
        today,
        previousEstimatedTdee: 2500,
        sex: 'male',
        goalConfig: goal,
        weightLogs,
        dailyLogs: logs9Qualifying
      });

      expect(res9.sufficiency.qualifying_intake_days).toBe(9);
      expect(res9.sufficiency.intake_sufficient).toBe(false);
      expect(res9.status).toBe('insufficient_logs'); // User has >= 5 weights and >= 10 history days, but missed food threshold

      // Now exactly 10 qualifying food days >= 800 kcal
      const logs10Qualifying: DailyLog[] = [
        ...logs9Qualifying.slice(0, 9),
        makeDailyLog('f_10', '2026-10-10', 1800)
      ];

      const res10 = solveAdaptiveTdee({
        today,
        previousEstimatedTdee: 2500,
        sex: 'male',
        goalConfig: goal,
        weightLogs,
        dailyLogs: logs10Qualifying
      });

      expect(res10.sufficiency.qualifying_intake_days).toBe(10);
      expect(res10.sufficiency.intake_sufficient).toBe(true);
      expect(res10.status).toBe('ready');

      // Contrast: Brand new user with only 9 total days ever logged in history
      const resEarlyCollecting = solveAdaptiveTdee({
        today,
        previousEstimatedTdee: 2500,
        sex: 'male',
        goalConfig: goal,
        weightLogs,
        dailyLogs: logs9Qualifying.slice(0, 9) // only 9 total logs ever
      });
      expect(resEarlyCollecting.status).toBe('collecting_data');
    });

    it('boundary: soft-deleted logs (_deleted: true) in both weight_logs and daily_logs are ignored', () => {
      // Setup: exactly 3 valid recent weights + 1 soft-deleted recent weight
      const weightLogs: WeightLog[] = [
        makeWeightLog('2026-10-05', 80.0), // 1 valid prior
        makeWeightLog('2026-10-08', 80.0), // valid recent 1
        makeWeightLog('2026-10-10', 80.0), // valid recent 2
        makeWeightLog('2026-10-12', 80.0), // valid recent 3
        makeWeightLog('2026-10-14', 80.0, 80.0, true) // soft-deleted recent 4!
      ];

      // Setup: 9 valid food days + 1 soft-deleted food day
      const dailyLogs: DailyLog[] = [];
      for (let d = 1; d <= 9; d++) {
        dailyLogs.push(makeDailyLog(`f_${d}`, `2026-10-0${d}`, 2000));
      }
      dailyLogs.push(makeDailyLog('f_deleted', '2026-10-10', 2000, true)); // soft-deleted day 10!

      const result = solveAdaptiveTdee({
        today,
        previousEstimatedTdee: 2500,
        sex: 'male',
        goalConfig: goal,
        weightLogs,
        dailyLogs
      });

      // Recent weights count must be 3 (not 4)
      expect(result.sufficiency.recent_weight_count).toBe(3);
      expect(result.sufficiency.weight_sufficient).toBe(false);

      // Food qualifying days must be 9 (not 10)
      expect(result.sufficiency.qualifying_intake_days).toBe(9);
      expect(result.sufficiency.intake_sufficient).toBe(false);

      expect(result.status).not.toBe('ready');

      // Also verify computeWeightTrendAnalytics ignores soft-deleted logs
      const userSettings: UserSettings = {
        id: 'global_settings',
        locale: 'en',
        theme: 'system',
        daily_calorie_target: 2000,
        custom_macros: { protein: 150, carbs: 200, fats: 60 }
      };

      const analytics = computeWeightTrendAnalytics({
        today,
        weightLogs,
        dailyLogs,
        userSettings
      });

      expect(analytics.recent_weight_count_7d).toBe(3);
      expect(analytics.qualifying_intake_days_14d).toBe(9);
      expect(analytics.calibration_status).not.toBe('ready');
    });
  });
});
