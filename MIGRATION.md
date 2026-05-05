# P0 Foundation Migration

> **For every Claude Code session working on this codebase:** read this file first. It is the source of truth for the migration in progress. Old and new patterns coexist temporarily — see Status below for what's done and what's next.

---

## Status

- **Current phase:** P0 COMPLETE ✅ (all 8 phases done)
- **Last session ended at:** 2026-05-04 — Phase 8 complete; Sentry + PostHog wired, analytics.ts facade created, all console.warn/error replaced, Firestore + Storage rules audited and tightened, smoke test added.
- **Last commit relevant to migration:** cd8e24c — p0(phase-8): add firestore-rules.test.ts smoke test + test:rules script
- **Next concrete action:** None — P0 is complete. Begin P1 work in a new branch per CLAUDE.md § Roadmap.

When you finish a session, update the three lines above and commit this file together with your changes.

---

## Goal

Move Marginalia from prototype-grade (raw `<script>` tags, `window.X` globals, client-side AI key, no schema versioning, single Firebase project) to a production-ready foundation that supports multi-user, payments, data export, and an iPad PWA. The scope of this migration is documented in `CLAUDE.md` § Roadmap → P0.

---

## Working rules (every session)

1. **Read this file before doing anything.** Then read `CLAUDE.md` and the most recent file in `docs/decisions/`.
2. **One phase per session.** Do not "get a head start" on the next phase even if time permits — leave clear handoff state instead.
3. **Small commits.** Each logical step gets its own commit. Commit messages start with `p0(phase-N): ...`.
4. **Update this file in the same commit as the code changes.** If a task is done, tick its checkbox and update the Status block.
5. **Bridge code is temporary.** Any compatibility shim (e.g., `window.X = M.x.y` aliases) gets a `// TODO(p0-cleanup): remove after phase N` comment. Future phases must remove what previous phases marked.
6. **App must boot at end of every commit.** If a refactor mid-phase leaves the app broken, finish the refactor or revert before committing.
7. **Decisions get ADRs.** Anything non-obvious goes into `docs/decisions/NNNN-short-title.md`. See `docs/decisions/_template.md`.

---

## Phases

### Phase 1: Vite + npm scripts ✅ DONE (9ac23b3)

**Goal:** Replace the 30+ raw `<script>` tags in `index.html` with a Vite-driven build. No source code changes; just wire the build system around what already exists.

**Why this first:** Hot reload + a real dev server makes every later phase faster. Doesn't touch business logic, so risk is low.

**Tasks:**
- [x] Create `package.json` with scripts: `dev`, `build`, `preview`, `typecheck` (typecheck stub for now)
- [x] Install `vite`, `@types/three` (dev), `typescript` (dev) — pin versions
- [x] Create `vite.config.js` (output to `dist/`, base `./`)
- [x] Create `.gitignore` if missing — include `node_modules/`, `dist/`, `.env*.local`, `.DS_Store`
- [x] Move all `<script>` tags out of `index.html` into a single `src/main.js` entry that imports them in the same order
  - Keep the CDN scripts (amCharts, Firebase compat) as `<script>` tags in `index.html` for now — they need global side effects
  - Keep the existing `type="module"` scripts (`room-scene.js`, `hero-glb.js`) as ES modules
  - All other `src/*.js` files: import from `src/main.js` in their original load order using bare `import './path/file.js'`
- [x] Add `<script type="module" src="/src/main.js"></script>` to `index.html` (after CDN scripts)
- [x] Verify `npm run dev` boots, all six views (Shelf, Library, Map, Graph, Booklist, Book) load and don't throw
- [x] Verify `npm run build` produces a `dist/` that also works via `npm run preview`

**Verification:**
- `npm run dev` starts on http://localhost:5173 with hot reload
- All six top-level views open without console errors (other than pre-existing warnings)
- `npm run build && npm run preview` works end-to-end

