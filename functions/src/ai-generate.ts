/* Marginalia · AI generate Cloud Function
   Thin HTTP wrapper around handleGatewayRequest (ai-handler.ts). Proxies to DeepSeek
   (OpenAI-compatible) server-side; the client never touches the API key or sends prompt text.

   POST /aiGenerate
   Headers: Authorization: Bearer <Firebase ID token>
   Body:    { featureId: string, bookId?: string, params?: object }
   Response: SSE stream (text/event-stream), or JSON { error } with 400/401/402/403/404/405/429
*/

import * as Sentry from '@sentry/node';
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';
import { AuditPaths } from './_shared/paths';
import { handleGatewayRequest, type GatewayDeps } from './ai-handler';
import { AI_MODEL, AI_PROVIDER, RATE_LIMIT_PER_DAY, RATE_LIMIT_PER_MINUTE, allowedOrigins } from './ai-config';

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.GCLOUD_PROJECT ?? 'unknown' });
}

admin.initializeApp();

const db = admin.firestore();

// Token bucket state stored in Firestore under users/{uid}/rateLimits/ai (server-only path).
async function checkRateLimit(uid: string): Promise<{ ok: boolean; reason?: string }> {
  const ref = db.doc(AuditPaths.rateLimit(uid));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const stamps: number[] = (snap.data()?.callTimestamps || []).filter((t: number) => t > now - 86_400_000);
    if (stamps.filter((t) => t > now - 60_000).length >= RATE_LIMIT_PER_MINUTE) return { ok: false, reason: 'Rate limit: 10 calls per minute exceeded' };
    if (stamps.length >= RATE_LIMIT_PER_DAY) return { ok: false, reason: 'Rate limit: 200 calls per day exceeded' };
    tx.set(ref, { callTimestamps: [...stamps, now] }, { merge: true });
    return { ok: true };
  });
}

export const aiGenerate = functions.onRequest(
  { secrets: ['AI_API_KEY'], cors: allowedOrigins() },
  async (req, res) => {
    const apiKey = process.env.AI_API_KEY;
    const auditRef = db.doc(AuditPaths.aiCall('pending', String(Date.now())));
    let auditPath = auditRef.path;

    const deps: GatewayDeps = {
      db: db as unknown as GatewayDeps['db'],
      workspaceId: process.env.WORKSPACE_ID || 'default',
      allowedOrigins: allowedOrigins(),
      verifyToken: async (token) => (await admin.auth().verifyIdToken(token)).uid,
      checkRateLimit,
      audit(entry) {
        const { uid, ...rest } = entry as { uid: string } & Record<string, unknown>;
        if (auditPath.includes('/pending/')) auditPath = AuditPaths.aiCall(uid, String(Date.now()));
        db.doc(auditPath)
          .set({ provider: AI_PROVIDER, model: AI_MODEL, ...rest, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
          .catch(() => undefined);
      },
      onModelError: (e, extra) => Sentry.captureException(e, { extra }),
      async stream(prompt, onDelta) {
        if (!apiKey) throw new Error('AI gateway not configured');
        const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });
        const stream = await client.chat.completions.create({
          model: AI_MODEL,
          messages: [
            { role: 'system', content: 'Return only valid JSON. No markdown fences, no explanation.' },
            { role: 'user', content: prompt },
          ],
          stream: true,
          stream_options: { include_usage: true },
          temperature: 0.4,
          max_tokens: 4096,
        });
        let inputTokens = 0;
        let outputTokens = 0;
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || '';
          if (delta) onDelta(delta);
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens;
            outputTokens = chunk.usage.completion_tokens;
          }
        }
        return { inputTokens, outputTokens };
      },
    };

    const result = await handleGatewayRequest(deps, {
      method: req.method,
      origin: req.headers.origin,
      authorization: req.headers.authorization,
      body: req.body,
    });

    if (result.kind === 'error') {
      res.status(result.status).json({ error: result.error, ...(result.extra ?? {}) });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ meta: { provider: AI_PROVIDER, model: AI_MODEL } })}\n\n`);
    try {
      await result.start((chunk) => res.write(chunk));
    } finally {
      res.end();
    }
  }
);
