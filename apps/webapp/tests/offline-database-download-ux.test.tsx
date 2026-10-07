/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SettingsModal } from '../src/components/SettingsModal.js';
import * as AppContext from '../src/context/AppContext.js';
import * as CatalogDownloadHook from '../src/hooks/useCatalogDownload.js';
import { en } from '@quomida/i18n-locales';

describe('Offline Database Download UX & Lifecycle', () => {
  const mockDownloadCatalog = vi.fn();
  const mockDeleteCatalog = vi.fn().mockResolvedValue(undefined);

  const baseAppContext = {
    locale: 'en',
    setLocale: vi.fn(),
    theme: 'dark',
    setTheme: vi.fn(),
    userSettings: {
      daily_calorie_target: 2000,
      custom_macros: { protein: 150, carbs: 200, fats: 65 }
    },
    updateUserSettings: vi.fn(),
    syncStatus: 'idle',
    activeProvider: null,
    lastSyncedTime: 'Just now',
    isSettingsOpen: true,
    setIsSettingsOpen: vi.fn(),
    setIsStorageSettingsOpen: vi.fn(),
    catalogVersion: '1.0.0',
    catalogGeneratedAt: '2026-10-01',
    catalogFileSizeBytes: 57671680, // ~55MB
    refreshCatalog: vi.fn(),
    itemCounts: { logs: 10, customFoods: 2 },
    clearLocalDatabase: vi.fn(),
    disconnectProvider: vi.fn(),
    dbVersion: 1,
    isOnline: true,
    t: en
  };

  beforeEach(() => {
    vi.spyOn(AppContext, 'useApp').mockReturnValue({ ...baseAppContext } as any);
    vi.spyOn(CatalogDownloadHook, 'useCatalogDownload').mockReturnValue({
      status: 'idle',
      progress: 0,
      error: null,
      isDeleting: false,
      downloadCatalog: mockDownloadCatalog,
      deleteCatalog: mockDeleteCatalog
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('disables the download button when the app is offline', () => {
    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      ...baseAppContext,
      isOnline: false
    } as any);

    render(<SettingsModal />);

    const downloadBtn = screen.getByRole('button', { name: /download/i });
    expect(downloadBtn).toBeDefined();
    expect((downloadBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('displays dynamic approximate file size on the download button', () => {
    // 120MB = 120 * 1024 * 1024 bytes
    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      ...baseAppContext,
      catalogFileSizeBytes: 125829120, // 120MB
      isOnline: true
    } as any);

    render(<SettingsModal />);

    const downloadBtn = screen.getByRole('button', { name: /download/i });
    expect(downloadBtn.textContent).toContain('120MB');
  });

  it('opens confirmation popup dialog recommending Wi-Fi when download button is clicked', async () => {
    render(<SettingsModal />);

    const downloadBtn = screen.getByRole('button', { name: /download/i });
    fireEvent.click(downloadBtn);

    // Confirmation dialog should be displayed with Wi-Fi recommendation
    expect(screen.getByRole('dialog', { name: /download offline database/i })).toBeDefined();
    expect(screen.getByText(/wi-fi/i)).toBeDefined();

    // Download should NOT have been invoked yet
    expect(mockDownloadCatalog).not.toHaveBeenCalled();
  });

  it('cancels the download dialog without starting download when cancel is clicked', async () => {
    render(<SettingsModal />);

    const downloadBtn = screen.getByRole('button', { name: /download/i });
    fireEvent.click(downloadBtn);

    expect(screen.getByRole('dialog', { name: /download offline database/i })).toBeDefined();

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    expect(screen.queryByRole('dialog', { name: /download offline database/i })).toBeNull();
    expect(mockDownloadCatalog).not.toHaveBeenCalled();
  });

  it('proceeds with download when user confirms the download dialog', async () => {
    render(<SettingsModal />);

    const downloadBtn = screen.getByRole('button', { name: /download/i });
    fireEvent.click(downloadBtn);

    const confirmBtn = screen.getByRole('button', { name: /download now/i });
    fireEvent.click(confirmBtn);

    expect(mockDownloadCatalog).toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: /download offline database/i })).toBeNull();
  });

  it('shows delete button when full catalog is installed and confirms deletion to save space', async () => {
    vi.spyOn(CatalogDownloadHook, 'useCatalogDownload').mockReturnValue({
      status: 'complete',
      progress: 100,
      error: null,
      isDeleting: false,
      downloadCatalog: mockDownloadCatalog,
      deleteCatalog: mockDeleteCatalog
    } as any);

    render(<SettingsModal />);

    // Shows installed status badge and delete button
    expect(screen.getAllByText(/available offline|installed/i).length).toBeGreaterThan(0);
    const deleteBtn = screen.getByRole('button', { name: /delete/i });
    expect(deleteBtn).toBeDefined();

    // Click delete -> opens confirmation dialog
    fireEvent.click(deleteBtn);
    expect(screen.getByRole('dialog', { name: /delete offline database/i })).toBeDefined();

    // Confirm deletion
    const confirmDeleteBtn = screen.getByRole('button', { name: /delete and free space|confirm/i });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(mockDeleteCatalog).toHaveBeenCalled();
    });
  });
});
