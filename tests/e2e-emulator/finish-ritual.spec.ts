import { test, expect, type Page } from '@playwright/test';
import { WS, addBookViaUi, createUser, currentMonthKey, listDocs, openView, signIn, skipPreloader, trackPageErrors, writeDoc } from './helpers';

// Plan 2.3: finishing a book opens a three-question ritual (skippable), an AI finish card is stored in
// moments/{bookId} and shown at the top of the Notes tab, it survives a reload and can be exported.

async function setup(page: Page, label: string) {
  const email = `${label}-${Date.now()}@example.com`;
  const uid = await createUser(email, 'correct-horse-1');
  await skipPreloader(page);
  await signIn(page, email, 'correct-horse-1');
  await page.waitForTimeout(1500);
  return { uid, email };
}

const momentOf = async (uid: string, bookId: string) => {
  const docs = await listDocs(`workspaces/${WS}/users/${uid}/moments`);
  return docs.find((d) => d.id === bookId);
};

test('finish a book, answer three questions, and the finish card sits on top of Notes and survives a reload', async ({ page }) => {
  const errors = trackPageErrors(page);
  const { uid, email } = await setup(page, 'ritual');
  const bookId = await addBookViaUi(page, uid, 'Deep Work', 'Cal Newport');

  await page.locator('[data-status-select]').selectOption('finished');
  const dialog = page.locator('.fr-dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-fr-step]')).toHaveText('1 of 3');
  await page.screenshot({ path: 'tests/screenshots/phase-2/2.3-ritual-step1-1440.png' });

  await page.locator('[data-fr-answer]').fill('Shallow work had been eating my mornings');
  await page.locator('[data-fr-next]').click();
  await expect(page.locator('[data-fr-step]')).toHaveText('2 of 3');
  await page.locator('[data-fr-answer]').fill('Protect the first two hours');
  await page.locator('[data-fr-next]').click();
  await expect(page.locator('[data-fr-step]')).toHaveText('3 of 3');
  await page.locator('[data-fr-answer]').fill('Digital Minimalism, for the same reason');
  await page.locator('[data-fr-next]').click();

  // The Notes tab opens with the card as its first element.
  const card = page.locator('#notes [data-finish-card]');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.book-tab-btn.is-active')).toHaveAttribute('data-target', 'notes');
  await expect(card).toContainText('Doubt, then action');
  await expect(card).toContainText('Shallow work had been eating my mornings'); // the answer reached the server-built prompt
  expect(await page.locator('#notes > *').first().evaluate((el) => el.matches('[data-finish-card]') || !!el.querySelector('[data-finish-card]'))).toBe(true);

  const moment = await momentOf(uid, bookId);
  expect(moment?.fields.state.stringValue).toBe('completed');
  expect(moment?.fields.answers.mapValue.fields.belief.stringValue).toBe('Shallow work had been eating my mornings');
  expect(moment?.fields.card.mapValue.fields.original).toBeTruthy(); // stored as an AiBlock

  // Marking it finished again never re-opens the ritual.
  await page.locator('.book-tab-btn[data-target="overview"]').click();
  await page.locator('[data-status-select]').selectOption('reading');
  await page.locator('[data-status-select]').selectOption('finished');
  await page.waitForTimeout(2500);
  await expect(dialog).toHaveCount(0);

  // After a reload the card is still there.
  await page.reload();
  await page.click('#skipBtn');
  await expect(page.locator('#authUserMeta')).toContainText(email, { timeout: 20_000 });
  await page.waitForTimeout(1500);
  await openView(page, 'Search');
  await page.locator('#shelfContinueTrack .shelf-quick-card, #shelfRecentTrack .shelf-quick-card').first().click();
  await page.locator('.book-tab-btn[data-target="notes"]').click();
  await expect(page.locator('#notes [data-finish-card]')).toContainText('Doubt, then action');

  for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `tests/screenshots/phase-2/2.3-finish-card-${w}.png` });
  }
  expect(errors).toEqual([]);
});

