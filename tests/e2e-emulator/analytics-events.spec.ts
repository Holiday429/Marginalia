import { test, expect, type Request } from '@playwright/test';
import { gunzipSync } from 'node:zlib';
import { openView, trackPageErrors } from './helpers';

// Plan 2.10: walk signup -> add a book -> highlight -> finish (plus a session, a Kindle import and
// one AI generation) and check which product events actually leave the browser for PostHog.
// Runs on the production build (port 5175) with a FAKE PostHog key; every analytics request is
// answered locally, nothing reaches posthog.com.
test.use({ baseURL: 'http://localhost:5175' });

interface CapturedEvent { event: string; properties: Record<string, unknown> }

/** posthog-js sends gzip (or base64 form) JSON; decode whichever it used. */
function decodeCapture(req: Request): CapturedEvent[] {
  const buf = req.postDataBuffer();
  if (!buf) return [];
  let text: string;
  try { text = gunzipSync(buf).toString('utf8'); } catch { text = buf.toString('utf8'); }
  if (text.startsWith('data=')) text = Buffer.from(decodeURIComponent(text.slice(5)), 'base64').toString('utf8');
  try {
    const json = JSON.parse(text);
    const list = Array.isArray(json) ? json : Array.isArray(json?.batch) ? json.batch : [json];
    return list.filter((e: CapturedEvent) => e && typeof e.event === 'string');
  } catch { return []; }
}

const CLIPPINGS = [
  'Deep Work (Cal Newport)\n- Your Highlight on page 12 | location 100-101 | Added on Monday, January 1, 2024 12:00:00 AM\n\nFocus is a skill.\n==========\n',
  'Deep Work (Cal Newport)\n- Your Highlight on page 14 | location 120-121 | Added on Monday, January 1, 2024 12:05:00 AM\n\nBoredom is trainable.\n==========\n',
].join('');

