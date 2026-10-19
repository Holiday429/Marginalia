import { test, expect, type Page } from '@playwright/test';
import { WS, addBookViaUi, createUser, currentMonthKey, listDocs, openView, signIn, skipPreloader, trackPageErrors, writeDoc } from './helpers';

// Plan 2.2: a new book is never a blank page. The pre-read card is prepared in the background through the
// real aiGenerate function (fake model server, see tests/support/mock-llm.mjs), every tab explains
// itself when empty, detail always opens on Overview, and the shelf preview agrees with the Actions tab.

async function setup(page: Page, label: string) {
  const email = `${label}-${Date.now()}@example.com`;
  const uid = await createUser(email, 'correct-horse-1');
  await skipPreloader(page);
  await signIn(page, email, 'correct-horse-1');
  await page.waitForTimeout(1500);
  return { uid, email };
}

test('a new book shows its pre-read card within 30 seconds and the card costs one generation', async ({ page }) => {
  const errors = trackPageErrors(page);
  const { uid } = await setup(page, 'intro');
  const started = Date.now();
  const bookId = await addBookViaUi(page, uid, 'The Order of Time', 'Carlo Rovelli');

  // While it is being prepared the page says so; then the card replaces that line.
  const card = page.locator('#overview [data-intro-card]');
  await expect(card).toBeVisible({ timeout: 30_000 });
  const seconds = (Date.now() - started) / 1000;
  expect(seconds).toBeLessThan(30);
  await expect(card).toContainText('A test premise for the pre-read card');
  await expect(card).toContainText('Cultural context');
  await expect(page.locator('[data-intro-card-status]')).toHaveCount(0);

  // Stored as an AiBlock, and counted against the monthly allowance exactly once.
  const stored = await listDocs(`workspaces/${WS}/users/${uid}/books/${bookId}/ai`);
  expect(stored.map((d) => d.id)).toContain('intro-card');
  const usage = await listDocs(`usage/${uid}/months`);
  expect(usage.find((d) => d.id === currentMonthKey())?.fields.aiCalls.integerValue).toBe('1');

  expect(errors).toEqual([]);
  console.log(`intro card visible after ${seconds.toFixed(1)}s`);

  for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `tests/screenshots/phase-2/2.2-overview-intro-card-${w}.png` });
  }
});

test('when the free allowance is used up, no card is generated and the page offers the manual button', async ({ page }) => {
  const { uid } = await setup(page, 'quota');
  await writeDoc(`usage/${uid}/months/${currentMonthKey()}`, { aiCalls: 10 });
  await addBookViaUi(page, uid, 'Seven Brief Lessons', 'Carlo Rovelli');

  const status = page.locator('[data-intro-card-status="quota"]');
  await expect(status).toBeVisible({ timeout: 20_000 });
  await expect(status).toContainText('free AI generations are used up');
  await expect(page.locator('#overview [data-intro-card]')).toHaveCount(0);
  await expect(page.locator('#overview .ai-generate-btn')).toContainText('Generate pre-read card');
  const usage = await listDocs(`usage/${uid}/months`);
  expect(usage.find((d) => d.id === currentMonthKey())?.fields.aiCalls.integerValue).toBe('10'); // refused, not counted
  await page.screenshot({ path: 'tests/screenshots/phase-2/2.2-overview-quota-1440.png' });
});

