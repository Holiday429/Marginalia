# P2 Plan — Differentiation

> Created: 2026-05-05  
> Prerequisite: P1 complete (all 8 phases merged to main, including 3D room visual polish)

---

## Context: What P1 left us with

P1 is done. The app now supports real users end-to-end:

- **BooksStore** — Firestore-backed, real-time, multi-device. `window.BOOK_DETAILS` / `window.BOOK_BY_ID` are still emitted as legacy sync events (tagged `TODO(p0-cleanup)`) but all new writes go through Firestore.
- **Reading sessions** — Full timer + Firestore persistence. Desk slot in 3D room shows currently-reading book. Focus widget site-wide.
- **HighlightsStore** — Firestore collectionGroup listener. Notes wall Quote of Day reads real user highlights.
- **Export** — JSON + Markdown, gated on entitlements, unit-tested.
- **Payments** — Lemon Squeezy + Cloud Function webhook. `plan` / `entitlements` update live on checkout.
- **AI editing** — `AiBlock<T>` schema (`original` / `userEdited?` / `generatedAt` / `promptVersion`). Inline edit + regenerate in every AI panel.
- **iPad baseline** — Touch targets ≥ 44px, PWA manifest, `viewport-fit=cover`. Known residual issues documented in `docs/ipad-baseline.md`.
- **3D room** — `RoomScene` with `shelfWall`, `notesWall`, `desk` slots registered. `notesWall` and `desk` slots are mounted. `shelfWall` slot is registered but **not yet mounted** — it shows nothing today.

### Honest debt carried into P2

| Area | Current state | Problem |
|---|---|---|
| `shelfWall` slot | Registered in `room.ts` at `[-5.22, 2.2, 0]`, `shelf` camera pose points at it | Not mounted — the north wall is empty in the 3D room |
| `shelf.js` | Still reads `window.SHELF_BOOKS` / `window.BOOK_BY_ID` | Views not yet reading from BooksStore module directly |
| `booklist.js` | Reads `window.BOOKLIST_CURATED` (mock data) | No live Firestore data; curated list is demo-only |
| `book.js` | Reads `window.BOOK_BY_ID`, `window.NotesStore` | Not yet migrated to BooksStore / HighlightsStore modules |
| Map view | Hardcoded `MAP_BOOKS` array in `map.js` | Does not read from BooksStore; user's real books never appear |
| Action items | `actions` panel exists in book-types; `actions/{actionId}` collection described in schema | No client implementation, no UI, no reminders |
| Public profiles | `profile` panel registered in PanelManager | No implementation; `marginalia.app/{slug}` doesn't exist |
| Notion / Kindle import | `KindleImport` module stub exists; `claude-import` panel in book-types | Kindle: UI stub only. Notion / Apple Books: not started |
| i18n zh-CN | `localeCompare('zh-Hans-CN')` used in graph-data.js | No locale strings file, no language switcher, no zh-CN translations |
| PWA icon | Placeholder SVG in `public/icon.svg` | iOS "Add to Home Screen" shows blank icon |
| 3D perf fallback | GPU tier check at load but no runtime FPS monitor | No auto-fallback from 3D → 2D if framerate drops below 30fps |
| `window.M` cleanup | `window.M` still exported from `main.js` with `TODO(p0-cleanup)` | Module boundary is leaking; callers should import directly |

---

## P2 Goals

P2 ends when Marginalia is worth sharing publicly: the 3D room feels complete, books connect to real geography, users can act on what they read, and the product is shareable via public profiles.

Specific outcomes:

1. The `shelfWall` slot in the 3D room is mounted with the Library 2D shelf component — north wall shows real books.
2. Map view reads from BooksStore — user's actual books appear as pins on the globe.
3. Action follow-up system is live: users can capture action items from book insights, and get 30-day / quarterly reminders.
4. Public profile pages (`marginalia.app/{slug}`) are live with opt-in sharing, visually consistent with the existing app design language.
5. zh-CN locale is complete — all functional UI strings translated.
6. `window.M` global is removed; all `TODO(p0-cleanup)` tags from P1 are resolved.

Import / sync (Notion, Apple Books, Kindle) is deliberately deferred — the design of what syncs in which direction needs more thought before building. See "What P2 deliberately leaves out" below.

---

## Phases

### Phase 1: `shelfWall` slot — Library 2D on the north wall