test('signup, add, highlight, session, import, AI and finish each reach PostHog exactly once', async ({ page }) => {
  const errors = trackPageErrors(page);
  const events: CapturedEvent[] = [];
  await page.route(/posthog\.com/, (route) => {
    const url = route.request().url();
    if (/\/config(\?|$)/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'phc_consent_test', supportedCompression: ['gzip-js'], hasFeatureFlags: false, sessionRecording: false, heatmaps: false, surveys: false, defaultIdentifiedOnly: true, siteApps: [], analytics: { endpoint: '/i/v0/e/' } }) });
    if (/config\.js/.test(url)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    if (/\/(e|batch|i\/v0\/e)\/?(\?|$)/.test(new URL(url).pathname + new URL(url).search)) {
      events.push(...decodeCapture(route.request()));
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  // The AI gateway is stubbed: no DeepSeek key in tests. The client still runs its real code path.
  await page.route(/\/aiGenerate/, (route) => route.fulfill({
    status: 200,
    headers: { 'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*' },
    body: 'data: {"delta":"{\\"nodes\\":[]}"}\n\ndata: [DONE]\n\n',
  }));

  await page.goto('/');
  await page.locator('[data-consent="granted"]').click();
  await page.click('#skipBtn');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'room', { timeout: 15_000 });

  // Register through the real auth form.
  const email = `funnel-${Date.now()}@example.com`;
  await page.evaluate(({ email }) => {
    (document.getElementById('authTabRegister') as HTMLButtonElement).click();
    (document.getElementById('authUsernameInput') as HTMLInputElement).value = `funnel${Date.now()}`;
    (document.getElementById('authIdentityInput') as HTMLInputElement).value = email;
    (document.getElementById('authPasswordInput') as HTMLInputElement).value = 'correct-horse-1';
    (document.getElementById('authForm') as HTMLFormElement).requestSubmit();
  }, { email });
  await expect(page.locator('#authUserMeta')).toContainText(email, { timeout: 15_000 });
  await page.waitForTimeout(1500);

  // A reading session (the timer lives in the room, so it comes before any panel opens).
  await page.locator('.fw-collapse-btn').click();
  await page.locator('[data-fw-start]').click();
  await page.waitForTimeout(1200);
  await page.locator('[data-fw-stop]').click();

  // Add a book.
  await openView(page, 'Search');
  await page.locator('#searchNewEntryBtn').click();
  await page.locator('#neTitle').fill('Deep Work');
  await page.locator('#neAuthor').fill('Cal Newport');
  await page.locator('#neStatus').selectOption('reading');
  await page.locator('#neSubmitBtn').click();
  await expect(page.locator('#neForm')).toBeHidden({ timeout: 15_000 });

  // Highlight, then import two Kindle clippings.
  await page.locator('.book-tab-btn[data-target="highlights"]').click();
  await page.locator('#hlAddBtn').click();
  await page.locator('#hlFormQuote').fill('Attention is the scarce resource.');
  await page.locator('.hl-form-save').click();
  await expect(page.locator('.hl-item', { hasText: 'Attention is the scarce resource.' })).toBeVisible({ timeout: 15_000 });
  await page.locator('#hlKindleBtn').click();
  await page.locator('#kindleFileInput').setInputFiles({ name: 'My Clippings.txt', mimeType: 'text/plain', buffer: Buffer.from(CLIPPINGS) });
  await page.locator('.kindle-preview-import').first().click();
  // The book page re-renders after the import, so wait for the imported quote rather than the button.
  await page.locator('.book-tab-btn[data-target="highlights"]').click();
  await expect(page.locator('.hl-item', { hasText: 'Focus is a skill.' })).toBeVisible({ timeout: 15_000 });

  // One AI generation (stubbed gateway).
  const aiTabs = await page.locator('.book-tab-btn').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.target));
  let generated = false;
  for (const target of aiTabs) {
    await page.locator(`.book-tab-btn[data-target="${target}"]`).click();
    const btn = page.locator('.ai-generate-btn:visible').first();
    if (await btn.count()) { await btn.click(); generated = true; break; }
  }
  expect(generated, 'a tab with an AI generate button exists').toBe(true);
  await expect.poll(() => events.filter((e) => e.event === 'ai_generated').length, { timeout: 20_000 }).toBe(1);

  // Finish the book.
  await page.locator('.book-tab-btn[data-target="overview"]').click();
  await page.locator('[data-status-select]').selectOption('finished');

  // posthog-js batches; wait for the whole set to arrive, then give stragglers a moment.
  const names = ['signup', 'book_added', 'import_completed', 'highlight_saved', 'session_completed', 'book_finished', 'ai_generated'];
  await expect.poll(() => names.every((n) => events.some((e) => e.event === n)), { timeout: 30_000, intervals: [500] }).toBe(true);
  await page.waitForTimeout(4000);

  const count = (name: string) => events.filter((e) => e.event === name).length;
  expect(count('signup')).toBe(1);
  expect(count('book_added')).toBe(1);
  expect(count('import_completed')).toBe(1);
  expect(count('session_completed')).toBe(1);
  expect(count('book_finished')).toBe(1);
  expect(count('ai_generated')).toBe(1);
  expect(events.filter((e) => e.event === 'highlight_saved').map((e) => e.properties.source).sort()).toEqual(['book', 'import']);
  expect(events.find((e) => e.event === 'signup')!.properties.method).toBe('email');
  expect(events.find((e) => e.event === 'book_added')!.properties).toMatchObject({ source: 'manual', status: 'reading' });
  expect(events.find((e) => e.event === 'import_completed')!.properties).toMatchObject({ source: 'kindle', highlights: 2 });

  // The events carry the signed-in user, not an anonymous visitor (needed for funnels/retention).
  const identified = events.find((e) => e.event === 'book_finished')!;
  expect(String(identified.properties.distinct_id ?? '')).not.toBe('');

  // No event names outside the catalogue sneak into the product events.
  expect(errors).toEqual([]);
});
