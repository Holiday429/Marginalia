import { test, expect, type Page } from '@playwright/test';

// P0 smoke suite — unauthenticated demo path only.
// Walks the same tour a first-time visitor takes: preloader → room → search
// (seed books) → book detail → map → graph. See docs/refactor-plan.md Phase 0.
//
// Phase 1.6 removed the two known boot errors (the broken .exr texture and the duplicate
// book.glb request), so the gate is now strict: any uncaught page error fails the suite.
const KNOWN_ERROR_SUBSTRINGS: string[] = [];

function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

function unexpectedErrors(errors: string[]): string[] {
  return errors.filter((e) => !KNOWN_ERROR_SUBSTRINGS.some((known) => e.includes(known)));
}

async function skipPreloader(page: Page) {
  await page.goto('/');
  const decline = page.locator('[data-consent="denied"]'); // analytics consent banner (first visit)
  if (await decline.isVisible().catch(() => false)) await decline.click();
  await page.click('#skipBtn');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'room', { timeout: 10_000 });
}

test('preloader boots and Skip enters the room', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto('/');
  await expect(page.locator('#skipBtn')).toBeVisible();
  await skipPreloader(page);
  expect(unexpectedErrors(errors)).toEqual([]);
});

test('search view shows seed books', async ({ page }) => {
  const errors = trackPageErrors(page);
  await skipPreloader(page);

  await page.evaluate(() => { window.location.hash = '#search'; });
  await expect(page.locator('body')).toHaveAttribute('data-view', 'search', { timeout: 10_000 });

  await expect(page.locator('#view-search')).toBeVisible();
  await expect(page.locator('.shelf-quick-card').first()).toBeVisible();
  expect(unexpectedErrors(errors)).toEqual([]);
});

test('opening a book from search shows the book detail panel', async ({ page }) => {
  const errors = trackPageErrors(page);
  await skipPreloader(page);
  await page.evaluate(() => { window.location.hash = '#search'; });
  await expect(page.locator('body')).toHaveAttribute('data-view', 'search', { timeout: 10_000 });

  await page.locator('.shelf-quick-card').first().click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'book', { timeout: 10_000 });
  await expect(page.locator('#panel-book')).toBeVisible();
  expect(unexpectedErrors(errors)).toEqual([]);
});

test('map view loads', async ({ page }) => {
  const errors = trackPageErrors(page);
  await skipPreloader(page);

  await page.evaluate(() => { window.location.hash = '#map'; });
  await expect(page.locator('body')).toHaveAttribute('data-view', 'map', { timeout: 10_000 });
  expect(unexpectedErrors(errors)).toEqual([]);
});

test('graph view loads', async ({ page }) => {
  const errors = trackPageErrors(page);
  await skipPreloader(page);

  await page.evaluate(() => { window.location.hash = '#graph'; });
  await expect(page.locator('body')).toHaveAttribute('data-view', 'web', { timeout: 10_000 });
  expect(unexpectedErrors(errors)).toEqual([]);
});

// Phase 1 gate (docs/optimization-plan.md): one visit through every main view, in order, with zero page errors.
test('phase 1 gate: landing, room, Search, Library, Map, Graph, Profile, Book — zero page errors', async ({ page }) => {
  const errors = trackPageErrors(page);

  await page.goto('/');
  await expect(page.locator('#skipBtn')).toBeVisible(); // landing

  await skipPreloader(page); // room

  const visit = async (hash: string, view: string) => {
    await page.evaluate((h) => { window.location.hash = h; }, hash);
    await expect(page.locator('body')).toHaveAttribute('data-view', view, { timeout: 15_000 });
    await page.waitForTimeout(1200); // let the view's own async work run (and fail, if it is going to)
  };
  await visit('#search', 'search');
  await visit('#library', 'library-2d');
  await visit('#map', 'map');
  await visit('#graph', 'web');
  await visit('#profile', 'profile');

  await visit('#search', 'search');
  await page.locator('.shelf-quick-card').first().click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'book', { timeout: 15_000 });
  await page.waitForTimeout(1200);

  expect(unexpectedErrors(errors)).toEqual([]);
});
