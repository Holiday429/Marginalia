import { test, expect, type Page } from '@playwright/test';
import { addBookViaUi, createUser, listHighlights, openView, signIn, skipPreloader, trackPageErrors } from './helpers';

// Plan 2.1: quick capture from any page, offline-safe, attributable by dragging onto a spine.

async function setup(page: Page, label: string) {
  const email = `${label}-${Date.now()}@example.com`;
  const uid = await createUser(email, 'correct-horse-1');
  await skipPreloader(page);
  await signIn(page, email, 'correct-horse-1');
  await page.waitForTimeout(1500);
  return { uid, email };
}

/** The whole interaction: one click on "+", type, one click on Save. */
async function capture(page: Page, text: string) {
  let clicks = 0;
  await page.locator('.qc-fab').click(); clicks += 1;
  await page.locator('[data-qc-text]').fill(text);
  await page.locator('[data-qc-save]').click(); clicks += 1;
  await expect(page.locator('.qc-sheet')).toHaveCount(0);
  return clicks;
}

test('from the room, Library, Book and Map a capture takes at most two clicks and reaches Firestore', async ({ page }) => {
  const errors = trackPageErrors(page);
  const { uid } = await setup(page, 'clicks');
  const bookId = await addBookViaUi(page, uid, 'Deep Work', 'Cal Newport');

  const cases: Array<{ where: string; go: () => Promise<void>; bookPreselected: boolean }> = [
    { where: 'Book', go: async () => { /* the add-book flow left the book page open */ }, bookPreselected: true },
    { where: 'Library', go: async () => { await openView(page, 'Library'); }, bookPreselected: false },
    { where: 'Map', go: async () => { await openView(page, 'Map'); }, bookPreselected: false },
    { where: 'Room', go: async () => { await page.evaluate(() => { location.hash = '#room'; }); await page.waitForTimeout(1500); }, bookPreselected: false },
  ];

  for (const c of cases) {
    await c.go();
    const text = `captured from ${c.where}`;
    expect(await capture(page, text), `${c.where}: clicks`).toBeLessThanOrEqual(2);
    await expect.poll(async () => (await listHighlights(uid)).some((h) => h.quote === text), { timeout: 10_000, message: c.where }).toBe(true);
    const saved = (await listHighlights(uid)).find((h) => h.quote === text)!;
    expect(saved.source).toBe('quick');
    // On the Book page the book is preselected; elsewhere the capture waits for an owner.
    expect(saved.bookId, c.where).toBe(c.bookPreselected ? bookId : '');
  }

  // The C key opens the same sheet (and typing "c" in a field does not).
  await page.keyboard.press('c');
  await expect(page.locator('.qc-sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.qc-sheet')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a capture made offline is stored on the device and appears in Firestore once the network returns', async ({ page, context }) => {
  const { uid } = await setup(page, 'offline');
  await context.setOffline(true);
  await page.locator('.qc-fab').click();
  await page.locator('[data-qc-text]').fill('written on a train');
  await page.locator('[data-qc-save]').click();
  await expect(page.locator('.qc-toast')).toContainText('Saved on this device');
  await page.waitForTimeout(1500);
  expect((await listHighlights(uid)).filter((h) => h.quote === 'written on a train')).toHaveLength(0);

  await context.setOffline(false);
  await expect.poll(async () => (await listHighlights(uid)).filter((h) => h.quote === 'written on a train').length, { timeout: 30_000 }).toBe(1);
});

test('a capture still waiting in the outbox is sent after a reload', async ({ page, context }) => {
  const { uid, email } = await setup(page, 'reload');
  // Cut only Firestore's write channel: the page, sign-in and reads still work, but no write is confirmed.
  const cut = (route: { abort: () => Promise<void> }) => route.abort();
  await context.route(/Firestore\/Write\/channel/, cut);
  await page.locator('.qc-fab').click();
  await page.locator('[data-qc-text]').fill('survives a reload');
  await page.locator('[data-qc-save]').click();
  await expect(page.locator('.qc-sheet')).toHaveCount(0);
  await page.waitForTimeout(1500);
  expect((await listHighlights(uid)).filter((h) => h.quote === 'survives a reload')).toHaveLength(0);

  await page.reload(); // the in-memory Firestore queue is gone; only the outbox remains
  await context.unroute(/Firestore\/Write\/channel/, cut);
  await page.click('#skipBtn');
  await expect(page.locator('#authUserMeta')).toContainText(email, { timeout: 20_000 });
  await expect.poll(async () => (await listHighlights(uid)).filter((h) => h.quote === 'survives a reload').length, { timeout: 30_000 }).toBe(1);
});

test('ending a reading session opens the sheet; an unattributed capture can be dragged onto a spine', async ({ page }) => {
  const { uid } = await setup(page, 'drag');
  const bookId = await addBookViaUi(page, uid, 'The Overstory', 'Richard Powers');

  // Session end → "You read for …" sheet.
  await page.evaluate(() => { location.hash = '#room'; });
  await page.waitForTimeout(1500);
  await page.locator('.fw-collapse-btn').click();
  await page.locator('[data-fw-start]').click();
  await page.waitForTimeout(1200);
  await page.locator('[data-fw-stop]').click();
  await expect(page.locator('.qc-title')).toContainText('You read for');
  await page.locator('[data-qc-text]').fill('trees talk to each other');
  if (await page.locator('[data-qc-clear]').count()) await page.locator('[data-qc-clear]').click(); // the session's book is preselected; this test wants an orphan
  await page.locator('[data-qc-save]').click();
  await expect.poll(async () => (await listHighlights(uid)).find((h) => h.quote === 'trees talk to each other')?.bookId, { timeout: 10_000 }).toBe('');

  // The pill appears; open the drawer; drag the capture onto the book's spine in Search.
  await openView(page, 'Search');
  const pill = page.locator('.cd-pill');
  await expect(pill).toBeVisible();
  await expect(pill).toContainText('1 unattributed');
  await pill.click();
  const grip = page.locator('.cd-item', { hasText: 'trees talk to each other' }).locator('[data-cd-grip]');
  const spine = page.locator(`#shelfContinueTrack .shelf-quick-card[data-book-id="${bookId}"]`);
  await expect(spine).toBeVisible();
  const from = (await grip.boundingBox())!;
  const to = (await spine.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await expect(spine).toHaveClass(/cd-drop-target/);
  await page.mouse.up();

  await expect.poll(async () => (await listHighlights(uid)).find((h) => h.quote === 'trees talk to each other')?.bookId, { timeout: 10_000 }).toBe(bookId);
  await expect(pill).toBeHidden();

  // It now shows in that book's Highlights tab.
  await spine.click();
  await page.locator('.book-tab-btn[data-target="highlights"]').click();
  await expect(page.locator('.hl-item', { hasText: 'trees talk to each other' })).toBeVisible({ timeout: 15_000 });
});

test('at 390px the sheet stays above the on-screen keyboard (screenshots at three sizes)', async ({ page }) => {
  await setup(page, 'kbd');
  const shots = 'tests/screenshots/phase-2';
  for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(600);
    await page.locator('.qc-fab').click();
    await page.locator('[data-qc-text]').fill('A line that stayed with me after the last chapter.');
    await page.waitForTimeout(500); // let the slide-up finish
    await page.screenshot({ path: `${shots}/2.1-capture-sheet-${w}.png` });
    if (w === 390) {
      // Playwright has no soft keyboard, so fake what iOS reports: the visual viewport shrinks by the keyboard height.
      const keyboard = 336;
      await page.evaluate((kb) => {
        const vv = window.visualViewport!;
        Object.defineProperty(vv, 'height', { configurable: true, get: () => window.innerHeight - kb });
        vv.dispatchEvent(new Event('resize'));
      }, keyboard);
      await page.waitForTimeout(300);
      const visibleBottom = h - keyboard;
      for (const sel of ['.qc-title', '[data-qc-text]', '[data-qc-save]']) {
        const box = (await page.locator(sel).boundingBox())!;
        expect(box.y, sel).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height, `${sel} above the keyboard`).toBeLessThanOrEqual(visibleBottom + 1);
      }
      await page.screenshot({ path: `${shots}/2.1-capture-sheet-390-keyboard.png` });
      await page.evaluate(() => { const vv = window.visualViewport!; delete (vv as unknown as { height?: number }).height; vv.dispatchEvent(new Event('resize')); });
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('.qc-sheet')).toHaveCount(0);
  }
});

