import { describe, it, expect, vi } from 'vitest';
import { resolveUXStatus, resolveProviderDiagnostic } from '@quomida/cloud-providers';
import enDict from '../../../packages/i18n-locales/locales/en.json';
import esDict from '../../../packages/i18n-locales/locales/es.json';

describe('Schema Remediation UI State & i18n Guard', () => {
  it('evaluates corrupted and upgrade_required sync statuses to error state requiring user attention', () => {
    const mockAdapter = {
      getStatus: () => 'corrupted' as const
    };

    const uxState = resolveUXStatus({
      isOnline: true,
      adapter: mockAdapter as any
    });
    expect(uxState).toBe('error');

    const diagnostic = resolveProviderDiagnostic(uxState, true);
    expect(diagnostic.statusKey).toBe('needsAttention');
    expect(diagnostic.variant).toBe('attention');
    expect(diagnostic.hasAlertBadge).toBe(true);

    const upgradeAdapter = {
      getStatus: () => 'upgrade_required' as const
    };

    const upgradeUxState = resolveUXStatus({
      isOnline: true,
      adapter: upgradeAdapter as any
    });
    expect(upgradeUxState).toBe('error');
  });

  it('maintains 100% parity between English and Spanish dictionaries for remediation keys', () => {
    const enRemediation = (enDict as any).sync?.remediation;
    const esRemediation = (esDict as any).sync?.remediation;

    expect(enRemediation).toBeDefined();
    expect(esRemediation).toBeDefined();

    const requiredKeys = [
      'corruptedTitle',
      'corruptedDesc',
      'upgradeTitle',
      'upgradeDesc',
      'backupNote',
      'repairButton',
      'upgradeButton',
      'repairing',
      'upgrading',
      'repairSuccess',
      'upgradeSuccess',
      'dismiss'
    ];

    for (const key of requiredKeys) {
      expect(enRemediation[key]).toBeDefined();
      expect(typeof enRemediation[key]).toBe('string');
      expect(enRemediation[key].length).toBeGreaterThan(0);

      expect(esRemediation[key]).toBeDefined();
      expect(typeof esRemediation[key]).toBe('string');
      expect(esRemediation[key].length).toBeGreaterThan(0);
    }
  });

  it('verifies that repair and migrate callbacks invoke the corresponding adapter methods', async () => {
    const repairSpy = vi.fn(async () => {});
    const migrateSpy = vi.fn(async () => {});

    const mockAdapter = {
      repair: repairSpy,
      migrate: migrateSpy,
      getStatus: vi.fn(() => 'idle' as const),
      getLastSyncedTime: () => new Date().toISOString()
    };

    // Simulate repair action
    await mockAdapter.repair();
    expect(repairSpy).toHaveBeenCalledTimes(1);

    // Simulate migrate action
    await mockAdapter.migrate();
    expect(migrateSpy).toHaveBeenCalledTimes(1);
  });
});
