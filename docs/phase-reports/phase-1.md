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

## 1.3 Billing webhook — code done; the live Lemon Squeezy lifecycle run is Holiday's

| Acceptance | Status | Evidence |
| --- | --- | --- |
| Every row of the plan table has a unit test on a sample payload; bad signature → 401 | ✅ | `functions/test/billing-webhook.test.ts` (21 tests): created/active, created/on_trial, updated (renewal), cancelled, resumed, expired, past_due, lifetime order, other-variant order, lifetime refund, other-variant refund — payloads in `functions/test/fixtures/billing/*.json` (13 files, Lemon Squeezy shape). Signature: correct HMAC accepted; wrong/short/non-hex/empty rejected; the real `billingWebhook` handler returns 401 for wrong and missing signature |
| Cancelled first, older `updated` later → still `cancelAtPeriodEnd` | ✅ | "a stale subscription_updated after cancelled does not undo the cancellation" (stale events are dropped by comparing `attributes.updated_at`) |
| A monthly subscription's first order never makes the user lifetime | ✅ | "a monthly subscription's first order never makes the user lifetime" (orders are matched on `first_order_item.variant_id == LEMON_SQUEEZY_VARIANT_LIFETIME`) |
| Holiday runs subscribe → cancel → expire and lifetime → refund in LS test mode; `billing/{uid}` matches the table | ⏳ Holiday | Needs deployed function + LS test store. Expected states are exactly the test expectations above. |

Mutation check: with the stale-event guard removed 1 test fails; with the lifetime-variant check removed 4 fail (restored afterwards) — the tests do bite.

Design notes
- `functions/src/billing-state.ts` is a pure reducer (prev doc + payload → next doc). `billing-webhook.ts` wraps it in a Firestore transaction (read-modify-write, idempotent).
- Lifetime and subscription are tracked independently (`lifetimeActive`, `subscriptionPlan`) and composed: refunding a lifetime order falls back to an active subscription instead of Free; a refund arriving before its `order_created` is remembered so the later order is ignored.
- A `cancelled` event whose `ends_at` is already past is treated as expired (late delivery).
- No uid in `custom_data` → document parked in `billing_orphans` (clients cannot read it; default-deny) and the webhook still returns 200 so LS stops retrying. Handler errors return 500 so LS retries.
- `createCheckout`: CORS and the post-checkout redirect now use the `ALLOWED_ORIGINS` allow-list (403 otherwise; previously any `Origin` header became the redirect), and a lifetime owner gets 409 instead of being able to pay again.
- Decisions deferred to you: Q1.3-a/b/c/d in `docs/open-questions.md`.

## 1.4 Reading-session writes — done

| Acceptance | Status | Evidence |
| --- | --- | --- |
| Emulator: start + stop a timer → doc with `durationMs`; rules test: owner can write, others cannot | ✅ | `npm run test:e2e:emu` → `tests/e2e-emulator/reading-session.spec.ts` drives the real login form and focus widget, then reads `workspaces/default/users/{uid}/sessions` from the Firestore emulator: 1 doc, `durationMs ≥ 1000`, `startedAt`, `endedAt` present. Rules: `tests/firestore-rules.test.ts` block "reading sessions (1.4)" (4 tests, 24 total pass) |
| After refresh, today's Profile heatmap cell is coloured | ✅ | Same spec: reload → Profile → `.prof-year__cell[title^="<today>"]` has class `is-l1…l4` and title "1 sessions". Screenshot: `tests/screenshots/phase-1/1.4-profile-heatmap.png` (390/768/1440 sizes still to do in the final screenshot pass) |
| No `ReadingSession.start` error in Sentry/console | ✅ (local) | Spec asserts no console error containing `ReadingSession.start/stop`. Production Sentry not checked. |

What changed
- Root cause: `collection(db,'users',uid,'data','sessions')` has an even number of segments, so the SDK threw and the `catch` swallowed it. Now `workspaces/{ws}/users/{uid}/sessions/{id}` via `WsPaths.sessions`. Stop re-sends `bookId/startedAt` so a missed start still yields a valid doc.
- Rules: owner-only; `create` needs numeric `startedAt` + string `bookId`; `startedAt` cannot be rewritten.
- Index: none needed — the only query is a single-field range (`startedAt >= cutoff`), which Firestore indexes automatically. `firestore.indexes.json` is unchanged on purpose.
- Profile reads sessions (+ highlight dates) for the owner and passes per-day `sessionDays` to the annual shelf heatmap and the reading-identity input (previously hard-coded `[]`). `src/profile/session-days.ts` aggregates by local calendar day (unit-tested, 4 tests). Public visitors get an empty rhythm because sessions are owner-only.
- Stop emits `marginalia:session-ended` `{ sessionId, bookId, durationMs }`. The visible "Want to note something?" prompt is **not** built here: it needs the quick-capture panel from task 2.1, and a button with nothing behind it would be worse than no button. 2.1 should listen for that event.

New test infrastructure (needed for every logged-in acceptance item)
- `vite --mode emulator` (`.env.emulator`, demo project, no secrets) connects Auth/Firestore/Functions/Storage to the local emulators; guarded by `MODE === 'emulator'` so dev/prod builds cannot point at localhost. `playwright.emulator.config.ts`, `npm run test:e2e:emu`, now part of `npm run check:all`.

Regression found and fixed on the way (introduced by 1.1)
- `entitlements-store` used to create `users/{uid}` on first sign-in; 1.1 removed that write, so a brand-new account had no `users/{uid}` and the owner's Profile showed "Profile not found". The e2e caught it. `lookupByUid` now builds the profile from the auth user when the doc does not exist.

Known, deferred
- Boot-time `TypeError: Cannot read properties of undefined (reading 'image')` comes from three.js's loader on the broken `oriented_strand_board_rough_2k.exr`; it is removed by 1.6. The new spec tolerates it explicitly (comment points to 1.6); the phase gate still requires 0 pageerrors.
