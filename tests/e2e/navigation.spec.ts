import { test, expect, type Page } from '@playwright/test';

// Plan 2.8, option B: the top nav is Library · Map · Graph · Profile; Library has two modes (Browse, Arrange) backed by the old
// Search and Library pages, and the old hashes keep working. Phones are not a target (Q2.8-a): the sizes are two iPad landscapes, a
// desktop, and the near-square inner screen of a foldable.
const SIZES = [
  { w: 1024, h: 768, name: 'ipad-1024' },
  { w: 1180, h: 820, name: 'ipad-1180' },
  { w: 1440, h: 900, name: 'desktop-1440' },
  { w: 880, h: 1100, name: 'fold-880' },
] as const;
const TABS = ['Library', 'Map', 'Graph', 'Profile'];
const SHOTS = 'tests/screenshots/phase-2';

type Box = { x: number; y: number; width: number; height: number };

async function boxes(page: Page, selector: string): Promise<Array<{ text: string; box: Box }>> {
  return page.evaluate((sel) => Array.from(document.querySelectorAll<HTMLElement>(sel))
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0)
    .map(({ el, r }) => ({ text: (el.textContent || '').trim(), box: { x: r.x, y: r.y, width: r.width, height: r.height } })), selector);
}

const intersects = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The four tabs are on screen, in order, inside the viewport and not touching each other or anything else in the header row. */
async function expectNavClean(page: Page, size: { w: number; h: number }, scope: string) {
  const tabs = await boxes(page, `${scope} .room-top-tabs .room-nav-item`);
  expect(tabs.map((t) => t.text)).toEqual(TABS);
  for (const t of tabs) {
    expect(t.box.x).toBeGreaterThanOrEqual(0);
    expect(t.box.x + t.box.width).toBeLessThanOrEqual(size.w);
    expect(t.box.y).toBeGreaterThanOrEqual(0);
    expect(t.box.y + t.box.height).toBeLessThanOrEqual(size.h);
    expect(t.box.height).toBeGreaterThanOrEqual(44); // touch target
  }
  for (let i = 0; i < tabs.length; i++) for (let j = i + 1; j < tabs.length; j++) expect(intersects(tabs[i]!.box, tabs[j]!.box), `${tabs[i]!.text} / ${tabs[j]!.text}`).toBe(false);
  return tabs;
}

async function expectHeaderRowClean(page: Page, scope: string, tabs: Array<{ box: Box }>) {
  const left = await boxes(page, `${scope} .panel-header-left`);
  const right = await boxes(page, `${scope} .panel-header-right > *`);
  const first = tabs[0]!.box;
  const last = tabs[tabs.length - 1]!.box;
  const nav: Box = { x: first.x, y: first.y, width: last.x + last.width - first.x, height: first.height };
  for (const item of [...left, ...right]) expect(intersects(nav, item.box), `header item "${item.text.slice(0, 20)}" overlaps the nav`).toBe(false);
}

async function enterRoom(page: Page) {
  await page.goto('/');
  const decline = page.locator('[data-consent="denied"]');
  if (await decline.isVisible().catch(() => false)) await decline.click();
  await page.click('#skipBtn');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'room', { timeout: 15_000 });
}

