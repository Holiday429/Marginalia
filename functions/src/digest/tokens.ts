/* Marginalia · signed links for the weekly email (plan 2.4).
   A link carries its own payload (who, what, which answer, when it expires) and an HMAC over it, so a
   click needs no login and nothing has to be stored until the link is used. Single use is enforced by
   the ledger in actions.ts (email_tokens/{jti}); expiry and tampering are checked here.
*/

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { LinkPayload } from './types';

export const LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** Unsubscribe links stay valid much longer than answer links: an old email must still be able to stop the emails. */
export const UNSUBSCRIBE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

const b64 = (buf: Buffer) => buf.toString('base64url');

function mac(body: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

export function newTokenId(): string {
  return b64(randomBytes(12));
}

export function signLink(payload: LinkPayload, secret: string): string {
  if (!secret) throw new Error('EMAIL_LINK_SECRET is not set');
  const body = b64(Buffer.from(JSON.stringify(payload), 'utf8'));
  return `${body}.${b64(mac(body, secret))}`;
}

export type VerifyResult =
  | { ok: true; payload: LinkPayload }
  | { ok: false; reason: 'invalid' | 'expired' };

export function verifyLink(token: string, secret: string, now: number): VerifyResult {
  if (!secret || typeof token !== 'string') return { ok: false, reason: 'invalid' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'invalid' };
  const [body, signature] = parts;
  let given: Buffer;
  try { given = Buffer.from(signature, 'base64url'); } catch { return { ok: false, reason: 'invalid' }; }
  const expected = mac(body, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'invalid' };
  let payload: LinkPayload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as LinkPayload; } catch { return { ok: false, reason: 'invalid' }; }
  if (payload?.v !== 1 || !payload.u || !payload.w || !payload.j || typeof payload.e !== 'number' || !['hl', 'act', 'unsub'].includes(payload.k)) {
    return { ok: false, reason: 'invalid' };
  }
  if (now > payload.e) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}
