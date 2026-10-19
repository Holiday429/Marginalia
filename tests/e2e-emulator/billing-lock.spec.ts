import { test, expect } from '@playwright/test';
import { WS, createUser, openProfileSettings, openView, signIn, skipPreloader } from './helpers';

// Plan 1.1: a signed-in client cannot write plan/entitlements/billing, and an anonymous visitor can
// open a public profile without ever being able to read users/{uid} (email, plan).
const FS = 'http://127.0.0.1:8080/v1/projects/demo-marginalia/databases/(default)/documents';

async function idToken(email: string, password: string): Promise<string> {
  const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  return ((await res.json()) as { idToken: string }).idToken;
}

async function patch(path: string, fields: Record<string, unknown>, token?: string) {
  const mask = Object.keys(fields).map((f) => `updateMask.fieldPaths=${f}`).join('&');
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { stringValue: String(v) }])) };
  return fetch(`${FS}/${path}?${mask}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

test('plan cannot be forged from the client; a public profile exposes no email or plan', async ({ page, browser }) => {
  const stamp = Date.now();
  const email = `public-${stamp}@example.com`;
  const slug = `reader-${stamp}`;
  const uid = await createUser(email, 'correct-horse-1');

  await skipPreloader(page);
  await signIn(page, email, 'correct-horse-1');
  await page.waitForTimeout(1500);

  // Publish a profile through the real settings UI.
  await openView(page, 'Profile');
  await openProfileSettings(page);
  await page.locator('#profSlugInput').fill(slug);
  await page.locator('#profSlugSave').click();
  await expect(page.locator('#profSlugStatus')).toHaveClass(/prof-slug-status--ok/, { timeout: 20_000 });
  await page.locator('#profPublicToggle').evaluate((el: HTMLInputElement) => el.click());
  await expect.poll(async () => (await fetch(`${FS}/publicProfiles/${slug}`)).status, { timeout: 20_000 }).toBe(200);

  // 1. The signed-in owner cannot write billing fields — the same request the browser console would send.
  const token = await idToken(email, 'correct-horse-1');
  expect((await patch(`users/${uid}`, { plan: 'lifetime' }, token)).status).toBe(403);
  expect((await patch(`users/${uid}`, { entitlements: 'ai.unlimited' }, token)).status).toBe(403);
  expect((await patch(`billing/${uid}`, { plan: 'lifetime' }, token)).status).toBe(403);
  expect((await patch(`usage/${uid}/months/2026-10`, { aiCalls: '0' }, token)).status).toBe(403);
  expect((await patch(`users/${uid}`, { 'settings.language': 'en' }, token)).status).toBe(200); // ordinary settings still work

  // 2. An anonymous visitor reads the card, never the user doc.
  const card = await (await fetch(`${FS}/publicProfiles/${slug}`)).json() as { fields: Record<string, unknown> };
  expect(Object.keys(card.fields).sort()).not.toEqual(expect.arrayContaining(['email']));
  expect(JSON.stringify(card)).not.toMatch(/email|plan|entitlements|@example\.com/);
  expect((await fetch(`${FS}/users/${uid}`)).status).toBe(403);
  expect((await fetch(`${FS}/billing/${uid}`)).status).toBe(403);

  // 3. A real anonymous browser can open the public page.
  const visitor = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  visitor.on('pageerror', (e) => errors.push(String(e)));
  await visitor.goto(`/#/p/${slug}`);
  const decline = visitor.locator('[data-consent="denied"]');
  if (await decline.isVisible().catch(() => false)) await decline.click();
  // A shared profile link currently lands on the landing page first (task 4.4 gives public pages their own route).
  await visitor.click('#skipBtn');
  await expect.poll(async () => visitor.evaluate(() => document.body.innerText.toLowerCase()), { timeout: 25_000 }).toContain('public-');
  const text = await visitor.evaluate(() => document.body.innerText);
  expect(text).not.toContain('Profile not found');
  expect(text).not.toContain('@example.com');
  expect(errors).toEqual([]);
  void WS;
});
