import { describe, expect, it } from 'vitest';
import { LINK_TTL_MS, signLink, verifyLink } from '../src/digest/tokens';
import { buildDigestContent, actionDueAt } from '../src/digest/build';
import { buildDigestEmail, subjectFor, type DigestLinks } from '../src/digest/email';
import { MockEmailSender, NoProviderSender, createEmailSender } from '../src/digest/senders';
import { reportEmailClick } from '../src/digest/analytics';
import { scheduleFrom } from '../src/_shared/resurface';
import type { LinkPayload } from '../src/digest/types';

const SECRET = 'test-secret';
const NOW = Date.UTC(2026, 9, 19, 7);
const DAY = 86_400_000;
const payload = (over: Partial<LinkPayload> = {}): LinkPayload => ({ v: 1, k: 'hl', u: 'u1', w: 'ws', i: 'h1', t: '7d', r: 'resonates', e: NOW + LINK_TTL_MS, j: 'j1', ...over });

describe('signed links', () => {
  it('a valid link verifies and carries its payload', () => {
    const r = verifyLink(signLink(payload(), SECRET), SECRET, NOW);
    expect(r).toMatchObject({ ok: true, payload: { u: 'u1', i: 'h1', r: 'resonates' } });
  });

  it('expires after its time, not before', () => {
    const token = signLink(payload({ e: NOW + 1000 }), SECRET);
    expect(verifyLink(token, SECRET, NOW + 1000).ok).toBe(true);
    expect(verifyLink(token, SECRET, NOW + 1001)).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a changed payload, a changed signature, the wrong secret, and junk', () => {
    const token = signLink(payload(), SECRET);
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload(), r: 'dismiss', u: 'someone-else' })).toString('base64url');
    expect(verifyLink(`${forged}.${sig}`, SECRET, NOW)).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyLink(`${body}.${sig.slice(0, -2)}AA`, SECRET, NOW)).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyLink(token, 'other-secret', NOW)).toEqual({ ok: false, reason: 'invalid' });
    for (const junk of ['', 'abc', 'a.b.c', '.', 'x.']) expect(verifyLink(junk, SECRET, NOW).ok).toBe(false);
    expect(verifyLink(token, '', NOW).ok).toBe(false); // no secret configured: nothing verifies
  });
});

describe('what goes into the digest', () => {
  const hl = (id: string, over = {}) => ({ id, quote: `quote ${id}`, bookId: 'b1', ...scheduleFrom(NOW - 8 * DAY), ...over });
  const titles = new Map([['b1', 'Deep Work']]);

  it('takes at most three due highlights and one due action', () => {
    const c = buildDigestContent({
      highlights: [hl('a'), hl('b'), hl('c'), hl('d'), hl('e', { resurface7At: NOW + DAY })],
      actions: [
        { id: 'x', text: 'older', status: 'open', createdAt: NOW - 40 * DAY, remind7At: NOW - 33 * DAY, remind30At: NOW - 10 * DAY },
        { id: 'y', text: 'newer', status: 'open', createdAt: NOW - 9 * DAY, remind7At: NOW - 2 * DAY },
        { id: 'z', text: 'done', status: 'done', remind7At: NOW - DAY },
      ],
      bookTitles: titles,
      now: NOW,
    });
    expect(c.highlights).toHaveLength(3);
    expect(c.highlights[0]).toMatchObject({ bookTitle: 'Deep Work', tier: '7d' });
    expect(c.action).toMatchObject({ id: 'x', text: 'older', ageDays: 40 });
  });

  it('shows the action seen least recently, so it does not repeat every week', () => {
    const c = buildDigestContent({
      highlights: [],
      actions: [
        { id: 'x', text: 'seen last week', status: 'open', remind7At: NOW - 20 * DAY, lastDigestAt: NOW - 7 * DAY },
        { id: 'y', text: 'never shown', status: 'snoozed', remind7At: NOW - DAY },
      ],
      bookTitles: titles,
      now: NOW,
    });
    expect(c.action?.id).toBe('y');
  });

  it('is empty when nothing is due (so no email is sent)', () => {
    const c = buildDigestContent({ highlights: [hl('a', { resurface7At: NOW + DAY })], actions: [{ id: 'q', text: 't', status: 'open', remind7At: NOW + DAY }], bookTitles: titles, now: NOW });
    expect(c).toEqual({ highlights: [], action: null });
    expect(actionDueAt({ id: 'a', status: 'archived', remind7At: NOW - DAY }, NOW)).toBeNull();
  });
});

