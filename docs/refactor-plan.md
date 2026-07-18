# Marginalia — Code Structure Refactor Plan (Production Standard)

Status: planned · Owner: Holiday · Executor: Claude (one phase per session)
Scope: technical debt in code structure only. No product features, no visual changes.
Every phase must end with: app boots, all CI gates green, one commit (or small commit series) that is independently shippable.

## Debt inventory (verified 2026-07-18)

| # | Debt | Evidence |
|---|------|----------|
| 1 | Firebase **compat SDK via CDN `<script>` tags** (v10.12.2, 4 tags in `index.html:282-285`) | Wrappers `src/firebase/{config,auth,db}.js`; bare `firebase.` global consumed in `services/billing.ts`, `services/ai-gateway.ts`, `profile/profile-settings.ts` via `declare const firebase` |
| 2 | amCharts 5 via **5 eager CDN scripts** (`index.html:40-44`), incl. chinaHigh geodata, loaded on every first paint; used only by `src/map/map.js` + `src/profile/profile-map.ts` | D3 also CDN (lazy, `web.js:152`) |
| 3 | Remaining `window.*` globals: 4 assignments in `src/main.js:75-78` (for `generate-ui.ts` legacy reads) + scattered readers (`window.MarginaliaDB`, `window.PanelRegistry`, `window.MarginaliaStorage`) | CLAUDE.md declares these bugs |
| 4 | **No code splitting**: empty `vite.config.js`, single 1.5 MB JS bundle (464 KB br) + 341 KB CSS; 13 CSS `<link>` tags in `index.html`; `hero-glb.js` loaded as separate module script |
| 5 | JS/TS split ~61/57 files; core router `app.js`, `panel-manager.js`, `notes-store.js` untyped; 60 `: any`; `tsconfig.json` **excludes `src/three` + `src/three-room`** from typecheck |
| 6 | **Test surface: 2 files** (`tests/firestore-rules.test.ts`, `tests/export.test.ts`). No store/parser/component tests, no e2e. CI (`deploy.yml`) runs build only — no typecheck/lint/test gate |
| 7 | No ESLint; legacy fonts (Cormorant, Libre Caslon, Inter, Caveat) still in the Google Fonts request (`index.html:24`) because seed spine data references them |

## Phase order & rationale

```
P0 Safety net (CI gates + lint + smoke e2e)   ← protects everything after
P1 Firebase modular SDK                        ← highest risk; unblocks bundling & TS of firebase layer
P2 Kill remaining window globals               ← small, finishes M-namespace migration
P3 Dependencies & bundle architecture          ← needs P1 (firebase in bundler graph)
P4 TypeScript completion                       ← after P1/P3 so files aren't converted twice
P5 Test coverage to production bar             ← locks the refactored shape in
```

Rules for the executor (every phase):
- Never mix a behavior change with a rename/conversion in the same commit.
- Preserve public API surfaces (`MarginaliaAuth`, `MarginaliaStorage`, store events like `marginalia:books-changed`) unless the phase says otherwise.
- After each phase run: `npm run typecheck && npm run check:entitlements && npx vitest run && npm run build` + the Playwright smoke test (after P0 exists).
- Follow existing CLAUDE.md conventions (tokens-only CSS, `withMeta` writes, `hasEntitlement`, no `console.log`).

---

## Phase 0 — Safety net ✅ done (branch `refactor/p0-safety-net`)

Goal: make every later refactor verifiable before touching any production code.

Landed: `eslint.config.js` (flat config, window/firebase/am5/d3 bans as `warn`, pre-existing
style issues downgraded to `warn` to keep the gate at 0 errors), `tests/e2e/smoke.spec.ts`
(5 Playwright tests against a production build: preloader→room, search seed books, book
detail panel, map, graph), `playwright.config.ts` (drives `vite build` + `vite preview` on
port 4173), `.github/workflows/ci.yml` (lint/typecheck/typecheck:room/check:entitlements →
unit-tests + rules-tests (firebase emulator) + build + e2e), `deploy.yml` now triggers on
`workflow_run` of CI success instead of raw push. `vite.config.js` gained a `test.exclude`
so vitest and Playwright never collect each other's spec files. New scripts: `lint`,
`test:unit` (vitest minus the emulator-only rules test), `test:e2e`.

