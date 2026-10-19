import { test, expect } from '@playwright/test';
import { DEMO_TITLES, bodyText, brokenImages, createUser, openView, signIn, skipPreloader, trackPageErrors } from './helpers';

// Plan 1.5: a signed-in user only ever sees their own books — no demo or Sapiens leakage.
test('a brand-new account sees empty states, never demo books', async ({ page }) => {
  const errors = trackPageErrors(page);
  const email = `empty-${Date.now()}@example.com`;
  await createUser(email, 'correct-horse-1');
  await skipPreloader(page);
  await signIn(page, email, 'correct-horse-1');
  await page.waitForTimeout(1500);

  await openView(page, 'Search');
  await expect(page.locator('#shelfStack .shelf-empty--first')).toBeVisible();
  expect(await page.locator('#shelfStack .shelf-spine:not(.shelf-spine--ghost)').count()).toBe(0);

  for (const view of ['Search', 'Library', 'Map', 'Graph', 'Profile'] as const) {
    await openView(page, view);
    const text = await bodyText(page);
    for (const title of DEMO_TITLES) expect(text, `${view} shows demo title "${title}"`).not.toContain(title);
  }

  await openView(page, 'Profile');
  expect(await brokenImages(page)).toEqual([]);
  expect(errors.filter((e) => !/book\.glb|404|reading 'image'/.test(e))).toEqual([]);
});

test('a signed-in user adds 人类简史 as reading, writes a highlight, and both survive a reload', async ({ page }) => {
  const email = `author-${Date.now()}@example.com`;
  await createUser(email, 'correct-horse-1');
  await skipPreloader(page);
  await signIn(page, email, 'correct-horse-1');
  await page.waitForTimeout(1500);

  await openView(page, 'Search');
  await page.locator('#searchNewEntryBtn').click();
  await page.locator('#neTitle').fill('人类简史');
  await page.locator('#neAuthor').fill('尤瓦尔·赫拉利');
  await page.locator('#neStatus').selectOption('reading');
  await page.locator('#neSubmitBtn').click();
  await expect(page.locator('#neForm')).toBeHidden({ timeout: 15_000 });

  // Add Book lands on the new book's page. The user's own 人类简史 keeps the status the user chose
  // (it used to be overwritten with seed data) and starts with no highlights.
  await expect(page.locator('select').filter({ hasText: 'Reading' }).first()).toHaveValue('reading', { timeout: 15_000 });
  await page.locator('.book-tab-btn[data-target="highlights"]').click();
  await page.locator('#hlAddBtn').click();
  await page.locator('#hlFormQuote').fill('认知革命让智人开始讲故事。');
  await page.locator('.hl-form-save').click();
  await expect(page.locator('.hl-item', { hasText: '认知革命让智人开始讲故事。' })).toBeVisible({ timeout: 15_000 });

  // Reload: status and highlight persist, and the highlight is still editable.
  await page.reload();
  await page.click('#skipBtn');
  await expect(page.locator('#authUserMeta')).toContainText(email, { timeout: 15_000 });
  await page.waitForTimeout(2000);
  await openView(page, 'Search');
  const again = page.locator('#shelfStack .shelf-spine[data-status="reading"]').first();
  await expect(again).toBeVisible({ timeout: 15_000 });
  await again.click();
  await again.click();
  if (!(await page.locator('.hl-item').first().isVisible())) await page.locator('.book-tab-btn[data-target="highlights"]').click();
  const item = page.locator('.hl-item', { hasText: '认知革命让智人开始讲故事。' });
  await expect(item).toBeVisible({ timeout: 15_000 });
  await expect(item.locator('[data-hl-comment-add], [data-hl-delete]').first()).toBeVisible(); // editable controls present
  expect(await page.evaluate(() => document.body.innerText)).not.toContain('Cognitive Revolution'); // no seed tags leaked
});

test('signed-out demo mode: every page agrees on the numbers and no image is broken', async ({ page }) => {
  await skipPreloader(page);
  await page.waitForTimeout(1500);

  await openView(page, 'Search');
  const counts = await page.locator('#shelfCount').innerText();
  const finished = Number(/(\d+)\s*finished/i.exec(counts)?.[1]);
  const total = (await page.locator('#shelfStack .shelf-spine').count());
  expect(finished).toBeGreaterThan(0);
  expect(total).toBeGreaterThan(finished);

  await openView(page, 'Profile');
  await page.waitForTimeout(2500);
  const profileText = await page.evaluate(() => document.body.innerText);
  const m = /(\d+)\s*\n?\s*Books Finished/i.exec(profileText) || /Books Finished\s*\n?\s*(\d+)/i.exec(profileText);
  expect(m, 'Profile shows a Books Finished number').not.toBeNull();
  expect(Number(m![1])).toBe(finished);

  expect(await brokenImages(page)).toEqual([]);
});