describe('the email', () => {
  const links: DigestLinks = {
    highlight: (id, tier, rating) => `https://fn/x?t=${id}.${tier}.${rating}`,
    action: (id, op) => `https://fn/x?t=${id}.${op}`,
    unsubscribe: 'https://fn/x?t=unsub',
    app: 'https://app/',
    settings: 'https://app/#profile',
  };
  const content = {
    highlights: [{ id: 'h1', quote: 'A <b>quote</b> & more', bookId: 'b1', bookTitle: 'Deep Work', tier: '7d' as const }],
    action: { id: 'a1', text: 'Block two hours', bookId: 'b1', bookTitle: 'Deep Work', ageDays: 12 },
  };

  it('has the four answers per highlight, the action buttons, and an unsubscribe link', () => {
    const m = buildDigestEmail(content, links, { to: 'r@example.com', postalAddress: '1 Test Street' });
    for (const r of ['resonates', 'thought', 'action', 'dismiss']) expect(m.html).toContain(`h1.7d.${r}`);
    expect(m.html).toContain('a1.done');
    expect(m.html).toContain('a1.snooze');
    expect(m.html).toContain('https://fn/x?t=unsub');
    expect(m.html).toContain('1 Test Street');
    expect(m.headers?.['List-Unsubscribe']).toBe('<https://fn/x?t=unsub>');
    expect(m.text).toContain('Still holds: https://fn/x?t=h1.7d.resonates');
    expect(m.to).toBe('r@example.com');
  });

  it('escapes the reader\'s own text', () => {
    const m = buildDigestEmail(content, links, { to: 'r@example.com' });
    expect(m.html).toContain('A &lt;b&gt;quote&lt;/b&gt; &amp; more');
    expect(m.html).not.toContain('<b>quote</b>');
  });

  it('subject reflects what is inside', () => {
    expect(subjectFor(content)).toMatch(/a highlight and an action/);
    expect(subjectFor({ highlights: [], action: content.action })).toBe('Marginalia: an action is due');
    expect(subjectFor({ ...content, action: null, highlights: [content.highlights[0], content.highlights[0]] })).toBe('Marginalia: 2 highlights worth another look');
  });
});

describe('email senders', () => {
  it('the mock keeps what it was asked to send', async () => {
    const mock = new MockEmailSender();
    const { id } = await mock.send({ to: 'a@b.c', subject: 's', html: '<p>h</p>', text: 't' });
    expect(mock.sent).toEqual([expect.objectContaining({ id, to: 'a@b.c' })]);
  });

  it('is the mock only when asked for (or inside the emulator); otherwise it refuses with a clear error', async () => {
    expect(createEmailSender({ EMAIL_PROVIDER: 'mock' }).name).toBe('mock');
    expect(createEmailSender({ FUNCTIONS_EMULATOR: 'true' }).name).toBe('mock');
    const none = createEmailSender({});
    expect(none).toBeInstanceOf(NoProviderSender);
    await expect(none.send()).rejects.toThrow(/EMAIL_PROVIDER/);
    expect(createEmailSender({ EMAIL_PROVIDER: 'resend' }).name).toBe('none'); // not wired in yet
  });
});

describe('email click analytics', () => {
  const ev = { uid: 'u1', action: 'hl:resonates', outcome: 'applied' as const };
  it('sends only with a key and a granted consent', async () => {
    const calls: unknown[] = [];
    const fake = (async (_u: unknown, init: { body: string }) => { calls.push(JSON.parse(init.body)); return { ok: true }; }) as unknown as typeof fetch;
    expect(await reportEmailClick({}, 'granted', ev, fake)).toBe(false);
    expect(await reportEmailClick({ POSTHOG_KEY: 'k' }, 'denied', ev, fake)).toBe(false);
    expect(await reportEmailClick({ POSTHOG_KEY: 'k' }, undefined, ev, fake)).toBe(false);
    expect(calls).toHaveLength(0);
    expect(await reportEmailClick({ POSTHOG_KEY: 'k' }, 'granted', ev, fake)).toBe(true);
    expect(calls).toEqual([expect.objectContaining({ event: 'email_action_clicked', distinct_id: 'u1' })]);
  });

  it('never throws into the click when the network fails', async () => {
    const boom = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await reportEmailClick({ POSTHOG_KEY: 'k' }, 'granted', ev, boom)).toBe(false);
  });
});