**Why first:** The 3D room's north wall has been visually empty since the 3D room launched. It's the single most visible missing piece. Fixing it requires no new features — just mounting the existing Library 2D component as a `SlotComponent`.

**Current state:** `room.ts` registers `shelfWall` at position `[-5.22, 2.2, 0]` with rotation `[0, π/2, 0]`. The `shelf` camera pose points directly at it. `three-room.js` mounts `notesWall` and `desk` but skips `shelfWall`. `library-2d.js` exports `initLibrary` / `enterLibrary` but does not implement the `SlotComponent` interface.

**Tasks:**

- Create `src/library-2d/library-2d-slot.ts`: wraps the existing Library 2D rendering logic as a `SlotComponent`. The component renders a condensed "wall view" of the shelf — spine cards in rows, no sidebar, no search bar — at the slot dimensions (`1200 × 760` px canvas, scaled to `0.0095` by the slot system, matching the `shelfWall` transform in `room.ts`).
  - `mount(container)`: renders the spine-card shelf into the container. Subscribes to `marginalia:books-changed`.
  - `unmount()`: removes listeners, clears DOM.
  - `refresh()`: re-reads BooksStore and re-renders.
  - `getDimensions()`: returns `{ width: 1200, height: 760 }`.
- In `three-room.js`, import `createShelfWallComponent` from `library-2d-slot.ts` and mount it: `scene.mountSlot('shelfWall', createShelfWallComponent())`.
- The wall component reads from `BooksStore.getAll()` — no `window.SHELF_BOOKS` reads inside the slot. This is the first view to read BooksStore directly (not via legacy sync).
- Clicking a spine on the wall navigates to the Book panel (same as the standalone Library 2D).
- Visual: spine cards use the same `SpineCard` component already used in `library-2d.js`. No new visual language.

**Verification:**

- Navigate to the 3D room, press the shelf pose button — north wall shows the user's books as spine cards.
- Add a book → it appears on the wall within 1s (reactive via `marginalia:books-changed`).
- Click a spine → Book panel opens for that book.
- Unauthenticated visitor: wall shows seed books.

---

### Phase 2: Map view → BooksStore

**Why second:** The Map is a core differentiator — reading geography is a meaningful visualization. Right now it shows a hardcoded list of 30 books in `map.js` that never changes regardless of who is signed in. Every real user sees the wrong map.

**Current state:** `map.js` defines `MAP_BOOKS` as a static array at the top of the file. The amCharts globe renders pins from this array. There is no connection to BooksStore.

**Tasks:**

- Remove `MAP_BOOKS` static array from `map.js`.
- On `initMap` / `enterMap`: subscribe to `BooksStore` (`marginalia:books-changed`). On each change, rebuild the pin data from `BooksStore.getAll()`.
- Books need a `location` field to appear on the map. Add `location?: { country: string; city?: string; lat?: number; lng?: number }` to the `BookSchema` in `src/data/schema/book.ts` (inside the `user` sub-object, since location is reader-assigned, not intrinsic to the book).
- Add location fields to the `New Entry` form: a country selector (dropdown) + optional city text field. Pre-fill from ISBN lookup if available (defer for now — just manual entry).
- The Book detail panel: add a small "Location" field to the Overview section. Editable inline. Saves to `users/{uid}/data/books/{bookId}.user.location` via Firestore.
- Map rendering: books with no `location` set are excluded from pins. Show a count badge "N books not yet located" with a link to the Booklist to set locations in bulk.
- For unauthenticated visitors: fall back to the seed books (which have `loc` fields already — map them to the new schema shape).

**Verification:**

- Sign in with zero books → globe is empty with "0 books located" badge.
- Add a book with a location → pin appears on the globe within 1s.
- Unauthenticated visitor still sees the seed book pins.
- `npm run typecheck` exits 0 (new schema fields typed).

---

### Phase 3: Action items — capture, list, remind

**Why third:** Action items are the deepest expression of Marginalia's "after reading" thesis. The `actions` collection is in the Firestore schema; the `actions` panel tab is registered in `book-types.js`; there is no client implementation.

**Tasks:**

- Create `src/store/actions-store.ts`: Firestore listener on `users/{uid}/data/actions`. Exposes `getAll()`, `getByBook(bookId)`, `add(action)`, `update(id, patch)`, `subscribe(cb)`.
  - Schema (aligns with CLAUDE.md): `{ _v: 1, bookId, text, status: 'open' | 'done' | 'snoozed', createdAt, dueAt?, reviewedAt? }`. Validate with Zod.
