import { test, expect } from '@playwright/test';

// Plan 2.9: the way into the library is a real button, visible at once, inside the first screen on a phone,
// reachable with the keyboard, and the spine labels on the landing shelf do not run into each other.

test('Enter Library is a button that is visible within a second of load, in the first screen at 390px, and first in tab order', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'load' });
  const enter = page.locator('#enterBtn');
  await expect(enter).toBeVisible({ timeout: 1000 });
  expect(await enter.evaluate((el) => el.tagName)).toBe('BUTTON');
  await expect(enter).toHaveText('Enter Library');

  // Inside the first screen, and not covered by the consent banner that a first visit shows.
  const box = (await enter.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  const covered = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id !== 'enterBtn', { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  expect(covered).toBe(false);
  await page.screenshot({ path: 'tests/screenshots/phase-2/2.9-landing-390.png' });

  // Tab reaches it first; Enter goes into the room.
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('enterBtn');
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'room', { timeout: 15_000 });
});

test('the landing shelf at three sizes: no spine title runs into its author', async ({ page }) => {
  for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.book .spine-text');
    // Titles and authors are laid out one above the other: their boxes must not intersect.
    const overlaps = await page.evaluate(() => {
      const bad: string[] = [];
      document.querySelectorAll('.book').forEach((book) => {
        const t = book.querySelector('.spine-text')?.getBoundingClientRect();
        const a = book.querySelector('.spine-author')?.getBoundingClientRect();
        if (!t || !a || !t.width || !a.width) return;
        const overlap = Math.min(t.bottom, a.bottom) - Math.max(t.top, a.top);
        if (overlap > 1) bad.push(`${book.querySelector('.spine-text')?.textContent}: ${overlap.toFixed(1)}px`);
      });
      return bad;
    });
    expect(overlaps, `${w}px`).toEqual([]);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `tests/screenshots/phase-2/2.9-landing-shelf-${w}.png` });
  }
});
