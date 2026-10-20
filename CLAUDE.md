# Marginalia

A personal reading-records platform. Marginalia owns the *after* of reading: cultural context, knowledge connection, and the conversion of insight into action.

**Current state:** Phase 1 (stabilize) is merged. Phase 2 (core loop) is on branch `phase-2-loop`, pending the owner's review: quick capture, pre-read card, finish ritual, spaced resurface + weekly email (real sending waits for an email provider), multi-source import, automatic map placement, global search (⌘K), first-run guide and event analytics are built; task 2.8 (Today panel and navigation) is built too: nav Library · Map · Graph · Profile, Library with Browse / Arrange modes, camera buttons in Settings. Open decisions live in `docs/open-questions.md`; evidence in `docs/phase-reports/phase-1.md` and `phase-2.md`.

**Code rules:**
- ES modules + explicit imports everywhere. No `window.X` globals — any remaining ones are bugs to fix, not patterns to follow.
- `M` namespace (`src/core/namespace.ts`) is the migration target. When touching old globals, migrate them to the appropriate `M.*` branch.
- No `<script>` tag ordering hacks.
- Every Firestore write must go through `withMeta()` / `withMetaCreate()` from `src/services/db.ts` and be validated with a Zod schema first.
- Never check `plan === 'pro'`. Always use `hasEntitlement('feature-x')`.
- **Firestore paths exist in one place:** `src/firebase/paths.ts` (`Paths`, `WsPaths`, `AuditPaths`, `GroupNames`). No literal path in a `collection()` / `doc()` call (`npm run check:paths` fails the build). The workspace id comes from `getWorkspaceId()` in `src/firebase/workspace.ts`. Adding a path means adding a rules test case in `tests/path-cases.ts`.
- **Billing is server-only.** `billing/{uid}` and `usage/{uid}/months/*` are written by Cloud Functions; clients only read their own. `users/{uid}` is owner-only and never holds plan, entitlements or quota.
- **AI requests carry no text.** The client sends `{ featureId, bookId? }`; prompts are built in `shared/ai-prompts/` by the `aiGenerate` function from the user's own Firestore data.
- **Books come only from `BooksStore`**, which reads a `BookDataSource` (`src/store/book-data-source.ts`): Firestore when signed in (an empty library stays empty), the single demo library in `src/data/demo/` when signed out. Never import `src/data/demo` anywhere else. No special-casing of specific books.
- **Static files** are referenced through `asset()` (`src/core/asset.ts`). 3D models and surface textures are optimized by `npm run assets:optimize` (originals live in the git-ignored `assets-src/`) and referenced through `src/three/asset-urls.ts`; GLBs load through `src/three/gltf-loader.ts`.
- **Analytics only after consent:** PostHog/Sentry go through `src/services/analytics.ts`, which starts them only once the visitor accepted (`src/services/consent.ts`).
- Run `npm run check:all` before every commit (see "Testing and gates").

---

## Information Architecture

```
Marginalia                 Top nav (landscape: iPad, foldables, desktop): Library · Map · Graph · Profile
├── Room (3D)              — Home. Persistent shell; never toggled by show(). Camera moves between poses (Settings → Camera).
│   ├── Today panel        — Bottom of the room (signed in): reading now, 3 highlights worth another look, due action, start timer
│   ├── Shelf Wall         — Library 2D component mounted as CSS3D plane on the north wall
│   ├── Notes Wall         — Highlights as sticky cards on the east wall
│   └── Desk               — Currently-reading book + reading session timer
├── Library (one nav tab, two modes, switch under the header)
│   ├── Browse (view-search)  — Browse + filter all books; what the Library tab opens (the old Search page)
│   └── Arrange (panel-library) — Permanent fallback: flat draggable shelf (shared component with Room shelf wall)
├── Map (panel-map)        — Reading geography by author origin / content location / reader anchor
├── Graph (panel-web)      — D3 concept/book network (src/web/web.js)
├── Profile (panel-profile)— Public profile, reading identity, heatmap, annual shelf, Settings
└── Book (panel-book)      — Single-book detail: panels vary by book type (AI features, highlights, actions)
```

Phones are not a target for now (the whole site is designed for landscape); the PWA targets iPad and foldables that can show landscape, and the page looks the same as on the web.

**Nav aliases** (handled in `src/core/app.ts` `toCanonicalViewName`):
- `graph` → `web` (internal id)
- `shelf` → `search`
- `studio` → `library`
- `#search` is Library · Browse and `#library` is Library · Arrange; both keep working and both highlight the Library tab (`primaryTabIdForView` in `src/core/primary-tabs.ts`)

