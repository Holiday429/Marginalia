import { test, expect, type Page } from '@playwright/test';
import { WS, createUser, listDocs, signIn, skipPreloader, writeDoc } from './helpers';

// Plan 2.9: a new account gets a three-step guide (3 books, a first highlight, the room and the map);
// it can be skipped; finished or skipped, it never comes back, on any device.

const goodreads3 = Buffer.from([
  'Book Id,Title,Author,ISBN,ISBN13,My Rating,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Exclusive Shelf',
  ...['Alpha', 'Beta', 'Gamma'].map((t, i) => `${i},"${t} book","Author ${i}","=""""","=""${String(9782000000000 + i)}""",0,2000,1999,,2020/01/01,,to-read`),
].join('\n'));

async function newAccount(page: Page, label: string, guide = true) {
  const email = `${label}-${Date.now()}@example.com`;
  const uid = await createUser(email, 'correct-horse-1', { guide });
  await skipPreloader(page);
  await signIn(page, email, 'correct-horse-1');
  return { uid, email };
}

const onboardingState = async (uid: string) => {
  const doc = (await listDocs('users')).find((d) => d.id === uid);
  return doc?.fields?.settings?.mapValue?.fields?.onboarding?.mapValue?.fields?.state?.stringValue as string | undefined;
};

test('a new account walks the three steps and the guide closes for good', async ({ page }) => {
  const { uid, email } = await newAccount(page, 'guide');
  const guide = page.locator('#onboardingGuide');
  await expect(guide).toBeVisible({ timeout: 15_000 });
  await expect(guide.locator('[data-ob-step="books"]')).toHaveClass(/is-current/);
  await expect(guide).toContainText('0 of 3 so far');
  for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `tests/screenshots/phase-2/2.9-guide-step1-${w}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 720 });

  // Step 1: import three books from the guide itself.
  await guide.locator('[data-ob-import]').click();
  await page.locator('[data-imp-file]').setInputFiles({ name: 'goodreads.csv', mimeType: 'text/csv', buffer: goodreads3 });
  await page.locator('[data-imp-preview]').click();
  await page.locator('[data-imp-confirm]').click();
  await expect(page.locator('[data-imp-done]')).toBeVisible({ timeout: 20_000 });
  await page.locator('[data-imp-close]').first().click();
  await expect(guide.locator('[data-ob-step="books"]')).toHaveClass(/is-done/);
  await expect(guide.locator('[data-ob-step="highlight"]')).toHaveClass(/is-current/);

  // Step 2: a first highlight through quick capture.
  await guide.locator('[data-ob-capture]').click();
  await page.locator('[data-qc-text]').fill('My first saved line');
  await page.locator('[data-qc-save]').click();
  await expect(guide.locator('[data-ob-step="highlight"]')).toHaveClass(/is-done/, { timeout: 15_000 });
  await expect(guide.locator('[data-ob-step="tour"]')).toHaveClass(/is-current/);

  // Step 3: the room and the map.
  await guide.locator('[data-ob-map]').click();
  await expect(page.locator('#panel-map')).toBeVisible({ timeout: 15_000 });
  await expect(guide.locator('[data-ob-room]')).toContainText('Open the room');
  await guide.locator('[data-ob-room]').click();
  await expect(guide.locator('[data-ob-finish]')).toBeVisible({ timeout: 15_000 });
  await expect(guide).toContainText('You are all set');
  await page.screenshot({ path: 'tests/screenshots/phase-2/2.9-guide-done-1280.png' });
  await guide.locator('[data-ob-finish]').click();
  await expect(guide).toHaveCount(0);
  await expect.poll(() => onboardingState(uid)).toBe('done');

  // Gone after a reload, and not offered on another browser either.
  await page.reload();
  await page.click('#skipBtn');
  await expect(page.locator('#authUserMeta')).toContainText(email, { timeout: 20_000 });
  await page.waitForTimeout(5000);
  await expect(page.locator('#onboardingGuide')).toHaveCount(0);
});

test('skipping is remembered on the account: not after a reload, not on another device', async ({ page, browser }) => {
  const { uid, email } = await newAccount(page, 'skipguide');
  const guide = page.locator('#onboardingGuide');
  await expect(guide).toBeVisible({ timeout: 15_000 });
  await guide.locator('[data-ob-skip]').click();
  await expect(guide).toHaveCount(0);
  await expect.poll(() => onboardingState(uid)).toBe('skipped');
  expect((await listDocs(`workspaces/${WS}/users/${uid}/books`))).toHaveLength(0); // skipping does not touch the library

  await page.reload();
  await page.click('#skipBtn');
  await expect(page.locator('#authUserMeta')).toContainText(email, { timeout: 20_000 });
  await page.waitForTimeout(5000);
  await expect(page.locator('#onboardingGuide')).toHaveCount(0);

  await page.close(); // one 3D scene at a time keeps the software-GL browser responsive
  const other = await (await browser.newContext()).newPage();
  await skipPreloader(other);
  await signIn(other, email, 'correct-horse-1');
  await other.waitForTimeout(5000);
  await expect(other.locator('#onboardingGuide')).toHaveCount(0);
});

test('minimising keeps the guide', async ({ page }) => {
  await newAccount(page, 'minimise');
  const guide = page.locator('#onboardingGuide');
  await expect(guide).toBeVisible({ timeout: 15_000 });
  await guide.locator('[data-ob-min]').click();
  await expect(guide.locator('.ob-pill')).toContainText('Getting started · 0 of 3');
  await guide.locator('[data-ob-open]').click();
  await expect(guide.locator('[data-ob-step="books"]')).toBeVisible();
});

test('an account that already has books and a highlight never sees the guide', async ({ page }) => {
  // An established account: three books and a highlight already exist.
  const email = `veteran-${Date.now()}@example.com`;
  const uid = await createUser(email, 'correct-horse-1', { guide: true });
  for (const [i, title] of ['One', 'Two', 'Three'].entries()) {
    await writeDoc(`workspaces/${WS}/users/${uid}/books/b${i}`, { title: `${title} book`, author: 'Someone', status: 'reading' });
  }
  await writeDoc(`workspaces/${WS}/users/${uid}/highlights/h1`, { bookId: 'b0', quote: 'An old highlight', source: 'manual', createdAt: Date.now() - 86_400_000 * 30 });
  await skipPreloader(page);
  await signIn(page, email, 'correct-horse-1');
  await page.waitForTimeout(6000);
  await expect(page.locator('#onboardingGuide')).toHaveCount(0);
  await expect.poll(() => onboardingState(uid), { timeout: 10_000 }).toBe('done'); // marked done silently
});
