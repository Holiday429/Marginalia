# P1 Plan — Core

> Last updated: 2026-05-04  
> Based on: full codebase survey after P0 completion + 3D room merge

---

## Context: What P0 left us with

P0 is done and solid. The foundation looks like this:

- **Build:** Vite + TypeScript (allowJs). `npm run dev` / `build` / `typecheck` all work.
- **Firebase:** Dev/prod split via env files. Auth, Firestore, Storage wired.
- **AI:** DeepSeek calls behind a Cloud Function gateway — no key on client.
- **Schemas:** Zod validators for Book, Highlight, ReadingSession, UserProfile, etc. Every new Firestore write gets `_v: 1` + `_updatedAt`.
- **Entitlements:** `EntitlementsStore` + `PLAN_ENTITLEMENTS`. `hasEntitlement()` is the only gate.
- **Observability:** Sentry + PostHog behind `analytics.ts` facade.
- **3D Room:** Merged and working. `RoomScene` (Three.js, CSS3DRenderer), slot system (`shelfWall`, `notesWall`, `desk`), skin system. Notes wall live with Quote of Day + todo stickies. Hero book pull-to-flip animation working.

### What P0 did NOT finish (honest debt carried into P1)

These are real items that sit between P0 and a working production app:

| Area | Current state | Problem |
|---|---|---|
| `BooksStore` | Reads from `window.BOOK_DETAILS` seed + `window.BOOK_BY_ID` overrides | No live Firestore subscription; authenticated users see demo seed data |
| `app.js` view router | Calls `window.initShelf()` / `window.enterShelf()` etc. via dynamic lookup | `TODO(p0-cleanup)`: needs a static `VIEW_REGISTRY`; currently couples to globals |
| `studio/` folder | Still named `studio/`; view registered as both `studio` and `library` in DOM | `TODO(p0-cleanup)`: rename to `library-2d/` |
| Library layout | `localStorage` only | Dragged shelf layout is not persisted to Firestore — lost on another device |
| Notes wall todos | `localStorage` only | Todo stickies not in Firestore |
| `room.ts` | `@ts-nocheck`, Three.js loaded from unpkg CDN URLs | Bundler can't tree-shake; breaks offline PWA; type safety gone |
| `BooksStore` | Not a Firestore-backed store | No real-time sync, no multi-device |
| Reading session | Schema defined in Zod, **zero client implementation** | P1 feature |
| Quote of Day | Lives in notes-wall component, reads from `window.BOOKS` | Not from Firestore highlights; won't work for real users |
| Export | Not started | P1 feature |
| Payments | Not started | P1 feature |
| Responsive / iPad | Not verified | P1 gate before public beta |

---

## P1 Goals

P1 ends when a real user — not you — can sign in, add books, highlight passages, see their library persist across devices, and optionally pay for Pro. That's the beta bar.

Specific outcomes:
1. Authenticated users see **their own books** from Firestore, not seed data.
2. Reading session timer is live and persists sessions per book.
3. Quote of the Day pulls from the user's own Firestore highlights.
4. JSON + Markdown export works end to end.
5. Lemon Squeezy / Paddle integration: Pro plan purchasable, entitlements update live.
6. AI output is editable and saved (`userEdited ?? original` pattern).
7. iPad Safari is usable end to end (no broken layouts, ≥44px touch targets).
8. Three.js migrated off unpkg CDN — PWA-safe, type-checked.

---

## Phases

### Phase 1: BooksStore → Firestore (single source of truth)

**Why first:** Every other P1 feature (sessions, export, Quote of Day) depends on a real data layer. Nothing else can be production-quality until users see their own books.

**Current state:** `books-store.js` merges `window.BOOK_DETAILS` (seed) + `window.BOOK_BY_ID` (Firebase overrides). Authenticated users still see the same 5 demo books. This is the biggest user-facing lie in the codebase.

