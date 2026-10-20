import { describe, it, expect } from 'vitest';
import { en, es } from '@quomida/i18n-locales';

function getObjectKeyPaths(obj: Record<string, any>, prefix = ''): string[] {
  let keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys = keys.concat(getObjectKeyPaths(v, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

describe('i18n Key Parity (en vs es)', () => {
  it('has identical keys in English and Spanish dictionaries', () => {
    const enKeys = getObjectKeyPaths(en).sort();
    const esKeys = getObjectKeyPaths(es).sort();

    const missingInEs = enKeys.filter(k => !esKeys.includes(k));
    const missingInEn = esKeys.filter(k => !enKeys.includes(k));

    expect(missingInEs, 'Keys present in EN but missing in ES').toEqual([]);
    expect(missingInEn, 'Keys present in ES but missing in EN').toEqual([]);
    expect(enKeys).toEqual(esKeys);
  });

  it('contains all required weight, analytics, and adaptive settings keys', () => {
    const requiredKeys = [
      'nav.analytics',
      'weight.pillLabel',
      'weight.trendLabel',
      'weight.logWeightCta',
      'weight.quickLogTitle',
      'weight.weightKgLabel',
      'weight.trendPreviewLabel',
      'weight.noteLabel',
      'weight.notePlaceholder',
      'weight.saveWeight',
      'weight.deleteWeight',
      'weight.unitKg',
      'analytics.title',
      'analytics.subtitle',
      'analytics.estimatedTdee',
      'analytics.kcalPerDay',
      'analytics.sevenDayDelta',
      'analytics.kgPerWeek',
      'analytics.nextCheckIn',
      'analytics.daysRemaining',
      'analytics.readyNow',
      'analytics.statusReady',
      'analytics.statusCollecting',
      'analytics.statusInsufficient',
      'analytics.complianceTitle',
      'analytics.complianceRecentWeight',
      'analytics.compliancePriorWeight',
      'analytics.complianceFoodDays',
      'analytics.chartTitle',
      'analytics.rawWeightLegend',
      'analytics.trendWeightLegend',
      'analytics.range14d',
      'analytics.range30d',
      'analytics.range90d',
      'analytics.emptyChart',
      'analytics.recentEntries',
      'settings.targetModeManual',
      'settings.targetModeSmart',
      'settings.biometricsTitle',
      'settings.sexLabel',
      'settings.sexMale',
      'settings.sexFemale',
      'settings.birthDateLabel',
      'settings.heightCmLabel',
      'settings.currentWeightKgLabel',
      'settings.activityLevelLabel',
      'settings.activitySedentary',
      'settings.activityLight',
      'settings.activityModerate',
      'settings.activityVery',
      'settings.activityExtreme',
      'settings.goalSelectorTitle',
      'settings.goalLose',
      'settings.goalMaintain',
      'settings.goalGain',
      'settings.weeklyRateLabel',
      'settings.adaptiveToggleLabel',
      'settings.adaptiveToggleHint',
      'settings.previewTitle',
      'settings.previewBmr',
      'settings.previewTdee',
      'settings.previewTargetKcal'
    ];

    const enKeys = getObjectKeyPaths(en);
    for (const key of requiredKeys) {
      expect(enKeys).toContain(key);
    }
  });
});