- Build the `actions` panel in `src/book/panels/`: renders the action list for the current book. Each action has a checkbox (done), edit-in-place text, and a "Snooze 30 days" button.
  - "Add action" text field at the bottom: typed text + Enter → `ActionsStore.add({ bookId, text, status: 'open' })`.
- Action reminders: a lightweight Cloud Function (`functions/src/action-reminders.ts`) scheduled to run daily. Queries `actions` where `status === 'open'` and `dueAt <= now`. For each overdue action: write a `notifications/{uid}/unread/{id}` doc with `{ type: 'action_reminder', actionId, bookId, text }`.
  - Client: on sign-in, check `notifications/{uid}/unread` — if any exist, show a badge on the 3D room sidebar and a dismissible panel listing the overdue actions.
  - Notification badge clears when the user opens the panel (marks docs `read: true`).
- 30-day default: when an action is created, `dueAt` defaults to `createdAt + 30 days`. Quarterly review: a separate scheduled function at 90-day intervals sends a single digest notification listing all open actions older than 90 days.
- `logEvent('action_added', { bookId })`, `logEvent('action_completed', { bookId, daysOpen })`.

**Verification:**

- Add an action to a book → appears in the `actions` panel.
- Check the checkbox → `status: 'done'` in Firestore, item struck through in UI.
- Manually set `dueAt` to a past timestamp in Firestore → trigger the reminder function → notification doc appears → badge shows in room sidebar.

---

### Phase 4: Public profile pages

**Why fourth:** Public profiles are the primary growth mechanic — shareable reading identities. The `profile.public` entitlement already exists; the `profile` panel is registered in PanelManager; there is no implementation.

**UI consistency requirement:** The public profile page is the first surface external visitors see without signing in. It must look and feel like it belongs to the same product — not a generic landing page bolted on. Specifically:

- Typography: `var(--font-serif)` (Fraunces) for body and headings, `var(--font-mono)` (IBM Plex Mono) for metadata tags and numeric labels. No system sans-serif.
- Color: use the existing CSS tokens from `src/styles/tokens.css`. No raw hex values.
- Spine cards: reuse the existing `SpineCard` component exactly — same proportions, same hover state. Do not build new book card markup.
- Layout feel: quiet, editorial, generous whitespace. Match the register of the Booklist view (the closest existing analog) rather than a marketing page.
- No new icon shapes. Use the existing SVG `<symbol>` set from `index.html`.

**Tasks:**

- Firestore: add `users/{uid}.settings.slug` (unique, alphanumeric + hyphens, user-chosen). Add a uniqueness check via Cloud Function or Firestore transaction before writing.
- Add `users/{uid}.settings.profilePublic: boolean` (default `false`). Only expose public data when this is `true`.
- Public data path: a Cloud Function (`functions/src/public-profile.ts`) HTTP endpoint at `/p/{slug}` that reads `users/{uid}` (by slug lookup) and returns only: display name, avatar URL, public books list (books where `user.shareInProfile: true`), reading stats (total books, total reading time), and up to 5 recent highlights flagged public.
  - Firestore Rules: `users/{uid}` readable by anyone if `profilePublic === true`. Books sub-collection: readable if `profilePublic === true` AND `user.shareInProfile === true`.
- Profile settings panel (`src/web/profile-settings/`): slug input + public toggle + "books to share" multi-select (checkboxes per book). Gated on `hasEntitlement('profile.public')`.
- Public page route (`#/p/{slug}`): no auth required to view. Renders: display name, public books as `SpineCard` rows (same component, same CSS), total books read + total reading time, one rotating quote from public highlights. No marketing copy, no sign-up CTA cluttering the reading content.
- Custom domain: `profile.customDomain` entitlement — deferred to P3 (requires DNS + subdomain infrastructure).
- `logEvent('profile_viewed', { slug })` (server-side in the Cloud Function).

**Verification:**

- Set slug, enable public profile, mark 3 books as shared → `marginalia.app/#/p/{slug}` renders without sign-in.
- Free user: profile settings panel shows upgrade prompt (entitlement gate on `profile.public`).
- User B cannot read user A's non-public books via Firestore Rules.
- Visual spot-check: open the public page and the Booklist view side by side — fonts, token colors, and spine card proportions match.

---

### Phase 5: zh-CN locale + `window.M` cleanup

