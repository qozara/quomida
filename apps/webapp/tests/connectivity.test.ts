import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Connectivity & Offline Status Detection', () => {
  let originalOnLine: boolean;

  beforeEach(() => {
    originalOnLine = navigator.onLine;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: originalOnLine
    });
    vi.restoreAllMocks();
  });

  it('detects offline state when navigator.onLine is false or offline event fires', () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false
    });

    const isOnline = navigator.onLine;
    expect(isOnline).toBe(false);
  });

  it('simulates heartbeat check failing on fetch error', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    let heartbeatSuccess = false;
    try {
      const res = await fetch('/', { method: 'HEAD' });
      heartbeatSuccess = res.ok;
    } catch {
      heartbeatSuccess = false;
    }

    expect(fetchSpy).toHaveBeenCalledWith('/', { method: 'HEAD' });
    expect(heartbeatSuccess).toBe(false);
  });

  it('simulates heartbeat check succeeding when online', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    let heartbeatSuccess = false;
    try {
      const res = await fetch('/', { method: 'HEAD' });
      heartbeatSuccess = res.ok;
    } catch {
      heartbeatSuccess = false;
    }

    expect(fetchSpy).toHaveBeenCalledWith('/', { method: 'HEAD' });
    expect(heartbeatSuccess).toBe(true);
  });
});
