# Marginalia

A personal reading-records platform. Marginalia owns the *after* of reading: cultural context, knowledge connection, and the conversion of insight into action.

**Current state:** Foundation stable. Active work: Book detail page panels, Graph transition animation, spaced-repetition reminder system, and session data aggregation in Profile.

**Code rules:**
- ES modules + explicit imports everywhere. No `window.X` globals — any remaining ones are bugs to fix, not patterns to follow.
- `M` namespace (`src/core/namespace.ts`) is the migration target. When touching old globals, migrate them to the appropriate `M.*` branch.
- No `<script>` tag ordering hacks.
- Every Firestore write must go through `withMeta()` / `withMetaCreate()` from `services/db.ts` and be validated with a Zod schema first.
- Never check `plan === 'pro'`. Always use `hasEntitlement('feature-x')`.

---

## Information Architecture

```
Marginalia
├── Search (view-search)   — Browse + filter all books; default landing after room
├── Room (3D)              — Persistent shell; never toggled by show(). Camera moves between poses.
│   ├── Shelf Wall         — Library 2D component mounted as CSS3D plane on the north wall
│   ├── Notes Wall         — Highlights as sticky cards on the east wall
│   └── Desk               — Currently-reading book + reading session timer
├── Library 2D             — Permanent fallback: flat draggable shelf (shared component with Room shelf wall)
├── Map (panel-map)        — Reading geography by author origin / content location / reader anchor
├── Graph (panel-web)      — D3 concept/book network (src/web/web.js)
├── Profile (panel-profile)— Public profile, reading identity, heatmap, annual shelf
└── Book (panel-book)      — Single-book detail: panels vary by book type (AI features, highlights, actions)
```

**Nav aliases** (handled in `app.js` `toCanonicalViewName`):
- `graph` → `web` (internal id)
- `shelf` → `search`
- `studio` → `library`

---

## Tech Stack

| Layer     | Choice                                                              |
|-----------|---------------------------------------------------------------------|
| Frontend  | TypeScript + ES Modules, Vite                                       |
| 3D        | Three.js r145+ + CSS3DRenderer (hybrid 2D/3D)                       |
| Backend   | Firebase: Auth, Firestore, Storage, Cloud Functions (gen2)          |
| AI        | DeepSeek API via Cloud Function gateway only (`VITE_AI_GATEWAY_URL`)|
| Payments  | Lemon Squeezy — `services/billing.ts` → `VITE_CHECKOUT_URL`        |
| Analytics | PostHog (`VITE_POSTHOG_KEY`) + Sentry (`VITE_SENTRY_DSN`)          |
| Hosting   | Vercel (`.vercel/project.json` present). PWA installable on iPad.   |

No Mac app. No native iOS/Android in v1. PWA + iPad Safari is the primary mobile target.

---

## Project Structure

