import { test, expect, type Page } from '@playwright/test';

// Phase 3.4: Room Theme in Settings is wired to the room. The choice is stored, survives a reload, and changing it
// downloads nothing (the textures are tinted, not swapped). The Ambient Effects are not built yet and say so.
const THEME_KEY = 'marginalia_room_theme_v1';

async function openSettings(page: Page) {
  await page.goto('/');
  const decline = page.locator('[data-consent="denied"]');
  if (await decline.isVisible().catch(() => false)) await decline.click();
  await page.click('#skipBtn');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'room', { timeout: 15_000 });
  await page.locator('#roomSidebarToggleBtn').click(); // Settings lives in the left menu
  await page.locator('#roomSettingsTrigger').click();
  await expect(page.locator('#roomSettingsPanel')).toBeVisible();
}

test('Room Theme: the choice is stored, survives a reload and downloads nothing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await openSettings(page);

  await expect(page.locator('[data-room-theme].active')).toHaveAttribute('data-room-theme', 'taupe');
  await page.waitForTimeout(4000); // let the room finish loading so the request count is stable
  const before = await page.evaluate(() => performance.getEntriesByType('resource').length);

  await page.locator('[data-room-theme="sage"]').click();
  await expect(page.locator('[data-room-theme].active')).toHaveAttribute('data-room-theme', 'sage');
  expect(await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)).toBe('sage');
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').length)).toBe(before);

  await page.reload();
  await page.click('#skipBtn');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'room', { timeout: 15_000 });
  await page.locator('#roomSidebarToggleBtn').click();
  await page.locator('#roomSettingsTrigger').click();
  await expect(page.locator('[data-room-theme].active')).toHaveAttribute('data-room-theme', 'sage');
  expect(errors).toEqual([]);
});

test('Ambient Effects are disabled and say they are coming soon', async ({ page }) => {
  await openSettings(page);
  for (const label of ['Rain', 'Vinyl Noise', 'Fireplace']) {
    await expect(page.locator('#roomSettingsPanel').getByRole('button', { name: label, exact: true })).toBeDisabled();
  }
  await expect(page.locator('#roomSettingsPanel').getByText('Coming soon.')).toBeVisible();
});