Verified: a deliberately broken `window.Foo =` triggers the lint rule; a deliberately
broken `#skipBtn` id fails all 5 e2e tests; both were reverted before commit. Known
pre-existing runtime issue (not introduced here, not fixed here): a page error
`Cannot read properties of undefined (reading 'image')` fires during room boot — the
smoke suite allowlists this one known string so it doesn't mask *new* errors, per
`KNOWN_ERROR_SUBSTRINGS` in `smoke.spec.ts`.

Also noted, out of scope for P0: `.npm-cache/` is tracked in git (should not be) —
flag for cleanup separately; pre-existing `npm audit` findings in `dompurify`/`protobufjs`
(transitive via `firebase`/`posthog-js`) are unrelated to this phase's new devDependencies.

1. **ESLint (flat config, `eslint.config.js`)** with `typescript-eslint`. Key rules:
   - `no-restricted-globals` / `no-restricted-syntax`: ban `window.<PascalCase> =` assignments, bare `firebase`, `am5`, `d3` identifiers (start as `warn`, flipped to `error` in P2/P3 as each is removed).
   - `no-console` (`error`, allow `console.error` + the one `console.debug` version line or route it through analytics).
   - `@typescript-eslint/no-explicit-any`: `warn` (flipped to `error` in P4).
   - Add `npm run lint`.
2. **Playwright smoke e2e** (`playwright-core` is already a devDependency; add `@playwright/test`):
   - `tests/e2e/smoke.spec.ts`, unauthenticated demo path only: load `/` → preloader renders → enter library → search view shows seed books → open a book detail panel → navigate to map → navigate to graph. Assert no uncaught page errors.
   - Script: `npm run test:e2e` (starts `vite preview` of a fresh build).
3. **CI gates**: new `ci.yml` (on PR + push) running `lint`, `typecheck`, `typecheck:room`, `check:entitlements`, `vitest run`, `build`, `test:e2e`. Make `deploy.yml` depend on the same job set (job-level `needs` or reuse via workflow_call).

Done when: CI is red on a deliberately introduced `window.Foo =` and green on main.

## Phase 1 — Firebase modular SDK migration

Goal: `npm i firebase`, delete the 4 compat CDN `<script>` tags, everything imports Firebase as ES modules. Highest-risk phase — do it early and alone.

1. `src/firebase/config.js` → `config.ts`: `initializeApp` from typed `ENV`; export `app`, `auth`, `db`, `storage` singletons (`getAuth`, `getFirestore`, `getStorage`).
2. `src/firebase/auth.js` (574 lines) → `auth.ts` on the modular API (`signInWithPopup`, `GoogleAuthProvider`, `createUserWithEmailAndPassword`, `signInWithEmailAndPassword`, `onAuthStateChanged`, …). **Keep the `MarginaliaAuth` public surface byte-compatible** — enumerate its methods/fields first and write a checklist into the PR description. Auth persistence is IndexedDB in both SDKs → existing sessions survive; verify explicitly.
3. `src/firebase/db.js` → `db.ts` (`MarginaliaStorage`, `MarginaliaBooksCloud`) on modular Firestore/Storage (`doc`, `collection`, `onSnapshot`, `ref`, `uploadBytes`, …).
4. Export a `getIdToken(): Promise<string | null>` helper from `auth.ts`; replace the three `declare const firebase` blocks (`services/billing.ts`, `services/ai-gateway.ts`, `profile/profile-settings.ts`) with imports of it.
5. Sweep stores (`books-store.ts`, `highlights-store.ts`, `actions-store.ts`, `notes-store.js`, `entitlements-store.ts`) and any other `firebase.` consumers to import the singletons from `firebase/config.ts`.
6. Remove the 4 CDN tags from `index.html`. Flip the ESLint `firebase` global ban to `error`.

Done when: Google popup login, email signup/login, logout, Firestore live listeners, Storage cover upload, AI generate (ID token path), and checkout URL fetch all work against the dev project; rules tests + smoke e2e green; no `firebase-*-compat` request in the network panel.

Risk notes: compat and modular share the same underlying auth state — do NOT wrap in a try/catch that silently falls back; fail loud. Watch for `serverTimestamp()`/`FieldValue` usages in `withMeta` (`services/db.ts`) needing modular imports.

### Phase 1 ✅ done (branch `refactor/p1-firebase-modular-sdk`)