```
src/
├── core/
│   ├── app.js            — SPA router: App.show(), App.navigateTo(), nav rendering
│   ├── panel-manager.js  — Overlay panel lifecycle (open/close/transition)
│   ├── view-registry.ts  — Static map of viewId → { init?, enter?, enterPanel? }
│   ├── namespace.ts      — M root object (migration target for all globals)
│   ├── namespace.types.ts— TypeScript branches of M
│   ├── env.ts            — Typed Vite env vars (VITE_*)
│   ├── graph-data.js     — MarginaliaGraph: concept↔book link store
│   ├── concept-ui.js     — Concept drawer open/close
│   ├── primary-tabs.js   — Top nav tab bar renderer
│   └── i18n.ts           — i18n helper (en + zh-CN)
├── data/
│   ├── schema/           — Zod validators + TS types (book, highlight, action, reading-session, …)
│   ├── schema/book-types.js — BOOK_TYPES registry: defaultPanels + defaultAiFeatures per type
│   ├── mock/             — seed-spines.js (landing page mock data only)
│   └── seed/             — Demo data for unauthenticated visitors only
├── services/
│   ├── db.ts             — withMeta / withMetaCreate / validateWrite / isLegacyDoc
│   ├── ai-gateway.ts     — MarginaliaAI.generate() / generateJSON() via Cloud Function
│   ├── billing.ts        — getCheckoutUrl() → Lemon Squeezy
│   └── analytics.ts      — logEvent / logError (PostHog + Sentry)
├── store/
│   ├── books-store.ts    — Firestore onSnapshot for all user books; emits marginalia:books-changed
│   ├── highlights-store.ts — collectionGroup('highlights') listener; emits marginalia:highlights-changed
│   ├── notes-store.js    — IndexedDB (+ Firestore flush): highlights, notes, actions, ai-results, user-books
│   ├── actions-store.ts  — Firestore actions collection listener
│   ├── ai-results-store.ts — Cached AI output store
│   └── entitlements-store.ts — Plan → entitlement resolver
├── firebase/
│   ├── auth.js           — MarginaliaAuth (Firebase Auth wrapper)
│   ├── config.js         — MARGINALIA_FIREBASE config from ENV
│   └── db.js             — MarginaliaStorage, MarginaliaBooksCloud
├── ai/
│   ├── client/generate-ui.ts — AIGenerateUI (trigger AI, stream into panel)
│   ├── features/registry.js  — AIFeatureRegistry: featureId → { panel, label, promptId, outputType }
│   └── features/prompts/     — One .js per featureId; each calls AIFeatureRegistry.setPrompt(id, { build })
├── components/
│   ├── spine-card.js                    — SpineCard: reusable book spine tile
│   ├── hero-book/hero-book.js           — HeroBook: 3D-flip currently-reading book component
│   ├── notes-wall/notes-wall.js         — NotesWall: highlights as sticky cards (CSS3D slot)
│   ├── pixel-avatar/pixel-avatar.ts     — PixelReader: pixel-art avatar renderer
│   ├── reading-session/reading-session.ts — Focus timer controller (sessionStorage-backed)
│   ├── reading-session/desk-slot.ts     — DeskSlotComponent: SlotComponent wrapper for desk
│   ├── reading-session/focus-widget.ts  — Focus widget UI
│   └── action-notifications/            — Action reminder notification component
├── three/
│   ├── room.ts           — RoomScene class: loads all GLBs, CSS3DRenderer, raycasting, interactive targets
│   ├── camera-paths.ts   — POSES: front | approach | shelf | notes (positions + FOV + idle amplitude)
│   ├── slots.ts          — SlotComponent interface + createPlaceholderSlotComponent
│   └── skins.ts          — ROOM_SKINS: warm-study | mist-morning | … (color + lighting presets)
├── three-room/
│   ├── three-room-view.js — initRoom / enterRoom; all room→panel navigation logic
│   ├── three-room.js      — createThreeRoomPreview(): mounts RoomScene + all slot components
│   ├── frame-fly.js       — Profile transition: picture frame animation (playFrameFlyIn / settleFrameFlyIn)
│   └── three-room.css
├── search/
│   ├── search.js          — initSearch / enterSearch / renderSearchSection
│   └── search-decor-3d.js — Decorative open-book Three.js object on the search page
├── library-2d/
│   ├── library-2d.js      — initLibrary / enterLibrary; drag-to-arrange shelf
│   ├── library-2d-slot.ts — createShelfWallComponent(): SlotComponent for the 3D room north wall
│   ├── library-2d-state.js
│   └── library-2d-template.js
├── map/
│   ├── map.js             — initMap / enterMap
│   ├── map-globe.js       — Interactive Leaflet/SVG world map
│   ├── globe-fly.js       — Map transition: globe animation (playGlobeFlyIn)
│   └── geo-profiles.js    — Country → author/book data
├── web/
│   └── web.js             — initWeb / enterWeb; D3 concept graph
├── profile/
│   ├── profile.ts         — initProfile / enterProfile; public + own profile rendering
│   ├── profile-heatmap.ts — Reading heatmap component
│   ├── profile-map.ts     — ProfileMap: geographic reading footprint mini-map
│   ├── profile-year-in-review.ts — ProfileAnnualShelf: yearly reading shelf
│   ├── profile-settings.ts
│   ├── profile-types.ts   — PublicProfileData, PublicBook, SessionDay, DemoPayload types
│   ├── profile-demo-resolver.ts  — Demo profile builder (unauthenticated)
│   ├── reading-identity.ts       — mountReadingIdentity (AI portrait section)
│   ├── reading-identity-service.ts
│   ├── reading-identity-types.ts
│   └── annual-shelf-store.ts     — loadAnnualShelf()
├── book/
│   ├── book.js            — initBook / enterBook; merges store data + seed; renders panel tabs
│   ├── book-detail.js     — buildBookDetailModel() / BOOK_SECTION_LABELS
│   └── panels/
│       ├── registry.js    — PanelRegistry: panelId → { label, icon, render }
│       ├── overview.js, highlights.js, notes.js, actions.js (universal)
│       ├── characters.js, timeline.js (fiction)
│       ├── mindmap.js, concept-cards.js (nonfiction / social)
│       ├── geo-context.js (travel)
│       └── claude-import.js (visual notes import)
├── new-entry/
│   └── new-entry.js       — NewEntry: Add Book form with spine customisation
├── api/
│   ├── export.ts          — JSON export assembler (books + highlights)
│   └── kindle-import.js   — KindleImport: My Clippings.txt parser + UI
├── shared/
│   ├── shelf-utils.ts     — containsCJK, getUnifiedShelfSpineSize
│   └── spine-colors.js    — SPINE_COLORS palette
└── preloader/
    ├── preloader.js       — Landing page (book-spine splash + Enter Library)
    └── hero-glb.js        — mountHeroGLB(): Three.js book flip for hero-book exit
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

Register the view in `src/core/view-registry.ts`. Add `<div id="panel-{name}" hidden>` in `index.html` (exception: `search` uses `view-search` as its element id; see `PANEL_ELEMENT_ID` in `panel-manager.js`).

---

## 3D Room — Interactive Objects & Navigation

The room (`src/three/room.ts` `RoomScene`) registers interactive 3D objects via `INTERACTIVE_ASSETS`. Each has an `interactiveAction` string that maps to a callback in `RoomSceneOptions`. **Do not add interactive objects by any other mechanism.**

### Current interactive objects

| Object id       | GLB                          | interactiveAction | Triggers                    |
|-----------------|------------------------------|-------------------|-----------------------------|
| `hero-book-shelf` | `/book.glb` (left wall)    | `heroBook`        | `onHeroBookSelect`          |
| `bookshelf-a`   | `/3d/book_shelf.glb`         | `organize`        | `onOrganizeSelect`          |
| `bookshelf-b`   | `/3d/bookshelf real.glb`     | `organize`        | `onOrganizeSelect`          |
| `globe`         | `/3d/antique_globe.glb`      | `map`             | `onGlobeSelect`             |
| `macbook`       | `/3d/macbook.glb`            | `shelf`           | `onLaptopSelect`            |
| `desk-book-sapiens` | `/book.glb` (desk)       | `sapiens`         | `onSapiensSelect`           |
| `picture-frame` | `/3d/wooden_picture_frame.glb` | `profile`       | `onPhotoFrameSelect`        |
| `graph-board`   | `/3d/messy_tack_board.glb`   | `graph`           | `onWebSelect`               |

### Camera poses (`src/three/camera-paths.ts`)

| Pose id    | Facing           | Used when entering     |
|------------|------------------|------------------------|
| `front`    | Room centre      | Default / approach     |
| `approach` | Desk from above  | Book detail            |
| `shelf`    | North wall       | Search / Library       |
| `notes`    | East wall        | Graph / Notes Wall     |

To add a new pose: add to `POSES` in `camera-paths.ts`, add to `PANEL_POSES` map in `three-room-view.js`.

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
| Book      | `desk-book-sapiens` | `sapiens`         | ✅ Implemented   | `src/book/book-fly.js`        |

### Reference

Before touching any transition code, read these files — they are the source of truth:

- `src/map/globe-fly.js` — baseline pattern for overlay lifecycle
- `src/three-room/frame-fly.js` — GLB texture swap, CSS handoff, multi-phase animation
- `src/three-room/three-room-view.js` — `exitRoomViaGlobeFly()` / `exitRoomViaFrameFly()` show the exact `ROOM_VIEW_STATE` + `.finally()` wiring

**Never:** navigate before `onLanded` fires; skip `.finally()`; leave a WebGLRenderer alive after the Promise resolves; darken the overlay before the first GLB frame renders.

---

## Data Architecture

### Firestore schema

```
workspaces/{wsId}/users/{uid}/
├── meta/
│   ├── user_profile   — displayName, email, profileSlug, bio, avatar
│   ├── entitlements   — plan, features[], expiryDate
│   └── settings       — language, theme, notifications
└── data/
    ├── books/{bookId}              — _v:1, BookSchema fields
    ├── books/{bookId}/highlights/{id}  — HighlightSchema (_v:1, bookId, quote, source, kind, page)
    ├── books/{bookId}/sessions/{id}    — ReadingSessionSchema (_v:1, bookId, startedAt, endedAt, durationMs)
    ├── notes/{id}                  — book notes (free text)
    ├── actions/{id}                — ActionSchema (_v:1, bookId, text, status, remind*At, reminded*)
    ├── ai_results/{featureId}      — AiBlock<T>: { original, userEdited?, generatedAt, promptVersion }
    └── library_layout              — shelf drag-to-arrange state
