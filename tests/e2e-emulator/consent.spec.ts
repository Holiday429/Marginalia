import { test, expect } from '@playwright/test';

// Plan 1.8: PostHog and Sentry start only after the visitor accepts. This spec runs against a
// production build (port 5175) configured with fake analytics keys; every request to those hosts
// is recorded and aborted, so no real traffic is ever produced.
test.use({ baseURL: 'http://localhost:5175' });

const ANALYTICS_HOSTS = /posthog\.com|ingest\.sentry\.io|sentry\.io/;

test('no analytics request before consent; requests only after Accept; stops after Decline', async ({ page }) => {
  const seen: string[] = [];
  await page.route(ANALYTICS_HOSTS, (route) => { seen.push(route.request().url()); return route.abort(); });
  page.on('request', (req) => { if (ANALYTICS_HOSTS.test(req.url()) && !seen.includes(req.url())) seen.push(req.url()); });

  // 1. First visit: the banner asks, nothing is sent.
  await page.goto('/');
  await expect(page.locator('#consentBanner')).toBeVisible();
  await page.evaluate(() => setTimeout(() => { throw new Error('consent-test-before'); }, 0));
  await page.waitForTimeout(3000);
  expect(seen, 'requests before any choice').toEqual([]);

  // 2. Decline: still nothing, and the choice is remembered across a reload.
  await page.locator('[data-consent="denied"]').click();
  await expect(page.locator('#consentBanner')).toHaveCount(0);
  await page.reload();
  await page.waitForTimeout(2500);
  await expect(page.locator('#consentBanner')).toHaveCount(0);
  expect(seen, 'requests after declining').toEqual([]);

  // 3. Change of mind via the footer link: Accept starts both SDKs.
  await page.locator('[data-consent-open]').first().click();
  await page.locator('[data-consent="granted"]').click();
  await page.evaluate(() => setTimeout(() => { throw new Error('consent-test-after'); }, 0));
  await expect.poll(() => seen.some((u) => /posthog\.com/.test(u)), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => seen.some((u) => /sentry\.io/.test(u)), { timeout: 15_000 }).toBe(true);

  // 4. Withdraw: no further requests.
  await page.waitForTimeout(1500);
  await page.locator('[data-consent-open]').first().click();
  await page.locator('[data-consent="denied"]').click();
  const before = seen.length;
  await page.evaluate(() => setTimeout(() => { throw new Error('consent-test-withdrawn'); }, 0));
  await page.waitForTimeout(3000);
  expect(seen.slice(before), 'requests after withdrawing').toEqual([]);
});