test('skipping leaves the status alone, is remembered, and the Notes tab can still start the ritual', async ({ page }) => {
  const { uid } = await setup(page, 'skip');
  const bookId = await addBookViaUi(page, uid, 'Piranesi', 'Susanna Clarke');

  await page.locator('[data-status-select]').selectOption('finished');
  await expect(page.locator('.fr-dialog')).toBeVisible({ timeout: 10_000 });
  await page.locator('[data-fr-skip]').click();
  await expect(page.locator('.fr-dialog')).toHaveCount(0);
  await expect(page.locator('[data-status-select]')).toHaveValue('finished');
  await expect.poll(async () => (await momentOf(uid, bookId))?.fields.state.stringValue).toBe('skipped');

  await page.locator('[data-status-select]').selectOption('reading');
  await page.locator('[data-status-select]').selectOption('finished');
  await page.waitForTimeout(2500);
  await expect(page.locator('.fr-dialog')).toHaveCount(0);

  await page.locator('.book-tab-btn[data-target="notes"]').click();
  await expect(page.locator('#notes [data-finish-card-prompt]')).toBeVisible();
  await page.locator('[data-fc-start]').click();
  await expect(page.locator('.fr-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.fr-dialog')).toHaveCount(0);
});

test('when the free allowance is gone the answers are kept and the card can be written later', async ({ page }) => {
  const { uid } = await setup(page, 'noquota');
  await writeDoc(`usage/${uid}/months/${currentMonthKey()}`, { aiCalls: 10 });
  const bookId = await addBookViaUi(page, uid, 'Dune', 'Frank Herbert');

  await page.locator('[data-status-select]').selectOption('finished');
  await expect(page.locator('.fr-dialog')).toBeVisible({ timeout: 10_000 });
  await page.locator('[data-fr-answer]').fill('Power needs myths');
  await page.locator('[data-fr-next]').click();
  await page.locator('[data-fr-next]').click();
  await page.locator('[data-fr-next]').click();
  await expect(page.locator('.fr-dialog')).toContainText('free AI generations are used up');
  await page.locator('[data-fr-open]').click();
  await expect(page.locator('#notes [data-finish-card-pending]')).toBeVisible();
  const moment = await momentOf(uid, bookId);
  expect(moment?.fields.state.stringValue).toBe('completed');
  expect(moment?.fields.card).toBeUndefined();

  // Quota back: writing the card from the Notes tab works and keeps the saved answers.
  await writeDoc(`usage/${uid}/months/${currentMonthKey()}`, { aiCalls: 0 });
  await page.locator('[data-fc-generate]').click();
  await expect(page.locator('#notes [data-finish-card]')).toContainText('Power needs myths', { timeout: 20_000 });
});

test('the card exports as an image, and the Profile annual shelf opens it', async ({ page }) => {
  const { uid } = await setup(page, 'export');
  const bookId = await addBookViaUi(page, uid, 'Deep Work', 'Cal Newport');
  await page.locator('[data-status-select]').selectOption('finished');
  await expect(page.locator('.fr-dialog')).toBeVisible({ timeout: 10_000 });
  await page.locator('[data-fr-answer]').fill('Attention is a skill');
  for (let i = 0; i < 3; i += 1) await page.locator('[data-fr-next]').click();
  await expect(page.locator('#notes [data-finish-card]')).toBeVisible({ timeout: 30_000 });

  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.locator('[data-fc-export]').click()]);
  expect(download.suggestedFilename()).toMatch(/finish-card\.png$/);
  const path = await download.path();
  const { statSync } = await import('node:fs');
  expect(statSync(path!).size).toBeGreaterThan(20_000);

  // Profile → annual shelf: the finished book on stage says it has a card and opens straight on it.
  await openView(page, 'Profile');
  const hint = page.locator('#profAnnualStageReflection');
  await expect(hint).toBeVisible({ timeout: 20_000 });
  await page.locator('#profAnnualStage').click();
  await expect(page.locator('#notes [data-finish-card]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.book-tab-btn.is-active')).toHaveAttribute('data-target', 'notes');
  expect(bookId).toBeTruthy();
});