---

## Tech Stack

| Layer     | Choice                                                              |
|-----------|---------------------------------------------------------------------|
| Frontend  | TypeScript + ES Modules, Vite                                       |
| 3D        | Three.js r145+ + CSS3DRenderer (hybrid 2D/3D)                       |
| Backend   | Firebase: Auth, Firestore, Storage, Cloud Functions (gen2)          |
| AI        | DeepSeek API via Cloud Function gateway only (`VITE_AI_GATEWAY_URL`)|
| Payments  | Lemon Squeezy — `src/services/billing.ts` → `VITE_CHECKOUT_URL`    |
| Analytics | PostHog (`VITE_POSTHOG_KEY`) + Sentry (`VITE_SENTRY_DSN`)          |
| Hosting   | Vercel (`vercel.json`: immutable cache for hashed assets). PWA installable on iPad. |
| Tests     | Vitest (unit, Firestore rules), Playwright (smoke + signed-in e2e on Firebase emulators) |
| 3D assets | `@gltf-transform` + sharp pipeline → WebP textures, meshopt, content-hashed names |

No Mac app. No native iOS/Android in v1. PWA + iPad Safari is the primary mobile target.

---

## Project Structure

```
src/
├── main.js                 — app entry: wires stores to auth, analytics + consent, view registry
├── core/
│   ├── app.ts              — SPA router: App.show(), App.navigateTo(), nav rendering
│   ├── panel-manager.ts    — Overlay panel lifecycle (open/close/transition)
│   ├── view-registry.ts    — Lazy map of viewId → { init?, enter?, enterPanel? }
│   ├── namespace.ts        — M root object (migration target for all globals)
│   ├── namespace.types.ts  — TypeScript branches of M
│   ├── env.ts              — Typed Vite env vars (VITE_*)
│   ├── asset.ts            — asset(): URL of a file in public/ (applies the Vite base)
│   ├── graph-data.ts       — MarginaliaGraph: concept↔book link store
│   ├── concept-ui.ts       — Concept drawer open/close
│   ├── primary-tabs.ts     — Top nav tab bar renderer
│   └── i18n.ts             — i18n helper (en + zh-CN)
├── data/
│   ├── schema/             — Zod validators + TS types (book, highlight, action, reading-session, empty-book, …)
│   ├── schema/book-types.ts — BOOK_TYPES registry: defaultPanels + defaultAiFeatures per type
│   └── demo/               — THE demo library (signed-out visitors only): index.ts + featured-book.js
├── services/
│   ├── db.ts               — withMeta / withMetaCreate / validateWrite / isLegacyDoc
│   ├── ai-gateway.ts       — MarginaliaAI.generate() / generateJSON(): sends { featureId, bookId }
│   ├── billing.ts          — getCheckoutUrl() → Lemon Squeezy
│   ├── analytics.ts        — logEvent / logError (PostHog + Sentry), consent-gated
│   └── consent.ts          — analytics consent choice (localStorage)
├── store/
│   ├── book-data-source.ts — BookDataSource: Firestore (signed in) | demo (signed out)
│   ├── books-store.ts      — the only source of books for views; emits marginalia:books-changed
│   ├── highlights-store.ts — per-user highlights listener + save/remove; emits marginalia:highlights-changed
│   ├── notes-store.ts      — IndexedDB (+ Firestore flush): highlights, notes, actions, ai-results, user-books
│   ├── actions-store.ts    — Firestore actions collection listener
│   ├── captures-store.ts   — quick captures = highlights with source 'quick' and bookId '' until attributed; device-first with an outbox (capture-outbox.ts)
│   ├── resurface-store.ts  — due highlights (up to 3) + the four answers (shared/resurface.ts has the schedule logic)
│   ├── moments-store.ts    — finish ritual record per book (moments/{bookId})
│   ├── book-status-events.ts — notifyBookStatusChange(): the one hook for "moved into finished" (analytics now, finish ritual in 2.3)
│   ├── ai-results-store.ts — Cached AI output store
│   └── entitlements-store.ts — reads billing/{uid} → entitlements (never writes)
├── firebase/
│   ├── paths.ts            — all Firestore path builders (shared with functions/)
│   ├── workspace.ts        — getWorkspaceId()
│   ├── auth.ts             — MarginaliaAuth (Firebase Auth wrapper)
│   ├── config.ts           — MARGINALIA_FIREBASE config from ENV; emulator hookup in `emulator` mode
│   └── db.ts               — MarginaliaStorage, MarginaliaBooksCloud
├── ai/
│   ├── client/generate-ui.ts — AIGenerateUI (trigger AI, stream into panel, 402 → upgrade prompt)
│   └── features/registry.ts  — AIFeatureRegistry: featureId → { panel, label, outputType } (no prompts)
├── components/
│   ├── spine-card.ts                    — SpineCard: reusable book spine tile
│   ├── hero-book/hero-book.ts           — HeroBook: 3D-flip currently-reading book component
│   ├── notes-wall/notes-wall.ts         — NotesWall: highlights as sticky cards (CSS3D slot)
│   ├── pixel-avatar/pixel-avatar.ts     — PixelReader: pixel-art avatar renderer
│   ├── reading-session/reading-session.ts — Focus timer controller (sessionStorage-backed)
│   ├── reading-session/desk-slot.ts     — DeskSlotComponent: SlotComponent wrapper for desk
│   ├── reading-session/focus-widget.ts  — Focus widget UI
│   ├── consent-banner/consent-banner.ts — analytics consent banner
│   ├── legal-links/legal-links.ts       — Privacy / Terms / Credits footer links
│   ├── action-notifications/action-notifications.ts — Action reminder notifications
│   ├── quick-capture/quick-capture.ts — global "+" button and C key (boot part); quick-capture-sheet.ts is the sheet (loaded on first use); captures-pill.ts + captures-drawer.ts list unattributed captures (drag onto a spine)
│   ├── library-mode-switch/library-mode-switch.ts — Browse / Arrange switch under the header of the two Library pages (routes `search` / `library`)
│   ├── today-panel/today-panel.ts — Today panel in the room (mounted by three-room-view.js): reading now, due highlights (ResurfaceStore.due), due action (pickDueAction in shared/resurface.ts), start timer
│   ├── finish-ritual/finish-ritual-boot.ts — listens for "moved into finished"; finish-ritual.ts is the three-question dialog (loaded on demand)
│   └── onboarding/onboarding-boot.ts — decides once per sign-in whether the first-run guide is needed; onboarding.ts is the three-step guide
├── three/
│   ├── room.ts             — RoomScene class: loads GLBs, CSS3DRenderer, raycasting, interactive targets
│   ├── camera-paths.ts     — POSES: front | approach | shelf | notes (positions + FOV + idle amplitude)
│   ├── slots.ts            — SlotComponent interface + createPlaceholderSlotComponent
│   ├── skins.ts            — ROOM_SKINS: warm-study | mist-morning | … (color + lighting presets)
│   ├── gltf-loader.ts      — shared GLB loader (meshopt, fetch-once cache)
│   ├── asset-urls.ts       — modelUrl() / textureUrl() from the generated manifest
│   └── frame-photo.ts      — picture-frame photo: user avatar or default pixel reader
├── three-room/
│   ├── three-room-view.js  — initRoom / enterRoom; all room→panel navigation logic; room poster
│   ├── three-room.js       — createThreeRoomPreview(): mounts RoomScene + all slot components
│   ├── frame-fly.js        — Profile transition: picture frame animation (playFrameFlyIn / settleFrameFlyIn)
│   └── room-audio.ts       — ambient room audio
├── search/
│   ├── search.js           — initSearch / enterSearch / renderSearchSection
│   ├── laptop-fly.js       — Search transition: macbook fly-in
│   ├── search-decor-3d.js  — Decorative open-book Three.js object on the search page
│   └── global/             — cross-book search (⌘K / Ctrl+K): index.ts (pure MiniSearch index; CJK as characters + pairs), snippet.ts, data.ts (what is indexed), panel.ts, boot.ts (the shortcut; the rest loads on first use)
├── library-2d/
│   ├── library-2d.ts       — initLibrary / enterLibrary; drag-to-arrange shelf
│   ├── library-2d-state.js
│   └── library-2d-template.js
├── map/
│   ├── map.ts              — initMap / enterMap
│   ├── map-globe.js        — Interactive globe
│   ├── globe-fly.js        — Map transition: globe animation (playGlobeFlyIn)
│   ├── geo-profiles.js     — Country → author/book data
│   ├── geo-resolve.ts      — automatic placement: resolveBookGeo callable → book.geo ("pending" until the reader confirms)
│   └── geo-helpers.ts      — pure helpers: placement patch (never replaces a reader's place), located count, insight threshold
├── web/
│   ├── web.js              — initWeb / enterWeb; D3 concept graph
│   └── graph-fly.js        — Graph transition: tack board fly-in
├── profile/
│   ├── profile.ts          — initProfile / enterProfile; public + own profile rendering
│   ├── public-profile.ts   — publicProfiles/{slug} card sync (the only data anonymous visitors read)
│   ├── profile-heatmap.ts  — Reading heatmap component
│   ├── session-days.ts     — reading sessions → per-day heatmap data
│   ├── profile-map.ts      — ProfileMap: geographic reading footprint mini-map
│   ├── profile-year-in-review.ts — ProfileAnnualShelf: yearly reading shelf + streak heatmap
│   ├── profile-settings.ts — settings panel (slug, visibility, export, delete account)
│   ├── delete-account.ts   — Settings → Delete account flow
│   ├── profile-types.ts    — PublicProfileData, PublicBook, SessionDay, DemoPayload types
│   ├── profile-demo-resolver.ts — Demo profile payload (signed out)
│   └── annual-shelf-store.ts    — loadAnnualShelf()
├── book/
│   ├── book.js             — initBook / enterBook; store data + empty-book defaults; renders panel tabs
│   ├── book-detail.js      — buildBookDetailModel() / BOOK_SECTION_LABELS
│   ├── book-fly.js         — Book transition: desk book fly-in
│   ├── reading-card.ts     — shareable reading card (AI takeaway via the gateway)
│   └── panels/
│       ├── registry.ts     — PanelRegistry: panelId → { label, icon, render }
│       ├── notes.js
│       ├── actions.js
│       ├── characters.js
│       ├── timeline.js
│       ├── mindmap.js
│       ├── concept-cards.js
│       ├── geo-context.js
│       └── claude-import.js
├── new-entry/
│   └── new-entry.ts        — NewEntry: Add Book form with spine customisation
├── api/
│   ├── export.ts           — JSON/Markdown export assembler (books + highlights)
│   ├── kindle-import.ts    — KindleImport: per-book Kindle import (uses import/kindle.ts)
│   └── import/             — unified import: pure parsers (goodreads, storygraph, readwise, weread, kindle), detect.ts, plan.ts (dedupe), build.ts, run.ts (writes), import-ui.ts (preview + confirm dialog)
├── shared/
│   ├── reading-status.ts   — ReadingStatus vocabulary (Add Book, book detail, Search, Library shelves)
│   ├── shelf-utils.ts      — containsCJK, getUnifiedShelfSpineSize
│   └── spine-colors.ts     — SPINE_COLORS palette
└── preloader/
    ├── preloader.js        — Landing page (book-spine splash + Enter Library)
    ├── landing-books.js    — decorative spine parameters for the landing animation
    └── hero-glb.js         — mountHeroGLB(): Three.js book flip for hero-book exit

shared/                     — code shared by the web app and Cloud Functions
├── entitlements.ts         — Plan → entitlement table (single source)
└── ai-prompts/             — pure prompt builders + the AI feature whitelist (index.ts)

functions/src/              — Cloud Functions (gen2)
├── ai-generate.ts          — aiGenerate HTTP wrapper; ai-handler.ts / ai-context.ts / ai-quota.ts / ai-config.ts hold the logic
├── billing-webhook.ts      — Lemon Squeezy webhook; billing-state.ts is the pure state machine
├── create-checkout.ts      — checkout URL with the uid attached
├── delete-account.ts       — deleteAccount callable
├── action-reminders.ts     — scheduled action reminders
└── profile-slug-check.ts   — slug availability

scripts/                    — optimize-assets.mjs, build-legal-pages.mjs, measure-room-load.mjs, check-*.mjs, check-all.sh, migrations/
tests/                      — unit + rules tests; e2e/ (production smoke), e2e-emulator/ (signed-in flows on emulators)
docs/                       — optimization-plan.md, phase-reports/, open-questions.md, decisions/ (ADRs)
```

