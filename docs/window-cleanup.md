# Window Global Cleanup

**Goal:** Replace all `window.X` module references with direct ES module imports. No behaviour changes — identical runtime output, just clean dependency wiring.

**Ground rules:**
- One batch per commit. Run `npm run typecheck` and manually verify the affected views in the browser before committing.
- Do not touch: `window.addEventListener`, `window.dispatchEvent`, `window.setTimeout`, `window.innerWidth`, `window.location`, `window.scrollTo`, `window.requestAnimationFrame`, `window.CSS`, `window.ResizeObserver`, `window.localStorage`, `window.parent`, `window.scrollY` — these are browser built-ins, not module globals.
- `window.firebase` (Firebase compat SDK) stays — it is a CDN script, not a module.
- The preloader (`src/preloader/preloader.js`) is animation-only and uses no real user data. Its two `window.` references are intentional or benign — see notes at the end of this file. Do not touch it unless specifically instructed.
- After all batches are done, delete `src/core/namespace.ts` and the `M.*` assignments in `src/main.js`.

---

## Batch 1 — Data globals

These are the most widely referenced. Clear them first so every view reads from `BooksStore` only.

### What to remove from `src/main.js`

Delete these import + assignment lines entirely:

```js
import { BOOKS, SHELF_BOOKS } from './data/mock/seed-spines.js';
import { BOOKLIST_CURATED } from './data/mock/curated-booklist.js';
import { __SEED_SAPIENS } from './data/seed/sapiens.js';
import { BOOK_DETAILS, BOOK_BY_ID } from './data/seed/index.js';
M.data.BOOKS = BOOKS;
M.data.SHELF_BOOKS = SHELF_BOOKS;
M.data.BOOKLIST_CURATED = BOOKLIST_CURATED;
M.data.__SEED_SAPIENS = __SEED_SAPIENS;
M.data.BOOK_DETAILS = BOOK_DETAILS;
M.data.BOOK_BY_ID = BOOK_BY_ID;
```

### Files to update

**`src/shelf/shelf.js`**

Replace every `window.BOOK_DETAILS`, `window.BOOK_BY_ID`, `window.SHELF_BOOKS` reference.

Add at top of file:
```js
import { BooksStore } from '../store/books-store.ts';
import { BOOKS as SHELF_BOOKS, SEED_BOOK_BY_ID, SEED_BOOK_DETAILS } from '../data/seed/index.js';
```

- `window.BOOK_DETAILS` → `BooksStore.getAll()` (when user is signed in) or `SEED_BOOK_DETAILS` (unauthenticated demo path)
- `window.SHELF_BOOKS` → `SHELF_BOOKS` (this is mock spine data used only for the 2D shelf display, not real user books)
- `window.BOOK_BY_ID?.[id]` → `BooksStore.getById(id) ?? SEED_BOOK_BY_ID[id]`
- Line 94 `window.renderShelfSection = refreshShelfFromSource` → delete; `renderShelfSection` is already exported as a named export at the bottom of the file
- Line 264–265 where `window.BOOK_DETAILS.push(...)` and `window.BOOK_BY_ID[id] = ...` are called → these are mutating the global seed array to inject a newly-created book. Replace with `BooksStore.add(detail)` and remove the manual push entirely.

**`src/library-2d/library-2d.js`**

Add at top:
```js
import { BooksStore } from '../store/books-store.ts';
import { BOOKS as SHELF_BOOKS } from '../data/mock/seed-spines.js';
import { SEED_BOOK_BY_ID } from '../data/seed/index.js';
```

- `window.SHELF_BOOKS` → `SHELF_BOOKS`
- `window.BOOK_BY_ID?.[id]` → `BooksStore.getById(id) ?? SEED_BOOK_BY_ID[id]`

**`src/booklist/booklist.js`**

Add at top:
```js
import { BOOKLIST_CURATED } from '../data/mock/curated-booklist.js';
```

- Replace `window.BOOKLIST_CURATED` → `BOOKLIST_CURATED`

**`src/firebase/db.js`**

- `window.BOOK_BY_ID?.[bookId]` (lines 66, 71) → import and use `SEED_BOOK_BY_ID` from `../data/seed/index.js`
- `window.BOOK_DETAILS` (line 71) → import `SEED_BOOK_DETAILS` from `../data/seed/index.js`

