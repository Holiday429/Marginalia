/* Marginalia · geography functions (plan 2.6).
   resolveBookGeo       — callable; author origin (Wikidata) + story setting (internal model call) for up to 25 books.
   resolveReadingPlace  — callable; city and country for coordinates the reader chose to share.
   Both need a signed-in caller and are rate limited per user. Configuration: WIKIDATA_CONTACT (an email or URL
   Wikimedia can reach you at; their policy requires it), AI_API_KEY (already used by aiGenerate).
*/

import * as https from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';
import { Paths } from './_shared/paths';
import { AI_MODEL, allowedOrigins } from './ai-config';
import { MAX_BOOKS_PER_CALL, resolveBooks, type ResolveBook } from './geo/resolve';
import { reverseGeocode } from './geo/reverse-geocode';
import type { ModelCall } from './geo/setting';

const db = admin.firestore();

const emulator = () => process.env.FUNCTIONS_EMULATOR === 'true';
const userAgent = () => `Marginalia/0.1 (${process.env.WIKIDATA_CONTACT || 'contact not configured'})`;

const PER_MINUTE = 10;
const PER_DAY = 200;

async function checkRateLimit(uid: string): Promise<void> {
  const ref = db.doc(Paths.geoRateLimit(uid));
  const ok = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const stamps: number[] = (snap.data()?.callTimestamps ?? []).filter((t: number) => t > now - 86_400_000);
    if (stamps.filter((t) => t > now - 60_000).length >= PER_MINUTE || stamps.length >= PER_DAY) return false;
    tx.set(ref, { callTimestamps: [...stamps, now] }, { merge: true });
    return true;
  });
  if (!ok) throw new https.HttpsError('resource-exhausted', 'Too many place lookups. Try again later.');
}

function modelCall(): ModelCall | null {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return null;
  const baseURL = emulator() && process.env.AI_BASE_URL ? process.env.AI_BASE_URL : 'https://api.deepseek.com';
  const client = new OpenAI({ apiKey, baseURL });
  return async (prompt) => {
    const res = await client.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: 'Return only valid JSON. No markdown fences, no explanation.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      max_tokens: 200,
    });
    return { text: res.choices[0]?.message?.content ?? '', inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0 };
  };
}

export const resolveBookGeo = https.onCall({ cors: allowedOrigins(), secrets: ['AI_API_KEY'] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new https.HttpsError('unauthenticated', 'Sign in first.');
  const raw = (request.data as { books?: unknown })?.books;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_BOOKS_PER_CALL) {
    throw new https.HttpsError('invalid-argument', `Send between 1 and ${MAX_BOOKS_PER_CALL} books.`);
  }
  const books: ResolveBook[] = raw.map((b) => {
    const x = (b ?? {}) as Record<string, unknown>;
    return { id: String(x.id ?? '').slice(0, 200), title: String(x.title ?? '').slice(0, 200), author: String(x.author ?? '').slice(0, 200) };
  }).filter((b) => /^[A-Za-z0-9_-]{1,200}$/.test(b.id) && b.title);
  await checkRateLimit(uid);
  const results = await resolveBooks({
    db,
    wikidata: { fetch, userAgent: userAgent(), baseUrl: emulator() ? process.env.WIKIDATA_BASE_URL : undefined },
    model: modelCall(),
  }, uid, books);
  return { results };
});

export const resolveReadingPlace = https.onCall({ cors: allowedOrigins() }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new https.HttpsError('unauthenticated', 'Sign in first.');
  const { lat, lon } = (request.data ?? {}) as { lat?: unknown; lon?: unknown };
  if (typeof lat !== 'number' || typeof lon !== 'number') throw new https.HttpsError('invalid-argument', 'lat and lon are required.');
  await checkRateLimit(uid);
  const place = await reverseGeocode(lat, lon, { fetch, userAgent: userAgent(), baseUrl: emulator() ? process.env.NOMINATIM_BASE_URL : undefined });
  return { place };
});
