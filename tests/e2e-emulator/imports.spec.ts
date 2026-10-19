import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { WS, createUser, listDocs, openView, plain, signIn, skipPreloader, trackPageErrors } from './helpers';

// Plan 2.5: one preview-and-confirm dialog for Goodreads, StoryGraph, Readwise, WeChat Read and Kindle.

const fixture = (name: string) => readFileSync(new URL(`../fixtures/imports/${name}`, import.meta.url));

async function setup(page: Page, label: string) {
  const email = `${label}-${Date.now()}@example.com`;
  const uid = await createUser(email, 'correct-horse-1');
  await skipPreloader(page);
  await signIn(page, email, 'correct-horse-1');
  await page.waitForTimeout(1500);
  await openView(page, 'Search');
  return { uid, email };
}

async function chooseFile(page: Page, name: string, buffer: Buffer, source = 'auto') {
  await page.locator('#searchImportBtn').click();
  await page.locator('[data-imp-source]').selectOption(source);
  await page.locator('[data-imp-file]').setInputFiles({ name, mimeType: 'text/plain', buffer });
  await page.locator('[data-imp-preview]').click();
}

const books = async (uid: string) => (await listDocs(`workspaces/${WS}/users/${uid}/books`)).map((d) => ({ id: d.id, ...plain(d.fields) }));
const highlights = async (uid: string) => (await listDocs(`workspaces/${WS}/users/${uid}/highlights`)).map((d) => ({ id: d.id, ...plain(d.fields) }));

function goodreads200(): Buffer {
  const header = 'Book Id,Title,Author,ISBN,ISBN13,My Rating,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Exclusive Shelf';
  const rows = Array.from({ length: 200 }, (_, i) => `${i},"Book number ${i}","Author ${i % 40}","=""""","=""${String(9780000000000 + i)}""",${i % 6},2000,1999,2021/01/${String((i % 28) + 1).padStart(2, '0')},2020/01/01,"shelf-${i % 7}",${['read', 'to-read', 'currently-reading'][i % 3]}`);
  return Buffer.from([header, ...rows].join('\n'));
}

