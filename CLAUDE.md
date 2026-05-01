# Marginalia

> ⚠️ **P0 foundation migration in progress.** Before making any architectural change, read `MIGRATION.md` and the most recent file in `docs/decisions/`. Old (`window.X` globals, raw `<script>` tags, no schema versioning) and new (ES modules, Vite, Firestore `_v: 1`) patterns coexist temporarily. New work follows the target patterns documented below; bridge code is tagged `// TODO(p0-cleanup)`.
>
> If you are starting a Claude Code session, run `/migration-status` first. See `docs/claude-code-commands/README.md`.

A personal reading-records platform — not a reader, not a social network, not a collection. Marginalia owns the *after* of reading: cultural context, knowledge connection, and the conversion of insight into action. Built for readers who care more about depth than count.

---

## Information Architecture

```
Marginalia
├── Shelf       — Browse all books, filter by status
├── Library     — 3D room with shelf wall, sticky-note wall, desk
├── Library 2D  — Flat shelf view (fast path, mobile fallback)
├── Map         — Reading geography by author origin / setting
├── Graph       — Concept network (kept minimal; not a focus area)
├── Booklist    — Yearly reviews, exports, shareable digests
└── Book        — Single-book detail (notes, AI features, actions)
```

`Library` is the canonical name. The previous `studio` naming is deprecated and will be removed during migration.

---

## Tech Stack

| Layer            | Choice                                              |
|------------------|-----------------------------------------------------|
| Frontend         | TypeScript + ES Modules, Vite for build             |
| 3D               | Three.js + CSS3DRenderer (hybrid 2D/3D)             |
| Backend          | Firebase: Auth, Firestore, Storage, Cloud Functions |
| AI               | Anthropic Claude via server-side gateway only       |
| Payments         | Lemon Squeezy or Paddle (handles tax / VAT)         |
| Analytics        | PostHog                                             |
| Error tracking   | Sentry                                              |
| Hosting          | Firebase Hosting (PWA, installable on iPad Safari)  |

No Mac app. No native iOS / Android in v1. PWA is the primary mobile target.

---

## Project Structure

```
marginalia/
├── index.html
├── public/                       # Static assets
│   ├── 3d/                       # GLB models (room, book, props)
│   └── fonts/
├── functions/                    # Cloud Functions (separate package)
│   ├── ai-gateway/
│   ├── billing-webhook/
│   └── account/
├── src/
│   ├── core/                     # Cross-cutting concerns
│   │   ├── app.ts                # SPA router
│   │   ├── event-bus.ts          # Typed pub/sub
│   │   ├── env.ts                # Environment config
│   │   └── i18n.ts               # Locale strings
│   ├── data/
│   │   ├── schema/               # Type definitions, Zod validators
│   │   └── seed/                 # Demo data for unauthenticated visitors
│   ├── services/                 # External-facing singletons
│   │   ├── db.ts                 # Firestore wrapper
│   │   ├── auth.ts
│   │   ├── storage.ts
│   │   ├── ai-gateway.ts         # Calls Cloud Function
│   │   ├── billing.ts            # Subscription status
│   │   └── analytics.ts          # logEvent, logError
│   ├── store/                    # Reactive client state
│   │   ├── books-store.ts
│   │   ├── notes-store.ts
│   │   ├── sessions-store.ts
│   │   └── entitlements-store.ts
│   ├── views/                    # One folder per registered view
│   │   ├── shelf/
│   │   ├── library-2d/
│   │   ├── library-3d/
│   │   ├── map/
│   │   ├── graph/
│   │   ├── booklist/
│   │   └── book/
│   ├── components/               # Cross-view UI primitives
│   │   ├── spine-card/
│   │   ├── book-cover/
│   │   ├── nav-header/
│   │   ├── ai-panel/
│   │   ├── reading-session/
│   │   └── sticky-note/
│   ├── ai/
│   │   ├── features/             # Registry
│   │   └── prompts/              # One file per featureId
│   ├── three/                    # 3D scene infrastructure
│   │   ├── room.ts               # Scene, camera, lighting
│   │   ├── camera-paths.ts       # Cinematic transitions
│   │   ├── slots.ts              # Wall / desk slot system
│   │   └── loaders.ts            # GLB loader, asset manifest
│   └── styles/
│       ├── tokens.css            # Design tokens
│       ├── reset.css
│       └── typography.css
└── CLAUDE.md
```

### Naming conventions

- Folders: kebab-case (`library-3d`, `reading-session`)
- TypeScript files match folder name (`library-3d/library-3d.ts`)
- Types: `PascalCase`. Functions / variables: `camelCase`
- Firestore collections: lowercase plural (`books`, `highlights`)
- CSS classes: scoped to module (`.library-shelf__row`, never `.row`)

