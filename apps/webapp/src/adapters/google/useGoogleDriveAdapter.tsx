import { useMemo, useRef, useCallback } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { GoogleDriveSheetsSyncAdapter } from '@quomida/sync-adapters';
import type { AdapterFactory } from '../types.js';

export const useGoogleDriveAdapter = (): AdapterFactory => {
  const loginResolver = useRef<((token: string) => void) | null>(null);
  const loginRejecter = useRef<((err: any) => void) | null>(null);

  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata',
    onSuccess: (res) => {
      if (loginResolver.current) loginResolver.current(res.access_token);
    },
    onError: (err) => {
      if (loginRejecter.current) loginRejecter.current(err);
    }
  });

  const triggerLogin = useCallback(() => new Promise<string>((resolve, reject) => {
    loginResolver.current = resolve;
    loginRejecter.current = reject;
    login();
  }), [login]);

  return useMemo(() => ({
    id: 'google-drive-sheets',
    name: 'Google Drive / Sheets (BYOS)',
    description: 'Connect personal Google Drive spreadsheet for cross-device cloud backups.',
    iconType: 'gdrive',
    
    connect: async () => {
      const token = await triggerLogin();
      const adapter = new GoogleDriveSheetsSyncAdapter({ onTokenRefresh: triggerLogin });
      await adapter.initialize(token);
      return { 
        adapter, 
        credentials: { accessToken: token, expiresAt: Date.now() + 3500000 } 
      };
    },
    
    restore: async (credentials: any) => {
      const adapter = new GoogleDriveSheetsSyncAdapter({ onTokenRefresh: triggerLogin });
      const token = credentials?.accessToken;
      await adapter.initialize(token);
      return adapter;
    }
  }), [triggerLogin]);
};