test('a 200-book Goodreads file imports in under 10 seconds, and importing it again adds nothing', async ({ page }) => {
  const errors = trackPageErrors(page);
  const { uid } = await setup(page, 'gr200');
  await page.screenshot({ path: 'tests/screenshots/phase-2/2.5-search-import-button-1440.png' });
  await chooseFile(page, 'goodreads_library_export.csv', goodreads200());
  await expect(page.locator('[data-imp-summary]')).toContainText('200 books. 200 new');
  for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `tests/screenshots/phase-2/2.5-import-preview-${w}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 720 });

  const started = Date.now();
  await page.locator('[data-imp-confirm]').click();
  await expect(page.locator('[data-imp-done]')).toBeVisible({ timeout: 30_000 });
  const seconds = (Date.now() - started) / 1000;
  console.log(`200-book import finished in ${seconds.toFixed(1)}s`);
  expect(seconds).toBeLessThan(10);
  await expect(page.locator('[data-imp-done]')).toContainText('200 new books');

  const stored = await books(uid);
  expect(stored).toHaveLength(200);
  expect(stored.find((b) => b.title === 'Book number 0')).toMatchObject({ status: 'finished', isbn: '9780000000000' });
  expect(stored.find((b) => b.title === 'Book number 1')).toMatchObject({ status: 'want' });

  // Again, the same file: everything is recognised, nothing can be confirmed, nothing is added.
  await page.locator('[data-imp-close]').first().click();
  await chooseFile(page, 'goodreads_library_export.csv', goodreads200());
  await expect(page.locator('[data-imp-summary]')).toContainText('0 new');
  await expect(page.locator('[data-imp-summary]')).toContainText('200 already in your library');
  await expect(page.locator('[data-imp-confirm]')).toBeDisabled();
  expect(await books(uid)).toHaveLength(200);
  expect(errors).toEqual([]);
});

test('Readwise: books and highlights come in, a second import adds no highlight twice', async ({ page }) => {
  const { uid } = await setup(page, 'readwise');
  await chooseFile(page, 'readwise-export.csv', fixture('readwise.csv'));
  await expect(page.locator('[data-imp-summary]')).toContainText('Readwise: 2 books. 2 new');
  await expect(page.locator('[data-imp-summary]')).toContainText('4 new highlights');
  await page.locator('[data-imp-confirm]').click();
  await expect(page.locator('[data-imp-done]')).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await highlights(uid)).length).toBe(4);
  const stored = await highlights(uid);
  expect(stored.find((h) => String(h.quote).startsWith('Boredom'))).toMatchObject({ annotation: 'Try this on the train', page: 14, source: 'readwise' });
  expect(stored.every((h) => typeof h.resurface7At === 'number')).toBe(true); // imported highlights get a review schedule

  await page.locator('[data-imp-close]').first().click();
  await chooseFile(page, 'readwise-export.csv', fixture('readwise.csv'));
  await expect(page.locator('[data-imp-confirm]')).toBeDisabled();
  expect((await highlights(uid)).length).toBe(4);
  expect(await books(uid)).toHaveLength(2);
});

test('WeChat Read: chapters and thoughts land on the right highlights; Kindle clippings join an existing book', async ({ page }) => {
  const { uid } = await setup(page, 'weread');
  await page.locator('#searchImportBtn').click();
  await page.locator('[data-imp-source]').selectOption('weread');
  await page.locator('[data-imp-paste]').fill(fixture('weread.txt').toString('utf8'));
  await page.locator('[data-imp-preview]').click();
  await expect(page.locator('[data-imp-summary]')).toContainText('WeChat Read: 2 books. 2 new');
  await page.locator('[data-imp-confirm]').click();
  await expect(page.locator('[data-imp-done]')).toBeVisible({ timeout: 20_000 });

  await expect.poll(async () => (await highlights(uid)).length).toBe(4);
  const hl = await highlights(uid);
  const first = hl.find((h) => String(h.quote).startsWith('农业革命是史上最大的骗局'))!;
  expect(first).toMatchObject({ chapter: '第一部分 认知革命', annotation: '我觉得他说得太绝对，但很有启发。', source: 'weread' });
  expect(hl.find((h) => String(h.quote).startsWith('这一章让我想起'))).toMatchObject({ chapter: '第二部分 农业革命' });
  expect(hl.find((h) => String(h.quote).startsWith('人是为了活着本身而活着的'))).toMatchObject({ chapter: '第一章' });

  // Kindle clippings for 人类简史 (already imported above) merge into that book instead of creating another.
  await page.locator('[data-imp-close]').first().click();
  await chooseFile(page, 'My Clippings.txt', fixture('kindle-clippings.txt'));
  await expect(page.locator('[data-imp-summary]')).toContainText('Kindle: 2 books. 1 new, 0 get more highlights, 1 already in your library');
  await page.locator('[data-imp-confirm]').click();
  await expect(page.locator('[data-imp-done]')).toBeVisible({ timeout: 20_000 });
  expect((await books(uid)).filter((b) => b.title === '人类简史')).toHaveLength(1);
});

test('StoryGraph: statuses, ratings and tags are brought over', async ({ page }) => {
  const { uid } = await setup(page, 'sg');
  await chooseFile(page, 'storygraph-export.csv', fixture('storygraph.csv'));
  await expect(page.locator('[data-imp-summary]')).toContainText('StoryGraph: 4 books. 4 new');
  await page.locator('[data-imp-confirm]').click();
  await expect(page.locator('[data-imp-done]')).toBeVisible({ timeout: 20_000 });
  const stored = await books(uid);
  expect(stored.find((b) => b.title === 'Piranesi')).toMatchObject({ status: 'finished', rating: 5 });
  expect(stored.find((b) => b.title === 'Gone Girl')).toMatchObject({ status: 'confirmed-later' });
});