test('in Library a capture can be dragged onto a shelf spine as well', async ({ page }) => {
  const { uid } = await setup(page, 'libdrag');
  const bookId = await addBookViaUi(page, uid, 'Piranesi', 'Susanna Clarke');
  await openView(page, 'Library');
  await page.evaluate(() => { location.hash = '#library'; });
  await page.waitForTimeout(1500);
  await page.locator('.qc-fab').click();
  await page.locator('[data-qc-text]').fill('the House is kind');
  if (await page.locator('[data-qc-clear]').count()) await page.locator('[data-qc-clear]').click();
  await page.locator('[data-qc-save]').click();
  await expect.poll(async () => (await listHighlights(uid)).find((h) => h.quote === 'the House is kind')?.bookId, { timeout: 10_000 }).toBe('');

  await page.locator('.cd-pill').click();
  const grip = page.locator('.cd-item', { hasText: 'the House is kind' }).locator('[data-cd-grip]');
  const target = page.locator(`#panel-library .library-draggable[data-book-id="${bookId}"]`).first();
  await expect(target).toBeVisible({ timeout: 15_000 });
  const from = (await grip.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await listHighlights(uid)).find((h) => h.quote === 'the House is kind')?.bookId, { timeout: 10_000 }).toBe(bookId);
});

test('screenshots of the unattributed captures drawer at three sizes', async ({ page }) => {
  const { uid } = await setup(page, 'shots');
  await addBookViaUi(page, uid, 'Piranesi', 'Susanna Clarke');
  await openView(page, 'Search');
  await page.locator('.qc-fab').click();
  await page.locator('[data-qc-text]').fill('The beauty of the House is immeasurable; its Kindness infinite.');
  if (await page.locator('[data-qc-clear]').count()) await page.locator('[data-qc-clear]').click();
  await page.locator('[data-qc-save]').click();
  await page.locator('.cd-pill').click();
  for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(600);
    await expect(page.locator('.cd-drawer')).toBeVisible();
    await page.screenshot({ path: `tests/screenshots/phase-2/2.1-captures-drawer-${w}.png` });
  }
});
