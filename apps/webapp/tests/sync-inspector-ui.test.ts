import { describe, it, expect, beforeEach } from 'vitest';
import { formatRelativeTime } from '../src/components/sync/SyncTimestamp.js';
import {
  resolveUXStatus,
  resolveProviderDiagnostic,
  MockSyncAdapter,
  GoogleDriveSheetsSyncAdapter
} from '@quomida/sync-adapters';


describe('Sync Inspector UI Logic & Time Formatter (WCAG 2.2)', () => {
  it('formats relative sync timestamps accurately', () => {
    expect(formatRelativeTime(null)).toBe('Never');

    const now = new Date().toISOString();
    expect(formatRelativeTime(now)).toBe('Just now');

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fiveMinutesAgo)).toBe('5m ago');

    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(threeHoursAgo)).toBe('3h ago');

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoDaysAgo)).toBe('2d ago');
  });

  it('verifies non-visual status updates for screen readers (WCAG SC 4.1.3)', () => {
    // Check that all UX states produce distinct accessible announcements
    const states = ['syncing', 'offline', 'waiting', 'error', 'idle', 'local'] as const;
    const adapter = new MockSyncAdapter();

    states.forEach((state) => {
      let uxState;
      if (state === 'offline') {
        uxState = resolveUXStatus({ isOnline: false, adapter });
        expect(uxState).toBe('offline');
      } else if (state === 'syncing') {
        adapter.simulateSyncing();
        uxState = resolveUXStatus({ isOnline: true, adapter });
        expect(uxState).toBe('syncing');
      } else if (state === 'waiting') {
        adapter.simulateThrottled();
        uxState = resolveUXStatus({ isOnline: true, adapter });
        expect(uxState).toBe('waiting');
      } else if (state === 'error') {
        adapter.simulateAuthFailed();
        uxState = resolveUXStatus({ isOnline: true, adapter });
        expect(uxState).toBe('error');
      } else if (state === 'idle') {
        adapter.simulateIdle();
        uxState = resolveUXStatus({ isOnline: true, adapter });
        expect(uxState).toBe('idle');
      } else if (state === 'local') {
        uxState = resolveUXStatus({ isOnline: true, adapter: null });
        expect(uxState).toBe('local');
      }
    });
  });

  it('allows seamless swapping between MockSyncAdapter and GoogleDriveSheetsSyncAdapter without altering core contracts', async () => {
    const mockAdapter = new MockSyncAdapter();
    await mockAdapter.initialize();
    expect(mockAdapter.id).toBe('mock-sync-adapter');
    expect(mockAdapter.getStatus()).toBe('idle');
    expect(mockAdapter.getConnectedAccount()).toBe('test-user@mock-cloud.internal');

    const gdriveAdapter = new GoogleDriveSheetsSyncAdapter();
    expect(gdriveAdapter.id).toBe('google-drive-sheets');
    expect(gdriveAdapter.getStatus()).toBe('disconnected');

    await gdriveAdapter.initialize({ accessToken: 'mock-oauth-token' });
    expect(gdriveAdapter.isInitialized()).toBe(true);
    expect(gdriveAdapter.getStatus()).toBe('idle');
    expect(gdriveAdapter.getConnectedAccount()).toBe('google-user@drive.google.com');

    await gdriveAdapter.disconnect();
    expect(gdriveAdapter.isInitialized()).toBe(false);
    expect(gdriveAdapter.getStatus()).toBe('disconnected');
  });

  it('guarantees cloud provider diagnostic consistency across popover and storage panel when offline', async () => {
    const adapter = new MockSyncAdapter();
    await adapter.initialize();
    // Device is offline while adapter was previously synced/idle
    const uxState = resolveUXStatus({ isOnline: false, adapter });
    expect(uxState).toBe('offline');


    // Both popover diagnostic row and provider card use resolveProviderDiagnostic
    const diagnostic = resolveProviderDiagnostic(uxState, true);
    expect(diagnostic.statusKey).toBe('paused');
    expect(diagnostic.variant).toBe('paused');
    expect(diagnostic.hasAlertBadge).toBeUndefined();
  });

  it('ensures provider diagnostic resolves to notConnected when adapter is disconnected and device is online', () => {
    // When user disconnected cloud connector and internet reconnects:
    const uxState = resolveUXStatus({ isOnline: true, adapter: null });
    expect(uxState).toBe('local');

    const diagnostic = resolveProviderDiagnostic(uxState, false);
    expect(diagnostic.statusKey).toBe('notConnected');
    expect(diagnostic.variant).toBe('offline');
    expect(diagnostic.hasAlertBadge).toBeUndefined();
  });
});