**Tasks:**
- Replace `BooksStore._rebuild()` with a Firestore real-time listener: `onSnapshot(collection(db, 'users/{uid}/data/books'))` → rehydrate `_books` + `_byId`.
- On first sign-in (empty collection), offer to seed from `src/data/seed/` — or just start empty. Do not auto-seed without a prompt.
- Remove `window.BOOK_DETAILS` / `window.BOOK_BY_ID` reads from `BooksStore`. Seed data is only used for the unauthenticated demo path (preloader → "Skip sign-in").
- Wire the new store into `studio.js` (Library view) and `shelf.js` — both read `BooksStore.getAll()` today; they'll just start seeing real data.
- Migrate `NewEntry` writes: `new-entry.js` currently writes to `window.BOOK_BY_ID` + dispatches `books-overrides-changed`. Replace with a Firestore `setDoc` to `users/{uid}/data/books/{bookId}`, using `withMetaCreate` + `validateWrite(BookSchema)`.
- Library shelf layout: move from `localStorage` to `users/{uid}/data/library_layout` in Firestore. Use debounced writes (500ms) on drag-end — don't write on every frame.

**Verification:**
- Sign in → add a book → sign out → sign in again → book is there.
- Two browser tabs open: add book in tab 1 → appears in tab 2 within 1s.
- Unauthenticated visitor still sees demo seed books (preloader skip path untouched).

---

### Phase 2: View router cleanup + `studio/` → `library-2d/` rename

**Why second:** The `window.initX` / `window.enterX` dynamic dispatch in `app.js` is the last major `window.X` coupling. Fixing it unblocks clean TypeScript on the router, and the rename makes the codebase match the documented architecture.

**Tasks:**
- Create `src/core/view-registry.ts`: a static map of `viewId → { init?, enter? }` where each entry imports the relevant module directly (no dynamic `window[...]` lookup).
- Register all current views: `shelf`, `studio` (temporarily), `map`, `web`, `booklist`, `book`.
- In `app.js`, replace the `window['init'+name]` / `window['enter'+name]` lookups with `VIEW_REGISTRY[name]?.init?.()` etc.
- Rename `src/studio/` → `src/library-2d/`. Update all imports. Update the DOM id from `view-studio` → `view-library-2d`. Update `app.js` `views` map.
- Remove the `TODO(p0-cleanup)` comments that are now resolved.
- `window.M` bridge: add `TODO(p0-cleanup)` resolution comment now that Phase 3 globals are gone.

**Verification:**
- `npm run typecheck` exits 0.
- All views load and navigate correctly.
- No `window.initX` / `window.enterX` patterns remain in `app.js`.

---

### Phase 3: Three.js off CDN → npm

**Why third:** `room.ts` has `@ts-nocheck` specifically because Three.js is loaded from `https://unpkg.com` CDN URLs which the bundler can't resolve. Until this is fixed: no type safety on the 3D layer, no offline PWA, no tree-shaking.

**Tasks:**
- `npm install three @types/three` (pin to `0.160.x` to match existing CDN version exactly — avoid surprise API changes).
- Replace all `https://unpkg.com/three@0.160.0/...` imports in `room.ts` with npm imports: `import * as THREE from 'three'`, `import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js'`, etc.
- Remove `// @ts-nocheck` from `room.ts`. Fix any type errors that surface.
- Verify `DRACOLoader`, `EXRLoader`, `GLTFLoader`, `OrbitControls`, `RoomEnvironment`, `MeshoptDecoder` all import correctly from the npm package paths.
- Remove the CDN `<script>` tags for Three.js from `index.html` if any remain.
- Run `npm run build` and check bundle size — Three.js is large; confirm it's within acceptable range (Draco + textures < 2MB per CLAUDE.md performance budget).

**Verification:**
- `npm run typecheck` exits 0 (no `@ts-nocheck` remaining in `room.ts`).
- 3D room loads and all interactions work.
- `npm run build` produces a working offline-capable PWA build.

---

### Phase 4: Reading session timer

