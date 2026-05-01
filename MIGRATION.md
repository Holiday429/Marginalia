# P0 Foundation Migration

> **For every Claude Code session working on this codebase:** read this file first. It is the source of truth for the migration in progress. Old and new patterns coexist temporarily — see Status below for what's done and what's next.

---

## Status

- **Current phase:** 1 of 8 (in progress)
- **Last session ended at:** N/A — migration begun this session
- **Last commit relevant to migration:** p0(phase-1): add package.json and vite config
- **Next concrete action:** Phase 1, verification — run `npm run dev` and confirm all views boot

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

### Phase 1: Vite + npm scripts ⬜ TODO

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

### Phase 2: TypeScript opt-in (allowJs) ⬜ TODO

**Goal:** Enable TypeScript checking with `allowJs: true` so existing `.js` keeps working, but new files can be `.ts` and progressive typing becomes possible.

**Tasks:**
- [ ] Create `tsconfig.json` with `allowJs: true`, `checkJs: false`, `strict: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `noEmit: true`
- [ ] Wire `npm run typecheck` to `tsc --noEmit`
- [ ] Add a single trivial `.ts` file (e.g., `src/core/version.ts` exporting an app version constant) to prove the toolchain works
- [ ] CI / pre-commit hook: typecheck must pass

**Verification:**
- `npm run typecheck` exits 0
- Importing the new `.ts` file from a `.js` file works at runtime

---

### Phase 3: `window.X` → `M.*` namespace ⬜ TODO

**Goal:** Collapse all `window.X` globals onto a single `window.M` root, accessed via ES imports. This is the largest mechanical change in P0.

**Inventory** (current globals to eliminate, from grep):
`BOOKS`, `SHELF_BOOKS`, `BOOK_BY_ID`, `BOOK_DETAILS`, `BOOK_TYPES`, `BookTypes`, `BOOKLIST_CURATED`, `__SEED_SAPIENS`, `PanelRegistry`, `AIFeatureRegistry`, `AI_PROMPTS`, `NotesStore`, `BooksStore`, `MarginaliaAuth`, `MarginaliaDB`, `MarginaliaBooksCloud`, `MarginaliaStorage`, `MARGINALIA_FIREBASE`, `AIGenerateUI`, `renderPrimaryHeader`, `App`, `initShelf`, `enterShelf`, `initLibrary`, `enterLibrary`, `initBook`, `enterBook`, `initMap`, `enterMap`, `initWeb`, `enterWeb`, `initBooklist`, `enterBooklist`.

**Tasks:**
- [ ] Create `src/core/namespace.ts` exporting a single root: `export const M = { data: {}, store: {}, services: {}, ui: {}, ai: {}, three: {} } as MarginaliaRoot;`
- [ ] Type definitions for each namespace branch in `src/core/namespace.types.ts`
- [ ] For each existing global, in dependency order:
  - Convert its source file to export the symbol via ES export
  - Register it onto `M` in `src/main.js`
  - Add a temporary `window.X = M.x.y; // TODO(p0-cleanup): remove after phase 3` shim
  - Replace **callers** to import from the source file directly (not via `window` and not via `M.*`)
  - Once all callers are converted, drop the shim
- [ ] Final grep: `grep -rn "window\." src/` should return only legitimate browser API uses (`window.matchMedia`, `window.addEventListener`, etc.)

**Verification:**
- `grep -rn "window\.BOOKS\|window\.NotesStore\|window\.AIFeatureRegistry\|..." src/` returns 0
- All views still load and work
- `npm run build` succeeds

**Pitfall:** Do not try to move `App` (the SPA router) into `M` until everything else is done — too many call sites depend on `App.show()` being globally available. Convert `App` last.

---

### Phase 4: Environment split (dev / prod Firebase) ⬜ TODO

**Goal:** Separate Firebase projects for development and production. Source-of-truth config selection via env file.

**Tasks:**
- [ ] Create a second Firebase project: `marginalia-dev` (the existing one becomes `marginalia-prod`)
- [ ] Add `.env.development` and `.env.production` (both gitignored), `.env.example` (committed) showing required keys
- [ ] Create `src/core/env.ts` that reads `import.meta.env.*` and exports a typed `ENV` object
- [ ] Replace `MARGINALIA_FIREBASE` config with values from `ENV`
- [ ] Update `.firebaserc` and `firebase.json` to support project aliases (`firebase use dev` / `firebase use prod`)
- [ ] Update GitHub Actions / Vercel / wherever you deploy: dev branch → dev project, main → prod project

**Verification:**
- `npm run dev` connects to `marginalia-dev` Firestore (verifiable in browser devtools network tab)
- `npm run build` with prod env connects to `marginalia-prod`
- Sign in to dev and prod separately — accounts do not leak across projects

**ADR:** Write `docs/decisions/0002-firebase-environment-split.md` documenting the project-alias scheme.

---

### Phase 5: AI gateway via Cloud Functions ⬜ TODO

**Goal:** Move all Anthropic API calls server-side. Client never touches the API key.