**`src/core/graph-data.js`**

- `window.BOOK_DETAILS` (line 35) → import `SEED_BOOK_DETAILS` from `../data/seed/index.js`
- `window.BOOK_BY_ID?.[bookId]` (line 337) → `BooksStore.getById(bookId) ?? SEED_BOOK_BY_ID[bookId]`

**`src/book/book.js`**

- Line 18: `window.BOOK_BY_ID && window.BOOK_BY_ID[id]` → already has `BooksStore.getById(id)` as primary. Remove the `?? (window.BOOK_BY_ID && window.BOOK_BY_ID[id])` fallback and the TODO comment.

**Verify:** After this batch, grep confirms zero remaining references to `window.BOOK_DETAILS`, `window.BOOK_BY_ID`, `window.SHELF_BOOKS`, `window.BOOKLIST_CURATED`, `window.__SEED_SAPIENS`.

---

## Batch 2 — Service singletons

### What to remove from `src/main.js`

```js
M.services.MARGINALIA_FIREBASE = MARGINALIA_FIREBASE;
M.services.MarginaliaAuth = MarginaliaAuth;
M.services.MarginaliaBooksCloud = MarginaliaBooksCloud;
M.services.MarginaliaStorage = MarginaliaStorage;
```

Keep the imports themselves — they are still needed by `src/main.js` for the auth event wiring at the bottom of the file.

### Files to update

**`src/firebase/auth.js`**

- Line 13: `export const MarginaliaAuth = window.MarginaliaAuth = ((...` → remove `window.MarginaliaAuth =`, keep only `export const MarginaliaAuth = ...`
- Line 33: `window.MARGINALIA_FIREBASE || {}` → import `{ MARGINALIA_FIREBASE }` from `./config.js` and use directly
- Line 529: `window.MARGINALIA_FIREBASE?.workspaceId` → `MARGINALIA_FIREBASE?.workspaceId`

**`src/firebase/db.js`**

- Line 20: `export const MarginaliaBooksCloud = window.MarginaliaBooksCloud = ...` → remove `window.MarginaliaBooksCloud =`
- `window.MarginaliaAuth` (multiple) → add `import { MarginaliaAuth } from './auth.js'` at top; replace all
- `window.MARGINALIA_FIREBASE` → add `import { MARGINALIA_FIREBASE } from './config.js'`; replace all
- `window.MarginaliaGraph` (lines 94–119) → add `import { MarginaliaGraph } from '../core/graph-data.js'`; replace all
- `window.NotesStore` (line 367) → add `import { NotesStore } from '../store/notes-store.js'`; replace

**`src/library-2d/library-2d.js`**

- `window.MarginaliaAuth` (lines 1791, 1807) → add `import { MarginaliaAuth } from '../firebase/auth.js'`; replace

**`src/three-room/three-room-view.js`**

- `window.MarginaliaAuth` (lines 604, 623) → add `import { MarginaliaAuth } from '../firebase/auth.js'`; replace

**`src/book/book.js`**

- `window.MarginaliaStorage` (lines 183, 189) → add `import { MarginaliaStorage } from '../firebase/db.js'`; replace
- `window.MarginaliaBooksCloud` (line 190) → add `import { MarginaliaBooksCloud } from '../firebase/db.js'`; replace

**`src/map/map.js`**

- Line 1580: `window.BOOK_BY_ID?.[b.id]` → `BooksStore.getById(b.id)` (BooksStore already imported from Batch 1)

**Verify:** Zero remaining `window.MarginaliaAuth`, `window.MarginaliaStorage`, `window.MarginaliaBooksCloud`, `window.MARGINALIA_FIREBASE`.

---

## Batch 3 — UI render functions

These are functions defined in `src/core/app.js` that views call via `window.renderX`. The fix is to export them properly and import in each view.

### What to remove from `src/main.js`

```js
M.ui.renderPrimaryHeader = renderPrimaryHeader;
M.ui.renderUnifiedPanelHeader = renderUnifiedPanelHeader;
M.ui.renderToolPageShell = renderToolPageShell;
M.ui.renderShelfSection = renderShelfSection;
```

### In `src/core/app.js`

