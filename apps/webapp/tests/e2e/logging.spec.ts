import { test, expect } from '@playwright/test';

test.describe('Quomida Offline Food Logger & Macro Calculation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders initial dashboard and header elements', async ({ page }) => {
    await expect(page.getByTestId('dashboard-date-bar')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Calorías')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Proteínas')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Carbohidratos')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Grasas')).toBeVisible({ timeout: 15000 });
  });

  test('searches for regional meat cut and opens Portion Bottom Sheet', async ({ page }) => {
    await page.getByRole('button', { name: /Add food to/i }).first().click();

    const searchInput = page.locator('#input-food-search');
    await searchInput.fill('Aceite');

    // Click search result item (excluding #btn-find-more-ai footer action)
    const searchResult = page.locator('button:not(#btn-find-more-ai)').filter({ hasText: /Aceite/i }).first();
    await expect(searchResult).toBeVisible({ timeout: 15000 });
    await searchResult.click();

    // Verify portion bottom sheet modal opens
    await expect(page.getByText('Porción y Cantidad')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Nutrición Calculada')).toBeVisible({ timeout: 15000 });

    // Click Log Item button
    const logButton = page.locator('#btn-log-item');
    await logButton.click();

    // Bottom sheet closes and food logs into meal section
    await expect(page.getByText('Porción y Cantidad')).not.toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Aceite/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('opens and closes settings modal', async ({ page }) => {
    await page.locator('#btn-open-settings-avatar').click();
    await expect(page.getByText('Perfil y Configuración')).toBeVisible({ timeout: 15000 });

    await page.locator('#accordion-header-app-settings').click();
    const langSelect = page.locator('#select-language');
    await langSelect.selectOption('en');

    await page.locator('#btn-close-settings').click();
    await expect(page.getByText(/Perfil y Configuración|Profile & Settings/)).not.toBeVisible({ timeout: 15000 });
  });
});
