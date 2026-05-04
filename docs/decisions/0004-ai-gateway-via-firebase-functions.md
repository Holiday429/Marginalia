# 0004 — AI gateway via Firebase Cloud Functions

**Status:** Accepted
**Date:** 2026-05-04

## Context

Phase 5 of the P0 migration. Previously `src/ai/client/api.js` called the DeepSeek API directly from the browser, with the API key stored in `localStorage`. This exposes the key to any user who opens DevTools. Additionally, there was no server-side rate limiting, quota enforcement, or audit trail.

## Decision

All AI requests are proxied through a Firebase Cloud Function (`aiGenerate`). The client sends a Firebase ID token; the function verifies the token, checks rate limits and quota, forwards the prompt to DeepSeek, streams the response back as SSE, and writes an audit log entry.

- API key (`AI_API_KEY`) lives in Firebase Functions secrets — never in source or the client bundle.
- Client authentication uses the existing Firebase ID token from `firebase.auth().currentUser.getIdToken()`.
- The gateway URL is configured via `VITE_AI_GATEWAY_URL` (env file, not hardcoded).
- DeepSeek is called via the `openai` npm package pointed at `https://api.deepseek.com` (OpenAI-compatible API).
- Rate limit: 10 calls/minute, 200 calls/day per user — tracked in `users/{uid}/rateLimits/ai` in Firestore.
- Quota: `users/{uid}.quota.aiCreditsRemaining` — decremented per successful call; 402 when exhausted.
- Audit log: `audit/ai_calls/{uid}/{timestamp}` — written on every call attempt.

## Alternatives considered

- **Keep key in localStorage, add a proxy later** — delays the security fix and requires a second migration. Rejected.
- **Use a separate backend (Express / Hono on Cloud Run)** — more flexible long-term but adds infra complexity at P0. Firebase Functions co-locate with Firestore auth, making token verification trivial. Rejected for P0.
- **Anthropic Claude instead of DeepSeek** — the existing client already used DeepSeek. The gateway is provider-agnostic (OpenAI-compatible interface); switching providers means changing `baseURL` and `model` in the function, not the client. Deferred decision.

## Consequences

- The client (`src/services/ai-gateway.ts`) has no key management methods (`hasKey`, `setKey`, `clearKey`) — those are gone.
- `src/ai/settings/ai-settings.js` (the key management UI) is deleted.
- The AI Settings button in the account dock is removed from `src/firebase/auth.js`.
- AI features require the user to be signed in (previously worked with just a local key).
- To deploy: `firebase functions:secrets:set AI_API_KEY`, then `firebase deploy --only functions`.
- `VITE_AI_GATEWAY_URL` must be set in `.env.development` and `.env.production` after deployment.
- Phase 6 (entitlements) will gate `ai.unlimited` entitlement against quota exhaustion more precisely.