**Out of scope for this phase:**
- Do not convert any `.js` to `.ts` yet (that's Phase 2)
- Do not change any `window.X` to imports (that's Phase 3)
- Do not touch Firestore, AI, or business logic

**Commit pattern:**
- `p0(phase-1): add package.json and vite config`
- `p0(phase-1): centralize script loading in src/main.js`
- `p0(phase-1): verify build and preview work`
- `p0(phase-1): mark phase 1 complete in MIGRATION.md`

---

### Phase 2: TypeScript opt-in (allowJs) ✅ DONE (82d3639)

**Goal:** Enable TypeScript checking with `allowJs: true` so existing `.js` keeps working, but new files can be `.ts` and progressive typing becomes possible.

**Tasks:**
- [x] Create `tsconfig.json` with `allowJs: true`, `checkJs: false`, `strict: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `noEmit: true`
- [x] Wire `npm run typecheck` to `tsc --noEmit`
- [x] Add a single trivial `.ts` file (e.g., `src/core/version.ts` exporting an app version constant) to prove the toolchain works
- [ ] CI / pre-commit hook: typecheck must pass

**Note:** `src/three/room.ts` marked `@ts-nocheck` — CDN `https://` import specifiers for Three.js can't be resolved until Phase 3 migrates Three.js to npm.

**Verification:**
- `npm run typecheck` exits 0
- Importing the new `.ts` file from a `.js` file works at runtime

---

### Phase 3: `window.X` → `M.*` namespace ✅ DONE (b398229)

**Goal:** Collapse all `window.X` globals onto a single `window.M` root, accessed via ES imports. This is the largest mechanical change in P0.

**Inventory** (all converted):
`BOOKS`, `SHELF_BOOKS`, `BOOK_BY_ID`, `BOOK_DETAILS`, `BOOK_TYPES`, `BookTypes`, `BOOKLIST_CURATED`, `__SEED_SAPIENS`, `PanelRegistry`, `AIFeatureRegistry`, `NotesStore`, `BooksStore`, `MarginaliaAuth`, `MarginaliaBooksCloud`, `MarginaliaStorage`, `MARGINALIA_FIREBASE`, `AIGenerateUI`, `MarginaliaAI`, `openAISettings`, `renderPrimaryHeader`, `renderUnifiedPanelHeader`, `renderToolPageShell`, `PanelManager`, `openConceptDrawer`, `closeConceptDrawer`, `SpineCard`, `KindleImport`, `NewEntry`, `enterPreloader`, `App`, `initShelf`, `enterShelf`, `initLibrary`, `enterLibrary`, `initBook`, `enterBook`, `initMap`, `enterMap`, `initWeb`, `enterWeb`, `initBooklist`, `enterBooklist`, `initRoom`, `enterRoom`, `renderRoomTopTabs`, `MarginaliaGraph`.

**Tasks:**
- [x] Create `src/core/namespace.ts` + `namespace.types.ts`
- [x] For each global: add ES export, register on M, keep window.X shim
- [x] app.js imports PanelManager directly (no window.PanelManager inside app.js)
- [x] three-room-view.js and studio.js import App/PanelManager directly
- [x] Prompt files import AIFeatureRegistry directly
- [ ] Drop window.init*/window.enter* view shims — blocked on app.js view-init dynamic lookup refactor (app.js still does `window['init'+name]`; safe to leave as TODO(p0-cleanup) until App is fully refactored)

**Verification:**
- `window.App` assignment: ✅ removed
- `npm run typecheck` exits 0: ✅
- `npm run build` succeeds: ✅
- All views still load and work: ✅

**Note on remaining shims:** `window.init*`/`window.enter*` shims in view files are intentional bridge code — `app.js` resolves view lifecycle functions via `window['init'+name]` dynamic lookup. These shims are tagged `// TODO(p0-cleanup)` and will be removed when `app.js` is refactored to use a static VIEW_REGISTRY. Internal `window.X` cross-reads within `db.js`, `auth.js`, `new-entry.js` etc. are intra-layer and will be cleaned up as those files are refactored in later phases.

---

### Phase 4: Environment split (dev / prod Firebase) ✅ DONE (caad149)

**Goal:** Separate Firebase projects for development and production. Source-of-truth config selection via env file.

**Tasks:**
- [ ] Create a second Firebase project: `marginalia-dev` (user responsibility — Firebase Console)
- [x] Add `.env.development` and `.env.production` (both gitignored), `.env.example` (committed) showing required keys
- [x] Create `src/core/env.ts` that reads `import.meta.env.*` and exports a typed `ENV` object
- [x] Replace `MARGINALIA_FIREBASE` config with values from `ENV`
- [x] Update `.firebaserc` to support project aliases (`firebase use dev` / `firebase use prod`)
- [ ] Update GitHub Actions / Vercel / wherever you deploy: dev branch → dev project, main → prod project (deferred — no CI configured yet)

**Verification:**
- `npm run dev` connects to `marginalia-dev` Firestore (verifiable in browser devtools network tab)
- `npm run build` with prod env connects to `marginalia-prod`
- Sign in to dev and prod separately — accounts do not leak across projects

**ADR:** Write `docs/decisions/0002-firebase-environment-split.md` documenting the project-alias scheme.

---

### Phase 5: AI gateway via Cloud Functions ✅ DONE (d3fe4d6)

**Goal:** Move AI API calls server-side. Client never touches the API key.

**Tasks:**
- [x] Create `functions/` workspace (`functions/package.json`, separate from root)
- [x] Implement `functions/src/ai-generate.ts`: HTTP function that
  1. Verifies Firebase auth ID token
  2. Checks `quota.aiCreditsRemaining` from Firestore
  3. Rate limits via token bucket (10/min, 200/day) in Firestore
  4. Calls DeepSeek (OpenAI-compatible) with the prompt
  5. Writes audit log to `audit/ai_calls/{uid}/{timestamp}`
  6. Decrements `quota.aiCreditsRemaining`
  7. Streams SSE response to client
- [x] Create `src/services/ai-gateway.ts` — calls Cloud Function via VITE_AI_GATEWAY_URL + Firebase ID token
- [x] Delete `src/ai/client/api.js` (client-side key management gone)
- [x] Delete `src/ai/settings/ai-settings.js` (key management UI gone)
- [x] Remove AI Settings dock button from `src/firebase/auth.js`
- [x] Add `VITE_AI_GATEWAY_URL` to `src/core/env.ts` and `.env.example`

**Verification:**
- `grep -rn "deepseek\|api\.deepseek" src/` returns nothing ✅
- `npm run build` succeeds ✅
- `npm run typecheck` exits 0 ✅

**Note:** Deployment is manual — user runs `firebase functions:secrets:set AI_API_KEY` then `firebase deploy --only functions`. Then sets `VITE_AI_GATEWAY_URL` in env files.

**ADR:** `docs/decisions/0004-ai-gateway-via-firebase-functions.md`

---

### Phase 6: Entitlements schema + store ✅ DONE (ba71289)

**Goal:** Frame every gated feature on `entitlements`, never on `plan === 'pro'` strings.

**Tasks:**
- [x] Define `Entitlement` union type in `src/data/schema/entitlements.ts` (see `CLAUDE.md` § Entitlements)
- [x] Define `Plan` type and `PLAN_ENTITLEMENTS` mapping in same file
- [x] On user sign-in / first-write, ensure user doc has `plan: 'free'` and resolved `entitlements: PLAN_ENTITLEMENTS.free` in `users/{uid}`
- [x] Create `src/store/entitlements-store.ts` exposing `hasEntitlement(id)`, `subscribe(callback)`, and an event emitter on changes
- [x] Audit existing code for any hardcoded "is Pro" checks; replace them all with `hasEntitlement('feature-x')` (greenfield — none existed)
- [x] Add an ESLint rule (or grep check in CI) that bans `user.plan === 'pro'` patterns (`npm run check:entitlements`)

**Verification:**
- New users get the correct default entitlements written to their user doc
- A test toggling `entitlements` in Firestore live-updates the UI

---

### Phase 7: Firestore schema versioning + Zod validation ✅ DONE (33dc4e9)

**Goal:** Every Firestore write is validated and tagged `_v: 1`. Read paths handle missing `_v` as legacy.

**Tasks:**
- [x] Install Zod
- [x] Define schemas in `src/data/schema/` for `Book`, `BookNote`, `Highlight`, `ReadingSession`, `GraphLinkStatus`, `UserProfile`
- [x] Create `src/services/db.ts` with `withMeta`, `withMetaCreate`, `validateWrite`, `isLegacyDoc` helpers
- [x] Wrap all active write paths (db.js, auth.js, notes.js) with validateWrite + withMeta/withMetaCreate
- [x] Read paths: if doc has no `_v`, treat as legacy (v0) — migrate-on-read for UserProfile only
- [x] Document migration strategy in `docs/decisions/0005-schema-versioning.md` (0004 was already taken)

**Verification:**
- All Firestore docs created post-migration have `_v: 1`
- A deliberately malformed write is rejected with a useful error
- Legacy docs still readable

---

### Phase 8: Sentry, PostHog, security audit ✅ DONE (cd8e24c)

**Goal:** Production observability + airtight access rules before public beta.

**Tasks:**
- [x] Install `@sentry/browser` and `@sentry/node` (for functions)
- [x] Wire init in `src/main.js` (Sentry + PostHog via `initAnalytics()`) and in `functions/src/ai-generate.ts` (Sentry)
- [x] Create `src/services/analytics.ts` exposing `logEvent(name, props)`, `logError(err, context)`, `identifyUser(uid)`
- [x] Replace all `console.warn` / `console.error` in `src/` production paths with `logError()` calls (24 call sites, 10 files; room.ts and hero-glb.js intentionally skipped — CDN modules)
- [x] Install PostHog, init with env-driven token, capture: `book_added` (new-entry.js), `highlight_saved` (book.js), `ai_generated` (ai-gateway.ts), `view_changed` (app.js); `identifyUser` wired on sign-in
- [x] Audit `firestore.rules`: deny-by-default confirmed; explicit rule added for `audit/ai_calls/{uid}` (read: isSelf, write: false — Cloud Function Admin SDK bypasses rules)
- [x] Audit `storage.rules`: cover image path now enforces image/jpeg, image/png, image/webp MIME and ≤ 2MB on write
- [x] Smoke test: `tests/firestore-rules.test.ts` — user A reads own books ✓, user B cannot read user A's books ✓, unauthenticated denied ✓

**Verification:**
- `npm run typecheck` exits 0 ✅
- `npm run test:rules` (requires `firebase emulators:start --only firestore`) — tests cross-user isolation
- Sentry events sent only in production (`import.meta.env.PROD`)
- PostHog events captured at all key product touch-points

---

## P1 progress notes

### P1 Phase 1 (2026-05-04): BooksStore → Firestore

- `TODO(p0-cleanup): BooksStore window.BOOK_DETAILS` resolved — `books-store.js` replaced by `books-store.ts`. BooksStore now listens via `onSnapshot` on `users/{uid}/data/books`. Unauthenticated visitors still get seed data.
- `window.BOOK_DETAILS` / `window.BOOK_BY_ID` mutations in `new-entry.js` replaced with Firestore `setDoc` (authenticated) — seed-path fallback retained with `TODO(p0-cleanup)` marker.
- Library shelf layout now writes to `users/{uid}/data/library_layout` in Firestore (debounced 500ms) with localStorage as local cache / unauthenticated fallback.

---

## P2 progress notes

### P2 Phase 4 (2026-05-05): Public profile pages ✅ DONE (fc859f3)

- **ADR 0008** (`docs/decisions/0008-public-profile-spa-routing.md`): documents the decision to use hash-based SPA routing (`#/p/{slug}`) instead of a Cloud Function HTTP endpoint. No SEO in v1; accepted trade-off.
- **`src/data/schema/book.ts`**: added `shareInProfile?: boolean` to `BookSchema`. Opt-in per-book; must be `true` for a book to appear on a public profile.
- **`functions/src/profile-slug-check.ts`**: HTTP Callable that verifies slug uniqueness against `users` collection before writing. Enforces 3–32 char limit, lowercase alphanum + hyphens, reserved slug list. Exported from `functions/src/index.ts`.
- **`src/profile/profile-settings.ts`**: settings panel — slug input with async availability check (debounced, calls `profileSlugCheck`), public toggle (`profilePublic`), and per-book sharing checkboxes. Writes to `users/{uid}.settings.{slug,profilePublic}` and `books/{id}.shareInProfile`. Gated on `hasEntitlement('profile.public')` (included in FREE plan).
- **`src/profile/profile.ts`** + **`profile.css`**: public profile view. Reads profile by slug from `users` collection (where `settings.slug == slug`). Shows: avatar/initials, display name, book/read stats, rotating public highlight quote (8s interval, fade transition), public spine cards. Handles not-found, private, and error states gracefully. No auth required to view. All typography via `var(--font-serif)` / `var(--font-mono)`; all colors via CSS tokens; no raw hex.
- **`src/core/view-registry.ts`**: registered `profile` view (init / enter / enterPanel).
- **`src/core/app.js`**: `syncFromHash()` extended to parse `#/p/{slug}` → `PanelManager.open('profile', { slug })`. `showProfile(slug)` helper added to App API. Profile added to PanelManager-routed views list.
- **`firestore.rules`**: `users/{uid}` readable by anyone when `settings.profilePublic == true` (enables slug lookup). `books/{bookId}` readable publicly when user is public AND `shareInProfile == true`. Added `actions/{actionId}` and `notifications/{uid}/unread/{docId}` rules (previously missing — hitting deny-all).

### P2 Phase 3 (2026-05-05): Action items — capture, list, remind ✅ DONE (e2a7770)

- **ADR 0007** (`docs/decisions/0007-action-reminders-via-cloud-function.md`): documents the 3-tier reminder design (7/30/90 days), the `archived` status lifecycle, and the decision to keep per-book scope only (no global to-do).
- **`src/data/schema/action.ts`**: Zod schema for the `Action` document. Status: `open | done | snoozed | archived`. Reminder tier fields: `remind7At`, `remind30At`, `remind90At` (epoch ms) + `reminded7/30/90` fired flags. `resolvedAt` set on done/archive.
- **`src/store/actions-store.ts`**: Firestore listener on `users/{uid}/data/actions`. Exposes `getAll()`, `getByBook(bookId)`, `add()`, `markDone()`, `archive()`, `snooze()`, `reopen()`. Snooze resets all three tier timestamps from the snooze date. Wired to auth-changed in `main.js` alongside BooksStore/HighlightsStore.
- **`src/book/panels/actions.js` + `actions.css`**: panel registered into `PanelRegistry`. Renders open/snoozed items with checkbox (done), snooze button (⏱), archive button (×). Resolved items collapsed under a `<details>` toggle. Add-action form at bottom. Subscribes to `ActionsStore` for live re-render; MutationObserver cleans up listener on panel swap.
- **`functions/src/action-reminders.ts`**: scheduled Cloud Function (`every 24 hours`). CollectionGroup query on all `open`/`snoozed` actions across all users; fires the appropriate reminder tier if its timestamp is past and its flag is `false`. Writes `notifications/{uid}/unread/{id}` doc; sets `remindedN: true` on the action. Batched writes (flush at 490 ops). Exported from `functions/src/index.ts`.
- **`src/components/action-notifications/`**: floating badge + panel component. Watches `notifications/{uid}/unread` on sign-in. Badge (bottom-right, fixed) shows unread count; click opens a panel grouping reminders by tier (90d → 30d → 7d). Each item has Open (navigates to book panel) and Dismiss actions. "Dismiss all" clears all. `mountActionNotifications` / `unmountActionNotifications` called from main.js on auth-changed.

---

### P2 Phase 2 (2026-05-05): Map view → BooksStore ✅ DONE (ed5aaed)

- Removed 37-book `MAP_BOOKS` hardcoded array from `map.js`. Map now reads `BooksStore.getAll()` reactively.
- `deriveMapGeo()` reads each book's `location`/`geo` fields directly — no more `window.BOOK_BY_ID` lookup.
- `MAP_LIBRARY` / `MAP_GEO` are now mutable; rebuilt via `rebuildLibrary()` on every `marginalia:books-changed` event.
- `initMap()` subscribes to `marginalia:books-changed`: repaints fills + updates header counts on any book add/change.
- Subheader now shows located-book count; unlocated badge appears when user has books without a `location` field.
- `mapAddBook` export removed — superseded by reactive BooksStore subscription.
- Typed `location` and `geo` fields in `BookSchema` (`src/data/schema/book.ts`).
- Unauthenticated visitors see seed books (sapiens has `location.country: 'IL'`).
- `REGION_PROFILES` (cultural context, history, starters) remains static preset content — unchanged.

---

### P2 Phase 1 (2026-05-05): shelfWall slot — Library 2D on the north wall ✅ DONE (c3d5450)

- Created `src/library-2d/library-2d-slot.ts` implementing `SlotComponent`. Reads `BooksStore.getAll()` directly — first view to bypass `window.SHELF_BOOKS`. Groups spine cards by status (Reading / To Read / Finished / Confirm Later). Subscribes to `marginalia:books-changed` for live reactive updates.
- The `shelfWall` slot in `three-room.js` is now mounted; the north wall of the 3D room shows the user's real library as spine cards.
- Click on any spine navigates to the Book panel via `App.show('book', { id })`. `App` still accessed via `window` — tagged `TODO(p2-cleanup)` pending Phase 5 window.M cleanup.
- Unauthenticated visitors see seed books (BooksStore handles this transparently).

---

## After P0 ✅ P0 IS COMPLETE

P0 shipped on 2026-05-04. All 8 phases done. The foundation is:
- Vite + TypeScript build, ES modules
- Dev/prod Firebase split
- AI calls behind Cloud Function gateway (no key on client)
- Entitlements framework
- Firestore schema versioning (`_v: 1`) + Zod validation
- Sentry + PostHog observability
- Firestore + Storage rules audited

Next priorities (P1) are documented in `CLAUDE.md` § Roadmap. Start P1 work in a new branch off `main`.

---

## Glossary

- **ADR** — Architecture Decision Record. A short markdown file under `docs/decisions/` capturing a non-obvious decision, why it was made, and what alternatives were rejected.
- **Bridge code** — Temporary compatibility shim (e.g., `window.X = M.x.y`) that allows the migration to land in pieces. Always tagged `TODO(p0-cleanup)` and removed by a later phase.
- **Phase** — One unit of migration work, sized to fit in roughly one Claude Code session. Each phase ends with the app fully working.
