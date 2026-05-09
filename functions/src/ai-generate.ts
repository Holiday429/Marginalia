/* Marginalia · AI generate Cloud Function
   Proxies AI requests to DeepSeek (OpenAI-compatible API) server-side.
   Client never touches the API key.

   POST /aiGenerate
   Headers: Authorization: Bearer <Firebase ID token>
   Body:    { featureId: string, bookData: object, prompt: string }
   Response: SSE stream of text/event-stream, or JSON on error
*/

import * as Sentry from '@sentry/node';
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.GCLOUD_PROJECT ?? 'unknown' });
}

admin.initializeApp();

const db = admin.firestore();
const AI_PROVIDER = 'deepseek';
const AI_MODEL = 'deepseek-chat';

// Token bucket state stored in Firestore under users/{uid}/rateLimits/ai
const RATE_LIMIT_PER_MINUTE = 10;
const RATE_LIMIT_PER_DAY    = 200;

export const aiGenerate = functions.onRequest(
  { secrets: ['AI_API_KEY'], cors: true },
  async (req, res) => {
    // Only POST
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // 1. Verify Firebase auth ID token
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      res.status(401).json({ error: 'Missing authorization token' });
      return;
    }

    let uid: string;
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      res.status(401).json({ error: 'Invalid authorization token' });
      return;
    }

    // 2. Rate limit check (token bucket in Firestore)
    const rateLimitRef = db.doc(`users/${uid}/rateLimits/ai`);
    const allowed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(rateLimitRef);
      const now = Date.now();
      const data = snap.exists ? snap.data()! : {};

      const minuteWindowStart = now - 60_000;
      const dayWindowStart    = now - 86_400_000;

      const minuteCalls: number[] = (data.callTimestamps || []).filter((t: number) => t > minuteWindowStart);
      const dayCalls: number[]    = (data.callTimestamps || []).filter((t: number) => t > dayWindowStart);

      if (minuteCalls.length >= RATE_LIMIT_PER_MINUTE) return { ok: false, reason: 'Rate limit: 10 calls per minute exceeded' };
      if (dayCalls.length    >= RATE_LIMIT_PER_DAY)    return { ok: false, reason: 'Rate limit: 200 calls per day exceeded' };

      const updated = [...dayCalls, now];
      tx.set(rateLimitRef, { callTimestamps: updated }, { merge: true });
      return { ok: true };
    });

    if (!allowed.ok) {
      res.status(429).json({ error: allowed.reason });
      return;
    }

    // 3. Check quota on user doc
    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();
    const quota = userSnap.exists ? (userSnap.data()?.quota || {}) : {};
    const credits: number = quota.aiCreditsRemaining ?? Infinity;
    if (credits <= 0) {
      res.status(402).json({ error: 'AI quota exhausted. Upgrade to Pro for unlimited access.' });
      return;
    }

    // 4. Parse request body
    const { featureId, prompt } = req.body as {
      featureId?: string;
      bookData?: unknown;
      prompt?: string;
    };

    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Missing prompt in request body' });
      return;
    }

    // 5. Call DeepSeek via OpenAI-compatible client (streaming)
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'AI gateway not configured' });
      return;
    }

    const client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com',
    });

    const auditRef = db.doc(`audit/ai_calls/${uid}/${Date.now()}`);
    const auditData = {
      featureId: featureId || null,
      provider: AI_PROVIDER,
      model: AI_MODEL,
      promptLength: prompt.length,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'started',
    };

    // Write audit log (non-blocking)
    auditRef.set(auditData).catch(() => {});

    // Stream SSE back to client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ meta: { provider: AI_PROVIDER, model: AI_MODEL } })}\n\n`);

    let fullText = '';
    let streamError: Error | null = null;

    try {
      const stream = await client.chat.completions.create({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: 'Return only valid JSON. No markdown fences, no explanation.' },
          { role: 'user',   content: prompt },
        ],
        stream: true,
        temperature: 0.4,
        max_tokens: 4096,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        }
      }

      res.write('data: [DONE]\n\n');
    } catch (err) {
      streamError = err as Error;
      Sentry.captureException(streamError, { extra: { featureId, uid } });
      res.write(`data: ${JSON.stringify({ error: streamError.message })}\n\n`);
    } finally {
      res.end();
    }

    // 6. Write final audit log + decrement quota (non-blocking)
    const finalStatus = streamError ? 'error' : 'ok';
    auditRef.update({ status: finalStatus, responseLength: fullText.length }).catch(() => {});

    if (!streamError && credits !== Infinity) {
      userRef.update({
        'quota.aiCreditsRemaining': admin.firestore.FieldValue.increment(-1),
      }).catch(() => {});
    }
  }
);