**Tasks:**
- [ ] Create `functions/` workspace (`functions/package.json`, separate from root)
- [ ] Implement `functions/src/ai-generate.ts`: HTTP function that
  1. Verifies Firebase auth ID token
  2. Looks up user's `entitlements` and `quota` from Firestore
  3. Resolves prompt by `featureId` from a server-side prompt registry (mirror of client `src/ai/features/`)
  4. Calls Anthropic with the resolved prompt
  5. Writes audit log to `audit/ai_calls/{uid}/{timestamp}`
  6. Decrements `quota.aiCreditsRemaining`
  7. Returns generated content
- [ ] Update `src/services/ai-gateway.ts` (the renamed `src/ai/client/api.js`) to call `https://<region>-<project>.cloudfunctions.net/aiGenerate` instead of Anthropic directly
- [ ] **Revoke the old Anthropic API key** that was exposed client-side; rotate to a new one stored in Firebase Functions secrets
- [ ] Rate limit: token bucket per user (start with 10 calls / minute, 200 / day)

**Verification:**
- `grep -rn "anthropic\|claude\|sk-ant" src/` returns nothing
- A test AI generation in Library / Book view succeeds end-to-end
- Audit log row appears in Firestore for each call
- Quota decrements correctly; second call after quota exhaustion returns a clear error

**ADR:** Write `docs/decisions/0003-ai-gateway-via-firebase-functions.md`.

---

### Phase 6: Entitlements schema + store ⬜ TODO

**Goal:** Frame every gated feature on `entitlements`, never on `plan === 'pro'` strings.

**Tasks:**
- [ ] Define `Entitlement` union type in `src/data/schema/entitlements.ts` (see `CLAUDE.md` § Entitlements)
- [ ] Define `Plan` type and `PLAN_ENTITLEMENTS` mapping in same file
- [ ] On user sign-in / first-write, ensure user doc has `plan: 'free'` and resolved `entitlements: PLAN_ENTITLEMENTS.free` in `users/{uid}`
- [ ] Create `src/store/entitlements-store.ts` exposing `hasEntitlement(id)`, `subscribe(callback)`, and an event emitter on changes
- [ ] Audit existing code for any hardcoded "is Pro" checks; replace them all with `hasEntitlement('feature-x')`
- [ ] Add an ESLint rule (or grep check in CI) that bans `user.plan === 'pro'` patterns

**Verification:**
- New users get the correct default entitlements written to their user doc
- A test toggling `entitlements` in Firestore live-updates the UI

---

### Phase 7: Firestore schema versioning + Zod validation ⬜ TODO

**Goal:** Every Firestore write is validated and tagged `_v: 1`. Read paths handle missing `_v` as legacy.

**Tasks:**
- [ ] Install Zod
- [ ] Define schemas in `src/data/schema/` for `Book`, `Highlight`, `ReadingSession`, `Action`, `LibraryLayout`
- [ ] Wrap all write paths in `services/db.ts` with: validate via Zod → add `_v: 1`, `_createdAt`, `_updatedAt` → write
- [ ] Read paths: if doc has no `_v`, treat as legacy (v0) and migrate-on-read where safe
- [ ] Document migration strategy in `docs/decisions/0004-schema-versioning.md`

**Verification:**
- All Firestore docs created post-migration have `_v: 1`
- A deliberately malformed write is rejected with a useful error
- Legacy docs still readable

---

### Phase 8: Sentry, PostHog, security audit ⬜ TODO

**Goal:** Production observability + airtight access rules before public beta.

**Tasks:**
- [ ] Install `@sentry/browser` and `@sentry/node` (for functions)
- [ ] Wire init in `src/main.js` and in each Cloud Function entry
- [ ] Create `src/services/analytics.ts` exposing `logEvent(name, props)` and `logError(err, context)`
- [ ] Replace all `console.warn` / `console.error` in `src/` with `logger.warn(category, msg)` (PRODUCTION code only — keep in tooling)
- [ ] Install PostHog, init with env-driven token, capture pageviews + key product events (book_added, highlight_saved, ai_generated, session_ended)
- [ ] Audit `firestore.rules`: every collection requires `request.auth.uid == userId` match; deny by default
- [ ] Audit `storage.rules`: cover uploads only to `users/{uid}/covers/`, image MIME enforced, ≤ 2MB
- [ ] Add a smoke test that two anonymous users cannot read each other's data

**Verification:**
- A deliberately thrown error in dev shows up in Sentry
- PostHog dashboard shows test events
- Firestore rules emulator: cross-user read attempt fails with permission denied

---

## After P0

P0 is the floor. After phase 8 ships, the next priorities (P1) are documented in `CLAUDE.md` § Roadmap. Do not start P1 work in the same branch as P0.

---

## Glossary

- **ADR** — Architecture Decision Record. A short markdown file under `docs/decisions/` capturing a non-obvious decision, why it was made, and what alternatives were rejected.
- **Bridge code** — Temporary compatibility shim (e.g., `window.X = M.x.y`) that allows the migration to land in pieces. Always tagged `TODO(p0-cleanup)` and removed by a later phase.
- **Phase** — One unit of migration work, sized to fit in roughly one Claude Code session. Each phase ends with the app fully working.
