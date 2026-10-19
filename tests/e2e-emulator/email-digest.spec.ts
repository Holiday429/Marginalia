import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { WS, addBookViaUi, createUser, listDocs, openProfileSettings, openView, plain, seedDueHighlight, signIn, skipPreloader, writeDoc } from './helpers';
import { runWeeklyDigest } from '../../functions/src/digest/run';
import { MockEmailSender } from '../../functions/src/digest/senders';
import { signLink } from '../../functions/src/digest/tokens';

// Plan 2.4 end to end: Settings switches the weekly email on, the digest runs (mock sender, real
// emulators), and the links in the email are opened in a browser against the real emailAction function.

const SECRET = 'emulator-link-secret'; // same value as scripts/write-emulator-secrets.mjs
const ACTION_URL = 'http://127.0.0.1:5001/demo-marginalia/us-central1/emailAction';
const DAY = 86_400_000;

const adminFromFunctions = createRequire(new URL('../../functions/package.json', import.meta.url))('firebase-admin');
function adminDb() {
  if (!adminFromFunctions.apps.length) adminFromFunctions.initializeApp({ projectId: 'demo-marginalia' });
  return adminFromFunctions.firestore();
}

/** Next date (UTC) on the given weekday, at 07:00. */
function nextWeekday(day: number): number {
  const d = new Date();
  d.setUTCHours(7, 0, 0, 0);
  while (d.getUTCDay() !== day) d.setUTCDate(d.getUTCDate() + 1);
  return d.getTime();
}

async function runDigestAt(now: number) {
  const db = adminDb();
  const sender = new MockEmailSender(db);
  const summary = await runWeeklyDigest({
    db, workspaceId: WS, sender, linkSecret: SECRET, actionBaseUrl: ACTION_URL, appBaseUrl: 'http://localhost:5174/', postalAddress: '1 Test Street',
    getEmail: async (uid) => (await adminFromFunctions.auth().getUser(uid).catch(() => null))?.email ?? null,
  }, now);
  return { summary, sender };
}

const mailbox = async () => (await listDocs('mail_outbox')).map((d) => ({ id: d.id, ...plain(d.fields) } as Record<string, any>));

function linkOf(html: string, kind: string, answer: string, itemId?: string): string {
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const href = m[1].replace(/&amp;/g, '&');
    const token = new URL(href).searchParams.get('t');
    if (!token) continue;
    const p = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
    if (p.k === kind && (p.r ?? '') === answer && (itemId === undefined || p.i === itemId)) return href;
  }
  throw new Error(`no ${kind}:${answer} link in the email`);
}

async function setup(page: Page, label: string) {
  const email = `${label}-${Date.now()}@example.com`;
  const uid = await createUser(email, 'correct-horse-1');
  await skipPreloader(page);
  await signIn(page, email, 'correct-horse-1');
  await page.waitForTimeout(1500);
  return { uid, email };
}

test('Settings turns the weekly email on and off and picks the day', async ({ page }) => {
  const { uid } = await setup(page, 'prefs');
  await openView(page, 'Profile');
  await openProfileSettings(page);
  const toggle = page.locator('#profDigestToggle');
  await expect(toggle).toBeAttached({ timeout: 15_000 });
  await toggle.evaluate((el) => (el as HTMLElement).scrollIntoView({ block: 'center' }));
  await page.locator('label:has(#profDigestToggle)').click();
  await expect.poll(async () => plain((await listDocs('users')).find((d) => d.id === uid)?.fields?.settings?.mapValue?.fields?.digest?.mapValue?.fields).enabled).toBe(true);
  await page.locator('#profDigestDay').selectOption('3');
  await expect.poll(async () => plain((await listDocs('users')).find((d) => d.id === uid)?.fields?.settings?.mapValue?.fields?.digest?.mapValue?.fields).day).toBe(3);
  await expect(page.locator('#profDigestStatus')).toContainText('Wednesday');
  await page.locator('#profDigestSection').screenshot({ path: 'tests/screenshots/phase-2/2.4-settings-weekly-email.png' });
  await page.locator('label:has(#profDigestToggle)').click();
  await expect.poll(async () => plain((await listDocs('users')).find((d) => d.id === uid)?.fields?.settings?.mapValue?.fields?.digest?.mapValue?.fields).enabled).toBe(false);
});

