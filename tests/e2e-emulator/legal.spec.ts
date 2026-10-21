import { test, expect } from '@playwright/test';

// Plan 1.8: Privacy, Terms and Credits are reachable from the footer (landing) and from the room settings.
// Runs against the production build (port 5175): Vite's dev server falls back to the SPA for /privacy/,
// while a static host (Vercel, GitHub Pages, vite preview) serves public/privacy/index.html.
test.use({ baseURL: 'http://localhost:5175' });

test('legal pages are linked from the landing footer and the room settings', async ({ page }) => {
  await page.goto('/');
  const decline = page.locator('[data-consent="denied"]');
  if (await decline.isVisible().catch(() => false)) await decline.click();

  for (const [label, heading] of [['Privacy', 'Privacy Policy'], ['Terms', 'Terms of Service'], ['Credits', 'Credits']] as const) {
    await page.goto('/');
    await page.locator('.legal-links--landing').getByRole('link', { name: label, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await expect(page.getByRole('link', { name: /Marginalia/ }).first()).toBeVisible(); // back link
  }

  // Credits lists the CC-BY models that are loaded in the room.
  await page.goto('/credits/');
  for (const title of ['Antique Globe', 'MacBook', 'Wooden Picture Frame', 'Messy Tack Board']) {
    await expect(page.locator('table').first()).toContainText(title);
  }

  // Room settings panel carries the same links.
  await page.goto('/');
  await page.click('#skipBtn');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'room', { timeout: 15_000 });
  await page.locator('#roomSidebarToggleBtn').click(); // Settings lives in the left menu
  await page.locator('#roomSettingsTrigger').click();
  const panel = page.locator('#roomSettingsPanel');
  for (const label of ['Privacy', 'Terms', 'Credits']) {
    await expect(panel.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
});
