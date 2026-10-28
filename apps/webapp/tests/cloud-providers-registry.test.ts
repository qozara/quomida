/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { CloudProviderList } from '../src/components/sync/CloudProviderList.js';
import * as AppContextModule from '../src/context/AppContext.js';
import { en } from '@quomida/i18n-locales';

describe('Adapter Registry', () => {
  it('should include all provider subdirectories in index.ts and exclude mock adapters from production UI', () => {
    const providersDir = path.join(__dirname, '../src/cloud-providers');
    const indexPath = path.join(providersDir, 'index.ts');
    
    // Read all directories in src/cloud-providers
    const entries = fs.readdirSync(providersDir, { withFileTypes: true });
    const providerFolders = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    // Read index.ts
    const indexContent = fs.readFileSync(indexPath, 'utf-8');

    // Verify each folder has an import in index.ts
    for (const folder of providerFolders) {
      expect(
        indexContent.includes(`/${folder}/`),
        `Missing registration for provider folder: ${folder}. Make sure to import and use the provider hook in src/cloud-providers/index.ts`
      ).toBe(true);
    }

    // Verify mock cloud adapter is not present in the production cloud-providers folder or registry
    expect(providerFolders).not.toContain('mock');
    expect(indexContent).not.toContain('mock');
  });

  it('verifies CloudProviderList UI does not render any mock sync adapter card', () => {
    vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
      activeProvider: null,
      uxSyncState: 'local',
      t: en,
      connectProvider: vi.fn(),
      reconnectProvider: vi.fn()
    } as any);

    render(
      React.createElement(GoogleOAuthProvider, {
        clientId: 'dummy_id',
        children: React.createElement(CloudProviderList, { onDisconnectRequest: vi.fn() })
      })
    );

    // Mock adapter should not exist anywhere in the UI
    expect(screen.queryByText(/Mock Cloud/i)).toBeNull();
    expect(screen.queryByText(/mock-sync-adapter/i)).toBeNull();

    // Google Drive provider card should be present
    expect(screen.getByText('Google Drive / Sheets (BYOS)')).toBeDefined();
  });
});