**Why fourth:** This is the P1 "depth" feature that separates Marginalia from a bookshelf app. The Zod schema is ready; the client is not.

**Tasks:**
- Create `src/components/reading-session/reading-session.ts` — a self-contained session controller:
  - `start(bookId)` → writes a session doc to `users/{uid}/data/books/{bookId}/sessions/{id}` with `startedAt`, status `active`. Uses `withMetaCreate + validateWrite(ReadingSessionSchema)`.
  - `stop(endPage?)` → patches `endedAt`, computes `durationMs`, writes final doc.
  - `getActive()` → returns current session or null (also persists to `sessionStorage` for page-reload resilience).
- Add "Start Reading" / "Stop Reading" button to the Book detail panel (`src/book/book.js`). Show elapsed time while active.
- Desk slot in the 3D room: mount a `ReadingSessionComponent` that shows the currently-reading book cover + start/stop. This is the `desk` slot that `three-room.js` leaves intentionally empty today.
- "Want to note something?" prompt: when `stop()` is called, surface a lightweight modal asking if the user wants to add a note before closing — pre-fills with the session duration + end page.
- Show per-book total reading time in the Book panel (sum `durationMs` across all sessions).
- `logEvent('reading_session_started', { bookId, startedAt })` and `logEvent('reading_session_ended', { bookId, durationMs, endPage })`.

**Verification:**
- Start a session on Book A → leave and come back → session still active.
- Stop session → doc in Firestore with correct `durationMs`.
- Total reading time visible in Book panel.
- Desk slot in 3D room shows currently-reading book.

---

### Phase 5: Quote of the Day from real highlights

**Why fifth:** The notes wall already has a "Quote of Day" card. It currently pulls from `window.BOOKS` seed highlights — it will show nothing (or wrong data) for real users. This is a quick fix but highly visible.

**Current state:** `notes-wall.js` calls `pickTodayQuote(allHighlights)` where `allHighlights` is assembled from `window.BOOKS` seed data.

**Tasks:**
- Create `src/store/highlights-store.ts`: Firestore listener on `users/{uid}/data/books/*/highlights` (collectionGroup query). Exposes `getAll()` and `subscribe()`.
- Update `createNotesWallComponent()` to accept a `highlightsStore` dependency (or read from the module-level store). Replace the `window.BOOKS` read with `HighlightsStore.getAll()`.
- Wire `HighlightsStore.init(uid, db)` in `main.js` alongside `BooksStore.init()`.
- Quote of the Day algorithm: deterministic day-based pick (existing `pickTodayQuote` function) — no change needed, just feed it real data.
- For unauthenticated visitors: fall back to `src/data/seed/` highlights (same as today).

**Verification:**
- Add a highlight to a book → it appears in the notes wall Quote of Day rotation within 24h.
- Unauthenticated visitor still sees a quote from seed data.

---

### Phase 6: JSON + Markdown export

**Why sixth:** Export is a trust signal ("your data is yours") and an entitlement gate. It's also independently testable with no UI dependencies.

**Tasks:**
- Create `src/api/export.ts` with two functions:
  - `exportJSON(uid)`: reads all `books`, `highlights`, `sessions`, `actions` for the user. Assembles a structured JSON matching the CLAUDE.md account/content split. Returns a `Blob`.
  - `exportMarkdown(uid)`: same data, rendered as a Markdown document with one `##` section per book, highlights as blockquotes, sessions as a table.
- Both functions read through the existing stores (not raw Firestore) so they get validated, merged data.
- Add an Export button in the Booklist view (gated on `hasEntitlement('export.json')` and `hasEntitlement('export.pdf')` respectively — PDF export is P3, only JSON + MD now).
- Wire download via `URL.createObjectURL` + a hidden `<a>` click.
- `logEvent('export_triggered', { format: 'json' | 'markdown' })`.
- Unit test the JSON assembler: feed mock store data, assert output shape.