```

**Schema versioning:** Every document has `_v: 1`. Use `isLegacyDoc()` to detect old documents; migrate in the store layer. Views never read raw Firestore docs — always go through stores.

**Seed data** (`src/data/seed/`) is used only for unauthenticated demo visitors. Never read seed data when `MarginaliaAuth.user` is set.

### Key Zod schemas (`src/data/schema/`)

| File                  | Validates                              |
|-----------------------|----------------------------------------|
| `book.ts`             | BookSchema — cover, status, geo, dates |
| `highlight.ts`        | HighlightSchema — quote, kind, source  |
| `action.ts`           | ActionSchema — text, status, remind*At |
| `reading-session.ts`  | ReadingSessionSchema — startedAt, durationMs |
| `ai-block.ts`         | AiBlock<T> wrapper                     |
| `entitlements.ts`     | Entitlement union type + PLAN_ENTITLEMENTS |
| `book-types.js`       | BOOK_TYPES: defaultPanels + defaultAiFeatures |

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
Client: MarginaliaAI.generate({ featureId, prompt, onChunk, onDone })
  → POST VITE_AI_GATEWAY_URL with Firebase ID token
    → Cloud Function: verify auth + entitlements + quota → call DeepSeek → audit log → return

Client: AIGenerateUI (src/ai/client/generate-ui.ts)
  → higher-level: resolves prompt via AIFeatureRegistry.buildPrompt(), streams into panel container
```