---

## View Pattern

Every view follows the same shape. The view id used everywhere (router, panel-manager, CSS `body[data-view]`) must match the key in `VIEW_REGISTRY`.

```
{name}/
├── {name}.js / {name}.ts     — exports initName (one-shot) + enterName + enterPanel_name
└── {name}.css
```

State, render, events may be in the same file or split — no strict file count requirement. The splitting pattern `{name}.state.ts / .render.ts / .events.ts` is aspirational, not enforced.

Register the view in `src/core/view-registry.ts`. Add `<div id="panel-{name}" hidden>` in `index.html` (exception: `search` uses `view-search` as its element id; see `PANEL_ELEMENT_ID` in `panel-manager.ts`).

---

## 3D Room — Interactive Objects & Navigation

The room (`src/three/room.ts` `RoomScene`) registers interactive 3D objects via `INTERACTIVE_ASSETS`. Each has an `interactiveAction` string that maps to a callback in `RoomSceneOptions`. **Do not add interactive objects by any other mechanism.**

### Current interactive objects

| Object id       | Model (`MODEL_PATHS` name)   | interactiveAction | Triggers                    |
|-----------------|------------------------------|-------------------|-----------------------------|
| `hero-book-shelf` | `book` (left wall)         | `heroBook`        | `onHeroBookSelect`          |
| `bookshelf-a`   | `book_shelf`                 | `organize`        | `onOrganizeSelect`          |
| `bookshelf-b`   | `bookshelf real`             | `organize`        | `onOrganizeSelect`          |
| `globe`         | `antique_globe`              | `map`             | `onGlobeSelect`             |
| `macbook`       | `macbook`                    | `shelf`           | `onLaptopSelect`            |
| `desk-book`     | `book` (desk)                | `deskBook`        | `onDeskBookSelect` — opens the book being read, or Add Book when there is none |
| `picture-frame` | `wooden_picture_frame` (photo = the user's avatar, `src/three/frame-photo.ts`) | `profile` | `onPhotoFrameSelect` |
| `graph-board`   | `messy_tack_board`           | `graph`           | `onWebSelect`               |

Model names resolve to content-hashed files through `src/three/asset-manifest.generated.ts` (generated by `npm run assets:optimize`; never edit by hand). Interactive objects load first, furniture and props after; the room shows `public/room-poster.webp` until `onSceneReady`.

### Camera poses (`src/three/camera-paths.ts`)

| Pose id    | Facing           | Used when entering     |
|------------|------------------|------------------------|
| `front`    | Room centre      | Default / approach     |
| `approach` | Desk from above  | Book detail            |
| `shelf`    | North wall       | Search / Library       |
| `notes`    | East wall        | Graph / Notes Wall     |

To add a new pose: add to `POSES` in `camera-paths.ts`, add to `PANEL_POSES` map in `three-room-view.js`. The buttons that move the camera (Front / Desk / Shelf wall / Notes wall / Free look) are in Settings → Camera (`#roomCameraControls`); there is no bottom toolbar.

---

## 3D Room → View Transitions (Fly-in Animations)

Every major view has a **physical object in the room** that acts as its portal. Clicking it triggers a fly-in animation that bridges the 3D room and the flat 2D view. This is the system's visual identity — maintain it consistently across all views.

**Core rule:** The `onLanded` callback must fire while the fullscreen overlay still covers the screen, so the destination view paints behind it before it fades out. Never call `App.navigateTo` or `PanelManager.open` before the overlay is up.

For detailed per-transition implementation instructions (Graph, Search/laptop, Book detail), see `FEATURES.md`.

### Current transition status

| View      | Room object         | interactiveAction | Fly-in status    | Fly module                    |
|-----------|---------------------|-------------------|------------------|-------------------------------|
| Map       | `globe`             | `map`             | ✅ Implemented   | `src/map/globe-fly.js`        |
| Profile   | `picture-frame`     | `profile`         | ✅ Implemented   | `src/three-room/frame-fly.js` |
| Library   | `bookshelf-a/b`     | `organize`        | ✅ Implemented   | `src/preloader/hero-glb.js`   |
| Search    | `macbook`           | `shelf`           | ✅ Implemented   | `src/search/laptop-fly.js`    |
| Graph     | `graph-board`       | `graph`           | ✅ Implemented   | `src/web/graph-fly.js`        |
| Book      | `desk-book`         | `deskBook`        | ✅ Implemented   | `src/book/book-fly.js`        |

### Reference

Before touching any transition code, read these files — they are the source of truth:

- `src/map/globe-fly.js` — baseline pattern for overlay lifecycle
- `src/three-room/frame-fly.js` — GLB texture swap, CSS handoff, multi-phase animation
- `src/three-room/three-room-view.js` — `exitRoomViaGlobeFly()` / `exitRoomViaFrameFly()` show the exact `ROOM_VIEW_STATE` + `.finally()` wiring

**Never:** navigate before `onLanded` fires; skip `.finally()`; leave a WebGLRenderer alive after the Promise resolves; darken the overlay before the first GLB frame renders.

---

## Data Architecture

### Firestore schema

All paths are built in `src/firebase/paths.ts` (shared with `functions/`).

```
users/{uid}                     — owner-only: settings (slug, profilePublic, language, sections), avatarUrl, publishedSlug.
│                                 NEVER plan / entitlements / quota (rules reject them).
└── rateLimits/ai               — server-only
billing/{uid}                   — SERVER-WRITTEN, owner read: plan, status, currentPeriodEnd, cancelAtPeriodEnd,
                                  provider, providerSubscriptionId, customerPortalUrl (+ webhook bookkeeping)
usage/{uid}/months/{YYYY-MM}    — SERVER-WRITTEN, owner read: aiCalls
publicProfiles/{slug}           — public read; created/updated by the owning uid only (the doc id makes slugs unique).
                                  Derived card (displayName, avatarUrl, bio, sections); exists only while the profile is public.
billing_orphans/{id}            — server-only: webhook events with no uid
audit/ai_calls/{uid}/{id}       — SERVER-WRITTEN, owner read: featureId, token counts, status

workspaces/{wsId}/
├── userProfiles/{uid}          — username lookup + email
├── notifications/{uid}/unread/{id} — action reminders (written by functions; owner may mark read)
└── users/{uid}/
    ├── books/{bookId}                 — BookSchema fields; public read only when shareInProfile + profile public
    │   ├── notes/main                 — free-text book note
    │   ├── ai/{featureId}             — AiBlock<T> per book
    │   └── visualNotes/{id}           — imported visual notes
    ├── highlights/{id}                — HighlightSchema (flat; filter by bookId)
    ├── actions/{id}                   — ActionSchema
    ├── sessions/{id}                  — ReadingSessionSchema (startedAt, endedAt, durationMs, bookId)
    ├── ai_results/{featureId}         — profile-level AiBlock (reader portrait, …)
    ├── annual_shelf/{year}            — Top-10 of the year
    ├── graph/linkStatus               — concept link overrides
    └── data/library_layout            — shelf drag-to-arrange state (LibraryLayoutSchema)
```

Every path has a rules test case in `tests/path-cases.ts` (owner-rw, owner-read/server-write, server-only, or public-read); `tests/firestore-rules.test.ts` fails if a builder has no case.

**Schema versioning:** Every document has `_v: 1`. Use `isLegacyDoc()` to detect old documents; migrate in the store layer. Views never read raw Firestore docs — always go through stores. Migrations live in `scripts/migrations/` (dry run by default, `--apply` to write, dev project first).

**Demo data** (`src/data/demo/`) exists only for signed-out visitors and is reachable only through `BookDataSource`'s demo source and `profile-demo-resolver.ts`. A signed-in user's library is exactly what is in their Firestore, including empty.

### Key Zod schemas (`src/data/schema/`)

| File                  | Validates                              |
|-----------------------|----------------------------------------|
| `book.ts`             | BookSchema — cover, status, geo, dates |
| `highlight.ts`        | HighlightSchema — quote, kind, source  |
| `action.ts`           | ActionSchema — text, status, remind*At |
| `reading-session.ts`  | ReadingSessionSchema — startedAt, durationMs |
| `ai-block.ts`         | AiBlock<T> wrapper                     |
| `empty-book.ts`       | createEmptyBook(): blank detail shell for a book with no notes yet |
| `book-types.ts`       | BOOK_TYPES: defaultPanels + defaultAiFeatures |
| `shared/entitlements.ts` | Entitlement union type + PLAN_ENTITLEMENTS (web + functions) |

### Mutable AI output

```ts
type AiBlock<T> = {
  original: T;
  userEdited?: T;
  generatedAt: number;
  promptVersion: string;
};
```

Views always render `userEdited ?? original`. Never overwrite `original` after first generation.

---

## AI Architecture

All AI calls go through `MarginaliaAI` in `src/services/ai-gateway.ts`. No API key on the client.

```
Client: MarginaliaAI.generate({ featureId, bookId?, onChunk, onDone })
  → POST VITE_AI_GATEWAY_URL { featureId, bookId? } with a Firebase ID token   (no prompt text, ever)
    → aiGenerate (functions/src/ai-handler.ts): origin allow-list → verify token → validate body (whitelist,
      custom `prompt` = 400) → rate limit → load THIS user's book/highlights/notes with the admin SDK
      (capped) → build the prompt in shared/ai-prompts → reserve a monthly quota slot (402 when used up) →
      stream DeepSeek → audit log with token counts → refund the slot if the call fails

Client: AIGenerateUI (src/ai/client/generate-ui.ts)
  → renders the Generate button per feature, streams into the panel, shows an upgrade prompt on 402
```

`src/ai/features/registry.ts` `AIFeatureRegistry` lists the features per panel (label, panel, output type). The server-side whitelist and prompt text live in `shared/ai-prompts/index.ts` (`AI_FEATURES`).

Quota: `FREE_AI_MONTHLY` / `PRO_AI_MONTHLY_FAIR_USE` in `functions/src/ai-config.ts`; plan comes only from `billing/{uid}`; usage counts live in `usage/{uid}/months/{YYYY-MM}`.

### AI features by book type

| Book type     | Feature ids                                        |
|---------------|----------------------------------------------------|
| Fiction       | `character-map`, `timeline-gen`                    |
| Nonfiction    | `mindmap-gen`, `concept-cards`, `action-suggest`   |
| Social science| `concept-cards`, `argument-breakdown`, `action-suggest` |
| Travel        | `geo-context`, `action-suggest`                    |
| Essay / self-help | `action-suggest`, `argument-breakdown`         |
| Profile       | `reader-portrait`, `reader-identity`               |

### Adding a new AI feature

1. Add the prompt builder `shared/ai-prompts/{id}.ts` (a pure function of the capped context) and register it in `shared/ai-prompts/index.ts` (`AI_FEATURES`, kind `book` or `library`). Text sent to the model is covered by snapshot tests (`functions/test/prompts.snapshot.test.ts`): review any diff deliberately.
2. Add the entry to `AIFeatureRegistry._features` in `src/ai/features/registry.ts` (label, panel, outputType).
3. Add the panel entry to `PanelRegistry` in `src/book/panels/registry.ts`.
4. Create `src/book/panels/{id}.js` — call `PanelRegistry.set('{id}', renderFn)`.
5. Add the feature to the appropriate book type in `BOOK_TYPES` `defaultAiFeatures`.
6. If the prompt needs data the loader does not read yet, extend `functions/src/ai-context.ts` (cap it with `PROMPT_LIMITS`).

---

## Entitlements

```ts
type Entitlement =
  | 'ai.unlimited'
  | 'export.pdf'
  | 'export.json'
  | 'profile.public'
  | 'profile.customDomain'
  | 'sync.notion'
  | 'library.3d'
  | 'reader.builtin';   // built-in reader (future)

FREE:     ['export.json', 'profile.public']
PRO:      [...FREE, 'ai.unlimited', 'export.pdf', 'profile.customDomain', 'sync.notion', 'library.3d', 'room.customAudio']
LIFETIME: same as PRO
```

The table is `shared/entitlements.ts` (one copy for the web app and `functions/`). `EntitlementsStore` only **reads** `billing/{uid}`; the Lemon Squeezy webhook (`functions/src/billing-state.ts`) is the only writer: a cancelled subscription stays Pro until `currentPeriodEnd` (`cancelAtPeriodEnd`), `past_due` keeps Pro, only the lifetime variant grants `lifetime`, and a refund reverts it.

**Never** `if (plan === 'pro')`. Always `EntitlementsStore.hasEntitlement('feature-x')`.

---

## 3D Room — Slots & Components

The room exposes three named CSS3D slots. Each takes a `SlotComponent` (defined in `src/three/slots.ts`):

```ts
interface SlotComponent {
  mount(container: HTMLElement): void;
  unmount(): void;
  refresh(): void;
  getDimensions(): { width: number; height: number };
}
```

| Slot id      | Wall      | Mounted component                                   |
|--------------|-----------|-----------------------------------------------------|
| `shelfWall`  | North     | Unmounted — room shelves are decor; user books live in Library 2D only |
| `notesWall`  | East      | `createNotesWallComponent()` — highlights as cards  |
| `desk`       | Desk      | `createDeskSlotComponent()` — reading session timer  |

Library 2D and the 3D shelf wall share the same underlying component. Drag-to-arrange is an intentional gamification mechanic — never replace with auto-sort.

**Performance budget:** 3D initial load < 2s on iPad Air; 60fps target, 30fps floor. Auto-fallback to Library 2D when GPU benchmark fails.

---

## Reading Session

`src/components/reading-session/reading-session.ts` is the site-wide focus timer.

- Active session stored in `sessionStorage` under key `marginalia:session`. Survives page reloads.
- On start: writes `workspaces/{ws}/users/{uid}/sessions/{sessionId}` via `ReadingSessionSchema`; on stop it adds `endedAt` / `durationMs`.
- Emits `marginalia:session-changed` custom event on state changes.
- `bookId` attribution is optional — sessions without a book are allowed.
- Stopping emits `marginalia:session-ended` `{ sessionId, bookId, durationMs }` — the hook for the "want to note something?" prompt (quick capture, plan task 2.1).
- The Profile reads the owner's sessions (`src/profile/session-days.ts`) to colour the reading heatmap; public visitors cannot read sessions.

---

## UI Rules

**Typography:**
- `var(--font-serif)` — Fraunces: body text, headings, most UI
- `var(--font-mono)` — IBM Plex Mono: labels, metadata, code
- `var(--font-display)` — Bodoni Moda: book covers / spine display text only
- No system sans-serif in functional UI. No legacy fonts (Cormorant, Libre Caslon, Inter, Caveat).

**Color:** Tokens only — `src/core/base.css`. No raw hex values in component CSS.

**Borders:** `solid` only. `dashed`/`dotted` forbidden on interactive elements.

**Casing:** Sentence case for buttons/labels (`Add highlight`). Title Case for section headings. All-caps forbidden except abbreviations (AI, ISBN, URL).

**Components:** Buttons, icons, headings: one source of truth in `src/components/`. Views do not roll their own. Icons are SVG `<symbol>`s in `index.html`, referenced via `<use href="#icon-name">`.

**Responsive:** 360px–2560px. Touch targets ≥ 44px. iPad Safari is the primary mobile target.

**Language:** Functional UI in English. User content preserves whatever language the user wrote in.

---

## Conventions

- All code comments and docs in English.
- Every async boundary: catch and forward to `logError(err, context)` from `src/services/analytics.ts`.
- User-facing errors: show an inline message with `role="alert"` (the planned `<error-banner>` component does not exist yet). No raw `alert()`.
- No `console.warn` / `console.log` in production paths.
- Firestore Rules: deny by default; explicit `request.auth.uid == uid` per collection.
- Inbound writes: validate with Zod → `withMeta/withMetaCreate` → Firestore. This order is mandatory.
- Cloud Functions: rate-limited per user; no API key on client.
- CSS classes: scoped to module (`.book-section__title` not `.title`). BEM-style encouraged.

---

## Testing and gates

Run before every commit (any failure blocks it): `npm run check:all`, which runs `lint`, `typecheck`, `typecheck:room`, `check:entitlements`, `check:hardcoded`, `check:paths`, `check:docs`, a build of `functions/`, `test:unit`, `test:rules:emu` (Firestore rules, quota and account-deletion tests on the Auth + Firestore emulators), `build`, `test:e2e` (production smoke, strict: any page error fails), `test:e2e:emu` (signed-in flows on the Auth/Firestore/Functions/Storage emulators, plus consent and legal pages on a production build), `size`, and the room-load budget (`scripts/measure-room-load.mjs`: ≤ 12 MB, 0 page errors).

- Rules: `tests/firestore-rules.test.ts` + `tests/path-cases.ts`. Functions: `functions/test/` (shared helpers import the build-time copy `functions/src/_shared`, generated by `scripts/sync-shared.mjs`).
- Signed-in e2e runs the app in Vite's `emulator` mode (`.env.emulator`); real Firebase projects are never touched by tests.
- UI work needs screenshots at 390×844, 768×1024 and 1440×900 in `tests/screenshots/phase-1/` (and later phases).

---

## Compliance

- Privacy, Terms and Credits are static pages generated by `npm run legal:build` (`scripts/build-legal-pages.mjs`, text in `scripts/legal/`). Credits come from the glTF `asset.extras` of the models that ship; a non-attribution-only (NC) model must never ship.
- Analytics are consent-gated (see Code rules). Account deletion is the `deleteAccount` callable (`functions/src/delete-account.ts`) driven from Settings; any new per-user data path must be added to it and to its emulator test.

---

## Import & Export

- **Kindle:** `src/api/kindle-import.ts` `KindleImport` — parses My Clippings.txt, saves to `NotesStore`.
- **JSON export:** `src/api/export.ts` — assembles books + highlights from stores, returns Blob.
- **PDF export:** entitlement-gated; not yet implemented (stub).
- **Notion sync:** entitlement `sync.notion` defined; service not yet implemented.

---

## Scope

**In:** Reading sessions, Quote of Day, action reminders (7/30/90 day), cross-book search, public profiles, JSON export, AI features by book type, Kindle import, 3D Library, PWA, i18n (en + zh-CN), Lemon Squeezy payments. Active feature development: quick-capture, spaced resurface for Quote of Day, finish ritual, reading stats in Profile, reading card export. See `FEATURES.md` for full implementation specs.

**Out:** Built-in EPUB reader, Mac/Android native app, social features (follows/feeds/likes), team plans, human-curated cultural corpus.
