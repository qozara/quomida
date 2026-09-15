import { test, expect } from '@playwright/test';

test.describe('Quomida Service Worker & Offline Shell Support', () => {
  test('renders application shell and detects offline status when context goes offline', async ({ page, context }) => {
    // 1. Initial page load to register Service Worker and precache app shell
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();

    // Wait for Service Worker registration and active state
    await page.waitForFunction(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.ready;
      return !!reg && !!reg.active;
    });

    // 2. Set browser context offline
    await context.setOffline(true);

    // 3. Reload page while offline
    await page.reload();

    // 4. Assert app shell renders successfully (header, dashboard title, meal sections)
    await expect(page.locator('header')).toBeVisible();
    await expect(page.getByText('Calorías')).toBeVisible();

    // 5. Assert status indicator reflects offline state and announces via screen reader text
    const statusBadge = page.locator('#sync-status-badge');
    await expect(statusBadge).toBeVisible();
    await expect(statusBadge).toContainText('Sin conexión');
  });
});