Landed: `npm i firebase@^12` (pinned to satisfy `@firebase/rules-unit-testing`'s peer range, not the old `10.12.2` CDN version — API surface used here is unaffected). `firebase/config.ts` exports `firebaseApp`/`firebaseAuth`/`firestoreDb`/`firebaseStorage`/`firebaseFunctions` singletons. `auth.ts` and `db.ts` rewritten on the modular API; `MarginaliaAuth`/`MarginaliaBooksCloud`/`MarginaliaStorage` public surfaces preserved. Added `getIdToken()` export from `auth.ts`, consumed by `billing.ts` and `ai-gateway.ts` (both `declare const firebase` blocks removed). `profile-settings.ts`'s Cloud Function call now uses `httpsCallable` from `firebase/functions` (previously called `window.firebase.functions()` — dead at runtime, since no `firebase-functions-compat.js` script tag was ever loaded). `services/db.ts`'s `serverTimestamp()` now imports the modular function directly. All 4 CDN `<script>` tags removed from `index.html`. Every `.collection().doc()...` compat chain across `profile.ts`, `profile-settings.ts`, `annual-shelf-store.ts`, `book.js`, `books-store.ts`, `highlights-store.ts`, `actions-store.ts`, `ai-results-store.ts`, `entitlements-store.ts`, `action-notifications.ts`, `reading-session.ts`, `library-2d.js`, `new-entry.js`, `main.js`, `claude-import.js`, `notes.js` rewritten to modular `doc()`/`collection()`/`query()`/`onSnapshot()` calls. ESLint: `firebase` bare-identifier ban split into its own `no-restricted-globals` rule at `error` (am5/d3 stay `warn`, still P3 scope).

**Bugs found and fixed as part of the sweep** (all were dead-`window.*` reads that silently no-op'd because nothing ever assigned `window.MarginaliaAuth` or — after this phase removed the old `config.js` self-assignment — `window.MARGINALIA_FIREBASE`; fixed by switching to direct imports, in scope because these files were already being touched):
- `entitlements-store.ts` — logged-in users' plan never synced from Firestore (silently stuck on `'free'`).
- `profile-settings.ts` — slug save, language save, profile-visibility save, section-visibility save all silently no-op'd.
- `actions-store.ts` — lazy-init fallback in `_colRef()` never fired.
- `books-store.ts`, `actions-store.ts`, `ai-results-store.ts`, `action-notifications.ts`, `new-entry.js` — workspace ID resolution silently fell back to `'default'` instead of the real workspace, because `config.js` used to self-assign `window.MARGINALIA_FIREBASE = {...}` and this phase's `config.ts` intentionally does not (that assignment is exactly the kind of thing P0/P2 exist to remove). Fixed by importing `MARGINALIA_FIREBASE` directly instead.
- `ai-results-store.ts` — `snap.exists()` was already being called as a function (modular convention) under the old compat code, where `.exists` is a boolean property — this would have thrown at runtime; now correct under the modular SDK.

**Bug found and left alone (pre-existing, not caused by this migration, out of scope)**: `registerWithUsername()` and the username branch of `loginWithIdentity()` (`auth.ts`) query `workspaces/{ws}/userProfiles` for username-uniqueness/lookup *before* the user is authenticated. `firestore.rules` requires `isSelf(uid)` (i.e. `request.auth != null`) to read that collection, so this query always fails with `permission-denied` — verified live against the dev project (`Missing or insufficient permissions.` surfaced in the auth gate UI). Confirmed via `git show HEAD:src/firebase/auth.js` that the original compat code had byte-identical logic order, so this is not a regression — **registration has likely never worked in production**. Flagged to the user; not fixed here since it's a logic/rules bug, not an SDK-migration concern.

Verified live against the `marginalia-dev-299f1` project (not just typecheck/build): zero `gstatic`/`firebase` compat script tags load; `signInWithEmailAndPassword` reaches real Firebase Auth and returns a properly-typed `auth/invalid-credential` error; Firestore's real-time `Listen` channel connects (HTTP 200); a real `createUserWithEmailAndPassword` + `userProfiles` uniqueness-check round-trip reaches Firestore (and correctly surfaces the pre-existing permission bug above — proof the query is actually executing, not silently swallowed).

## Phase 2 — Kill remaining window globals

Goal: zero `window.<PascalCase>` assignments; M namespace migration finished for real consumers.

1. `src/ai/client/generate-ui.ts`: replace `window.AIFeatureRegistry` / `window.BookTypes` / `window.MarginaliaAI` / `window.MarginaliaGraph` reads with direct ES imports. Delete `src/main.js:75-78` assignments.
2. Grep-driven sweep of remaining readers: `window.MarginaliaDB`, `window.PanelRegistry`, `window.MarginaliaStorage` → direct imports (use `M.*` only if a genuine circular-import knot appears; document any such case inline).
3. Tighten `src/core/namespace.types.ts`: replace `unknown` with real types for everything now imported/typed.
4. Flip the ESLint window-assignment ban to `error`.

Done when: `grep -rn "window\.[A-Z]" src` returns only browser APIs; smoke e2e green.

### Phase 2 ✅ done (branch `refactor/p2-kill-window-globals`)

**Actual scope was smaller than planned.** A full grep-driven inventory before touching code found the live surface was only 3 files: `src/main.js` (4 assignments), `src/ai/client/generate-ui.ts` (5 reads across `AIFeatureRegistry`/`BookTypes`/`MarginaliaAI`/`MarginaliaGraph`, plus a self-assignment on `AIGenerateUI` itself), and `src/services/ai-gateway.ts` (a `MarginaliaAI` self-assignment). The plan's step 2 (`window.MarginaliaDB`, `window.PanelRegistry`, `window.MarginaliaStorage` readers) turned out not to exist anywhere in the codebase — those were stale entries in the original P0 debt inventory, not live code. Also found and cleaned: a dead `window.AI_PROMPTS` read in `generate-ui.ts` (the global was never written anywhere — `AIFeatureRegistry.setPrompt()` is the real mechanism per CLAUDE.md; the read always fell through to `FALLBACK_PROMPT_VERSION`) and two stale doc comments (`book/panels/registry.js`, `ai/features/registry.js`) that described the old `window.X.set(...)` pattern instead of the real direct-import one.

**Verified no circular dependency** before converting: `generate-ui.ts`'s four targets (`ai/features/registry.js`, `data/schema/book-types.js`, `services/ai-gateway.ts`, `core/graph-data.js`) don't import `generate-ui.ts` back, directly or transitively. Confirmed live in-browser afterward (not just typecheck): all 5 window globals read `"undefined"`, and opening a nonfiction book's Visual Notes panel rendered a working "✦ AI · Generate mind map" toolbar — proof `AIFeatureRegistry.forBook()` executed correctly through the new direct imports.

**Found and deliberately left alone**: `src/core/namespace.ts` (the `M` root object) is imported in `main.js` but nothing in the entire codebase ever writes to or reads any `M.*` branch — it's fully dead code, not a partially-migrated bridge. This contradicts the plan's step 3 ("tighten `namespace.types.ts`" implies live branches worth typing precisely) and CLAUDE.md's description of `M` as "the migration target." User decision: leave `namespace.ts`/`namespace.types.ts` untouched — removing a documented architectural piece is a scope decision beyond a window-globals cleanup phase, flagged here for a separate discussion rather than acted on unilaterally.

**ESLint gotcha worth remembering for later phases**: flat config does not merge array-valued rule options across cascading config objects — the last matching object for a given rule name wins *entirely*, dropping earlier entries even in unrelated selectors. Verified this empirically (isolated repro, not assumption). This is why `no-restricted-syntax` now holds only `NO_WINDOW_ASSIGN` at `error`, and `firebase`/`am5`/`d3` were consolidated onto a single `no-restricted-globals` array at `warn` (`CDN_GLOBALS` in `eslint.config.js`) — `firebase` itself is fully removed and could theoretically sit at `error`, but doing so would require a fourth independent rule name; the real regression protection for `firebase` is that the compat package was uninstalled in P1, not the lint severity. If a future phase needs a third independent severity tier, budget time to either enumerate exact names via `no-restricted-properties`/`no-restricted-globals` (loses pattern generality) or reach for a plugin.

## Phase 3 — Dependencies & bundle architecture

Goal: all third-party code in the bundler graph; per-view lazy chunks; a size budget enforced in CI, not just measured after the fact.

Verified against real code before finalizing (2026-07-18): `map.js` already hand-rolls an amCharts readiness poll (`waitForAmCharts`, up to 100×80ms) because it's statically imported but amCharts loads async from a CDN `<script>` — converting to `await import()` removes real debt, not just cosmetic. `web.js`'s D3 "lazy load" is a second, undeclared CDN (`cdn.jsdelivr.net`, not in `index.html`'s script list) injected via a manually-created `<script>` tag. Actual D3 API surface used (`grep -oE "d3\.[a-zA-Z]+"`): `d3-force` (`forceSimulation`/`forceLink`/`forceManyBody`/`forceCollide`/`forceCenter`), `d3-selection` (`select`), `d3-zoom` (`zoom`/`zoomIdentity`), `d3-drag` (`drag`), `d3-scale` (`scaleSqrt`), `d3-array` (`max`/`min`) — 6 packages, not the 4 originally guessed. `profile-map.ts` uses `am5`/`am5map`/`am5themes_Animated`/`worldLow` only, never `chinaHigh` (map.js-only, larger geodata, good candidate for split-off lazy import). `app.js`'s `show()` and `panel-manager.js`'s `open()` are both synchronous today, and `open()` has a hand-tuned CSS transition (560ms enter / 360ms exit) — converting `VIEW_REGISTRY` to lazy loaders means these two functions must go async without blocking or breaking that animation timing; this is the highest-risk item in the phase and gets its own commit.

**`hero-glb.js` is explicitly out of scope.** `docs/window-cleanup.md` (an earlier, mostly-superseded planning doc) documents that its triple-loading — `index.html` `<script type="module">` + `hero-book.js` static import + `three-room-view.js` dynamic import — is intentional: `preloader.js`'s `waitForHeroGLBReady()` needs `window.__heroGLBReadyPromise` set before Vite's bundle graph even starts evaluating, which only works if it's a standalone module script parsed immediately by the HTML parser. Converting it to a bundled import would break that timing guarantee. Confirmed this is still live and accurate against current `preloader.js`.

Three deliberate deviations from a "ship it, measure later" approach, per production-standard requirement (2026-07-18 direction: prefer the correct end-state over patching the immediate problem):
- **`manualChunks` covers all four third-party dependencies** (three, firebase, amcharts, d3), not just three/firebase — otherwise Rollup's default heuristics may fragment amCharts/d3 into many small chunks instead of one predictable chunk per library.
- **Size budget is a CI gate (`size-limit`), not a number recorded in this file after the fact.** A budget nobody enforces regresses silently the first time someone adds a dependency.
- **`rollup-plugin-visualizer`** stays as a manual debugging tool (`npm run build:analyze`) — it does not double as the enforcement mechanism; `size-limit` owns that.

1. **amCharts → npm**: `@amcharts/amcharts5` + `@amcharts/amcharts5-geodata`. Remove the 5 CDN `<script>` tags from `index.html`. `map.js`: delete `waitForAmCharts` entirely, replace with `await Promise.all([import('@amcharts/amcharts5'), import('@amcharts/amcharts5/map'), import('@amcharts/amcharts5/themes/Animated'), import('@amcharts/amcharts5-geodata/worldLow')])` in `enterMap()`'s boot path; `chinaHigh` geodata imported separately, only when the China layer is actually requested. `profile-map.ts`: same dynamic-import pattern (no `chinaHigh`), delete all `(window as any).am5*` reads.
2. **D3 → npm**: `npm i d3-force d3-selection d3-zoom d3-drag d3-scale d3-array` (six packages, per the audit above). `web.js`: `enterWeb()` replaces `loadD3ThenBoot()` with a `Promise.all` of dynamic imports; every `d3.xxx` call becomes a destructured named import — no `d3` namespace object anywhere.
3. **View-level code splitting** (own commit, highest risk): `src/core/view-registry.ts` entries become `{ load: () => import('../map/map.js') }`. `app.js`'s `show()` becomes `async`: DOM visibility toggling, `data-view` assignment, and nav highlighting stay synchronous/immediate; only the `init`/`enter` call awaits `loader()`. `panel-manager.js`'s `open()` follows the same split — the 560ms CSS transition does not wait on the import; `init`/`enterPanel` fire whenever the import resolves (usually before the animation finishes; if not, a brief empty-panel-then-content is an acceptable degradation). `search` + `preloader` stay eager (default landing view). Audit all `App.show(...)` call sites (12+, found via grep) to confirm none assume synchronous-complete rendering.
4. **CSS with its chunk**: move 11 of the 13 per-view `<link rel="stylesheet">` tags into `import './x.css'` at the top of each view module (keep `base.css` + `preloader.css` in `index.html` — first-paint critical).
5. ~~`hero-glb.js`~~ — **skipped**, see above.
6. **`vite.config.js`**: `build.rollupOptions.output.manualChunks` — `three: ['three']`, `firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/functions']`, `amcharts: ['@amcharts/amcharts5', '@amcharts/amcharts5-geodata']`, `d3: ['d3-force', 'd3-selection', 'd3-zoom', 'd3-drag', 'd3-scale', 'd3-array']`. Add `rollup-plugin-visualizer` behind `npm run build:analyze` (debug tool, not a gate).
7. **Fonts**: migrate seed/mock spine data (`src/data/mock/seed-spines.js`, `src/data/seed/`) off Cormorant/Libre Caslon/Inter/Caveat onto the 3-font system, then cut those families (and their weights) from the Google Fonts URL.
8. **Bundle size CI gate**: `npm i -D size-limit @size-limit/file`. `package.json` `size-limit` array with per-chunk thresholds (entry ≤ 350 KB br; three/firebase/amcharts/d3 chunks each individually budgeted). New `npm run size` script. `ci.yml` gets a `size-check` job (`needs: build`) running `npm run build && npx size-limit` — over-budget fails the build, same enforcement tier as lint/typecheck.

Execution order: amCharts + D3 (lower risk, independently verifiable) → view-registry lazy loading (own commit, full manual walkthrough of every view before moving on) → CSS/manualChunks/fonts/size-limit last.

Done when: `index.html` has zero third-party `<script>` tags; `npx size-limit` passes locally and is wired into CI as a hard gate; every view still enters correctly via smoke e2e (extended to assert lazy-loaded content actually renders, e.g. `#mapChart svg` exists, `#webGraph` has nodes — not just that `data-view` changed); Network panel confirms map/graph chunks download only on first entry to those views, not on initial page load.

## Phase 4 — TypeScript completion

Goal: one language, one typecheck surface, `strict` everywhere.

Conversion order (rename `.js → .ts` + type the exported surface; no logic edits in the same commit):
1. Core: `core/app.js`, `core/panel-manager.js`, `core/graph-data.js`, `core/concept-ui.js`, `core/primary-tabs.js`.
2. Store: `store/notes-store.js` (largest untyped data surface — type its IndexedDB records against `data/schema` types).
3. Shared: `components/spine-card.js`, `components/hero-book/hero-book.js`, `components/notes-wall/notes-wall.js`, `api/kindle-import.js`, `new-entry/new-entry.js`, `shared/spine-colors.js`, `data/schema/book-types.js`, registries (`book/panels/registry.js`, `ai/features/registry.js`).
4. Views, largest first: `map/map.js` (2169), `library-2d/library-2d.js` (2157), `book/book.js` (1979), `three-room/three-room-view.js` (1540), `search/search.js`, `web/web.js`, `preloader/preloader.js`, fly modules.
5. Unify typecheck: fold `tsconfig.room-check.json` back in; delete the `src/three`/`src/three-room` excludes from `tsconfig.json`; fix fallout.
6. Burn down `: any` (60 → 0 in src, excluding genuinely-dynamic third-party seams); flip `no-explicit-any` to `error`.

Done when: `find src -name "*.js"` returns only files with a documented reason (target: none); single `npm run typecheck` covers all of `src`; CI green.

## Phase 5 — Test coverage to production bar

Goal: the layers that guard user data and money are tested; regressions caught in CI.

1. **Unit (vitest)**:
   - `data/schema/*`: fixture-based — valid doc, legacy doc (`isLegacyDoc`), invalid doc per schema.
   - `services/db.ts`: `withMeta`/`withMetaCreate`/`validateWrite` ordering and rejection paths.
   - `store/entitlements-store.ts`: plan→entitlement resolution incl. expiry.
   - `store/notes-store.js` (post-P4 `.ts`): with `fake-indexeddb`; flush-to-Firestore queue logic with a mocked `db`.
   - `api/kindle-import`: My Clippings fixtures — en, zh/CJK, malformed blocks, dedupe.
   - `core/i18n.ts`: key parity en ↔ zh-CN (turn `i18n:sync` into an assertion).
2. **Integration**: panel registry render smoke per `BOOK_TYPES` entry (jsdom); `AIGenerateUI` streaming with a mocked gateway (chunk assembly, `userEdited ?? original` precedence).
3. **E2E (Playwright + Firebase emulators**, already wired for rules tests): auth flow — email signup → add book → add highlight → create action → data visible after reload. Keep demo smoke from P0.
4. **CI**: vitest coverage thresholds — `src/services` + `src/store` + `src/data/schema` ≥ 80% lines; no global threshold yet.

Done when: CI runs unit + integration + 2 e2e suites in < 10 min; coverage gate active.

---

## Explicitly out of scope (tracked elsewhere)
GLB asset compression pipeline, service worker/PWA, SEO/landing page, i18n string coverage, entitlement stub features (PDF export / Notion sync / custom domain), `users/{uid}` public-read field audit. These are product/infra debts, not code-structure debts — do not let them creep into these phases.
