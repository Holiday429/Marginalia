# Marginalia

A personal reading-records platform. Marginalia owns the *after* of reading: cultural context, knowledge connection, and the conversion of insight into action.

**Current state:** P0 + P1 + P2 (phases 1–5) complete. Foundation is stable. Active work is on Book detail page refactor, UI consistency, and navigation structure.

**Code rules:** ES modules + explicit imports only. No `window.X` globals — any remaining ones are bugs to fix, not patterns to follow. No `<script>` tag ordering hacks.

---

## Information Architecture

```
Marginalia
├── Shelf       — Browse + filter all books (default landing)
├── Library     — 3D room (shelf wall, sticky-note wall, desk); degrades to Library 2D on mobile / low-GPU
├── Library 2D  — Permanent fallback: flat draggable shelf, shared component with Library 3D
├── Map         — Reading geography by author origin / setting
├── Booklist    — Yearly reviews, exports, shareable digests
└── Book        — Single-book detail (notes, AI features, actions)
```

Graph view exists as a stub only — no menu entry until it has a real implementation.

---

## Tech Stack

| Layer          | Choice                                              |
|----------------|-----------------------------------------------------|
| Frontend       | TypeScript + ES Modules, Vite                       |
| 3D             | Three.js + CSS3DRenderer (hybrid 2D/3D)             |
| Backend        | Firebase: Auth, Firestore, Storage, Cloud Functions |
| AI             | DeepSeek API (via OpenAI SDK) through Cloud Function gateway only |
| Payments       | Lemon Squeezy (webhook + entitlements wired)        |
| Analytics      | PostHog + Sentry                                    |
| Hosting        | Firebase Hosting (PWA, installable on iPad Safari)  |

No Mac app. No native iOS/Android in v1. PWA is the primary mobile target.

---

## Project Structure

```
src/
├── core/           # app.ts (router), i18n.ts, env.ts
├── data/
│   ├── schema/     # Zod validators + TypeScript types
│   └── seed/       # Demo data for unauthenticated visitors only
├── services/       # db.ts, auth.ts, ai-gateway.ts, billing.ts, analytics.ts
├── store/          # Reactive Firestore listeners: books, highlights, notes, actions, entitlements, ai-results
├── {view}/         # Views live at src/{name}/ (e.g. src/shelf/, src/book/)
├── components/     # Cross-view primitives: spine-card, reading-session, action-notifications, notes-wall
├── ai/
│   ├── features/   # registry.js — featureId → { panel, label, promptId, outputType }
│   └── prompts/    # One file per featureId
├── three/          # room.ts, camera-paths.ts, slots.ts, skins.ts
└── three-room/     # three-room-view.js — 3D room view controller
```

### Naming

- Folders: kebab-case. TS files match folder name.
- Types: `PascalCase`. Functions/variables: `camelCase`.
- Firestore collections: lowercase plural (`books`, `highlights`).
- CSS classes: scoped to module (`.book-section__title`, never `.title`).

---

## View Pattern

Every view follows the same shape:

```
{name}/
├── {name}.state.ts    # State shape + getters/setters. No DOM access.
├── {name}.render.ts   # Pure DOM rendering from state. No side effects, no event binding.
├── {name}.events.ts   # DOM event listeners → state mutations only.
├── {name}.ts          # Exports initName (one-shot) + enterName (called on each show).
└── {name}.css
```

Register in `src/core/view-registry.ts` + add a container div in `index.html`.

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
    ├── books/{bookId}          — _v:1, meta, user, ai, experimental
    ├── highlights/{id}         — bookId, quote, annotation, source
    ├── notes/{id}
    ├── actions/{id}            — status: open|snoozed|done|archived
    ├── sessions/{id}           — reading timer records
    ├── ai_results/{featureId}  — cached AI outputs
    └── library_layout          — shelf drag state

workspaces/{wsId}/notifications/{uid}/unread/{id}
```

**Schema versioning:** Every document carries `_v: 1`. Migrations are `vN → vN+1` transformers in the store layer. Views read through stores, which guarantee current version.

**Seed data** (`src/data/seed/`) is used only for unauthenticated demo visitors. No view reads seed data when a user is signed in.

### Mutable AI output

```ts
type AiBlock<T> = {
  original: T;
  userEdited?: T;
  generatedAt: number;
  promptVersion: string;
};
```

Views always render `userEdited ?? original`.

---

## AI Architecture

All AI calls go through a Cloud Function. No API key ever touches the client.

```
Client → POST /ai-generate → Cloud Function:
  1. Verify auth + entitlements + quota
  2. Resolve prompt by featureId (from registry)
  3. Call DeepSeek, write audit log, decrement quota
  4. Return structured result