---

## View Pattern

Every view in `src/views/{name}/` follows the same shape:

```
{name}/
├── {name}.state.ts    # State shape, getters, setters, subscribers
├── {name}.render.ts   # Pure DOM rendering from state
├── {name}.events.ts   # DOM event listeners → state updates
├── {name}.ts          # Public init / enter exports for the router
└── {name}.css
```

Strict separation:

- `state.ts` has no DOM access.
- `render.ts` has no side effects, no event binding.
- `events.ts` is the only place that maps DOM events to state mutations.

A view registers with the router by exporting `init{Name}` (one-shot) and optionally `enter{Name}` (called every time the view is shown). Adding a new view means: create the folder, register it in `core/app.ts`, add the view container in `index.html`.

No `<script>` tag ordering hacks. No `window.X` globals (see Migration below).

---

## Data Architecture

### Single source of truth

Firestore is the only authoritative store for user data. Local seed data in `src/data/seed/` is used **only** for unauthenticated visitors viewing demo content. No view reads seed data when a user is signed in.

### Firestore schema

```
users/{uid}
├── plan: 'free' | 'pro' | 'lifetime'
├── entitlements: Entitlement[]
├── settings: { language, theme, ... }
├── quota: { aiCreditsRemaining, ... }
└── data/
    ├── books/{bookId}
    │   ├── _v: number               # Schema version
    │   ├── _createdAt
    │   ├── _updatedAt
    │   ├── meta: {...}              # Title, author, ISBN — book-intrinsic
    │   ├── user: {...}              # Status, dates, location, mood
    │   ├── ai: {...}                # AI-generated content (see below)
    │   └── experimental: {...}      # Unstable fields, never relied on by views
    │
    ├── books/{bookId}/highlights/{highlightId}
    │   ├── quote, page, chapter, kind
    │   ├── annotation
    │   └── source: 'manual' | 'notion' | 'apple-books' | 'kindle'
    │
    ├── books/{bookId}/sessions/{sessionId}
    │   └── startedAt, endedAt, durationMs, endPage
    │
    ├── actions/{actionId}           # Cross-book action items
    │   └── bookId, text, status, dueAt, reviewedAt
    │
    └── library_layout               # 2D / 3D shelf positions
        └── shelves: [...]
```

### Schema versioning

Every Firestore document carries `_v: 1` from day one. Migrations are written as `vN → vN+1` transformers in the store layer; views read through stores, which guarantee the latest version. Without `_v`, schema evolution is destructive.

### Account / content split

- `users/{uid}` — Account-level metadata (plan, settings, quota). Subject to billing operations.
- `users/{uid}/data/...` — User content. Subject to export, deletion, backup.

Permanent. Different access rules, retention policies, and export semantics apply to each.

### Mutable AI output

AI-generated content is **always editable**. Each AI block stores both the original generation and the user's revision:

```ts
type AiBlock<T> = {
  original: T;
  userEdited?: T;
  generatedAt: number;
  promptVersion: string;
};
```

Views always render `userEdited ?? original`. Users can fork, edit, or flag any AI output. Without this, AI features are abandoned within months.

---

## AI Architecture

All AI calls go through a Cloud Function gateway. **No Anthropic API key ever touches the client.**

```
Client ──► /api/ai/generate ──► Cloud Function:
                                  1. Verify auth
                                  2. Check entitlements & quota
                                  3. Resolve prompt by featureId
                                  4. Call Anthropic
                                  5. Write audit log
                                  6. Decrement quota
                                  7. Return result
```

### Feature registry

`src/ai/features/registry.ts` maps `featureId → { panel, label, promptId, outputType }`. Adding an AI feature = one registry entry + one prompt file. The registry is the single index of "what AI can do".

### Prompt versioning

Every prompt file declares a `version` string. AI outputs persist their `promptVersion`, so when a prompt changes, old outputs are visibly marked as outdated and can be regenerated.

### Cultural context

Cultural context cards are AI-generated only in v1 (no human curation). UGC-curated context is a far-future possibility, not a near-term commitment.

---

## Entitlements & Monetization

### Plans (initial)

| Plan      | Price        | Notes                                     |
|-----------|--------------|-------------------------------------------|
| Free      | $0           | Forever, with usage caps                  |
| Pro       | ~$5–8 / mo   | Unlimited AI, exports, 3D Library, sync   |
| Lifetime  | one-time     | Early-adopter offer                       |

### Entitlements model

Plans are descriptions; entitlements are truth.

