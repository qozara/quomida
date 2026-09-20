import { describe, it, expect, beforeEach } from 'vitest';
import { MockCloudSyncProvider } from '../src/MockCloudSyncProvider.js';

describe('MockCloudSyncProvider', () => {
  let adapter: MockCloudSyncProvider;

  beforeEach(() => {
    adapter = new MockCloudSyncProvider();
  });

  it('starts uninitialized', () => {
    expect(adapter.isInitialized()).toBe(false);
    expect(adapter.getStatus()).toBe('disconnected');
  });

  it('initializes cleanly to idle status', async () => {
    await adapter.initialize('mock-token-123');
    expect(adapter.isInitialized()).toBe(true);
    expect(adapter.getStatus()).toBe('idle');
  });

  it('supports simulated failure states and recovery', async () => {
    await adapter.initialize('mock-token-123');
    expect(adapter.getStatus()).toBe('idle');

    adapter.simulateThrottled();
    expect(adapter.getStatus()).toBe('throttled');

    adapter.simulateAuthFailed();
    expect(adapter.getStatus()).toBe('auth_failed');

    await adapter.reauthenticate();
    expect(adapter.getStatus()).toBe('idle');

    adapter.simulateSyncing();
    expect(adapter.getStatus()).toBe('syncing');

    adapter.simulateIdle();
    expect(adapter.getStatus()).toBe('idle');
  });

  it('notifies status change subscribers', async () => {
    const statuses: string[] = [];
    const unsubscribe = adapter.onStatusChange((status) => {
      statuses.push(status);
    });

    await adapter.initialize('mock-token');
    adapter.simulateThrottled();
    adapter.simulateAuthFailed();
    unsubscribe();
    adapter.simulateIdle();

    expect(statuses).toEqual(['idle', 'throttled', 'auth_failed']);
  });

  it('supports forceSync and disconnect', async () => {
    await adapter.initialize('mock-token');
    expect(adapter.getConnectedAccount()).toBe('test-user@mock-cloud.internal');

    await adapter.forceSync();
    expect(adapter.getLastSyncedTime()).not.toBeNull();
    expect(adapter.getStatus()).toBe('idle');

    await adapter.disconnect();
    expect(adapter.isInitialized()).toBe(false);
    expect(adapter.getStatus()).toBe('disconnected');
  });

  it('allows pushing and pulling payload deltas', async () => {
    await adapter.initialize('mock-token');
    
    const samplePayload = {
      collection: 'daily_logs',
      documents: [
        {
          id: 'log-1',
          timestamp: '2026-09-12T20:00:00Z',
          date: '2026-09-12',
          meal_type: 'meal_lunch',
          food_reference_id: 'ing-1',
          quantity: 1,
          portion_name: 'g',
          macros: { calories: 240, protein: 44, carbs: 0, fats: 7 }
        }
      ]
    };

    await adapter.push(samplePayload);
    const pulled = await adapter.pull();
    expect(pulled.length).toBe(1);
    expect(pulled[0].collection).toBe('daily_logs');
    expect(pulled[0].documents[0].id).toBe('log-1');
  });
});

