/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGoogleDriveProvider } from '../src/cloud-providers/google/useGoogleDriveProvider.js';

let mockLoginHandler: ((res: any) => void) | null = null;
let capturedLoginOptions: any = null;

vi.mock('@react-oauth/google', () => ({
  useGoogleLogin: vi.fn((options: any) => {
    capturedLoginOptions = options;
    mockLoginHandler = options.onSuccess;
    return () => {
      // simulate async popup completion
      setTimeout(() => {
        if (mockLoginHandler) {
          mockLoginHandler({ access_token: 'mock-access-token-123' });
        }
      }, 10);
    };
  })
}));

describe('useGoogleDriveProvider with UserInfo Profile', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('includes openid, email and profile in OAuth scope', () => {
    renderHook(() => useGoogleDriveProvider());
    expect(capturedLoginOptions.scope).toContain('openid');
    expect(capturedLoginOptions.scope).toContain('email');
    expect(capturedLoginOptions.scope).toContain('profile');
    expect(capturedLoginOptions.scope).toContain('https://www.googleapis.com/auth/drive.file');
  });

  it('fetches Google userinfo upon connect() and initializes adapter with user name and email', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://www.googleapis.com/oauth2/v3/userinfo') {
        expect(init?.headers).toEqual(expect.objectContaining({
          Authorization: 'Bearer mock-access-token-123'
        }));
        return new Response(JSON.stringify({
          email: 'jane.doe@example.com',
          name: 'Jane Doe',
          picture: 'https://example.com/avatar.jpg'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200 });
    });
    global.fetch = fetchMock as any;

    const { result } = renderHook(() => useGoogleDriveProvider());

    let connectResult: any;
    await act(async () => {
      connectResult = await result.current.connect();
    });

    expect(fetchMock).toHaveBeenCalledWith('https://www.googleapis.com/oauth2/v3/userinfo', expect.anything());
    expect(connectResult.credentials.userEmail).toBe('jane.doe@example.com');
    expect(connectResult.credentials.userName).toBe('Jane Doe');
    expect(connectResult.adapter.getConnectedAccount()).toBe('Jane Doe (jane.doe@example.com)');
  });

  it('restores adapter with preserved userEmail and userName from credentials', async () => {
    const { result } = renderHook(() => useGoogleDriveProvider());

    const savedCredentials = {
      accessToken: 'restored-token-456',
      userEmail: 'restored.user@example.com',
      userName: 'Restored User'
    };

    let restoredAdapter: any;
    await act(async () => {
      restoredAdapter = await result.current.restore(savedCredentials);
    });

    expect(restoredAdapter.isInitialized()).toBe(true);
    expect(restoredAdapter.getConnectedAccount()).toBe('Restored User (restored.user@example.com)');
  });
});
