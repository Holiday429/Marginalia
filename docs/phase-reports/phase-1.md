# Phase 1 report — stabilize

Branch: `phase-1-stabilize`. Gate before every commit: `npm run check:all`
(lint, typecheck, typecheck:room, check:entitlements, functions build, test:unit, test:rules under the Firestore emulator, build, size).

Baseline on `main` before any change: lint 0 errors / 156 warnings, unit 12 pass, rules 7 pass, `dist` 508M.

## 1.1 Lock billing fields — code done; items marked ⚠ need a dev project

| Acceptance | Status | Evidence |
| --- | --- | --- |
| Rules tests: user writes `users/{uid}.plan` denied; writes `billing/{uid}` denied; reads own billing OK / other's denied; anon reads `users/{uid}` denied and `publicProfiles/{slug}` OK | ✅ | `npm run test:rules:emu` → 18 passed (11 new, `tests/firestore-rules.test.ts`, blocks "billing fields (1.1)" and "users/{uid} privacy and publicProfiles (1.1)") |
| `grep -rn plan src … \| grep -i setDoc` empty; `check:entitlements` passes | ✅ | grep returns nothing; `npm run check:entitlements` exit 0 |
| Dev project: console write of plan → `permission-denied` | ⚠ | Not run — no dev project access from this session. Same rule exercised in the emulator test "owner cannot write plan, entitlements or quota on users/{uid}". Run once after deploying rules to dev. |
| Public profile unauthenticated shows no email/plan in network | ⚠ | Not run in a browser. By construction: anonymous visitors read only `publicProfiles/{slug}`, whose rule is `hasOnly(uid, slug, displayName, avatarUrl, bio, location, joinedAt, sections, updatedAt)` (tested: extra `email`/`plan` fields rejected), and `users/{uid}` + `users` queries are denied (tested). |

Also verified: migration 001 against the emulator (3 seeded users incl. one with forged `plan: 'lifetime'`): forged user → `billing` free and legacy fields deleted; listed user → `pro`; public user → `publicProfiles/payer` created, no `email` in it. Unit tests in `tests/migration-001.test.ts` (3 pass).

Design notes
- `billing/{uid}` and `usage/{uid}/months/{YYYY-MM}`: owner read, `write: false`.
- `users/{uid}`: owner-only; create/update may not touch `plan`, `entitlements`, `quota`, `billing`; client delete denied.
- `publicProfiles/{slug}`: doc id is the slug, so Firestore enforces uniqueness; only the creating uid can update/delete; slug format and reserved list checked in rules. The client derives the card from `users/{uid}` (`src/profile/public-profile.ts`) and removes it when the profile goes private or the slug changes. `profileSlugCheck` now checks this collection.
- `shared/entitlements.ts` is the single entitlement table; `functions/src/_shared/` is a git-ignored build-time copy (`scripts/sync-shared.mjs`, run by functions `prebuild`).
- `billing-webhook.ts` already writes `billing/{uid}` (minimal change); the state machine is task 1.3. `ai-generate.ts` still reads `users.quota` (absent now) until 1.2.
- Book-level public reads (`shareInProfile`) still use rules `get(users/{uid}).settings.profilePublic`, which works because rules bypass read restrictions.

Open items: see `docs/open-questions.md` (Q1.1-a, Q1.1-b).

## 1.2 AI gateway lockdown — code done; items marked ⚠ need a dev project / real DeepSeek key

| Acceptance | Status | Evidence |
| --- | --- | --- |
| Valid token + custom `prompt` → 400; unknown `featureId` → 400; no token → 401 | ✅ (handler level) | `functions/test/ai-handler.test.ts` ("rejects a custom prompt with 400", "unknown featureId", "401 without a token and with a bad token"); also `system`/`messages` overrides → 400, path-like `bookId` → 400 |
| Free user's 11th call in a month → 402; failed call does not increase the count (unit test) | ✅ | Same file: "call 11 returns 402 and the counter stays at 10", "a failed generation does not increase the count", "an empty model response … is refunded". Real transaction semantics checked on the Firestore emulator in `functions/test/quota.emulator.test.ts` (11th refused; release gives a slot back; 12 parallel reservations → exactly 10 succeed) |
| Non-allow-listed origin rejected by CORS | ✅ (server) / ⚠ (browser) | Function declares `cors: allowedOrigins()` (from `ALLOWED_ORIGINS`) **and** the handler returns 403 for a non-listed `Origin` (unit test "rejects browser requests from non-allow-listed origins"). Not exercised from a real browser against a deployed function. |
| Every registry AI feature generates once in dev, same output format (screenshots) | ⚠ | Not run — needs a deployed dev function and a DeepSeek key. Substitute evidence: the 9 ported prompts were compared byte-for-byte against the pre-change client prompts for the same input (identical; my first port had changed template indentation and the comparison caught it), and are now locked by snapshot tests (`functions/test/prompts.snapshot.test.ts`, 10 snapshots). `reading-card` previously used a client-built prompt (`takeaway`/`keywords`); its server prompt is that same text. The old registry-only `reading-card` "oneliner" prompt was unused and was dropped. |

Gate: `npm run check:all` exit 0 (see follow-up note below). Note: the first 1.2 commit shipped snapshots generated from a stale `_shared` copy (wrong template indentation); the gate failed on re-run and the follow-up commit regenerates them from `shared/` and re-verifies byte-equality with the old prompts. The snapshot test now imports `shared/` directly.

What changed
- Request is `{ featureId, bookId? }`; whitelist is `shared/ai-prompts/index.ts` (`AI_FEATURES`). Prompts are pure functions in `shared/ai-prompts/`; the function loads the signed-in user's own book/highlights(≤60, 600 chars each)/actions/notes via the admin SDK (`functions/src/ai-context.ts`) and caps the final prompt at 30,000 chars. The client prompt files and `AIFeatureRegistry.setPrompt/buildPrompt` are removed.
- Quota: `usage/{uid}/months/{YYYY-MM}.aiCalls`, plan from `billing/{uid}` only (a forged `users.plan` is ignored — tested). Free = 10, paid = `PRO_AI_MONTHLY_FAIR_USE` (placeholder, Q1.2-a). Reserved in a transaction before the call, released on failure.
- Audit log now records `inputTokens` / `outputTokens` (DeepSeek `stream_options.include_usage`).
- Client: `ai-gateway.ts` sends only `featureId`/`bookId`; a 402 shows an **Upgrade** button in the AI toolbar (`generate-ui.ts`). `reading-card.ts` no longer has a direct-to-DeepSeek fallback and `VITE_DEEPSEEK_API_KEY` is gone from `env.ts` (an API key must never be in the client bundle).
- Behaviour change to be aware of: AI features now work only for books that exist in Firestore (server reads them); demo/seed-only books get a 404 "Book not found". Reader identity is built from Firestore books/highlights/sessions instead of the profile view's in-memory arrays.
- `test:unit` / `test:rules` now run `scripts/sync-shared.mjs` first (generates the git-ignored `functions/src/_shared`).
