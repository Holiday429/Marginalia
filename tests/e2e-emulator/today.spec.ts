import { test, expect, type Page } from '@playwright/test';
import { WS, addBookViaUi, createUser, goToPose, seedDueHighlight, signIn, skipPreloader, trackPageErrors, writeDoc } from './helpers';

// Plan 2.8: the room is home and carries a Today panel (the book being read, up to three highlights worth another look, the due action;
// collapsed by default, the timer lives in the focus dock); the desk book opens the book being read, or Add Book when nothing is being read.
const DAY = 86_400_000;
const SHOTS = 'tests/screenshots/phase-2';

async function setup(page: Page, label: string) {
  const email = `${label}-${Date.now()}@example.com`;
  const uid = await createUser(email, 'correct-horse-1');
  await skipPreloader(page);
  await signIn(page, email, 'correct-horse-1');
  await page.waitForTimeout(1500);
  return { uid, email };
}

async function backToRoom(page: Page) {
  await page.evaluate(() => { location.hash = '#room'; });
  await expect(page.locator('body')).toHaveAttribute('data-view', 'room', { timeout: 15_000 });
  await page.waitForTimeout(1200);
}

test('Today shows what is being read, what is worth another look and the due action; it is collapsed by default and opens the review list', async ({ page }) => {
  const errors = trackPageErrors(page);
  const { uid } = await setup(page, 'today');
  const bookId = await addBookViaUi(page, uid, 'Deep Work', 'Cal Newport');
  for (let i = 0; i < 4; i += 1) await seedDueHighlight(uid, `h${i}`, bookId, `A sentence worth another look number ${i}`);
  await writeDoc(`workspaces/${WS}/users/${uid}/actions/a1`, {
    bookId, text: 'Block two hours a day for deep work', status: 'open', createdAt: Date.now() - 9 * DAY,
    remind7At: Date.now() - 2 * DAY, remind30At: Date.now() + 21 * DAY, remind90At: Date.now() + 81 * DAY, reminded7: false, reminded30: false, reminded90: false,
  });
  await backToRoom(page);

  const today = page.locator('#roomTodayPanel');
  await expect(today).toBeVisible({ timeout: 15_000 });
  // Collapsed to a pill at first; there is no timer button here (the focus dock owns the timer).
  await expect(today).toHaveAttribute('data-collapsed', 'true');
  await expect(today.locator('.today__pill')).toContainText('4 to revisit');
  await today.locator('[data-today="toggle"]').click();
  await expect(today).toHaveAttribute('data-collapsed', 'false');
  await expect(today.locator('[data-today="timer"]')).toHaveCount(0);
  await expect(today.locator('[data-today-col="reading"]')).toContainText('Deep Work');
  await expect(today.locator('[data-today-col="reading"]')).toContainText('Cal Newport');
  await expect(today.locator('.today__quote')).toHaveCount(3); // four are due, three are shown
  await expect(today.locator('[data-today-col="review"]')).toContainText('A sentence worth another look');
  await expect(today.locator('[data-today-col="action"]')).toContainText('Block two hours a day for deep work');

  // Screenshots at the three landscape sizes; nothing in the panel runs off the screen.
  for (const [w, h, name] of [[1024, 768, 'ipad-1024'], [1180, 820, 'ipad-1180'], [1440, 900, 'desktop-1440']] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(800);
    const box = (await today.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(w);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(h);
    await page.screenshot({ path: `${SHOTS}/2.8-today-${name}.png` });
  }

  // Review opens the existing review list on the notes wall (no second copy of the four answers).
  await today.locator('[data-today="review"]').click();
  await expect(page.locator('[data-resurface-overlay]')).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('Escape');

  // Hide leaves a small pill, Show brings the panel back.
  await backToRoom(page);
  await expect(today).toHaveAttribute('data-collapsed', 'false'); // the choice is kept for the session
  await today.locator('[data-today="toggle"]').click();
  await expect(today).toHaveAttribute('data-collapsed', 'true');
  await expect(today.locator('.today__pill')).toContainText('4 to revisit'); // three highlights and the action
  await today.locator('[data-today="toggle"]').click();
  await expect(today).toHaveAttribute('data-collapsed', 'false');

  // Open book from the panel.
  await today.locator('[data-today="open-book"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'book', { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('a reader with nothing in progress sees an empty Today with a way to add a book; signed out there is no Today', async ({ page }) => {
  const errors = trackPageErrors(page);
  await skipPreloader(page);
  await expect(page.locator('#roomTodayPanel')).toBeHidden(); // signed out: nothing to show

  const email = `empty-today-${Date.now()}@example.com`;
  await createUser(email, 'correct-horse-1');
  await signIn(page, email, 'correct-horse-1');
  await page.waitForTimeout(1500);
  const today = page.locator('#roomTodayPanel');
  await expect(today).toBeVisible({ timeout: 15_000 });
  await today.locator('[data-today="toggle"]').click();
  await expect(today).toContainText('Nothing in progress.');
  await expect(today).toContainText('Nothing to revisit today.');
  await expect(today).toContainText('No action due.');
  await today.locator('[data-today="add-book"]').click();
  await expect(page.locator('#neForm')).toBeVisible({ timeout: 15_000 }); // Add Book opens
  expect(errors).toEqual([]);
});

/** Finds the desk book by hovering: the room names an object under the pointer ("Keep Reading" is the desk book). */
async function pointOnDeskBook(page: Page): Promise<{ x: number; y: number }> {
  const size = page.viewportSize()!;
  const title = page.locator('#roomHoverTitle');
  for (let y = Math.round(size.height * 0.34); y < size.height * 0.8; y += 26) {
    for (let x = Math.round(size.width * 0.22); x < size.width * 0.78; x += 26) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(90);
      if ((await title.textContent())?.trim() === 'Keep Reading' && await page.locator('#roomHoverBadge').isVisible()) return { x, y };
    }
  }
  throw new Error('the desk book was not found under the pointer');
}

test('with nothing being read, the desk book opens Add Book', async ({ page }) => {
  const errors = trackPageErrors(page);
  await setup(page, 'desk-empty');
  await goToPose(page, 'approach');
  await page.waitForTimeout(2500);
  const point = await pointOnDeskBook(page);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#neForm')).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('the desk book opens the book being read, not another book', async ({ page }) => {
  const errors = trackPageErrors(page);
  const { uid } = await setup(page, 'desk-reading');
  const bookId = await addBookViaUi(page, uid, 'Deep Work', 'Cal Newport'); // added as "reading"
  await writeDoc(`workspaces/${WS}/users/${uid}/books/other-${Date.now()}`, { title: 'A Different Book', author: 'Someone Else', status: 'to-read', _v: 1, createdAt: Date.now(), updatedAt: Date.now() });
  await backToRoom(page);
  await goToPose(page, 'approach');
  await page.waitForTimeout(2500);
  const point = await pointOnDeskBook(page);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('body')).toHaveAttribute('data-view', 'book', { timeout: 15_000 });
  await expect(page.locator('#panel-book')).toContainText('Deep Work');
  await expect(page.locator('#panel-book')).not.toContainText('A Different Book');
  expect(bookId).not.toBe('');
  expect(errors).toEqual([]);
});