test('every empty tab explains itself, and detail opens on Overview from the desk, Library and Search', async ({ page }) => {
  const { uid } = await setup(page, 'tabs');
  await writeDoc(`usage/${uid}/months/${currentMonthKey()}`, { aiCalls: 10 }); // keep this test about structure, not AI
  const bookId = await addBookViaUi(page, uid, 'Piranesi', 'Susanna Clarke');

  // Each tab either carries an empty-state block or is one of the tabs with its own guided form.
  const expectations: Record<string, RegExp> = {
    highlights: /No highlights yet/,
    'visual-notes': /No visual notes yet/,
    'cultural-context': /No extra context yet/,
    'related-books': /No related books yet/,
    actions: /No actions yet/,
  };
  const tabs = await page.locator('.book-tab-btn').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.target));
  for (const [tab, pattern] of Object.entries(expectations)) {
    if (!tabs.includes(tab)) continue;
    await page.locator(`.book-tab-btn[data-target="${tab}"]`).click();
    await expect(page.locator(`#${tab} [data-empty-state]`), `${tab} empty state`).toContainText(pattern);
  }
  await page.locator('.book-tab-btn[data-target="notes"]').click();
  await expect(page.locator('#notes')).toContainText(/Reading Context/); // Notes already starts from guided templates
  await page.screenshot({ path: 'tests/screenshots/phase-2/2.2-empty-tabs-1440.png' });

  // Leave the book on a non-Overview tab, then open it again from three different places.
  const activeTab = () => page.locator('.book-tab-btn.is-active').first().getAttribute('data-target');
  const leaveAndReturn = async (open: () => Promise<void>) => {
    await page.locator('.book-tab-btn[data-target="actions"]').click();
    await page.evaluate(() => { location.hash = '#room'; });
    await page.waitForTimeout(1200);
    await open();
    await expect(page.locator('#panel-book .book-tab-btn.is-active').first()).toBeVisible({ timeout: 15_000 });
    expect(await activeTab()).toBe('overview');
  };

  // From the desk: the room's "Reading Now" action (the desk book calls the same function).
  await leaveAndReturn(async () => {
    await page.evaluate(() => (document.querySelector('[data-room-action="reading-now"]') as HTMLElement).click());
  });
  // From Library.
  await leaveAndReturn(async () => {
    await openView(page, 'Library');
    await page.locator(`#panel-library .library-draggable[data-book-id="${bookId}"]`).first().click();
    await page.locator('[data-open-book]').first().click();
  });
  // From a search result.
  await leaveAndReturn(async () => {
    await openView(page, 'Search');
    await page.locator(`#shelfContinueTrack .shelf-quick-card[data-book-id="${bookId}"]`).click();
  });
});

test('the shelf preview shows the same action count as the Actions tab', async ({ page }) => {
  const { uid } = await setup(page, 'count');
  await writeDoc(`usage/${uid}/months/${currentMonthKey()}`, { aiCalls: 10 });
  const bookId = await addBookViaUi(page, uid, 'Deep Work', 'Cal Newport');

  await page.locator('.book-tab-btn[data-target="actions"]').click();
  for (const text of ['Block two hours a day', 'Turn off notifications', 'Write a shutdown ritual']) {
    await page.locator('.actions-add-input').fill(text);
    await page.locator('.actions-add-btn').click();
    await expect(page.locator('.actions-item', { hasText: text })).toBeVisible({ timeout: 10_000 });
  }
  await page.locator('.actions-item', { hasText: 'Turn off notifications' }).locator('input[type=checkbox]').check();
  await expect(page.locator('[data-actions-list]')).toHaveAttribute('data-open-count', '2');
  const tabCount = await page.locator('[data-actions-list] .actions-item').count();
  expect(tabCount).toBe(2);

  // Search preview.
  await openView(page, 'Search');
  const spine = page.locator(`#shelfStack .shelf-spine[data-book-id="${bookId}"]`);
  await spine.scrollIntoViewIfNeeded();
  await spine.click();
  await expect(page.locator('[data-preview-actions]').first()).toHaveText(`${tabCount} open actions`);

  await page.locator('#shelfPreviewCloseBtn').click();
  await page.mouse.wheel(0, -3000); // the shelf is far down the page; bring the nav back into view
  await page.waitForTimeout(500);
  // Library overlay.
  await openView(page, 'Library');
  await page.locator(`#panel-library .library-draggable[data-book-id="${bookId}"]`).first().click();
  await expect(page.locator('#libraryOverlayTags [data-preview-actions], .library-overlay [data-preview-actions]').first()).toHaveText(`${tabCount} open actions`);
});
