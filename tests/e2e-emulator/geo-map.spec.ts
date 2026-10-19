import { test, expect, type Page } from '@playwright/test';
import { WS, addBookViaUi, createUser, listDocs, openView, plain, signIn, skipPreloader, trackPageErrors } from './helpers';

// Plan 2.6: books are placed on the map without any manual step. The real resolveBookGeo function runs in
// the Functions emulator against a fake Wikidata and a fake model (tests/support/mock-llm.mjs); the
// accuracy of the real Wikidata lookup is measured separately (tests/geo-wikidata.test.ts).

async function setup(page: Page, label: string) {
  const email = `${label}-${Date.now()}@example.com`;
  const uid = await createUser(email, 'correct-horse-1');
  await skipPreloader(page);
  await signIn(page, email, 'correct-horse-1');
  await page.waitForTimeout(1500);
  await openView(page, 'Search');
  return { uid, email };
}

const goodreads = (n: number) => Buffer.from([
  'Book Id,Title,Author,ISBN,ISBN13,My Rating,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Exclusive Shelf',
  ...Array.from({ length: n }, (_, i) => `${i},"Placed book ${i}","Author ${i}","=""""","=""${String(9781000000000 + i)}""",0,2000,1999,,2020/01/01,,read`),
].join('\n'));

async function importFile(page: Page, buffer: Buffer) {
  await page.locator('#searchImportBtn').click();
  await page.locator('[data-imp-file]').setInputFiles({ name: 'goodreads_library_export.csv', mimeType: 'text/csv', buffer });
  await page.locator('[data-imp-preview]').click();
  await page.locator('[data-imp-confirm]').click();
  await expect(page.locator('[data-imp-done]')).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-imp-close]').first().click();
}

const books = async (uid: string) => (await listDocs(`workspaces/${WS}/users/${uid}/books`)).map((d) => ({
  id: d.id,
  ...plain(d.fields),
  origin: d.fields.geo?.mapValue?.fields?.authorOrigin?.mapValue?.fields?.country?.stringValue as string | undefined,
  setting: d.fields.geo?.mapValue?.fields?.contentLocation?.mapValue?.fields?.country?.stringValue as string | undefined,
}));

test('importing 20 books places them on the map with no manual step, marked "to confirm", for free', async ({ page }) => {
  const errors = trackPageErrors(page);
  const { uid } = await setup(page, 'geo20');
  await importFile(page, goodreads(20));

  // Without touching anything else, every book gets an author origin and a story setting.
  await expect.poll(async () => (await books(uid)).filter((b) => b.origin).length, { timeout: 60_000, intervals: [1000] }).toBe(20);
  const stored = await books(uid);
  expect(stored.every((b) => b.geoStatus === 'pending')).toBe(true);
  expect(stored.find((b) => b.title === 'Placed book 0')).toMatchObject({ origin: 'GB', setting: 'FR' }); // Author 0 → city 0 → GB; the fake model says FR
  expect(stored.find((b) => b.title === 'Placed book 2')?.origin).toBe('JP');

  // The internal model calls are logged with token counts and cost the reader nothing.
  const audit = await listDocs(`audit/ai_calls/${uid}`);
  const geoCalls = audit.map((d) => plain(d.fields)).filter((a) => a.featureId === 'resolve-book-geo');
  expect(geoCalls).toHaveLength(20);
  expect(geoCalls.every((a) => a.internal === true && a.countedAgainstQuota === false && a.inputTokens === 100)).toBe(true);
  expect(await listDocs(`usage/${uid}/months`)).toHaveLength(0);

  // The map shows them (20 placed, so the insight appears) and says how many wait for confirmation.
  await openView(page, 'Map');
  await expect(page.locator('#mapStats')).toContainText('books mapped', { timeout: 30_000 });
  await expect(page.locator('[data-map-insight]')).toContainText('You read most from', { timeout: 30_000 });
  await expect(page.locator('[data-map-pending]')).toContainText('20 places placed automatically');
  for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `tests/screenshots/phase-2/2.6-map-20-books-${w}.png` });
  }
  expect(errors).toEqual([]);
});

test('with fewer than ten placed books the map shows no "you read most from" line', async ({ page }) => {
  const { uid } = await setup(page, 'geo5');
  await importFile(page, goodreads(5));
  await expect.poll(async () => (await books(uid)).filter((b) => b.origin).length, { timeout: 60_000, intervals: [1000] }).toBe(5);
  await openView(page, 'Map');
  await expect(page.locator('[data-map-insight]')).toContainText('Place 5 more books on the map', { timeout: 30_000 });
  await expect(page.locator('[data-map-insight]')).not.toContainText('You read most from');
  await page.screenshot({ path: 'tests/screenshots/phase-2/2.6-map-5-books-1440.png' });
});

