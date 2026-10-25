import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runWithSyncLock } from '../src/context/AppContext.js';

describe('runWithSyncLock (Cross-Tab Web Locks)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses navigator.locks when available and executes action if lock is granted', async () => {
    const mockRequest = vi.fn().mockImplementation(async (lockName, options, callback) => {
      return callback({ name: lockName });
    });

    vi.stubGlobal('navigator', {
      locks: { request: mockRequest }
    });

    const fallbackLock = { current: false };
    const action = vi.fn().mockResolvedValue('success');

    const result = await runWithSyncLock(action, fallbackLock);

    expect(mockRequest).toHaveBeenCalledWith(
      'quomida_sync_lock',
      { ifAvailable: true },
      expect.any(Function)
    );
    expect(action).toHaveBeenCalled();
    expect(result).toBe('success');
  });

  it('skips action if navigator.locks returns null (another tab holds the lock)', async () => {
    const mockRequest = vi.fn().mockImplementation(async (_lockName, _options, callback) => {
      return callback(null);
    });

    vi.stubGlobal('navigator', {
      locks: { request: mockRequest }
    });

    const fallbackLock = { current: false };
    const action = vi.fn().mockResolvedValue('success');

    const result = await runWithSyncLock(action, fallbackLock);

    expect(mockRequest).toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('falls back cleanly to in-memory ref when navigator.locks is unavailable', async () => {
    vi.stubGlobal('navigator', {});

    const fallbackLock = { current: false };
    const action = vi.fn().mockResolvedValue('fallback-success');

    const result = await runWithSyncLock(action, fallbackLock);

    expect(action).toHaveBeenCalled();
    expect(result).toBe('fallback-success');
    expect(fallbackLock.current).toBe(false);
  });

  it('prevents re-entrancy in fallback mode when fallbackLock is true', async () => {
    vi.stubGlobal('navigator', {});

    const fallbackLock = { current: true };
    const action = vi.fn().mockResolvedValue('should-not-run');

    const result = await runWithSyncLock(action, fallbackLock);

    expect(action).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('queues and executes a trailing sync when concurrent calls arrive while lock is held', async () => {
    vi.stubGlobal('navigator', {});

    const fallbackLock = { current: false };
    const pendingSync = { current: false };

    let resolveFirstRun!: () => void;
    const firstRunBarrier = new Promise<void>((r) => {
      resolveFirstRun = r;
    });

    let callCount = 0;
    const action = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        await firstRunBarrier;
      }
      return `run-${callCount}`;
    });

    // Start first sync (holds lock until resolveFirstRun is called)
    const p1 = runWithSyncLock(action, fallbackLock, pendingSync);

    // While first sync is in-flight, two rapid mutations request sync
    const p2 = await runWithSyncLock(action, fallbackLock, pendingSync);
    const p3 = await runWithSyncLock(action, fallbackLock, pendingSync);

    expect(p2).toBeNull();
    expect(p3).toBeNull();
    expect(pendingSync.current).toBe(true);
    expect(action).toHaveBeenCalledTimes(1);

    // Finish first sync -> should automatically drain pendingSync and run action a 2nd time
    resolveFirstRun();
    const res1 = await p1;

    expect(action).toHaveBeenCalledTimes(2);
    expect(res1).toBe('run-2');
    expect(pendingSync.current).toBe(false);
    expect(fallbackLock.current).toBe(false);
  });
});
