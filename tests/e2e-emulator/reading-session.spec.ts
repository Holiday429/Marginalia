import { test, expect } from '@playwright/test';
import { WS, createUser, listDocs, signIn, skipPreloader, trackPageErrors } from './helpers';

// Plan 1.4: a timer start/stop writes workspaces/{ws}/users/{uid}/sessions/{id} with durationMs,
// and after a reload today's cell in the Profile reading heatmap is coloured.
test('reading session is stored and colours today in the Profile heatmap', async ({ page }) => {
  const errors = trackPageErrors(page);
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  const email = `reader-${Date.now()}@example.com`;
  const uid = await createUser(email, 'correct-horse-1');

  await skipPreloader(page);
  await signIn(page, email, 'correct-horse-1');

  // Start and stop a session from the focus widget.
  await page.locator('.fw-collapse-btn').click();
  await page.locator('[data-fw-start]').click();
  await page.waitForTimeout(1500);
  await page.locator('[data-fw-stop]').click();
  // Stopping a session opens the quick-capture sheet (2.1); it opens after the session write, so wait for it.
  await expect(page.locator('.qc-sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.qc-sheet')).toHaveCount(0);

  await expect.poll(async () => (await listDocs(`workspaces/${WS}/users/${uid}/sessions`)).length, { timeout: 10_000 }).toBe(1);
  const [session] = await listDocs(`workspaces/${WS}/users/${uid}/sessions`);
  expect(Number(session.fields.durationMs.integerValue)).toBeGreaterThanOrEqual(1000);
  expect(Number(session.fields.startedAt.integerValue)).toBeGreaterThan(0);
  expect(session.fields.endedAt).toBeDefined();

  // Reload, open Profile, find today's heatmap cell.
  await page.reload();
  await page.click('#skipBtn');
  await expect(page.locator('#authUserMeta')).toContainText(email, { timeout: 15_000 });
  const todayKey = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  await page.getByRole('button', { name: 'Profile', exact: true }).first().click();
  const cell = page.locator(`.prof-year__cell[title^="${todayKey}"]`);
  await expect(cell).toHaveClass(/is-l[1-4]/, { timeout: 20_000 });
  await expect(cell).toHaveAttribute('title', /1 sessions/);

  await page.locator('.prof-year__heatmap').first().screenshot({ path: 'tests/screenshots/phase-1/1.4-profile-heatmap.png' });

  expect(errors).toEqual([]);
  expect(consoleErrors.filter((e) => /ReadingSession\.(start|stop)/.test(e))).toEqual([]);
});
