/* Marginalia · AI gateway request handler (framework-free, dependency-injected for tests).

   POST body: { featureId: string, bookId?: string, params?: object }
   - featureId must be in the AI_FEATURES whitelist; any `prompt` field is rejected (400).
   - Prompts are assembled here from the user's own Firestore data; the client never sends text.
   Order: method → origin → auth → body → rate limit → context → quota reserve → model call.
   The quota slot is released if the model call fails. */

import { AI_FEATURES, PROMPT_LIMITS, isAiFeatureId, sanitizeParams, type PromptCtx } from './_shared/ai-prompts';
import { releaseAiCall, reserveAiCall, type QuotaDb } from './ai-quota';
import { loadBookContext, loadLibraryContext, ContextError, type ContextDb } from './ai-context';

export interface GatewayRequest {
  method: string;
  origin?: string;
  authorization?: string;
  body: unknown;
}

export interface TokenUsage { inputTokens: number; outputTokens: number }

export interface GatewayDeps {
  db: QuotaDb & ContextDb;
  workspaceId: string;
  allowedOrigins: string[];
  verifyToken(idToken: string): Promise<string>; // → uid, throws if invalid
  checkRateLimit(uid: string): Promise<{ ok: boolean; reason?: string }>;
  /** Streams the model output through `onDelta`. Resolves with token usage. */
  stream(prompt: string, onDelta: (text: string) => void): Promise<TokenUsage>;
  audit(entry: Record<string, unknown>): void;
  onModelError?(err: Error, extra: Record<string, unknown>): void;
}

export type GatewayResult =
  | { kind: 'error'; status: number; error: string; extra?: Record<string, unknown> }
  | { kind: 'stream'; start(write: (chunk: string) => void): Promise<void> };

const err = (status: number, error: string, extra?: Record<string, unknown>): GatewayResult => ({ kind: 'error', status, error, extra });

const SAFE_ID = /^[A-Za-z0-9_-]{1,200}$/;

export async function handleGatewayRequest(deps: GatewayDeps, req: GatewayRequest): Promise<GatewayResult> {
  if (req.method !== 'POST') return err(405, 'Method not allowed');

  if (req.origin && !deps.allowedOrigins.includes(req.origin)) return err(403, 'Origin not allowed');

  const token = (req.authorization ?? '').startsWith('Bearer ') ? req.authorization!.slice(7) : '';
  if (!token) return err(401, 'Missing authorization token');
  let uid: string;
  try { uid = await deps.verifyToken(token); } catch { return err(401, 'Invalid authorization token'); }

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return err(400, 'Invalid request body');
  const { featureId, bookId, params, ...rest } = body as Record<string, unknown>;
  if ('prompt' in rest || 'system' in rest || 'messages' in rest) return err(400, 'Custom prompts are not accepted');
  if (!isAiFeatureId(featureId)) return err(400, 'Unknown featureId');
  if (params !== undefined && (typeof params !== 'object' || params === null || Array.isArray(params))) {
    return err(400, 'Invalid params');
  }
  const feature = AI_FEATURES[featureId];
  if (feature.kind === 'book' && (typeof bookId !== 'string' || !SAFE_ID.test(bookId))) {
    return err(400, 'bookId is required for this feature');
  }

  const rate = await deps.checkRateLimit(uid);
  if (!rate.ok) return err(429, rate.reason ?? 'Rate limit exceeded');

  let ctx: PromptCtx;
  try {
    ctx = feature.kind === 'book'
      ? await loadBookContext(deps.db, deps.workspaceId, uid, bookId as string)
      : await loadLibraryContext(deps.db, deps.workspaceId, uid);
  } catch (e) {
    if (e instanceof ContextError) return err(e.status, e.message);
    throw e;
  }
  const spec = 'params' in feature ? (feature.params as Readonly<Record<string, number>>) : undefined;
  ctx.params = sanitizeParams(spec, params);
  const prompt = feature.build(ctx).slice(0, PROMPT_LIMITS.promptChars);

  const reservation = await reserveAiCall(deps.db, uid);
  if (!reservation.ok) {
    return err(402, 'AI quota exhausted for this month. Upgrade to Pro for more.', {
      plan: reservation.plan, used: reservation.used, limit: reservation.limit, month: reservation.month,
    });
  }

  return {
    kind: 'stream',
    async start(write) {
      deps.audit({ uid, featureId, bookId: bookId ?? null, promptLength: prompt.length, status: 'started' });
      let fullText = '';
      try {
        const usage = await deps.stream(prompt, (delta) => {
          fullText += delta;
          write(`data: ${JSON.stringify({ delta })}\n\n`);
        });
        if (!fullText.trim()) throw new Error('Model returned an empty response');
        write('data: [DONE]\n\n');
        deps.audit({ uid, featureId, status: 'ok', responseLength: fullText.length, ...usage });
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        deps.onModelError?.(error, { featureId, uid });
        write(`data: ${JSON.stringify({ error: 'Generation failed. You were not charged. Try again.' })}\n\n`);
        deps.audit({ uid, featureId, status: 'error', responseLength: fullText.length, message: error.message.slice(0, 200) });
        await releaseAiCall(deps.db, uid, reservation.month).catch(() => undefined);
      }
    },
  };
}
