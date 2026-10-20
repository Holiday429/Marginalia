import { test, expect } from '@playwright/test';

// Plan 2.9: the way into the library is a real button under the hero book, reachable with the keyboard, and the spine labels on the landing shelf do not run into each other.

test('Enter Library appears once, under the hero book, as a focusable button that is clear of the legal links', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); // landscape is the target; phones are not
  await page.goto('/', { waitUntil: 'load' });
  const enter = page.locator('#enterBtn');
  await expect(enter).toBeVisible({ timeout: 15_000 });
  expect(await enter.evaluate((el) => el.tagName)).toBe('BUTTON');
  await expect(enter).toHaveText('Enter Library');
  // The only "Enter Library" on the page: nothing above the shelf.
  await expect(page.getByRole('button', { name: 'Enter Library' })).toHaveCount(1);

  // It rides on a bobbing book but stays put, clear of the legal links and of the first-visit consent banner.
  const legal = page.locator('.legal-links--landing');
  for (let i = 0; i < 6; i++) {
    const e = (await enter.boundingBox())!;
    const l = (await legal.boundingBox())!;
    const banner = await page.locator('.consent-banner').boundingBox();
    expect(e.y + e.height, `sample ${i}`).toBeLessThanOrEqual(l.y);
    if (banner) expect(e.y + e.height, `banner ${i}`).toBeLessThanOrEqual(banner.y);
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: 'tests/screenshots/phase-2/2.9-landing-1440.png' });

  await enter.focus();
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