```

`src/ai/features/registry.js` is the single index of all AI features. Adding a feature = one registry entry + one prompt file. Every prompt file declares a `version` string; AI outputs store `promptVersion` so stale outputs can be flagged.

### AI features by book type

| Book type        | Features                                      |
|------------------|-----------------------------------------------|
| Fiction          | character-map, timeline-gen                   |
| Nonfiction       | concept-cards, mindmap-gen                    |
| Social science   | argument-breakdown                            |
| Travel           | geo-context                                   |
| Essay / self-help| action-suggest                                |

---

## Entitlements

Plans are descriptions; entitlements are truth. Never `if (plan === 'pro')` — always `hasEntitlement('feature-x')`.

```ts
type Entitlement = 'ai.unlimited' | 'export.pdf' | 'export.json'
  | 'profile.public' | 'profile.customDomain' | 'sync.notion' | 'library.3d';

FREE:     ['export.json', 'profile.public']
PRO:      [...FREE, 'ai.unlimited', 'export.pdf', 'profile.customDomain', 'sync.notion', 'library.3d']
LIFETIME: same as PRO
```

---

## 3D Library

The 3D room hosts existing 2D components on CSS3DRenderer planes — not a reimplementation. Books and shelves are DOM components projected onto walls.

The room exposes named slots. Each slot takes any `SlotComponent`:

```ts
interface SlotComponent {
  mount(container: HTMLElement): void;
  unmount(): void;
  refresh(): void;
  getDimensions(): { width: number; height: number };
}
```

| Slot       | Mounted component                          |
|------------|--------------------------------------------|
| North wall | Library shelf (shared with Library 2D)     |
| West wall  | Sticky notes (highlights as cards)         |
| Desk       | Currently-reading + reading session timer  |

Library 2D and Library 3D share the same shelf component. Library 2D is a permanent fallback, not a transitional state. Drag-to-arrange is an intentional gamification mechanic — do not replace with auto-sort.

Performance budget: 3D load < 2s on iPad Air; 60fps target, 30fps minimum; auto-fallback to Library 2D below threshold.

---

## UI Rules

**Typography:** `var(--font-serif)` (Fraunces) for body/headings. `var(--font-mono)` (IBM Plex Mono) for labels/metadata. `var(--font-display)` (Bodoni Moda) for book covers only. No system sans-serif in functional UI. No legacy fonts (Cormorant, Libre Caslon, Inter, Caveat).

**Color:** Tokens in `src/core/base.css`. No raw hex values in component CSS.

**Borders:** `solid` only. `dashed`/`dotted` forbidden on interactive elements — decorative dividers only.

**Casing:** Sentence case for buttons/labels (`Add highlight`). Title Case for section headings (`Key Notes & Highlights`). All-caps forbidden except abbreviations (AI, ISBN, URL).

**Components:** Buttons, icons, headings have one source of truth in `src/components/`. Views do not roll their own. Icons are SVG `<symbol>`s in `index.html`, referenced via `<use>`.

**Responsive:** 360px–2560px. Touch targets ≥ 44px. iPad Safari is the primary mobile target.

**Language:** Functional UI in English (i18n via `src/core/i18n.ts`). User content preserves whatever language the user wrote in.

---

## Conventions

- All comments and docs in English.
- Every async boundary catches and forwards to `logError` in `services/analytics.ts`.
- User-facing errors use the `<error-banner>` component.
- No `console.warn` in production paths.
- Firestore Rules deny by default; explicit `request.auth.uid == uid` per collection.
- Inbound writes validated with Zod before Firestore.
- Cloud Functions rate-limited per user.

---

## Scope

**In:** Reading sessions, Quote of Day, action reminders, cross-book search, public profiles, JSON/Markdown export, AI cultural context, Notion/Kindle import, 3D Library, PWA, i18n (en + zh-CN).

**Out:** Built-in EPUB reader, Mac/Android native app, social features (follows/feeds), heavy concept graph, human-curated cultural corpus, team plans.