- Line 323: `window.renderPrimaryHeader = renderPrimaryHeader` → delete
- Line 333: `window.renderUnifiedPanelHeader = renderUnifiedPanelHeader` → delete
- Line 346: `window.renderToolPageShell = renderToolPageShell` → delete
- Lines 392, 394, 396 (the re-assignment from window back to local var) → delete; the local vars should be assigned from the module-scope definitions directly, not round-tripped through window
- Line 379: `window.App = App` → delete (handled in next batch)

These functions are already exported as named exports. Views just need to import them instead of reading from window.

### Files to update

**`src/shelf/shelf.js`**
```js
import { renderPrimaryHeader, renderUnifiedPanelHeader } from '../core/app.js';
```
Replace `window.renderPrimaryHeader(...)` and `window.renderUnifiedPanelHeader(...)`.

**`src/booklist/booklist.js`**
```js
import { renderUnifiedPanelHeader, renderPrimaryHeader, renderToolPageShell } from '../core/app.js';
```
Replace all three window references.

**`src/map/map.js`**
```js
import { renderUnifiedPanelHeader, renderPrimaryHeader, renderToolPageShell } from '../core/app.js';
```
Replace. Also:
- Line 895: `window.__setMapGeoMode = (mode) => { ... }` → convert to a module-level exported function `export function setMapGeoMode(mode) { ... }`
- Lines 982–983: `window.__setMapGeoMode(mode)` → call `setMapGeoMode(mode)` directly (it's in the same file)

**`src/book/book.js`**
```js
import { renderPrimaryHeader } from '../core/app.js';
```
Replace `window.renderPrimaryHeader(...)`.

**`src/three-room/three-room-view.js`**
- Line 551: `window.renderRoomTopTabs = function renderRoomTopTabs(...)` → remove the `window.renderRoomTopTabs =` prefix; the function is already re-exported as a named export at line 809
- Line 809: `export const renderRoomTopTabs = window.renderRoomTopTabs` → change to `export { renderRoomTopTabs }`

**Verify:** Zero remaining `window.renderPrimaryHeader`, `window.renderUnifiedPanelHeader`, `window.renderToolPageShell`, `window.renderShelfSection`, `window.renderRoomTopTabs`, `window.__setMapGeoMode`.

---

## Batch 4 — Registries and business logic

### What to remove from `src/main.js`

```js
M.data.BOOK_TYPES = BOOK_TYPES;
M.data.BookTypes = BookTypes;
M.ui.PanelRegistry = PanelRegistry;
M.ai.AIFeatureRegistry = AIFeatureRegistry;
M.store.MarginaliaGraph = MarginaliaGraph;
M.ui.PanelManager = PanelManager;
M.ui.openConceptDrawer = openConceptDrawer;
M.ui.closeConceptDrawer = closeConceptDrawer;
```

Keep the imports — they may still be needed by app.js or other modules. Remove only the `M.*` assignments.

### Files to update

**`src/ai/features/registry.js`**

- Line 19: `export const AIFeatureRegistry = window.AIFeatureRegistry = ...` → remove `window.AIFeatureRegistry =`
- Line 126: `forBook(book)` calls `window.BookTypes.getAiFeatures(book)` → add `import { BookTypes } from '../../data/schema/book-types.js'`; replace

**`src/data/schema/book-types.js`**

If the file assigns itself to `window.BookTypes` or `window.BOOK_TYPES`, remove those assignments. Keep only the named exports.

**`src/core/panel-manager.js`**

If it assigns `window.PanelManager` or `window.PanelRegistry`, remove those assignments.

**`src/book/panels/registry.js`**

If it assigns `window.PanelRegistry`, remove.

**`src/book/book.js`**

```js
import { PanelRegistry } from './panels/registry.js';
import { BookTypes } from '../data/schema/book-types.js';
import { MarginaliaGraph } from '../core/graph-data.js';
import { openConceptDrawer } from '../core/concept-ui.js';
import { AIGenerateUI } from '../ai/client/generate-ui.ts';
```

Replace:
- `window.PanelRegistry` → `PanelRegistry`
- `window.BookTypes` → `BookTypes`
- `window.MarginaliaGraph` → `MarginaliaGraph`
- `window.openConceptDrawer` → `openConceptDrawer`
- `window.AIGenerateUI` → `AIGenerateUI`

**`src/core/graph-data.js`**

- Line 11: `export const MarginaliaGraph = window.MarginaliaGraph = ...` → remove `window.MarginaliaGraph =`

**`src/three-room/three-room-view.js`**

- `window.BOOKS` (lines 556) → import `{ BooksStore }` from `'../store/books-store.ts'`; use `BooksStore.getAll()` filtered to `status === 'reading'`

**Verify:** Zero remaining `window.PanelRegistry`, `window.BookTypes`, `window.BOOK_TYPES`, `window.MarginaliaGraph`, `window.openConceptDrawer`, `window.AIFeatureRegistry`.

---

## Batch 5 — Components and misc

### What to remove from `src/main.js`

```js
M.ui.SpineCard = SpineCard;
M.ui.NewEntry = NewEntry;
M.ui.KindleImport = KindleImport;
M.ui.App = App;
M.store.NotesStore = NotesStore;
M.store.BooksStore = BooksStore;
M.store.HighlightsStore = HighlightsStore;
M.store.EntitlementsStore = EntitlementsStore;
M.store.AiResultsStore = AiResultsStore;
M.store.ActionsStore = ActionsStore;
M.ai.MarginaliaAI = MarginaliaAI;
M.ai.AIGenerateUI = AIGenerateUI;
M.views.*  (all view assignments)
```

Keep all the imports — they are still needed for the auth event listener wiring at the bottom of `main.js`.

### Files to update

**`src/shelf/shelf.js`**

- `window.NewEntry?.mount()` → add `import { NewEntry } from '../new-entry/new-entry.js'`; call `NewEntry.mount()`
- `window.SpineCard.create(...)` → add `import { SpineCard } from '../components/spine-card.js'`; call `SpineCard.create(...)`

**`src/library-2d/library-2d.js`**

- `window.SpineCard.create(...)` → import and call directly
- `window.LibraryRiveMesh` (line 1297) → delete the entire `if (window.LibraryRiveMesh ...)` block. This feature is being removed; a replacement will be built separately from scratch.

**`src/booklist/booklist.js`**

- `window.SpineCard.create(...)` → import and call directly

**`src/book/book.js`**

- `window.KindleImport` (lines 122, 127) → add `import { KindleImport } from '../api/kindle-import.js'`; replace. Note: KindleImport is a stub — keep the `if (KindleImport)` guard.

**`src/core/app.js`**

- Line 379: `window.App = App` → delete. App is already a named export. Any file that needs `App` should `import { App } from '../core/app.js'`.
- Check for any remaining `window.App` reads in other files and add the import there.

**`src/firebase/db.js`** (if `NotesStore` reference remains from Batch 2)

Already handled.

**Verify:** Zero remaining `window.SpineCard`, `window.NewEntry`, `window.KindleImport`, `window.App`, `window.NotesStore`.

---

## Final cleanup (after all 5 batches pass typecheck)

1. In `src/main.js`, delete the entire `M.*` assignment section and the import of `namespace.ts`. The file should contain only: imports, `initAnalytics()`, `setLanguage()`, the auth event listener, and `DOMContentLoaded` handler.

2. Delete `src/core/namespace.ts` and `src/core/namespace.types.ts` if it exists.

3. Run `grep -r "window\." src/ --include="*.js" --include="*.ts" | grep -v "addEventListener\|dispatchEvent\|setTimeout\|clearTimeout\|innerWidth\|innerHeight\|scrollTo\|location\|requestAnimationFrame\|CSS\|ResizeObserver\|localStorage\|parent\|scrollY\|getSelection\|open(\|firebase\|prompt("` — the result should be empty.

4. Run `npm run typecheck`. Fix any remaining type errors.

5. Open the app in the browser. Walk through: preloader → room → shelf → a book detail → map → booklist. Confirm nothing is broken.

---

## Preloader notes (do not change)

`src/preloader/preloader.js` has two `window.` references that are intentional:

- `window.__heroGLBReadyPromise` — set by `hero-glb.js`, which is loaded as a `<script type="module">` in `index.html` outside the Vite bundle (see ADR 0002). This cross-boundary promise cannot be replaced with a module import without restructuring the GLB loader. Leave it as-is.
- `window.parent.postMessage(...)` and the `window.addEventListener('message', ...)` block — this is the dev-mode tweaks panel communicating with a parent iframe. It is intentional and must stay.

The preloader uses `BOOKS` from `../data/mock/seed-spines.js` via a direct ES module import (line 7) — this is already correct and needs no change.