**Why last in P2:** i18n is a multiplier on all other features — doing it after the features are stable means fewer translation rounds. The `window.M` cleanup resolves the last `TODO(p0-cleanup)` items from P0/P1.

**zh-CN tasks:**

- Create `src/core/i18n.ts`: a locale string registry with stable string IDs. Initial structure: `{ en: { ... }, 'zh-CN': { ... } }`. Exports `t(id: string): string` — reads from `users/{uid}.settings.language` (from `EntitlementsStore` / auth state), falls back to `en`.
- Audit all functional UI strings across all views (buttons, labels, nav items, error messages, panel headings). Extract each into `i18n.ts` keyed by stable ID. User-generated content (notes, highlights, book titles) is locale-agnostic — do not translate those.
- Translate all `en` strings to `zh-CN`. Target: ~200–300 strings across 8 views.
- Add language switcher to profile settings panel (dropdown: English / 中文). Writes to `users/{uid}.settings.language`. Re-renders the current view on change.
- Verify: no raw English strings remain in functional UI when `language: 'zh-CN'` is set.

**`window.M` cleanup tasks:**

- Remove `window.M = M` from `src/main.js` (tagged `TODO(p0-cleanup)`).
- Remove `window.SHELF_BOOKS`, `window.BOOK_BY_ID`, `window.BOOK_DETAILS` sync in `BooksStore._emit()` (tagged `TODO(p0-cleanup)`) — requires that `shelf.js`, `book.js`, and `booklist.js` have been migrated to read from BooksStore/HighlightsStore directly (Phases 1–2 of this P2 plan partially accomplish this; Phase 5 finishes the job for `book.js` and `booklist.js`).
- Migrate `book.js`: replace `window.BOOK_BY_ID[id]` with `BooksStore.getById(id)`. Replace `window.NotesStore?.getHighlights(id)` with `HighlightsStore.getByBook(id)`.
- Migrate `booklist.js`: replace `window.BOOKLIST_CURATED` (mock data) with `BooksStore.getAll()` — the curated list concept becomes a Booklist filter (e.g., books with `user.status === 'read'` sorted by `user.finishedAt`).
- Remove all remaining `window.init*` / `window.enter*` shims in view files now that `view-registry.ts` routes through the static registry.
- `npm run typecheck` exits 0 with no `@ts-ignore` or `as any` remaining in the migrated files.

**Verification:**

- `grep -rn "window\.M\b" src/` returns nothing.
- `grep -rn "window\.BOOK_DETAILS\|window\.BOOK_BY_ID\|window\.SHELF_BOOKS" src/` returns nothing.
- `grep -rn "window\.init\|window\.enter" src/` returns nothing.
- App fully functional after cleanup: all six views load, no console errors.
- Setting language to `zh-CN` → all UI labels switch to Chinese; user notes stay in their original language.

---

## What P2 deliberately leaves out

**Import / sync (requires design before building):**

- **Notion sync** — The direction (pull highlights in, push notes out, or bidirectional) needs to be decided before any code is written. The `sync.notion` entitlement and schema slots are reserved. Design session first, then a dedicated phase in P3.
- **Apple Books import** — Requires macOS clipboard parsing or a Safari extension. Lower ROI and higher platform complexity than Notion. P3 at earliest.
- **Kindle import** — `KindleImport` stub exists; full implementation needs an email-forwarding pipeline. P3.

**Other deferred items:**

- **PDF export** — Entitlement exists (`export.pdf`), implementation not started. P3.
- **Custom domain for public profiles** — Requires DNS + subdomain infrastructure. P3.
- **Reading progress visualization** — Heatmap / streak for books in `reading` status. P3.
- **iPad native app (Capacitor)** — Only if iPad DAU > 20% and users request a built-in EPUB reader. Far future.
- **3D runtime FPS fallback** — GPU tier check exists at load time; runtime framerate monitoring with auto-fallback to Library 2D. Low priority while 3D is Pro-only. P3.
- **PWA icon** — Replacing the placeholder SVG with production PNG icons at 180×180 and 512×512. Quick win, can be done anytime between phases.

---

## P2 branch and commit conventions

- Branch off `main`. Name: `p2/phase-N-short-description`.
- Commit prefix: `p2(phase-N): ...`
- Update `MIGRATION.md` with a `## P2 progress notes` section at the end of each phase.
- Each phase must leave `npm run dev`, `npm run build`, `npm run typecheck`, and `npm run check:entitlements` passing before the branch is merged.
