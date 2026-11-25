import { useMemo, useRef, useCallback } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import {
  GOOGLE_DRIVE_BYOS_SCOPES,
  GOOGLE_IDENTITY_AND_DRIVE_SCOPES,
} from '@qozara/google-auth';
import { useOptionalGoogleAuthSession } from '@qozara/google-auth/react';
import { GoogleDriveSheetsCloudSyncProvider } from '@quomida/cloud-providers';
import type { CloudProviderFactory } from '../types.js';

export const useGoogleDriveProvider = (): CloudProviderFactory => {
  const googleAuth = useOptionalGoogleAuthSession();
  const loginResolver = useRef<((token: string) => void) | null>(null);
  const loginRejecter = useRef<((err: unknown) => void) | null>(null);

  const login = useGoogleLogin({
    scope:
      'openid email profile https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata',
    onSuccess: (res) => {
      if (loginResolver.current) loginResolver.current(res.access_token);
    },
    onError: (err) => {
      if (loginRejecter.current) loginRejecter.current(err);
    },
  });

  const triggerFallbackLogin = useCallback(
    () =>
      new Promise<string>((resolve, reject) => {
        loginResolver.current = resolve;
        loginRejecter.current = reject;
        login();
      }),
    [login]
  );

  return useMemo(
    () => ({
      id: 'google-drive-sheets',
      name: 'Google Drive / Sheets (BYOS)',
      description: 'Connect personal Google Drive spreadsheet for cross-device cloud backups.',
      iconType: 'gdrive',

      connect: async () => {
        if (googleAuth) {
          const existingDriveToken = googleAuth.getValidAccessToken(GOOGLE_DRIVE_BYOS_SCOPES);
          const session =
            existingDriveToken && googleAuth.session
              ? googleAuth.session
              : await googleAuth.signInForDrive();

          const adapter = new GoogleDriveSheetsCloudSyncProvider({
            getAccessToken: () => googleAuth.store.getValidAccessToken(GOOGLE_DRIVE_BYOS_SCOPES),
            onTokenRefresh: async () => {
              const refreshed = await googleAuth.signInForDrive();
              return refreshed.accessToken;
            },
          });

          const userEmail = session.user?.email;
          const userName = session.user?.name;
          const userPicture = session.user?.picture;

          await adapter.initialize({ userEmail, userName, userPicture });
          // Only persist non-sensitive display metadata in RxDB; ephemeral OAuth tokens live exclusively in GoogleSessionStore
          return {
            adapter,
            credentials: {
              userEmail,
              userName,
              userPicture,
            },
          };
        }

        // Standalone fallback when rendered outside GoogleAuthSessionProvider (e.g. isolated unit tests)
        const token = await triggerFallbackLogin();
        let userEmail: string | undefined;
        let userName: string | undefined;
        let userPicture: string | undefined;

        try {
          const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (userInfoRes.ok) {
            const userInfo = await userInfoRes.json();
            userEmail = userInfo.email;
            userName = userInfo.name;
            userPicture = userInfo.picture;
          }
        } catch (err) {
          console.warn('[useGoogleDriveProvider] Failed to fetch Google userinfo:', err);
        }

        const adapter = new GoogleDriveSheetsCloudSyncProvider({
          onTokenRefresh: triggerFallbackLogin,
        });
        await adapter.initialize({ accessToken: token, userEmail, userName, userPicture });
        return {
          adapter,
          credentials: {
            accessToken: token,
            access_token: token,
            userEmail,
            userName,
            userPicture,
            expiresAt: Date.now() + 3500000,
          },
        };
      },

      restore: async (credentials: any) => {
        if (googleAuth) {
          googleAuth.store.migrateFromLegacyCredentials(
            credentials,
            GOOGLE_IDENTITY_AND_DRIVE_SCOPES
          );

          const adapter = new GoogleDriveSheetsCloudSyncProvider({
            getAccessToken: () => googleAuth.store.getValidAccessToken(GOOGLE_DRIVE_BYOS_SCOPES),
            onTokenRefresh: async () => {
              const refreshed = await googleAuth.signInForDrive();
              return refreshed.accessToken;
            },
          });

          const storedSession = googleAuth.store.getSession();
          const hasValidDriveToken = Boolean(
            googleAuth.store.getValidAccessToken(GOOGLE_DRIVE_BYOS_SCOPES)
          );
          const userEmail = storedSession?.user?.email ?? credentials?.userEmail;
          const userName = storedSession?.user?.name ?? credentials?.userName;
          const userPicture = storedSession?.user?.picture ?? credentials?.userPicture;

          await adapter.initialize({
            userEmail,
            userName,
            userPicture,
            ...(hasValidDriveToken
              ? {}
              : {
                  accessToken: storedSession?.accessToken ?? 'expired',
                  expiresAt: 1,
                }),
          });
          return adapter;
        }

        const adapter = new GoogleDriveSheetsCloudSyncProvider({
          onTokenRefresh: triggerFallbackLogin,
        });
        await adapter.initialize(credentials);
        return adapter;
      },
    }),
    [googleAuth, triggerFallbackLogin]
  );
};
