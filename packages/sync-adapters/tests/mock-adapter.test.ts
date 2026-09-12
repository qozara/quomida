import { describe, it, expect, beforeEach } from 'vitest';
import { MockSyncAdapter } from '../src/MockSyncAdapter.js';

describe('MockSyncAdapter', () => {
  let adapter: MockSyncAdapter;

  beforeEach(() => {
    adapter = new MockSyncAdapter();
  });

  it('starts uninitialized', () => {
    expect(adapter.isInitialized()).toBe(false);
    expect(adapter.getStatus()).toBe('disconnected');
  });

  it('initializes cleanly', async () => {
    await adapter.initialize('mock-token-123');
    expect(adapter.isInitialized()).toBe(true);
    expect(adapter.getStatus()).toBe('synced');
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