`src/ai/features/registry.js` `AIFeatureRegistry` is the single index of all AI features.

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

1. Add entry to `AIFeatureRegistry._features` in `registry.js`.
2. Create `src/ai/features/prompts/{id}.js` — call `AIFeatureRegistry.setPrompt('{id}', { build(book) { return promptString; } })`.
3. Add panel entry to `PanelRegistry` in `src/book/panels/registry.js`.
4. Create `src/book/panels/{id}.js` — call `PanelRegistry.set('{id}', renderFn)`.
5. Add feature to the appropriate book type in `BOOK_TYPES` `defaultAiFeatures`.

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
PRO:      [...FREE, 'ai.unlimited', 'export.pdf', 'profile.customDomain', 'sync.notion', 'library.3d']
LIFETIME: same as PRO
```

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
| `shelfWall`  | North     | `createShelfWallComponent()` — Library 2D spine view |
| `notesWall`  | East      | `createNotesWallComponent()` — highlights as cards  |
| `desk`       | Desk      | `createDeskSlotComponent()` — reading session timer  |

Library 2D and the 3D shelf wall share the same underlying component. Drag-to-arrange is an intentional gamification mechanic — never replace with auto-sort.

**Performance budget:** 3D initial load < 2s on iPad Air; 60fps target, 30fps floor. Auto-fallback to Library 2D when GPU benchmark fails.

---

## Reading Session

`src/components/reading-session/reading-session.ts` is the site-wide focus timer.

- Active session stored in `sessionStorage` under key `marginalia:session`. Survives page reloads.
- On start: writes a Firestore doc at `…/books/{bookId}/sessions/{sessionId}` via `ReadingSessionSchema`.
- Emits `marginalia:session-changed` custom event on state changes.
- `bookId` attribution is optional — sessions without a book are allowed.
- **Note:** `ReadingSessionSchema` marks itself "stub — sessions not yet written by the client (P1 feature)". The schema and write path are defined; the full aggregation pipeline is not yet implemented.

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
- Every async boundary: catch and forward to `logError(err, context)` from `services/analytics.ts`.
- User-facing errors: `<error-banner>` component. No raw `alert()`.
- No `console.warn` / `console.log` in production paths.
- Firestore Rules: deny by default; explicit `request.auth.uid == uid` per collection.
- Inbound writes: validate with Zod → `withMeta/withMetaCreate` → Firestore. This order is mandatory.
- Cloud Functions: rate-limited per user; no API key on client.
- CSS classes: scoped to module (`.book-section__title` not `.title`). BEM-style encouraged.

---

## Import & Export

- **Kindle:** `src/api/kindle-import.js` `KindleImport` — parses My Clippings.txt, saves to `NotesStore`.
- **JSON export:** `src/api/export.ts` — assembles books + highlights from stores, returns Blob.
- **PDF export:** entitlement-gated; not yet implemented (stub).
- **Notion sync:** entitlement `sync.notion` defined; service not yet implemented.

---

## Scope

**In:** Reading sessions, Quote of Day, action reminders (7/30/90 day), cross-book search, public profiles, JSON export, AI features by book type, Kindle import, 3D Library, PWA, i18n (en + zh-CN), Lemon Squeezy payments. Active feature development: quick-capture, spaced resurface for Quote of Day, finish ritual, reading stats in Profile, reading card export. See `FEATURES.md` for full implementation specs.

**Out:** Built-in EPUB reader, Mac/Android native app, social features (follows/feeds/likes), team plans, human-curated cultural corpus.