```ts
type Entitlement =
  | 'ai.unlimited'
  | 'export.pdf'
  | 'export.json'
  | 'profile.public'
  | 'profile.customDomain'
  | 'sync.notion'
  | 'library.3d'
  | 'reader.builtin';     // future
```

```ts
const FREE: Entitlement[] = ['export.json', 'profile.public'];
const PRO:  Entitlement[] = [
  ...FREE,
  'ai.unlimited',
  'export.pdf',
  'profile.customDomain',
  'sync.notion',
  'library.3d',
];

PLAN_ENTITLEMENTS = { free: FREE, pro: PRO, lifetime: PRO };
```

Every gated feature checks `hasEntitlement('feature-x')`. **Never** `if (user.plan === 'pro')`. This is enforceable as a lint rule.

### Data ownership

Account data and content data live in different paths and have different export, retention, and access policies. Splitting now means no migration when payments go live.

---

## 3D Library

The 3D Library is a **scene that hosts existing 2D components on planar surfaces** — not a reimplementation of the library in 3D. Books and shelves are not real 3D meshes; they are 2D DOM components projected onto walls via Three.js `CSS3DRenderer`.

### Slot system

The room exposes named slots (walls, desk). Each slot accepts any component implementing the slot interface:

```ts
interface SlotComponent {
  mount(container: HTMLElement): void;
  unmount(): void;
  refresh(): void;
  getDimensions(): { width: number; height: number };
}
```

The room places the slot's container as a `CSS3DObject` on its target plane. The component does not know it's in 3D.

### Initial slot allocation

| Slot        | Mounted component                                  |
|-------------|----------------------------------------------------|
| North wall  | Library shelf (same component used by Library 2D)  |
| West wall   | Sticky notes (highlights as cards)                 |
| Desk        | Currently-reading covers + reading session control |
| Reserved    | Future walls (map, booklist, year-end recap, etc.) |

### 2D / 3D coexistence

Library 2D (fast path, mobile-friendly) and Library 3D (immersive, desktop / iPad) **share the same shelf component**. Bug fixes and feature additions propagate automatically. Library 2D is **not** transitional — it's the permanent fallback for low-end devices, mobile, and accessibility.

### Manual arrangement is intentional

Drag-to-arrange shelves and books is a designed gamification mechanic: it replaces the missing physical sensation of arranging real books on a shelf. It triggers reading planning and habit formation. Auto-arrange (by status / color / size) is a helper, not the primary interaction.

### Performance budget

- 3D room initial load: under 2s on iPad Air baseline
- Frame rate: 60fps on iPad Air, 30fps minimum on lower devices
- Below threshold: fall back to Library 2D with a notice
- GLB compressed via Draco; total textures < 2MB

---

## UI Rules (Strictly Enforced)

### Language

Functional UI text (buttons, tabs, labels, navigation, errors) is in **English** by default, with i18n for other locales. User-generated content (notes, highlights, summaries) preserves the language the user wrote in. Never mix languages within a single functional UI element.

### i18n

- Locales supported initially: `en`, `zh-CN`. Expansion (`ja`, `ko`, `es`, …) follows demand.
- Functional strings live in `src/core/i18n.ts` keyed by stable IDs.
- User content is locale-agnostic; users write in any language they want.
- Locale is a user preference (`users/{uid}.settings.language`), not browser-detected.

### Casing

- Sentence case for buttons and short labels: `Add highlight`, `Save`, `Cancel`
- Title Case for section and panel headings: `Key Notes & Highlights`
- All-caps **forbidden**, except for acknowledged abbreviations (API, AI, URL, ISBN)

### Borders

- Default to `solid`. `dashed` and `dotted` are forbidden on buttons, inputs, cards, and container borders. Allowed only as decorative dividers (e.g., between list items).

### Typography

- `var(--font-serif)` (Fraunces) — primary UI body and headings
- `var(--font-mono)` (IBM Plex Mono) — numeric labels, metadata tags (`p. 12`, `CONCEPT`, `01`)
- `var(--font-display)` (Bodoni Moda) — book covers only
- System sans-serif fallback is forbidden in functional UI

### Visual consistency

- Buttons, icons, and headings have one source of truth in `src/components/`. Pages do not roll their own.
- Icons are SVG `<symbol>`s defined once in `index.html`, referenced via `<use>`.
- Color tokens live in `src/styles/tokens.css`. No raw hex in component CSS.

### Responsive

- Layouts adapt from 360px to 2560px width
- Touch targets ≥ 44px on touch devices
- Library 3D degrades to Library 2D below 768px or on low-GPU devices
- All views must be usable on iPad Safari (primary mobile target)

---

## Conventions

### Documentation

