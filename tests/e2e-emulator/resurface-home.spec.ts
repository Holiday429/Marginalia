import { test, expect, type Page } from '@playwright/test';
import { WS, addBookViaUi, createUser, listDocs, plain, seedDueHighlight, signIn, skipPreloader, trackPageErrors } from './helpers';

// Plan 2.4: the room's wall shows up to three highlights that are due for another look; answering updates
// the highlight (and what the wall shows) at once.

async function setup(page: Page, label: string) {
  const email = `${label}-${Date.now()}@example.com`;
  const uid = await createUser(email, 'correct-horse-1');
  await skipPreloader(page);
  await signIn(page, email, 'correct-horse-1');
  await page.waitForTimeout(1500);
  return { uid, email };
}

const highlight = async (uid: string, id: string) => plain((await listDocs(`workspaces/${WS}/users/${uid}/highlights`)).find((d) => d.id === id)?.fields);

async function openWallOverlay(page: Page) {
  await page.evaluate(() => { location.hash = '#room'; });
  await page.waitForTimeout(1500);
  await page.locator('[data-room-pose="notes"]').click();
  await page.waitForTimeout(1200);
  await page.locator('[data-open-card="quote"]').evaluate((el) => (el as HTMLElement).click());
  await expect(page.locator('[data-resurface-overlay]')).toBeVisible();
}

test('the wall shows three due highlights and answering one updates it', async ({ page }) => {
  const errors = trackPageErrors(page);
  const { uid } = await setup(page, 'wall');
  await page.evaluate(() => { location.hash = '#room'; });
  await seedDueHighlight(uid, 'h1', 'b1', 'First thing worth another look');
  await seedDueHighlight(uid, 'h2', 'b1', 'Second thing worth another look');
  await seedDueHighlight(uid, 'h3', 'b1', 'Third thing worth another look');
  await seedDueHighlight(uid, 'h4', 'b1', 'Fourth thing worth another look');
  await seedDueHighlight(uid, 'h5', 'b1', 'Not due yet', { resurface7At: Date.now() + 3 * 86_400_000 });

  await page.reload();
  await page.click('#skipBtn');
  await page.waitForTimeout(2500);
  await page.locator('[data-room-pose="notes"]').click();
  await page.waitForTimeout(1200);
  const items = page.locator('[data-resurface-list] [data-resurface-id]');
  await expect(items).toHaveCount(3); // four are due, three are shown
  await expect(page.locator('.calendar-card__source')).toContainText('3 to revisit');
  await page.screenshot({ path: 'tests/screenshots/phase-2/2.4-wall-1440.png' });

  await openWallOverlay(page);
  const shown = await page.locator('.rs-item').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.rsId));
  expect(shown).toHaveLength(3);

  // "Still holds": that highlight's 7-day moment closes and the wall fills the gap with the fourth.
  const first = shown[0]!;
  await page.locator(`.rs-item[data-rs-id="${first}"] [data-rs-rate="resonates"]`).evaluate((el) => (el as HTMLElement).click());
  await expect.poll(async () => (await highlight(uid, first)).resurfaced7).toBe(true);
  const after = await highlight(uid, first);
  expect(after.resurfaceRating).toBe('resonates');
  await expect.poll(async () => page.locator('.rs-item').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.rsId))).not.toContain(first);
  await expect(page.locator('.rs-item')).toHaveCount(3);

  // "Stop reminding": all three moments close.
  const second = (await page.locator('.rs-item').first().getAttribute('data-rs-id'))!;
  await page.locator(`.rs-item[data-rs-id="${second}"] [data-rs-rate="dismiss"]`).evaluate((el) => (el as HTMLElement).click());
  await expect.poll(async () => (await highlight(uid, second)).resurfaced90).toBe(true);
  expect(await highlight(uid, second)).toMatchObject({ resurfaced7: true, resurfaced30: true, resurfaced90: true });

  // "Turn into action": an action with the quote is created and the highlight moves on.
  const third = (await page.locator('.rs-item').first().getAttribute('data-rs-id'))!;
  await page.locator(`.rs-item[data-rs-id="${third}"] [data-rs-rate="action"]`).evaluate((el) => (el as HTMLElement).click());
  await expect.poll(async () => (await listDocs(`workspaces/${WS}/users/${uid}/actions`)).length).toBe(1);
  const action = (await listDocs(`workspaces/${WS}/users/${uid}/actions`))[0]!;
  expect(plain(action.fields).text).toMatch(/worth another look/);
  expect((await highlight(uid, third)).resurfaced7).toBe(true);

  // "Add a thought": the sentence is appended to the highlight.
  const fourth = (await page.locator('.rs-item').first().getAttribute('data-rs-id'))!;
  await page.locator(`.rs-item[data-rs-id="${fourth}"] [data-rs-rate="thought"]`).evaluate((el) => (el as HTMLElement).click());
  await page.locator('.rs-thought__input').fill('I disagree with this now');
  await page.locator('.rs-thought .rs-btn--primary').evaluate((el) => (el as HTMLElement).click());
  await expect.poll(async () => (await highlight(uid, fourth)).annotation).toBe('I disagree with this now');
  expect((await highlight(uid, fourth)).resurfaced7).toBe(true);
  expect(errors).toEqual([]);
});

