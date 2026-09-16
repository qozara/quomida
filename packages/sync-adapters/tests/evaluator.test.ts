import { describe, it, expect } from 'vitest';
import { resolveUXStatus, resolveProviderDiagnostic } from '../src/evaluator.js';


describe('resolveUXStatus - Sync State Evaluator', () => {
  it('returns "local" when no adapter is configured or adapter status is disconnected', () => {
    expect(resolveUXStatus({ isOnline: true, adapter: null })).toBe('local');
    expect(resolveUXStatus({ isOnline: false, adapter: null })).toBe('local');
    expect(resolveUXStatus({ isOnline: true, adapterStatus: 'disconnected' })).toBe('local');
  });

  it('returns "offline" when device is offline regardless of adapter idle/syncing status', () => {
    expect(resolveUXStatus({ isOnline: false, adapterStatus: 'idle' })).toBe('offline');
    expect(resolveUXStatus({ isOnline: false, adapterStatus: 'syncing' })).toBe('offline');
    expect(resolveUXStatus({ isOnline: false, adapterStatus: 'throttled' })).toBe('offline');
  });

  it('returns "syncing" when online and sync is in progress', () => {
    expect(resolveUXStatus({ isOnline: true, adapterStatus: 'syncing' })).toBe('syncing');
  });

  it('returns "waiting" (Paused - Retrying) on rate limit 429 or transient throttled error', () => {
    expect(resolveUXStatus({ isOnline: true, adapterStatus: 'throttled' })).toBe('waiting');
  });

  it('returns "error" (Action Required) on persistent auth failure', () => {
    expect(resolveUXStatus({ isOnline: true, adapterStatus: 'auth_failed' })).toBe('error');
    expect(resolveUXStatus({ isOnline: true, adapterStatus: 'error' })).toBe('error');
  });

  it('returns "idle" (Synced) when all clean, synced, and connected', () => {
    expect(resolveUXStatus({ isOnline: true, adapterStatus: 'idle' })).toBe('idle');
    expect(resolveUXStatus({ isOnline: true, adapterStatus: 'synced' })).toBe('idle');
  });
});

describe('resolveProviderDiagnostic - Unified Status Mapping', () => {
  it('maps "offline" UX state to paused provider status consistently', () => {
    const diagnostic = resolveProviderDiagnostic('offline', true);
    expect(diagnostic.statusKey).toBe('paused');
    expect(diagnostic.variant).toBe('paused');
  });

  it('maps "waiting" (throttled) UX state to paused provider status', () => {
    const diagnostic = resolveProviderDiagnostic('waiting', true);
    expect(diagnostic.statusKey).toBe('paused');
    expect(diagnostic.variant).toBe('paused');
  });

  it('maps "error" (auth_failed) UX state to needsAttention provider status with alert badge', () => {
    const diagnostic = resolveProviderDiagnostic('error', true);
    expect(diagnostic.statusKey).toBe('needsAttention');
    expect(diagnostic.variant).toBe('attention');
    expect(diagnostic.hasAlertBadge).toBe(true);
  });

  it('maps "syncing" UX state to syncing provider status', () => {
    const diagnostic = resolveProviderDiagnostic('syncing', true);
    expect(diagnostic.statusKey).toBe('syncing');
    expect(diagnostic.variant).toBe('online');
  });

  it('maps "idle" UX state to connected provider status', () => {
    const diagnostic = resolveProviderDiagnostic('idle', true);
    expect(diagnostic.statusKey).toBe('connected');
    expect(diagnostic.variant).toBe('online');
  });

  it('maps "local" or no adapter to notConnected provider status', () => {
    expect(resolveProviderDiagnostic('local', false).statusKey).toBe('notConnected');
    expect(resolveProviderDiagnostic('idle', false).statusKey).toBe('notConnected');
  });
});

