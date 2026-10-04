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
});
