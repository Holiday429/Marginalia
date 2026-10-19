import { test, expect, type Page } from '@playwright/test';
import { addBookViaUi, createUser, openView, signIn, skipPreloader, trackPageErrors } from './helpers';

// Plan 2.7: ⌘K / Ctrl+K opens one search over books, highlights, notes and actions, Chinese included.

async function setup(page: Page, label: string) {
  const email = `${label}-${Date.now()}@example.com`;
  const uid = await createUser(email, 'correct-horse-1');
  await skipPreloader(page);
  await signIn(page, email, 'correct-horse-1');
  await page.waitForTimeout(1500);
  return { uid, email };
}

test('signed out: Ctrl+K finds a two-character Chinese word that only appears in a demo highlight', async ({ page }) => {
  const errors = trackPageErrors(page);
  await skipPreloader(page);
  await page.waitForTimeout(1500);
  await page.keyboard.press('Control+k');
  const input = page.locator('[data-gs-input]');
  await expect(input).toBeFocused();
  await input.fill('骗局');
  const group = page.locator('.gs-group[aria-label="Highlights"]');
  await expect(group).toBeVisible();
  await expect(group.locator('.gs-hit').first()).toContainText('农业革命是历史上最大的骗局');
  await expect(group.locator('mark').first()).toHaveText('骗局');
  await page.screenshot({ path: 'tests/screenshots/phase-2/2.7-search-demo-1440.png' });

  // Enter opens the book on its Highlights tab; Escape closes the panel when nothing is chosen.
  await page.keyboard.press('Enter');
  await expect(page.locator('#panel-book .book-tab-btn.is-active')).toHaveAttribute('data-target', 'highlights', { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('signed in: books, highlights, notes and actions all answer, and each opens the right place', async ({ page }) => {
  const { uid } = await setup(page, 'gsearch');
  await addBookViaUi(page, uid, 'The Overstory', 'Richard Powers');

  // A highlight, a note and an action that all contain words nothing else has.
  await page.locator('.book-tab-btn[data-target="highlights"]').click();
  await page.locator('#hlAddBtn').click();
  await page.locator('#hlFormQuote').fill('树木之间通过地下的菌丝网络交换养分，这是一场静默的集体行动。');
  await page.locator('.hl-form-save').click();
  await expect(page.locator('.hl-item', { hasText: '菌丝网络' })).toBeVisible({ timeout: 15_000 });

  await page.locator('.book-tab-btn[data-target="notes"]').click();
  await page.locator('#ntFreeNote').fill('Mycorrhizal networks remind me of the commons. Re-read chapter four.');
  await page.locator('#ntFreeNoteSave').click();
  await expect(page.locator('#ntFreeNoteSaveStatus')).toContainText(/saved/i, { timeout: 10_000 });

  await page.locator('.book-tab-btn[data-target="actions"]').click();
  await page.locator('.actions-add-input').fill('Plant three oak seedlings this spring');
  await page.locator('.actions-add-btn').click();
  await expect(page.locator('.actions-item', { hasText: 'oak seedlings' })).toBeVisible({ timeout: 10_000 });

  // Works even while typing in a text field.
  await page.locator('.actions-add-input').click();
  await page.keyboard.press('Control+k');
  const input = page.locator('[data-gs-input]');
  await expect(input).toBeFocused();

  // Book title and author (prefix match, case-insensitive).
  await input.fill('overst');
  await expect(page.locator('.gs-group[aria-label="Books"] .gs-hit').first()).toContainText('Overstory');
  await input.fill('POWERS');
  await expect(page.locator('.gs-group[aria-label="Books"] .gs-hit').first()).toContainText('Richard Powers');

  // The Chinese word that appears only in the highlight's text.
  await input.fill('菌丝');
  await expect(page.locator('.gs-group[aria-label="Highlights"] .gs-hit').first()).toContainText('菌丝网络');
  await expect(page.locator('.gs-group[aria-label="Books"]')).toHaveCount(0);

  // The note, found by an English word inside it; clicking it opens the Notes tab.
  await input.fill('commons');
  await expect(page.locator('.gs-group[aria-label="Notes"] .gs-hit').first()).toContainText('Mycorrhizal');
  await page.locator('.gs-group[aria-label="Notes"] .gs-hit').first().click();
  await expect(page.locator('.book-tab-btn.is-active')).toHaveAttribute('data-target', 'notes', { timeout: 15_000 });

  // The action, opened from the keyboard.
  await page.keyboard.press('Control+k');
  await input.fill('seedlings');
  await expect(page.locator('.gs-group[aria-label="Actions"] .gs-hit').first()).toContainText('oak seedlings');
  await page.keyboard.press('Enter');
  await expect(page.locator('.book-tab-btn.is-active')).toHaveAttribute('data-target', 'actions', { timeout: 15_000 });

  // New material is searchable straight away (the index follows changes), and nothing found says so.
  await page.keyboard.press('Control+k');
  await input.fill('zzzzqx');
  await expect(page.locator('.gs-hint')).toContainText('Nothing found');
  await input.fill('菌丝');
  for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `tests/screenshots/phase-2/2.7-search-results-${w}.png` });
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('.gs-dialog')).toHaveCount(0);
});

test('the Search page has a visible "Search all" button for devices without a keyboard', async ({ page }) => {
  const { uid } = await setup(page, 'gsbtn');
  await addBookViaUi(page, uid, 'Piranesi', 'Susanna Clarke');
  await openView(page, 'Search');
  await page.locator('#searchAllBtn').click();
  await expect(page.locator('[data-gs-input]')).toBeFocused();
  await page.locator('[data-gs-input]').fill('pira');
  await expect(page.locator('.gs-hit').first()).toContainText('Piranesi');
  await page.screenshot({ path: 'tests/screenshots/phase-2/2.7-search-button-1440.png' });
});
