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

## 1.5 Remove hard-coded demo data — done (one acceptance partly pending a manual check)

| Acceptance | Status | Evidence |
| --- | --- | --- |
| `grep -rni sapiens src --exclude-dir=data` → 0 lines | ✅ | `npm run check:hardcoded` (now in `check:all`); the desk-book room identifiers were renamed `desk-book` / `deskBook` / `onDeskBookSelect` |
| e2e: a new account sees only empty states in Search/Library/Map/Graph/Profile | ✅ | `tests/e2e-emulator/real-library.spec.ts` "a brand-new account sees empty states…": visits all five views, asserts the Search empty state and that none of the demo titles (Sapiens, Dune, 活山, 红楼梦, Gatsby, Beloved) appears on any view |
| e2e: user adds 人类简史 as Reading and writes a highlight; both survive a reload and stay editable | ✅ | same file, test 2 — status stays `reading` (previously overwritten to finished by `_normalizeSapiens`), highlight present after reload with its edit/delete controls, no seed tags ("Cognitive Revolution") leaked into the page |
| e2e: signed-out demo shows the same finished/total numbers everywhere | ✅ (Search ↔ Profile) | test 3 compares Search "N finished" with Profile "Books Finished"; both derive from `DEMO_BOOKS`. Map and Graph are fed by the same list through `BooksStore` but are not number-compared in the e2e. Unit: `tests/demo-data.test.ts` (6 tests) |
| Profile has no broken image (`naturalWidth > 0` on every `<img>`) | ✅ | `brokenImages()` helper asserts `[]` on the demo Profile (it was 10 broken covers: paths pointed at `assets/covers/…` instead of `/covers/…`) and on a new account's Profile |