test('the room nav is Library · Map · Graph · Profile at iPad, desktop and foldable sizes; the camera bar is on the room', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.setViewportSize({ width: SIZES[1].w, height: SIZES[1].h });
  await enterRoom(page);

  for (const size of SIZES) {
    await page.setViewportSize({ width: size.w, height: size.h });
    await page.waitForTimeout(600);
    await expectNavClean(page, size, '#view-room');
    expect(await page.locator('#view-room .room-top-tabs .room-nav-item', { hasText: 'Search' }).count()).toBe(0);
    await page.screenshot({ path: `${SHOTS}/2.8-nav-room-${size.name}.png` });
  }

  // Camera: a bar on the room itself (not in Settings); picking an angle moves the camera.
  await page.setViewportSize({ width: SIZES[1].w, height: SIZES[1].h });
  expect(await page.locator('#roomCameraToolbar').count()).toBe(0);
  const camera = page.locator('#roomCameraControls');
  await expect(camera).toBeVisible();
  await expect(camera.locator('button')).toHaveText(['Front', 'Desk', 'Shelf wall', 'Notes wall', 'Free look']);
  await page.screenshot({ path: `${SHOTS}/2.8-camera-bar-ipad-1180.png` });
  await camera.locator('[data-room-pose="notes"]').click();
  await expect(camera.locator('[data-room-pose="notes"]')).toHaveClass(/active/);
  await page.locator('#roomSettingsTrigger').click();
  await expect(page.locator('#roomSettingsPanel #roomCameraControls')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Library has Browse and Arrange modes, both highlight the Library tab, and #search / #library / #shelf / #studio still arrive', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.setViewportSize({ width: SIZES[1].w, height: SIZES[1].h });
  await enterRoom(page);

  const go = async (hash: string, view: string) => {
    await page.evaluate((h) => { window.location.hash = h; }, hash);
    await expect(page.locator('body')).toHaveAttribute('data-view', view, { timeout: 15_000 });
    await page.waitForTimeout(800);
  };
  const activeMode = () => page.locator('.lib-mode:visible .lib-mode__btn.is-active').innerText();
  const activeTab = async () => (await page.locator('.room-top-tabs--panel:visible .room-nav-item.is-active').innerText()).trim();

  // Old hashes land on the same pages as before, and each shows the matching mode.
  await go('#search', 'search');
  expect(await activeMode()).toBe('Browse');
  expect(await activeTab()).toBe('Library');
  await go('#room', 'room');
  await go('#library', 'library-2d');
  expect(await activeMode()).toBe('Arrange');
  expect(await activeTab()).toBe('Library');
  await go('#room', 'room');
  await go('#shelf', 'search'); // alias
  await go('#room', 'room');
  await go('#studio', 'library-2d'); // alias
  await go('#room', 'room');

  // The switch moves between the two modes; the Library tab opens Browse.
  await go('#search', 'search');
  await page.locator('.lib-mode:visible .lib-mode__btn', { hasText: 'Arrange' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'library-2d', { timeout: 15_000 });
  await page.waitForTimeout(800);
  await page.locator('.lib-mode:visible .lib-mode__btn', { hasText: 'Browse' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'search', { timeout: 15_000 });
  await page.waitForTimeout(800);
  await go('#library', 'library-2d');
  await page.locator('#panel-library .room-top-tabs .room-nav-item', { hasText: 'Library' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'search', { timeout: 15_000 });
  await page.locator('#view-search .room-top-tabs .room-nav-item', { hasText: 'Map' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'map', { timeout: 15_000 });
  await go('#graph', 'web');
  await go('#profile', 'profile');
  expect(errors).toEqual([]);
});

test('on the Library pages the nav and the mode switch are visible and do not overlap anything at every size', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.setViewportSize({ width: SIZES[1].w, height: SIZES[1].h });
  await enterRoom(page);

  for (const size of SIZES) {
    await page.setViewportSize({ width: size.w, height: size.h });
    for (const [hash, view, scope, mode] of [
      ['#search', 'search', '#view-search', 'browse'],
      ['#library', 'library-2d', '#panel-library', 'arrange'],
    ] as const) {
      await page.evaluate((h) => { window.location.hash = h; }, hash);
      await expect(page.locator('body')).toHaveAttribute('data-view', view, { timeout: 15_000 });
      await page.waitForTimeout(1500);
      const tabs = await expectNavClean(page, size, scope);
      await expectHeaderRowClean(page, scope, tabs);
      const sw = await boxes(page, `${scope} .lib-mode`);
      expect(sw).toHaveLength(1);
      expect(sw[0]!.box.x).toBeGreaterThanOrEqual(0);
      expect(sw[0]!.box.x + sw[0]!.box.width).toBeLessThanOrEqual(size.w);
      const nav = tabs.map((t) => t.box);
      for (const b of nav) expect(intersects(b, sw[0]!.box), 'mode switch overlaps a tab').toBe(false);
      await page.screenshot({ path: `${SHOTS}/2.8-nav-${mode}-${size.name}.png` });
    }
    await page.evaluate(() => { window.location.hash = '#room'; });
    await expect(page.locator('body')).toHaveAttribute('data-view', 'room', { timeout: 15_000 });
  }
  expect(errors).toEqual([]);
});