**Verification:**
- Export JSON → valid JSON file, parseable, contains all books + highlights.
- Export Markdown → valid `.md` file, one section per book.
- Free user: export button is visible but clicking shows an upgrade prompt (entitlement gate).
- Pro user: download triggers immediately.

---

### Phase 7: Payments (Lemon Squeezy / Paddle)

**Why seventh:** Everything above must work before you charge anyone. Payments come last in P1 because they're a one-way door — once live, billing errors have real consequences.

**Tasks:**
- Choose one provider (Lemon Squeezy recommended: simpler API, handles EU VAT, no bank account required to test). Document choice in `docs/decisions/0006-payments-provider.md`.
- Create `functions/src/billing-webhook.ts`: HTTP function that receives Lemon Squeezy webhook events (`subscription_created`, `subscription_updated`, `subscription_cancelled`, `order_created`). On each event: validate signature, update `users/{uid}.plan` + `users/{uid}.entitlements` in Firestore.
- Create `src/services/billing.ts` on the client: `getCheckoutUrl(plan)` → calls a Cloud Function that creates a Lemon Squeezy checkout session and returns the URL. Client opens URL in a new tab.
- Wire upgrade prompts: anywhere `hasEntitlement(x)` returns false and the user hits the gate, show an upgrade CTA that calls `billing.getCheckoutUrl('pro')`.
- After a successful purchase (webhook fires → Firestore updates → `EntitlementsStore` emits) — the UI upgrades live without a page reload.
- Test mode: use Lemon Squeezy test store; document the test card numbers.

**Verification:**
- Complete a test checkout → `users/{uid}.plan` changes to `'pro'` in Firestore.
- `EntitlementsStore` emits within 2s of webhook arriving.
- UI gates unlock without page reload.
- Cancel subscription → plan reverts to `'free'` within the webhook delay.

---

### Phase 8: AI output editing + iPad baseline

**Why last in P1:** Polish pass. AI output editing is a data-model addition, not a new feature. iPad is the primary mobile target — must be verified before beta.

**AI output editing:**
- Implement `AiBlock<T>` type from CLAUDE.md in `src/data/schema/ai-block.ts`.
- Wrap all existing AI-generated content storage (cultural context, summaries) to use `{ original, userEdited?, generatedAt, promptVersion }`.
- Add an inline edit affordance to every AI output panel: pencil icon → editable textarea → save writes to `userEdited` field.
- Views render `userEdited ?? original` consistently.
- "Regenerate" button: clears `userEdited`, calls AI gateway again, updates `original`.

**iPad baseline (blocking beta):**
- Run through all six views on iPad Safari (simulator or device). Fix any:
  - Touch targets < 44px
  - Horizontal scroll breakage at 768px
  - 3D room performance below 30fps → confirm Library 2D fallback triggers
  - Overflow/clip issues on the notes wall
- Verify PWA install flow on iPad Safari: Add to Home Screen → app opens without Safari chrome.
- Fix the top-3 issues found; document known remaining issues in `docs/ipad-baseline.md`.

**Verification:**
- All P1 AI features store `original` + allow `userEdited`.
- PWA installs on iPad Safari.
- No critical layout breakage on 768px viewport.

---

## What P1 deliberately leaves out

These are in scope per CLAUDE.md but deferred to P2:

- **3D Library wall slot** (north wall with Library 2D component mounted via CSS3D) — the 3D room exists but the shelf wall slot is not yet mounted with real book data. This is P2.
- **Public profile pages** — P2.
- **Notion / Apple Books / Kindle import** — P2.
- **Action follow-up reminders** — P2 (data model exists as `actions` collection; UI not built).
- **i18n zh-CN** — P2.
- **PDF export** — P3.

---

## P1 branch and commit conventions

- Branch off `main`. Name: `p1/phase-N-short-description`.
- Commit prefix: `p1(phase-N): ...`
- Update `MIGRATION.md` status block at end of each phase (repurpose the file as a general progress log, not just P0).
- Each phase must leave `npm run dev`, `npm run build`, and `npm run typecheck` passing before the branch is merged.