What changed
- `BookDataSource` (`src/store/book-data-source.ts`): `FirestoreDataSource` for signed-in users (empty means empty) and `DemoDataSource` for visitors (demo library + locally added books from IndexedDB). `BooksStore` only talks to a source; `_isSapiensLike`, `_normalizeSapiens`, the seed fallback on an empty account, `_canonicalizeBooks`, and `window.__SEED_SAPIENS` are gone. `BooksStore.isDemoBook()` replaces the `id === 'sapiens'` checks in Library.
- Deleted: `src/data/seed/index.js`, `profile-demo.ts`, `src/data/mock/seed-spines.js`; `ensureShelfDetailRecord` (cloned Sapiens' notes into every book), the 22 mock spines in Search, the 11 mock "filler" books in the Profile annual shelf, the Sapiens branches in Search/Library/Book/Graph/New Entry/notes wall. Books without detail use `createEmptyBook()` (`src/data/schema/empty-book.ts`) and the panels' own empty states.
- New: `src/data/demo/` (single demo dataset), `src/core/asset.ts` (`asset()` applies the Vite base), covers renamed to ASCII in `public/covers/` and referenced through `asset()`, landing-page spines moved to `src/preloader/landing-books.js` (decorative props, not data), transition spines inlined in `frame-fly.js`.
- Short shelf: a signed-in user with fewer than 8 books gets ghost "+" spines (solid outline, see Q1.5-a); a user with no books gets an "Add a book" empty state.
- Picture frame: shows the user's avatar (`src/three/frame-photo.ts`, set from the user doc on sign-in and on avatar upload), else a default pixel reader; `public/3d/profile-frame-photo.jpg` and `me.jpg` deleted.
- Screenshots (demo Search/Profile, new-account Search) at 390/768/1440: `tests/screenshots/phase-1/1.5-*.png`. At 390px the top nav shows only the Map icon, so Profile/Library cannot be reached there (known defect, task 3.4); Profile is captured at 768 and 1440 only.

Not verified / follow-ups
- Not exercised in a real browser against a deployed dev project (only the emulator).
- `assets/` (repo root, duplicates `public/`) still contains the Chinese-named covers; it is deleted in 1.7.
- Open questions Q1.5-a…e in `docs/open-questions.md`.

## 1.6 Room asset compression — done (visual sign-off and live headers are Holiday's / need a deploy)

| Acceptance | Status | Evidence |
| --- | --- | --- |
| Landing → room: total response bytes ≤ 12 MB (was 243.9 MB) | ✅ **10.7 MB** | `node scripts/measure-room-load.mjs` (CDP `encodedDataLength` over 47 responses, served by `vite preview`, i.e. no brotli on JS/CSS; GLB/WebP/JPEG do not compress further, so production is the same or lower). Baseline reproduced first: 243.9 MB, 51 responses, 1 pageerror. Now part of `npm run check:all` (fails above 12 MB) |
| Same script: `pageerror` = 0 | ✅ | 0 (baseline 1: the `.exr` "reading 'image'" error). The smoke e2e (`tests/e2e/smoke.spec.ts`) and the emulator specs no longer tolerate any page error |
| `du -sh dist` < 60 MB (was 481 MB) | ✅ **25 MB** | `npm run check:all` output (`du -sh dist` after `npm run build`; 508 MB at the start of this phase on this checkout) |
| Fast 4G: poster visible within 2 s of clicking Enter | ✅ **52 ms** (emulated) | Playwright CDP network throttling with the DevTools "Fast 4G" preset (562.5 ms latency, 1.6 Mbit/s down); `measure-room-load.mjs --throttle=fast4g` → "poster 57 ms after the click". The 67 KB WebP is a static `<img>` in `index.html` fetched while the landing page is up and painted the moment Enter is clicked, before any room JS loads. Even if it had not been fetched yet: ≈ 0.56 s latency + 67 KB at 200 KB/s ≈ 0.9 s. Screenshot: `tests/screenshots/phase-1/room-poster-fast4g.png`. Not a manual DevTools session. |
| Before/after screenshots side by side, Holiday confirms | ⏳ Holiday | `tests/screenshots/phase-1/room-compare.png` (4 poses). See Q1.6-a |

What changed
- `scripts/optimize-assets.mjs` (`npm run assets:optimize`, deps `@gltf-transform/*`, `sharp`, `meshoptimizer`): `assets-src/3d/*.glb` → `public/3d/<name>.<hash>.glb` with WebP textures (cap 2048 / 1024 / 512), meshopt compression, no simplification; surface maps → `public/textures/<set>/<map>.<hash>.jpg`; writes `src/three/asset-manifest.generated.ts`. Models 163 MB → 8.2 MB.
- Surfaces now use Poly Haven (CC0) 1K JPG diffuse/normal/roughness for wall, floor, desk, OSB board; carpet from the existing ambientCG set downscaled. All `.exr` and displacement PNGs deleted, `EXRLoader` removed from `room.ts`.
- `src/three/gltf-loader.ts`: one loader with the Meshopt decoder for all eight GLB call sites (room, hero book, map globe, fly-ins, search decor); each URL is fetched once (the hero `book.glb` used to be downloaded twice), each caller parses its own copy so overlays never dispose the room's resources. Draco removed (nothing uses it).
- Load order: interactive objects first, furniture/props after; `onSceneReady` fades the poster out.
- Low-end path: `hardwareConcurrency <= 4` or a touch device → no real-time shadows, pixel ratio ≤ 1.5.
- `vercel.json`: `Cache-Control: public, max-age=31536000, immutable` for `/3d/*`, `/textures/*`, `/assets/*` (all content-hashed). **Not verified against a live deployment** — check the response headers after the first Vercel deploy.
- Removed from `public/`: 16 unused models (incl. the 3 CC-BY-NC ones: `bankers_lamp`, `sofa_pink`, `world_map_color_3d_scan`), unused texture sets (sofa, shelf), `public/book.glb` (now hashed), draco decoders, two unused frame JPGs. All 14 shipped models are CC-BY-4.0 and the GLB `asset.extras` (author/source/licence) survived optimization — verified with `node scripts/list-model-licenses.mjs public/3d` (input for the Credits page in 1.8). The Poly Haven/ambientCG textures are CC0 (no attribution required).
- Also: smoke e2e and the Playwright config use the installed Chrome locally (no browser download) with `workers: 1`.

## 1.7 Repository cleanup — done locally (CI run needs a push)

| Acceptance | Status | Evidence |
| --- | --- | --- |
| Fresh clone: `npm ci && npm run build` succeeds | ✅ | Cloned the branch to a scratch dir: `npm ci` exit 0, `npm run build` ✓ (dist 25 MB). The lockfile was out of sync before; it is regenerated (it also gained the asset-pipeline dev dependencies) |
| `git ls-files \| grep -E "npm-cache\|^assets/\|reference_\|^tmp/\|\.vite/\|DS_Store"` → nothing | ✅ | 0 matches in the fresh clone (356 tracked files, was 1372) |
| CI all green | ⏳ | Not run: nothing pushed. See Q1.7-c |

What changed
- Untracked (`git rm --cached`): `.npm-cache/` (910 files), `.vite/`, root `assets/` (393 MB; its 26 GLBs are byte-identical to the ones in `public/3d` — checked with `cmp` before moving), `reference_delete when complete/`, `tmp/`, `_ft.mjs`, root `book.glb` (identical to the published original), every `.DS_Store`. `.gitignore` extended so they cannot come back.
- Nothing was destroyed: `assets/`, the reference images, `tmp/` and `_ft.mjs` were moved to `assets-src/_legacy/` (git-ignored, on this machine); `.npm-cache` and `.vite` (regenerable) were deleted.
- `ci.yml`/`deploy.yml` use `npm ci`; CI additionally installs and builds `functions/`, runs `check:hardcoded`, and has a signed-in e2e job on the Firebase emulators (needs Java, Chromium).
- History is untouched. Q1.7-a lays out the `git filter-repo` trade-off for your decision.
- Leftover scratch clone from the verification: `/private/tmp/claude-501/-Users-Holiday-1-Desktop-Growth-Marginalia/6a904a90-4100-4a8c-aca0-75b26f48e5b8/scratchpad/fresh` (the sandbox refused my `rm -rf` of it; safe to delete by hand).

## 1.8 Launch compliance — done in code; legal text and the real-cloud checks need Holiday

| Acceptance | Status | Evidence |
| --- | --- | --- |
| `/privacy`, `/terms`, `/credits` reachable from the footer; Credits lists every CC-BY model currently loaded | ✅ | Static pages `public/{privacy,terms,credits}/index.html` generated by `npm run legal:build`. `tests/e2e-emulator/legal.spec.ts` clicks each link in the landing footer and finds the same links in the room settings panel. `tests/legal-pages.test.ts`: Credits is generated from the `asset.extras` of the 14 shipped GLBs (title, author, source, licence), lists every one, contains no NC licence; the committed pages equal the generator output. |
| Emulator: delete a test account → script confirms no document under that uid and no Auth user | ✅ | `functions/test/delete-account.emulator.test.ts` (Firestore + Auth emulators): seeds every path the app writes (users, billing, usage, publicProfiles, workspaces/…/users/{uid}/** incl. nested notes/sessions, userProfiles, notifications, audit, billing_orphans by email), runs `deleteAccountData`, then walks the entire database for any path containing the uid → none; `auth.getUser` → `user-not-found`; another user's data and a stranger's orphan record untouched; Storage prefix deletion requested; idempotent re-run; refuses while a subscription renews and deletes nothing. UI end-to-end: `tests/e2e-emulator/delete-account.spec.ts` drives the real Settings flow against the Auth + Firestore + **Functions + Storage** emulators (JSON downloads on click, Delete stays disabled until `DELETE` is typed, then Auth user and Firestore data are gone and the app is back on the landing page). |
| Before consent, no request to PostHog / Sentry | ✅ | `tests/e2e-emulator/consent.spec.ts` on a production build with fake keys: every request to `posthog.com`/`sentry.io` is recorded — none before a choice, none after Decline (and across a reload), requests appear only after Accept, and none after withdrawing again |

What changed
- **Consent**: `src/services/consent.ts` (choice in localStorage), `analytics.ts` starts PostHog/Sentry only after "granted" and stops them on withdrawal (Sentry `close(0)` + `beforeSend` gate; PostHog opt-out, feature-flag requests disabled — they fired after `reset()`, which the test caught). Banner `src/components/consent-banner/`; "Analytics preferences" in the footer reopens it. The banner sits above the landing page's Skip button on narrow screens (it covered it before — caught by the screenshot spec).
- **Legal footer** `src/components/legal-links/` on the landing page and in the room settings. Pages carry a visible DRAFT notice until `draft` is set to false (Q1.8-a); they use system fonts and no third-party requests.
- **Account deletion**: callable `deleteAccount` (`functions/src/delete-account.ts`) → deletes publicProfiles cards, the whole `workspaces/{ws}/users/{uid}` tree, userProfiles, notifications, `users/{uid}` (+rateLimits), billing, usage, audit logs, `billing_orphans` carrying the user's email, Storage files under the user's prefix, then the Auth user last (so a failed run can be retried). It refuses while a subscription is renewing (`failed-precondition` with the customer-portal link). Settings → "Delete account" (`src/profile/delete-account.ts`) auto-downloads the JSON export, requires typing DELETE, then wipes IndexedDB/localStorage/sessionStorage and returns to the landing page.
- Emulator config now also runs the Functions and Storage emulators (`firebase.json`, `functions/.env.demo-marginalia` with the local origin allow-list); `npm run test:e2e:emu` and `test:rules:emu` use them.

Not verified
- The `<error-banner>` component named in CLAUDE.md does not exist in the codebase; deletion errors use an inline `role="alert"` message like the rest of Settings.
- Nothing ran against a deployed Firebase project: Storage deletion is exercised only as a call (the e2e run uses the Storage emulator without any uploaded files).
- Text review: Q1.8-a…f in `docs/open-questions.md`.