test('the digest email arrives with the right content and its links work once, without a login', async ({ page, browser }) => {
  const { uid } = await setup(page, 'digest');
  const bookId = await addBookViaUi(page, uid, 'Deep Work', 'Cal Newport');
  await writeDoc(`users/${uid}`, {}); // make sure the user doc exists
  await adminDb().doc(`users/${uid}`).set({ settings: { digest: { enabled: true, day: 1 } } }, { merge: true });
  for (let i = 0; i < 4; i += 1) await seedDueHighlight(uid, `h${i}`, bookId, `A sentence worth another look number ${i}`);
  await adminDb().doc(`workspaces/${WS}/users/${uid}/actions/a1`).set({
    bookId, text: 'Block two hours a day for deep work', status: 'open', createdAt: Date.now() - 9 * DAY,
    remind7At: Date.now() - 2 * DAY, remind30At: Date.now() + 21 * DAY, remind90At: Date.now() + 81 * DAY, reminded7: false, reminded30: false, reminded90: false,
  });

  const monday = nextWeekday(1);
  const { summary } = await runDigestAt(monday);
  expect(summary.recipients).toContain(uid);
  const address = (await adminFromFunctions.auth().getUser(uid)).email;
  const mails = (await mailbox()).filter((m) => m.to === address);
  expect(mails).toHaveLength(1);
  const mail = mails[0]!;
  expect(mail.subject).toBe('Marginalia: 3 highlights and an action for this week');
  expect((String(mail.html).match(/A sentence worth another look/g) ?? []).length).toBe(3);
  expect(String(mail.html)).toContain('Block two hours a day for deep work');
  expect(String(mail.html)).toContain('Deep Work');

  // Screenshots of the email itself at the three sizes.
  const shotPage = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]] as const) {
    await shotPage.setViewportSize({ width: w, height: h });
    await shotPage.setContent(String(mail.html));
    await shotPage.screenshot({ path: `tests/screenshots/phase-2/2.4-digest-email-${w}.png`, fullPage: true });
  }

  const html = String(mail.html);
  const highlightIds = [...html.matchAll(/number (\d)/g)].map((m) => `h${m[1]}`);
  const first = highlightIds[0]!;

  // "Still holds": the field changes; the same link again says it was handled; a damaged one is refused.
  const link = linkOf(html, 'hl', 'resonates', first);
  await page.goto(link);
  await expect(page.locator('h1')).toHaveText('Done');
  await expect(page.locator('main')).toContainText('still holding');
  const stored = async (id: string) => plain((await listDocs(`workspaces/${WS}/users/${uid}/highlights`)).find((d) => d.id === id)?.fields);
  expect(await stored(first)).toMatchObject({ resurfaced7: true, resurfaceRating: 'resonates' });
  await page.goto(link);
  await expect(page.locator('h1')).toHaveText('Already handled');
  await page.goto(`${link.slice(0, -3)}AAA`);
  await expect(page.locator('h1')).toHaveText('This link is not valid');

  // An expired link is refused.
  const expired = `${ACTION_URL}?t=${encodeURIComponent(signLink({ v: 1, k: 'hl', u: uid, w: WS, i: highlightIds[1]!, t: '7d', r: 'dismiss', e: Date.now() - 1000, j: 'old-one' }, SECRET))}`;
  await page.goto(expired);
  await expect(page.locator('h1')).toHaveText('This link has expired');
  expect((await stored(highlightIds[1]!)).resurfaced7).toBe(false);

  // "Add a thought" opens a form first, then records it.
  await page.goto(linkOf(html, 'hl', 'thought', highlightIds[1]));
  await expect(page.locator('h1')).toHaveText('Add a thought');
  await page.locator('textarea[name=text]').fill('Still true, but I would phrase it differently');
  await page.locator('button[type=submit]').click();
  await expect(page.locator('h1')).toHaveText('Done');
  expect(await stored(highlightIds[1]!)).toMatchObject({ annotation: 'Still true, but I would phrase it differently', resurfaced7: true });

  // "Turn into action" and the action's own buttons.
  await page.goto(linkOf(html, 'hl', 'action', highlightIds[2]));
  await expect(page.locator('main')).toContainText('Turned into an action');
  expect((await listDocs(`workspaces/${WS}/users/${uid}/actions`)).length).toBe(2);
  await page.goto(linkOf(html, 'act', 'done'));
  await expect(page.locator('h1')).toHaveText('Done');
  expect(plain((await listDocs(`workspaces/${WS}/users/${uid}/actions`)).find((d) => d.id === 'a1')?.fields).status).toBe('done');

  // Unsubscribe, then the next Monday sends nothing to this reader.
  const mailsBefore = (await mailbox()).length;
  await page.goto(linkOf(html, 'unsub', ''));
  await expect(page.locator('h1')).toHaveText('You are unsubscribed');
  await page.screenshot({ path: 'tests/screenshots/phase-2/2.4-email-link-page-390.png' });
  const again = await runDigestAt(monday + 7 * DAY);
  expect(again.summary.recipients).not.toContain(uid);
  expect((await mailbox()).length).toBe(mailsBefore);
});

test('a reader with nothing due gets no email at all', async ({ page }) => {
  const { uid } = await setup(page, 'quiet');
  await adminDb().doc(`users/${uid}`).set({ settings: { digest: { enabled: true, day: 1 } } }, { merge: true });
  await seedDueHighlight(uid, 'later', 'b1', 'Not due for a while', { resurface7At: Date.now() + 20 * DAY });
  const before = (await mailbox()).length;
  const { summary } = await runDigestAt(nextWeekday(1));
  expect(summary.recipients).not.toContain(uid);
  expect((await mailbox()).length).toBe(before);
});
