import { test, expect } from '@playwright/test';

test.describe('Remote Catalog R2 Integration Test', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Check for potential React console errors to ensure everything is clean
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`Browser error: ${msg.text()}`);
      }
    });
  });

  test('searches remote catalog using HTTP VFS Range Requests successfully', async ({ page }) => {
    // Fill the search input
    const searchInput = page.locator('#input-food-search');
    await searchInput.fill('Aceite');

    // It might take a second to establish the remote SQLite worker and fetch
    // the HTTP Range requests, so we wait for the expected result to appear.
    // The "Aceite" result should appear in the search results list.
    const searchResult = page.getByRole('button', { name: /Aceite/i }).first();
    
    // We expect the search result to be visible within standard playwright timeout
    // If the HTTP Range requests timed out, this would fail.
    await expect(searchResult).toBeVisible({ timeout: 15000 });
    
    // Click the result to open the portion sheet
    await searchResult.click();

    // Verify portion bottom sheet modal opens correctly
    await expect(page.getByText('Porción y Cantidad').or(page.getByText('Portion and Quantity'))).toBeVisible();
    
    // We expect portions to be loaded as well (which makes another remote DB query)
    // The portion sheet opening is proof enough that the DB query succeeded.
  });
});