test('an automatic place is confirmed with one click, and a place the reader typed is never replaced', async ({ page }) => {
  const { uid } = await setup(page, 'geoconfirm');
  await importFile(page, goodreads(3));
  await expect.poll(async () => (await books(uid)).filter((b) => b.origin).length, { timeout: 60_000, intervals: [1000] }).toBe(3);

  // On the book page: the origin is shown with "To confirm"; Confirm marks it as the reader's.
  await page.evaluate(() => { location.hash = '#search'; });
  await page.waitForTimeout(800);
  await page.locator('#shelfRecentTrack .shelf-quick-card').first().click();
  await expect(page.locator('[data-author-origin]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-geo-pending]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/phase-2/2.6-book-origin-to-confirm-1440.png' });
  await page.locator('[data-geo-confirm]').click();
  await expect(page.locator('[data-geo-pending]')).toHaveCount(0);
  await expect.poll(async () => (await books(uid)).filter((b) => b.geoStatus === 'confirmed').length).toBe(1);

  // A book added by hand with a place typed in is not touched by the resolver.
  await openView(page, 'Search');
  await page.locator('#searchNewEntryBtn').click();
  await page.locator('#neTitle').fill('My own book');
  await page.locator('#neAuthor').fill('Author 1');
  await page.locator('#neStatus').selectOption('reading');
  await page.locator('#neOrigin').fill('Japan');
  await page.locator('#neSubmitBtn').click();
  await expect(page.locator('#neForm')).toBeHidden({ timeout: 15_000 });
  await page.waitForTimeout(5000); // long enough for a resolver run to have happened
  const mine = (await books(uid)).find((b) => b.title === 'My own book')!;
  expect(mine.origin).toBe('JP'); // "Author 1" would resolve to FR: the reader's own place won
  expect(mine.geoStatus).toBe('confirmed');
});

test('"where I read": only with the box ticked and the browser permission, city level, stored on the session and the book', async ({ browser }) => {
  const context = await browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: 38.722345, longitude: -9.139312 } });
  const page = await context.newPage();
  const { uid } = await setup(page, 'place');
  const bookId = await addBookViaUi(page, uid, 'Deep Work', 'Cal Newport');
  await page.evaluate(() => { location.hash = '#room'; });
  await page.waitForTimeout(1500);

  await page.locator('.fw-collapse-btn').click();
  await expect(page.locator('[data-fw-place]')).not.toBeChecked(); // off unless the reader turns it on
  await page.locator('[data-fw-book]').selectOption(bookId);
  await page.locator('label.fw-place').click();
  await page.locator('[data-fw-start]').click();

  await expect.poll(async () => {
    const s = (await listDocs(`workspaces/${WS}/users/${uid}/sessions`))[0];
    return s?.fields.place?.mapValue?.fields?.city?.stringValue;
  }, { timeout: 45_000, message: 'the session gets a city (permission, then a cold function call, then a lookup)' }).toBe('Lisbon');
  const session = (await listDocs(`workspaces/${WS}/users/${uid}/sessions`))[0]!;
  expect(session.fields.place.mapValue.fields.country.stringValue).toBe('PT');
  expect(JSON.stringify(session.fields)).not.toContain('38.7'); // no coordinates were stored
  await expect.poll(async () => (await listDocs(`workspaces/${WS}/users/${uid}/books`)).find((d) => d.id === bookId)?.fields.geo?.mapValue?.fields?.readerLocation?.mapValue?.fields?.city?.stringValue).toBe('Lisbon');
  await page.locator('[data-fw-stop]').click();
  await context.close();
});

test('declining location access leaves the timer working and stores no place', async ({ page }) => {
  const { uid } = await setup(page, 'noplace');
  await page.evaluate(() => { location.hash = '#room'; });
  await page.waitForTimeout(1500);
  await page.locator('.fw-collapse-btn').click();
  await page.locator('label.fw-place').click();
  await page.locator('[data-fw-start]').click();
  await page.waitForTimeout(3000);
  await page.locator('[data-fw-stop]').click();
  await expect.poll(async () => (await listDocs(`workspaces/${WS}/users/${uid}/sessions`)).length).toBe(1);
  expect((await listDocs(`workspaces/${WS}/users/${uid}/sessions`))[0]!.fields.place).toBeUndefined();
});