- All comments and docs are in English.
- Prefer self-explanatory structure over comment blocks. If a function needs a comment to be understood, the function is too long.
- Each module has a 1–2 line header declaring its purpose. No more.

### Error handling

- Every async boundary catches and forwards to `services/analytics.ts → logError`.
- User-facing errors use the standard `<error-banner>` component.
- No `console.warn` in production paths — use `logger.warn(category, message)`.

### Security

- Firestore Rules deny by default; allow per-collection with explicit `request.auth.uid == uid` checks.
- Storage Rules: cover image uploads only to `users/{uid}/covers/`, ≤ 2MB, image MIME enforced.
- Cloud Functions rate-limit per user (token bucket).
- Inbound writes validated with Zod before reaching Firestore.

### Testing

- Mandatory unit tests: entitlements logic, billing webhook handler, schema validators, export pipeline.
- E2E (Playwright): sign-up → add book → highlight; free → upgrade → entitlements live.
- Snapshot tests for view rendering are encouraged but not required.

### Git & deploy

- Branches: `main` (prod), `dev` (staging). Feature branches off `dev`.
- `main` deploys to `marginalia-prod`. `dev` to `marginalia-dev`.
- Pre-deploy: lint + tests must pass.

---

## Scope

### In scope

- Reading session timer (start / stop / "want to note something?" prompt)
- Quote of the Day on home (3 rotating past highlights)
- Action follow-up reminders (30-day, quarterly)
- Cross-book full-text search
- Public profile pages (`marginalia.app/{slug}`)
- Data export (JSON, Markdown; PDF later)
- AI-assisted cultural context (generation only, no human curation in v1)
- Notion / Apple Books / Kindle import
- 3D Library (CSS3DRenderer slot architecture)
- PWA, installable on iPad Safari
- i18n (en, zh-CN initially)

### Out of scope

- Built-in EPUB reader (web; reconsider for iPad native v2)
- Mac native app
- Android native app (v1)
- Social features (follows, comments, feeds)
- Heavy concept graph (current minimal version stays)
- Human-curated cultural corpus (UGC mode is far future)
- Team / family plans

---

## Roadmap

### P0 — Foundation (now)

1. Vite + TypeScript build system, ES modules
2. Firebase environment split (dev / prod projects)
3. AI calls migrated to Cloud Function gateway
4. Entitlements framework + plan / quota fields on user document
5. Firestore documents wrapped with `_v: 1`
6. Sentry + PostHog wired
7. Firestore + Storage rules audit
8. Waitlist form for incoming social-media traffic

### P1 — Core (this month)

9. Reading session feature
10. Single source of truth: views read from `store/` only
11. Quote of the Day on home
12. JSON + Markdown export
13. Responsive baseline (iPad Safari usable end-to-end)
14. Lemon Squeezy / Paddle integration; Pro plan live
15. AI output edit-and-save (`userEdited ?? original` pattern)

### P2 — Differentiation (next quarter)

16. 3D Library v1 (CSS3DRenderer + room scene + Library wall)
17. Sticky notes wall + desk with currently-reading
18. Public profile pages
19. Action follow-up reminders
20. Notion / Apple Books / Kindle import
21. i18n: zh-CN locale complete
22. Reading-progress visualization for `reading` status

### P3 — Later

23. iPad PWA polish (Capacitor wrap if App Store discovery helps)
24. Cultural context corpus (human-curated, post-UGC)
25. Native iPad app — only if iPad DAU > 20% and users demand a built-in EPUB reader

---

## Migration Notes (Transitional)

The repository is mid-transition from prototype to production architecture. Current state vs. target state:

| Area                  | Current                                    | Target                                |
|-----------------------|--------------------------------------------|---------------------------------------|
| Build                 | No build, raw `<script>` tags              | Vite + TypeScript                     |
| Module system         | `window.X` globals everywhere              | ES Modules with explicit imports      |
| Book data             | 5 sources merged at runtime                | Single Firestore book document        |
| AI calls              | Client-side (key may be exposed)           | Cloud Function gateway                |
| View files            | Single large file per view                 | `state` / `render` / `events` split   |
| Folder name `studio/` | Mixed with `library` semantics             | Renamed to `library-2d/`              |
| Entitlements          | None                                       | `entitlements[]` on user document     |
| Firestore docs        | No version field                           | `_v: 1` wrapper on all writes         |

The 3D Library is built as a **new view** that wraps the existing Library 2D component via slots; no parallel implementation. The 2D view remains a permanent fallback.

The book detail schema and concept graph schema are deliberately **not finalized**. New fields land in `book.experimental` until validated; graph data is kept derivable from `book.tags` rather than stored as edges.