test('an answered highlight is not reset when its comment is edited on the book page', async ({ page }) => {
  const { uid } = await setup(page, 'noreset');
  const bookId = await addBookViaUi(page, uid, 'Deep Work', 'Cal Newport');
  await seedDueHighlight(uid, 'h-keep', bookId, 'Edit my comment, keep my answer', { resurfaced7: true, resurfaceRating: 'resonates' });
  await page.reload();
  await page.click('#skipBtn');
  await page.waitForTimeout(2500);
  await page.evaluate((id) => { location.hash = '#search'; void id; }, bookId);
  await page.waitForTimeout(1500);
  await page.locator('#shelfContinueTrack .shelf-quick-card').first().click();
  await page.locator('.book-tab-btn[data-target="highlights"]').click();
  const item = page.locator('.hl-item', { hasText: 'Edit my comment, keep my answer' });
  await expect(item).toBeVisible({ timeout: 15_000 });
  await item.locator('[data-hl-comment-add]').click();
  await item.locator('[data-hl-comment-form] textarea').fill('a new comment');
  await item.locator('[data-hl-comment-form] button[type=submit]').click();
  await expect.poll(async () => (await highlight(uid, 'h-keep')).annotation).toBe('a new comment');
  expect(await highlight(uid, 'h-keep')).toMatchObject({ resurfaced7: true, resurfaceRating: 'resonates' });
});

test('a new highlight gets its 7, 30 and 90 day schedule when it is saved', async ({ page }) => {
  const { uid } = await setup(page, 'sched');
  await addBookViaUi(page, uid, 'Deep Work', 'Cal Newport');
  await page.locator('.book-tab-btn[data-target="highlights"]').click();
  await page.locator('#hlAddBtn').click();
  await page.locator('#hlFormQuote').fill('Schedule me');
  await page.locator('.hl-form-save').click();
  await expect.poll(async () => (await listDocs(`workspaces/${WS}/users/${uid}/highlights`)).length).toBe(1);
  const saved = plain((await listDocs(`workspaces/${WS}/users/${uid}/highlights`))[0]!.fields);
  const DAY = 86_400_000;
  expect(Number(saved.resurface7At) - Number(saved.createdAt)).toBe(7 * DAY);
  expect(Number(saved.resurface30At) - Number(saved.createdAt)).toBe(30 * DAY);
  expect(Number(saved.resurface90At) - Number(saved.createdAt)).toBe(90 * DAY);
  expect([saved.resurfaced7, saved.resurfaced30, saved.resurfaced90]).toEqual([false, false, false]);
});
