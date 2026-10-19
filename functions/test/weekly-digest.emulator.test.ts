/* Plan 2.4 against the Firestore + Auth emulators: build due data, run the weekly digest with the mock
   sender, check the email, click its links. Run with:
   firebase emulators:exec --only auth,firestore "npm run test:rules" */
import { createRequire } from 'node:module';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { handleEmailAction } from '../src/digest/actions';
import { makeLinks, runWeeklyDigest, type DigestRunDeps } from '../src/digest/run';
import { MockEmailSender } from '../src/digest/senders';
import { scheduleFrom } from '../src/_shared/resurface';
import { LINK_TTL_MS } from '../src/digest/tokens';

const requireFromFunctions = createRequire(new URL('../package.json', import.meta.url));
const emulators = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);

const WS = 'default';
const SECRET = 'digest-test-secret';
const DAY = 86_400_000;
const MONDAY = Date.UTC(2026, 9, 19, 7); // getUTCDay() === 1
const BASE = { actionBaseUrl: 'https://fn.example/emailAction', appBaseUrl: 'https://app.example/' };

describe.skipIf(!emulators)('weekly digest against the emulators', () => {
  let admin: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  let db: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  let mock: MockEmailSender;
  let n = 0;

  beforeAll(() => {
    admin = requireFromFunctions('firebase-admin');
    if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-marginalia' });
    db = admin.firestore();
  });
  beforeEach(() => { mock = new MockEmailSender(); });

  const deps = (): DigestRunDeps => ({
    db, workspaceId: WS, sender: mock, linkSecret: SECRET, ...BASE,
    postalAddress: '1 Test Street',
    getEmail: async (uid) => (await admin.auth().getUser(uid).catch(() => null))?.email ?? null,
  });

  async function seedReader(opts: { enabled?: boolean; day?: number; lastSentAt?: number; highlights?: number; dueAction?: boolean; email?: boolean } = {}) {
    n += 1;
    const uid = `digest-u${n}-${Date.now()}`;
    if (opts.email !== false) await admin.auth().createUser({ uid, email: `${uid}@example.com`, password: 'correct-horse-1' });
    await db.doc(`users/${uid}`).set({ settings: { digest: { enabled: opts.enabled ?? true, day: opts.day ?? 1, ...(opts.lastSentAt ? { lastSentAt: opts.lastSentAt } : {}) } } });
    await db.doc(`workspaces/${WS}/users/${uid}/books/b1`).set({ title: 'Deep Work', author: 'Cal Newport' });
    for (let i = 0; i < (opts.highlights ?? 0); i += 1) {
      await db.doc(`workspaces/${WS}/users/${uid}/highlights/h${i}`).set({ bookId: 'b1', quote: `Quote number ${i}`, source: 'manual', ...scheduleFrom(MONDAY - 8 * DAY) });
    }
    if (opts.dueAction) {
      await db.doc(`workspaces/${WS}/users/${uid}/actions/a1`).set({ bookId: 'b1', text: 'Block two hours a day', status: 'open', createdAt: MONDAY - 9 * DAY, remind7At: MONDAY - 2 * DAY, remind30At: MONDAY + 21 * DAY, remind90At: MONDAY + 81 * DAY, reminded7: false, reminded30: false, reminded90: false });
    }
    return uid;
  }

  const sentTo = (uid: string) => mock.sent.filter((m) => m.to === `${uid}@example.com`);
  const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  const link = (html: string, needle: string) => {
    // answer links are opaque tokens; find the one whose payload says what we want
    for (const href of hrefs(html)) {
      const token = new URL(href).searchParams.get('t');
      if (!token) continue;
      const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
      if (`${payload.k}:${payload.r ?? ''}` === needle) return { token, payload };
    }
    throw new Error(`no link for ${needle}`);
  };

  it('sends one email with three due highlights and one due action, to the right reader only', async () => {
    const uid = await seedReader({ highlights: 5, dueAction: true });
    const notToday = await seedReader({ highlights: 3, day: 3 });
    const disabled = await seedReader({ highlights: 3, enabled: false });
    const nothingDue = await seedReader({ highlights: 0 });
    const recently = await seedReader({ highlights: 3, lastSentAt: MONDAY - 2 * DAY });

    const summary = await runWeeklyDigest(deps(), MONDAY);
    expect(sentTo(uid)).toHaveLength(1);
    for (const other of [notToday, disabled, nothingDue, recently]) expect(sentTo(other)).toHaveLength(0);
    expect(summary.recipients).toContain(uid);
    expect(summary.skippedNotToday).toBeGreaterThanOrEqual(1);
    expect(summary.skippedRecently).toBeGreaterThanOrEqual(1);
    expect(summary.skippedNothingDue).toBeGreaterThanOrEqual(1);

    const email = sentTo(uid)[0]!;
    expect(email.subject).toBe('Marginalia: 3 highlights and an action for this week');
    expect((email.html.match(/Quote number/g) ?? []).length).toBe(3);
    expect(email.html).toContain('Block two hours a day');
    expect(email.html).toContain('Deep Work');
    expect(email.html).toContain('1 Test Street');
    expect(email.headers?.['List-Unsubscribe']).toMatch(/^<https:\/\/fn\.example\/emailAction\?t=/);
  });

  it('records what it sent: a second run the same day sends nothing, and shown highlights are marked', async () => {
    const uid = await seedReader({ highlights: 5 });
    await runWeeklyDigest(deps(), MONDAY);
    expect(sentTo(uid)).toHaveLength(1);
    expect((await db.doc(`users/${uid}`).get()).data().settings.digest.lastSentAt).toBe(MONDAY);
    const surfaced = (await db.collection(`workspaces/${WS}/users/${uid}/highlights`).get()).docs.filter((d: any) => d.data().lastSurfacedAt === MONDAY); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(surfaced).toHaveLength(3);

    await runWeeklyDigest(deps(), MONDAY);
    expect(sentTo(uid)).toHaveLength(1);

    // Two weeks later the picker moves on to the two highlights not shown yet, then fills with the others.
    await runWeeklyDigest(deps(), MONDAY + 14 * DAY);
    const second = sentTo(uid)[1]!;
    const fresh = surfaced.map((d: any) => d.id); // eslint-disable-line @typescript-eslint/no-explicit-any
    const unseen = ['h0', 'h1', 'h2', 'h3', 'h4'].filter((id) => !fresh.includes(id));
    for (const id of unseen) expect(second.html).toContain(`Quote number ${id.slice(1)}`);
  });

  it('a reader without an address gets nothing and the run still completes; a failing sender is not marked as sent', async () => {
    const noEmail = await seedReader({ highlights: 3, email: false });
    const s1 = await runWeeklyDigest(deps(), MONDAY);
    expect(s1.skippedNoEmail).toBeGreaterThanOrEqual(1);
    expect((await db.doc(`users/${noEmail}`).get()).data().settings.digest.lastSentAt).toBeUndefined();

    const uid = await seedReader({ highlights: 3 });
    const failing = { name: 'failing', send: async () => { throw new Error('provider down'); } };
    const s2 = await runWeeklyDigest({ ...deps(), sender: failing }, MONDAY);
    expect(s2.failed).toBeGreaterThanOrEqual(1);
    expect((await db.doc(`users/${uid}`).get()).data().settings.digest.lastSentAt).toBeUndefined(); // tries again next run
  });

  describe('the links in the email', () => {
    const act = (token: string, extra: Partial<Parameters<typeof handleEmailAction>[1]> = {}, now = MONDAY + DAY) =>
      handleEmailAction({ db, linkSecret: SECRET, appBaseUrl: BASE.appBaseUrl, now }, { method: 'GET', token, ...extra });

    it('"still holds" updates the highlight; the same link a second time says it was handled', async () => {
      const uid = await seedReader({ highlights: 1 });
      await runWeeklyDigest(deps(), MONDAY);
      const { token } = link(sentTo(uid)[0]!.html, 'hl:resonates');

      const first = await act(token);
      expect(first).toMatchObject({ status: 200, outcome: 'applied' });
      expect(first.html).toContain('still holding');
      const h = (await db.doc(`workspaces/${WS}/users/${uid}/highlights/h0`).get()).data();
      expect(h).toMatchObject({ resurfaced7: true, resurfaceRating: 'resonates' });
      expect(h.resurface30At).toBeGreaterThan(MONDAY); // later moments pushed out, never back to back

      const second = await act(token);
      expect(second).toMatchObject({ status: 200, outcome: 'already_done' });
      expect(second.html).toContain('Already handled');
    });

    it('rejects expired and tampered links and changes nothing', async () => {
      const uid = await seedReader({ highlights: 1 });
      await runWeeklyDigest(deps(), MONDAY);
      const { token } = link(sentTo(uid)[0]!.html, 'hl:dismiss');

      const late = await act(token, {}, MONDAY + LINK_TTL_MS + 1000);
      expect(late).toMatchObject({ status: 410, outcome: 'expired' });
      expect(late.html).toContain('expired');
      const bad = await act(`${token.slice(0, -3)}AAA`);
      expect(bad).toMatchObject({ status: 400, outcome: 'invalid' });
      expect((await db.doc(`workspaces/${WS}/users/${uid}/highlights/h0`).get()).data().resurfaced7).toBe(false);
    });

    it('"stop reminding", "turn into action" and "add a thought" each do what they say', async () => {
      const uid = await seedReader({ highlights: 3 });
      await runWeeklyDigest(deps(), MONDAY);
      const html = sentTo(uid)[0]!.html;
      const find = (r: string, id: string) => {
        for (const href of hrefs(html)) {
          const token = new URL(href).searchParams.get('t')!;
          const p = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
          if (p.k === 'hl' && p.r === r && p.i === id) return token;
        }
        throw new Error('missing link');
      };
      const doc = (id: string) => db.doc(`workspaces/${WS}/users/${uid}/highlights/${id}`).get().then((d: any) => d.data()); // eslint-disable-line @typescript-eslint/no-explicit-any

      await act(find('dismiss', 'h0'));
      expect(await doc('h0')).toMatchObject({ resurfaced7: true, resurfaced30: true, resurfaced90: true });

      await act(find('action', 'h1'));
      const actions = await db.collection(`workspaces/${WS}/users/${uid}/actions`).get();
      expect(actions.docs.map((d: any) => d.data().text)).toEqual(['Quote number 1']); // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(actions.docs[0].data()).toMatchObject({ status: 'open', bookId: 'b1', _v: 1 });

      // "Add a thought": GET shows a form and changes nothing; POST with the text records it, once.
      const form = await act(find('thought', 'h2'));
      expect(form.html).toContain('<textarea');
      expect((await doc('h2')).resurfaced7).toBe(false);
      const posted = await act(find('thought', 'h2'), { method: 'POST', text: 'I would argue the opposite now' });
      expect(posted.outcome).toBe('applied');
      expect(await doc('h2')).toMatchObject({ annotation: 'I would argue the opposite now', resurfaced7: true });
      expect((await act(find('thought', 'h2'), { method: 'POST', text: 'again' })).outcome).toBe('already_done');
      expect((await doc('h2')).annotation).toBe('I would argue the opposite now');
    });

    it('a highlight already answered in the app is reported as handled, not changed again', async () => {
      const uid = await seedReader({ highlights: 1 });
      await runWeeklyDigest(deps(), MONDAY);
      const { token } = link(sentTo(uid)[0]!.html, 'hl:resonates');
      await db.doc(`workspaces/${WS}/users/${uid}/highlights/h0`).set({ resurfaced7: true, resurfaceRating: 'thought' }, { merge: true });
      expect((await act(token)).outcome).toBe('already_done');
      expect((await db.doc(`workspaces/${WS}/users/${uid}/highlights/h0`).get()).data().resurfaceRating).toBe('thought');
    });

    it('action links: mark done, remind next week, once only', async () => {
      const uid = await seedReader({ dueAction: true });
      const uid2 = await seedReader({ dueAction: true });
      await runWeeklyDigest(deps(), MONDAY);
      const done = link(sentTo(uid)[0]!.html, 'act:done').token;
      expect((await act(done)).outcome).toBe('applied');
      expect((await db.doc(`workspaces/${WS}/users/${uid}/actions/a1`).get()).data()).toMatchObject({ status: 'done' });
      expect((await act(done)).outcome).toBe('already_done');

      const snooze = link(sentTo(uid2)[0]!.html, 'act:snooze').token;
      expect((await act(snooze)).outcome).toBe('applied');
      const a = (await db.doc(`workspaces/${WS}/users/${uid2}/actions/a1`).get()).data();
      expect(a).toMatchObject({ status: 'snoozed', reminded7: false });
      expect(a.remind7At).toBe(MONDAY + DAY + 7 * DAY);
    });

    it('unsubscribe stops the emails, works from the one-click POST too, and never expires after 14 days', async () => {
      const uid = await seedReader({ highlights: 3 });
      await runWeeklyDigest(deps(), MONDAY);
      const unsub = new URL(makeLinks({ workspaceId: WS, linkSecret: SECRET, ...BASE }, uid, MONDAY).unsubscribe).searchParams.get('t')!;
      const r = await act(unsub, { method: 'POST' }, MONDAY + 60 * DAY);
      expect(r).toMatchObject({ status: 200, outcome: 'applied' });
      expect((await db.doc(`users/${uid}`).get()).data().settings.digest.enabled).toBe(false);

      await runWeeklyDigest(deps(), MONDAY + 7 * DAY);
      expect(sentTo(uid)).toHaveLength(1); // only the first one
      expect((await act(unsub, {}, MONDAY + 90 * DAY)).outcome).toBe('applied'); // idempotent
    });
  });
});
