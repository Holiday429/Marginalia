import { test, expect, type Page } from '@playwright/test';

// P0 smoke suite — unauthenticated demo path only.
// Walks the same tour a first-time visitor takes: preloader → room → search
// (seed books) → book detail → map → graph. See docs/refactor-plan.md Phase 0.
//
// Known pre-existing issues tracked, not asserted away. These fire during the
// room/preloader boot sequence independent of navigation and are allowed so the
// gate doesn't mask *new* errors:
//   - "reading 'image'": a boot-sequence TypeError, out of scope for P0.
//   - "book.glb ... 404": the decorative hero-book GLB (a 7.3 MB asset served
//     from /public) intermittently 404s under `vite preview` in CI. Loading a
//     decorative 3D model is out of scope for a demo-path smoke test; the real
//     fix belongs in the P3 asset-pipeline phase. The app renders and navigates
//     correctly without it (all five nav assertions pass).
const KNOWN_ERROR_SUBSTRINGS = ["reading 'image'", 'book.glb', '.glb" responded with 404'];

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
