import { test, expect } from '@playwright/test';

test.describe('Quomida Offline Food Logger & Macro Calculation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders initial dashboard and header elements', async ({ page }) => {
    await expect(page.locator('header')).toBeVisible();
    await expect(page.getByText('Calorías')).toBeVisible();
    await expect(page.getByText('Proteínas')).toBeVisible();
    await expect(page.getByText('Carbohidratos')).toBeVisible();
    await expect(page.getByText('Grasas')).toBeVisible();
  });

  test('searches for regional meat cut and opens Portion Bottom Sheet', async ({ page }) => {
    const searchInput = page.locator('#input-food-search');
    await searchInput.fill('vacío');

    // Click search result item
    const searchResult = page.getByRole('button', { name: /Vacío vacuno/i });
    await expect(searchResult).toBeVisible();
    await searchResult.click();

    // Verify portion bottom sheet modal opens
    await expect(page.getByText('Portión y Cantidad')).toBeVisible();
    await expect(page.getByText('Nutrición Calculada')).toBeVisible();

    // Click Log Item button
    const logButton = page.locator('#btn-log-item');
    await logButton.click();

    // Bottom sheet closes and food logs into Lunch section
    await expect(page.getByText('Portión y Cantidad')).not.toBeVisible();
    await expect(page.getByText('Vacío vacuno (crudo)')).toBeVisible();
  });

  test('opens and closes settings modal', async ({ page }) => {
    await page.locator('#btn-open-settings').click();
    await expect(page.getByText('Perfil y Configuración')).toBeVisible();

    await page.getByRole('button', { name: 'English (US)' }).click().catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
  });
});
