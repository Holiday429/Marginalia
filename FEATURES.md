# Marginalia — Feature Implementation Specs

Implementation instructions for Claude Code. Each section is self-contained — implement one feature at a time. Read the referenced source files before writing any code.

---

## Feature 1: Quick Capture (闪现记录)

**What it does:** A floating capture button always visible in the 3D room sidebar and on the Notes Wall board. Lets the reader throw a thought or quote into the system immediately without selecting a book first. `bookId` is optional — unattributed captures are attributed to a book later.

**Where it lives in the UI:**
- Room sidebar `QUICK_ACTION_ITEMS` — add a "Capture" item that opens the capture sheet
- Notes Wall board (`src/components/notes-wall/notes-wall.js`) — add an "Add note" button in the To Do zone header

### Before writing any code, read:
- `src/three-room/three-room-view.js` — QUICK_ACTION_ITEMS array (line ~20) and how sidebar items are wired
- `src/components/notes-wall/notes-wall.js` — the full component; pay attention to `loadLocalTodos()`, `saveLocalTodos()`, and how the todo zone renders
- `src/store/actions-store.ts` — pattern for Firestore write via `withMetaCreate` + `validateWrite`
- `src/data/schema/action.ts` — ActionSchema fields

### Step 1 — Extend the data model

In `src/data/schema/highlight.ts`, the existing `HighlightSchema` already has `bookId: z.string()`. Add an optional variant for unattributed captures in a new file:

**Create `src/data/schema/capture.ts`:**
```ts
import { z } from 'zod';

export const CaptureSchema = z.object({
  quote:      z.string().min(1).max(1000),
  bookId:     z.string().nullable().optional(), // null = not yet attributed
  capturedAt: z.number(),
  source:     z.literal('quick'),
  attributed: z.boolean().default(false),
}).passthrough();

export type Capture = z.infer<typeof CaptureSchema>;
```

Firestore path: `workspaces/{wsId}/users/{uid}/data/captures/{captureId}`

### Step 2 — Create the capture store

**Create `src/store/captures-store.ts`:**

Mirror the structure of `src/store/actions-store.ts` exactly. Key methods:
- `initWithUser(uid, db)` — start Firestore listener on the `captures` collection
- `getAll()` — return all captures, sorted by `capturedAt` desc
- `getUnattributed()` — return captures where `attributed !== true`
- `add(quote, bookId?)` — validate with `CaptureSchema`, write via `withMetaCreate`
- `attribute(captureId, bookId)` — move capture to `books/{bookId}/highlights/{id}` as a proper HighlightSchema doc, then delete the capture doc
- `subscribe(fn)` — listener pattern same as ActionsStore

Emit `marginalia:captures-changed` custom event on every change.

### Step 3 — Create the capture sheet component

**Create `src/components/quick-capture/quick-capture.ts`:**

A bottom-sheet that slides up from the bottom of the screen. Not a panel — it overlays everything including active panels.

HTML structure (append to `document.body`, `position: fixed`):
```html
<div class="quick-capture-backdrop" data-quick-capture-backdrop></div>
<div class="quick-capture-sheet" data-quick-capture-sheet>
  <div class="quick-capture-handle"></div>
  <header class="quick-capture-head">
    <h2>Capture a thought</h2>
    <button type="button" data-quick-capture-close aria-label="Close">×</button>
  </header>
  <form class="quick-capture-form" data-quick-capture-form>
    <textarea
      class="quick-capture-input"
      data-quick-capture-text
      placeholder="Quote, idea, or observation…"
      rows="4"
      maxlength="1000"
      autofocus
    ></textarea>
    <div class="quick-capture-book-row">
      <label class="quick-capture-book-label">From which book? (optional)</label>
      <input
        class="quick-capture-book-input"
        data-quick-capture-book
        type="search"
        placeholder="Start typing a title…"
        autocomplete="off"
      >
      <ul class="quick-capture-suggestions" data-quick-capture-suggestions hidden></ul>
    </div>
    <button class="quick-capture-submit" type="submit">Save</button>
  </form>
</div>
```

Behaviour:
- Book typeahead: on input, filter `BooksStore.getAll()` by title match, show up to 5 suggestions. Click to select — store the `bookId` internally.
- On submit: call `CapturesStore.add(quote, bookId ?? null)`. If `bookId` is set, call `CapturesStore.attribute(newCaptureId, bookId)` immediately (skip the captures collection, write directly to highlights).
- Close on backdrop click, Escape key, or after successful save.
- Export `openQuickCapture()` and `closeQuickCapture()`.

**Create `src/components/quick-capture/quick-capture.css`** with the sheet animation (slide up from `translateY(100%)` to `translateY(0)`).

### Step 4 — Wire into the room sidebar

In `src/three-room/three-room-view.js`:

```js
// In QUICK_ACTION_ITEMS, add:
{ id: 'capture', label: 'Capture', icon: 'capture' },
```

In the sidebar click handler (where `action === 'search'` / `action === 'add-book'` etc.), add:
```js
if (action === 'capture') {
  import('../components/quick-capture/quick-capture.ts')
    .then(({ openQuickCapture }) => openQuickCapture());
  return;
}
```

Add the capture SVG icon to `index.html` as an `<svg><symbol id="icon-capture">` — a simple pencil or lightning bolt shape using the same style as existing icons.

### Step 5 — Wire into the Notes Wall board

In `src/components/notes-wall/notes-wall.js`, in the `renderToDoZone` function, add a small "+" button to the zone header:

```js
// In renderToDoZone, change the header to include:
<button class="notes-zone__add-btn" type="button" data-open-capture title="Quick capture">+</button>
```

In the event binding section of the notes wall component, handle `data-open-capture` clicks:
```js
container.addEventListener('click', (e) => {
  if (e.target.closest('[data-open-capture]')) {
    import('../quick-capture/quick-capture.ts')
      .then(({ openQuickCapture }) => openQuickCapture());
  }
});
```

### Step 6 — Unattributed captures badge in Search view

In `src/search/search.js`, in `renderStatsBar()` or the search header, add a "Captures" chip that shows when `CapturesStore.getUnattributed().length > 0`:

```html
<button class="search-captures-chip" data-open-captures>
  ◎ ${count} unattributed
</button>
```

Clicking opens a simple drawer listing unattributed captures, each with a "Attribute to book…" button that triggers the typeahead.

---

## Feature 2: Spaced Resurface for Quote of the Day

**What it does:** Replace the current random/day-modulo quote selection in the Notes Wall with a spaced repetition schedule. The quote shown is whichever highlight is most due for resurfacing (7 → 30 → 90 day tiers). Users can respond: "Still resonates", "Add thought", "Turn into action", or "Dismiss".

**Current code to replace:** `pickTodayQuote(highlights)` in `src/components/notes-wall/notes-wall.js` (line ~44). Currently does `highlights[day % highlights.length]` — pure modulo.

### Before writing any code, read:
- `src/components/notes-wall/notes-wall.js` — full file; focus on `pickTodayQuote`, `renderQuoteZone`, and the card open/close logic
- `src/data/schema/highlight.ts` — HighlightSchema fields
- `src/store/highlights-store.ts` — how highlights are stored and queried
- `src/store/notes-store.js` — IndexedDB layer; this is where resurface state should be persisted locally

### Step 1 — Extend HighlightSchema

In `src/data/schema/highlight.ts`, add resurface scheduling fields:

```ts
export const HighlightSchema = z.object({
  // ... existing fields ...
  resurface7At:    z.number().optional(),   // epoch ms — when to show at 7d tier
  resurface30At:   z.number().optional(),
  resurface90At:   z.number().optional(),
  resurfaced7:     z.boolean().optional(),  // true = user responded to 7d resurface
  resurfaced30:    z.boolean().optional(),
  resurfaced90:    z.boolean().optional(),
  resurfaceRating: z.enum(['resonates', 'thought', 'action', 'dismiss']).optional(),
}).passthrough();
```

When a new highlight is saved (in `NotesStore.saveHighlight` or `CapturesStore.attribute`), also set:
```ts
resurface7At:  Date.now() + 7  * 24 * 60 * 60 * 1000,
resurface30At: Date.now() + 30 * 24 * 60 * 60 * 1000,
resurface90At: Date.now() + 90 * 24 * 60 * 60 * 1000,
```

### Step 2 — Create the resurface picker function

In `src/components/notes-wall/notes-wall.js`, replace `pickTodayQuote` with:

```js
function pickResurfaceQuote(highlights) {
  if (!highlights.length) return null;
  const now = Date.now();

  // Priority 1: due at 7d tier and not yet responded
  const due7 = highlights.filter(h =>
    h.resurface7At && h.resurface7At <= now && !h.resurfaced7
  );
  if (due7.length) return { highlight: due7[0], tier: '7d' };

  // Priority 2: due at 30d tier
  const due30 = highlights.filter(h =>
    h.resurface30At && h.resurface30At <= now && !h.resurfaced30
  );
  if (due30.length) return { highlight: due30[0], tier: '30d' };

  // Priority 3: due at 90d tier
  const due90 = highlights.filter(h =>
    h.resurface90At && h.resurface90At <= now && !h.resurfaced90
  );
  if (due90.length) return { highlight: due90[0], tier: '90d' };

  // Fallback: most recent highlight (old behaviour)
  return { highlight: highlights[0], tier: null };
}
```

### Step 3 — Update the Quote Zone render

In `renderQuoteZone(data)`, replace the simple quote display with a resurface card:

```js
function renderQuoteZone(data) {
  const date = formatBoardDate(data.now);
  const resurfaceResult = data.resurfaceQuote; // { highlight, tier } | null

  const tierLabel = resurfaceResult?.tier
    ? `Resurface · ${resurfaceResult.tier}`
    : 'Quote of the Day';

  return `
    <section class="notes-zone notes-zone--quote">
      ${renderZoneTag(tierLabel, 'quote')}
      <button class="calendar-card${resurfaceResult ? '' : ' is-empty'}" type="button" data-open-card="quote">
        <!-- date display unchanged -->
        ${resurfaceResult ? `
          <p class="calendar-card__quote">${esc(resurfaceResult.highlight.quote)}</p>
          <p class="calendar-card__source">— ${esc(resurfaceResult.highlight.bookTitle || '')}</p>
          ${resurfaceResult.tier ? `<span class="resurface-badge">${esc(resurfaceResult.tier)}</span>` : ''}
        ` : `<p class="calendar-card__empty">Add highlights to see your Quote of the Day.</p>`}
      </button>
    </section>
  `;
}
```

### Step 4 — Add response UI in the expanded card

When the quote card is opened (the existing `data-open-card="quote"` handler), show four response buttons below the quote:

```html
<div class="resurface-actions" data-resurface-actions data-highlight-id="${highlightId}" data-tier="${tier}">
  <button data-resurface-rate="resonates">Still resonates</button>
  <button data-resurface-rate="thought">Add a thought</button>
  <button data-resurface-rate="action">Turn into action</button>
  <button data-resurface-rate="dismiss">Dismiss</button>
</div>
```

Handle clicks in the component's event listener:

```js
if (rateBtn) {
  const rating = rateBtn.dataset.resurfaceRate;
  const highlightId = actionsEl.dataset.highlightId;
  const tier = actionsEl.dataset.tier;
  await handleResurfaceResponse(highlightId, tier, rating);
}
```

**`handleResurfaceResponse(highlightId, tier, rating)`:**
- `'resonates'`: mark current tier done, keep higher tiers scheduled
- `'thought'`: open a mini textarea to append a note to the highlight, then mark tier done
- `'action'`: call `ActionsStore.add({ bookId: highlight.bookId, text: highlight.quote })`, then mark tier done
- `'dismiss'`: mark all tiers done (`resurfaced7/30/90: true`) — never shown again

Write updates to the highlight via `NotesStore.saveHighlight` (IndexedDB) and fire a Firebase sync if signed in.

### Step 5 — Update `loadData()` in the component

```js
async function loadData() {
  const allHighlights = loadHighlights();
  const resurfaceQuote = pickResurfaceQuote(allHighlights);
  return {
    now: new Date(),
    resurfaceQuote,    // replaces plain `quote`
    todos: loadLocalTodos(),
    // ... rest unchanged
  };
}
```

---

## Feature 3: Finish Ritual (合上一本书)

**What it does:** When a book's status changes to `'read'`, automatically open a three-question reflection modal. Answers + existing highlights feed an AI synthesis prompt that produces a one-paragraph reading card. The card is saved to the Notes panel of that book.

**Integration point:** Triggered from the Book detail view when status changes. The output card appears as a styled block at the top of the Notes panel.

### Before writing any code, read:
- `src/book/book.js` — `enterBook()` and how book status is rendered and changed
- `src/book/panels/notes.js` — full Notes panel; the synthesis card will prepend to this view
- `src/data/schema/book-note.ts` — `BookNoteSchema` (content + updatedAt)
- `src/services/ai-gateway.ts` — `MarginaliaAI.generate()` and `MarginaliaAI.generateJSON()`
- `src/ai/features/registry.js` — how to register a new feature + prompt

### Step 1 — Register the AI feature

In `src/ai/features/registry.js`, add to `_features`:

```js
'finish-synthesis': {
  label: 'Generate reading synthesis',
  panel: 'notes',
  outputType: 'json',
  promptId: 'finish-synthesis',
},
```

**Create `src/ai/features/prompts/finish-synthesis.js`:**

```js
import { AIFeatureRegistry } from '../registry.js';

AIFeatureRegistry.setPrompt('finish-synthesis', {
  version: '1.0',
  build(book, { belief, intention, next, highlights }) {
    const hl = (highlights || []).slice(0, 6).map(h => `"${h.quote}"`).join('\n');
    return `You are a thoughtful reading companion. The reader just finished "${book.title}" by ${book.author || 'unknown author'}.

Their reflections:
- What shifted or surprised them: "${belief}"
- What they intend to do differently: "${intention}"
- What they want to read next, and why: "${next}"

Their highlights from the book:
${hl || '(none saved)'}

Write a personal synthesis of what this book meant to this reader. Be specific and concrete — name the ideas from their highlights, connect them to their stated intentions. 2–3 sentences max. Do not use generic phrases like "this book changed my perspective". Return JSON: { "headline": "<5 words max>", "synthesis": "<the paragraph>", "tags": ["<tag1>", "<tag2>"] }`;
  }
});
```

### Step 2 — Create the finish ritual modal

**Create `src/components/finish-ritual/finish-ritual.js`:**

A three-step modal. One question per step, no scroll.

```js
export function openFinishRitual(book, highlights) {
  // highlights = HighlightsStore.getAll().filter(h => h.bookId === book.id)
  // Returns Promise<{ headline, synthesis, tags } | null>
}
```

HTML structure — append to `document.body`:
```html
<div class="finish-ritual-backdrop"></div>
<div class="finish-ritual-modal" role="dialog" aria-modal="true">
  <header class="finish-ritual-header">
    <span class="finish-ritual-step">1 / 3</span>
    <button type="button" class="finish-ritual-skip" data-finish-skip>Skip</button>
  </header>
  <div class="finish-ritual-body">
    <p class="finish-ritual-q" data-finish-question></p>
    <textarea class="finish-ritual-answer" data-finish-answer maxlength="400" rows="4"></textarea>
  </div>
  <footer class="finish-ritual-footer">
    <button class="finish-ritual-next" type="button" data-finish-next>Next →</button>
  </footer>
</div>
```

Three questions (store answers in an array):
1. `"What shifted or surprised you?"`
2. `"What will you actually do because of this book?"`
3. `"What do you want to read next, and why?"`

On step 3 "Next" → replace footer with a loading state → call AI.

### Step 3 — Call AI and save the result

After collecting all three answers:

```js
const prompt = AIFeatureRegistry.buildPrompt('finish-synthesis', book, {
  belief: answers[0],
  intention: answers[1],
  next: answers[2],
  highlights,
});

const result = await MarginaliaAI.generateJSON({ featureId: 'finish-synthesis', prompt });
// result: { headline, synthesis, tags }
```

Save to the book's notes document (prepend, don't overwrite existing notes):

```js
// Read existing note content from NotesStore
const existing = await NotesStore.getNote(book.id);
const synthesisBlock = `<div class="finish-synthesis-card" data-synthesis>
  <h3 class="synthesis-headline">${escapeHtml(result.headline)}</h3>
  <p class="synthesis-body">${escapeHtml(result.synthesis)}</p>
  <div class="synthesis-tags">${result.tags.map(t => `<span class="synthesis-tag">${escapeHtml(t)}</span>`).join('')}</div>
  <span class="synthesis-date">${new Date().toLocaleDateString()}</span>
</div>\n\n`;

const newContent = synthesisBlock + (existing?.content || '');
await NotesStore.saveNote(book.id, newContent);
```

Then close the modal and navigate the book detail to the Notes tab.

### Step 4 — Trigger from Book detail

In `src/book/book.js`, find where book status is updated (search for status change logic or the status dropdown handler). Add:

```js
// After a status write succeeds, check if it's a finish transition:
if (newStatus === 'read' && prevStatus !== 'read') {
  const highlights = HighlightsStore.getAll().filter(h => h.bookId === book.id);
  import('../../components/finish-ritual/finish-ritual.js')
    .then(({ openFinishRitual }) => openFinishRitual(book, highlights));
}
```

If the book detail currently doesn't have explicit status-change event handling, add it to the status `<select>` or status button click handler.

### Step 5 — Style the synthesis card in Notes panel

In `src/book/panels/notes.js` or a new `notes.css` file, add styles for `.finish-synthesis-card`:
- Warm background (`var(--color-surface-warm)` or `hsl(38 28% 94%)`)
- Top border accent in `var(--color-accent)`
- `font-family: var(--font-serif)`
- Tags as small rounded chips

The card renders from saved HTML in the notes editor — it's part of the `innerHTML` content, so no special parsing needed.

---

## Feature 4: Reading Stats in Profile (阅读数据面板)

**What it does:** A new "How I read" section added to the Profile page, below the annual shelf. Shows aggregated reading stats derived from existing `sessions`, `highlights`, and `books` data. Pure client-side aggregation — no new Cloud Functions.

### Before writing any code, read:
- `src/profile/profile.ts` — `enterProfile()` and where sections are appended; look for `mountReadingIdentity`, `ProfileAnnualShelf`, and the `ProfileHeatmap` mount points
- `src/profile/profile-heatmap.ts` — pattern for a self-contained profile section class
- `src/profile/profile-types.ts` — `PublicProfileData`, `SessionDay` types
- `src/profile/profile-year-in-review.ts` — `AnnualShelfOptions` interface; understand how `sessionDays` is already passed in
- `src/store/books-store.ts` — `BooksStore.getAll()` return shape
- `src/store/highlights-store.ts` — `HighlightsStore.getAll()`

### Step 1 — Create the stats builder

**Create `src/profile/reading-stats.ts`:**

```ts
import type { PublicBook, SessionDay } from './profile-types.ts';

export interface ReadingStats {
  totalBooks:          number;
  totalFinished:       number;
  totalHighlights:     number;
  totalSessionMinutes: number;
  avgSessionMinutes:   number;   // mean duration per session
  peakHour:            number;   // 0–23, hour-of-day with most session starts
  genreDistribution:   Array<{ label: string; count: number; pct: number }>;
  geoDistribution:     Array<{ country: string; count: number }>;
  deepReaderScore:     number;   // highlights per book, 0–100 normalised
}

export function buildReadingStats(
  books: PublicBook[],
  sessionDays: SessionDay[],
  highlightCount: number,
): ReadingStats {
  const finished = books.filter(b => b.status === 'read' || b.status === 'finished');
  const totalSessionMinutes = sessionDays.reduce((s, d) => s + d.minutes, 0);
  const sessionCount = sessionDays.reduce((s, d) => s + d.sessions, 0);

  // Genre distribution from book type field
  const genreCounts = new Map<string, number>();
  books.forEach(b => {
    const genre = (b as any).type || 'Other';
    genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
  });
  const total = books.length || 1;
  const genreDistribution = [...genreCounts.entries()]
    .map(([label, count]) => ({ label, count, pct: Math.round(count / total * 100) }))
    .sort((a, b) => b.count - a.count);

  // Geographic distribution from authorOrigin
  const geoCounts = new Map<string, number>();
  books.forEach(b => {
    const country = (b as any).geo?.authorOrigin?.country;
    if (country) geoCounts.set(country, (geoCounts.get(country) ?? 0) + 1);
  });
  const geoDistribution = [...geoCounts.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const deepReaderScore = finished.length > 0
    ? Math.min(100, Math.round(highlightCount / finished.length * 10))
    : 0;

  return {
    totalBooks:          books.length,
    totalFinished:       finished.length,
    totalHighlights:     highlightCount,
    totalSessionMinutes,
    avgSessionMinutes:   sessionCount > 0 ? Math.round(totalSessionMinutes / sessionCount) : 0,
    peakHour:            -1, // sessionDays doesn't include hour breakdown yet; show N/A
    genreDistribution,
    geoDistribution,
    deepReaderScore,
  };
}
```

### Step 2 — Create the renderer

**Create `src/profile/reading-stats-render.ts`:**

```ts
import type { ReadingStats } from './reading-stats.ts';

export function renderReadingStats(stats: ReadingStats, isOwner: boolean): string {
  if (!isOwner || stats.totalBooks === 0) return '';

  const deepLabel =
    stats.deepReaderScore >= 70 ? 'Deep reader' :
    stats.deepReaderScore >= 30 ? 'Balanced' : 'Light annotator';

  const genreBars = stats.genreDistribution.slice(0, 5).map(g => `
    <div class="rs-bar-row">
      <span class="rs-bar-label">${escHtml(g.label)}</span>
      <div class="rs-bar-track"><div class="rs-bar-fill" style="width:${g.pct}%"></div></div>
      <span class="rs-bar-count">${g.count}</span>
    </div>
  `).join('');

  return `
    <section class="reading-stats" aria-label="Reading stats">
      <h2 class="reading-stats__heading">How you read</h2>
      <div class="reading-stats__tiles">
        <div class="rs-tile">
          <span class="rs-tile__value">${stats.avgSessionMinutes}<span class="rs-tile__unit">min</span></span>
          <span class="rs-tile__label">Avg session</span>
        </div>
        <div class="rs-tile">
          <span class="rs-tile__value">${stats.totalHighlights}</span>
          <span class="rs-tile__label">Highlights saved</span>
        </div>
        <div class="rs-tile">
          <span class="rs-tile__value">${stats.totalSessionMinutes}<span class="rs-tile__unit">min</span></span>
          <span class="rs-tile__label">Total reading time</span>
        </div>
        <div class="rs-tile">
          <span class="rs-tile__value">${stats.deepReaderScore}</span>
          <span class="rs-tile__label">${deepLabel}</span>
        </div>
      </div>
      ${stats.genreDistribution.length > 0 ? `
        <div class="reading-stats__genres">
          <h3 class="rs-section-title">What you read</h3>
          ${genreBars}
        </div>
      ` : ''}
      ${stats.geoDistribution.length > 0 ? `
        <div class="reading-stats__geo">
          <h3 class="rs-section-title">Where your authors are from</h3>
          ${stats.geoDistribution.map(g => `
            <span class="rs-geo-chip">${escHtml(g.country)} <em>${g.count}</em></span>
          `).join('')}
        </div>
      ` : ''}
    </section>
  `;
}

function escHtml(v: string): string {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
```

### Step 3 — Mount in Profile

In `src/profile/profile.ts`, inside `renderResolvedProfile()` (the function that assembles the full profile HTML), after the annual shelf section is appended, add:

```ts
import { buildReadingStats } from './reading-stats.ts';
import { renderReadingStats } from './reading-stats-render.ts';
import { HighlightsStore } from '../store/highlights-store.ts';

// Inside renderResolvedProfile, after annualShelf.mount():
if (isOwner) {
  const highlightCount = HighlightsStore.getUid()
    ? HighlightsStore.getAll().length
    : 0;
  const stats = buildReadingStats(books as any, sessionDays, highlightCount);
  const statsHtml = renderReadingStats(stats, isOwner);
  if (statsHtml) {
    const statsMount = document.createElement('div');
    statsMount.className = 'profile-stats-mount';
    statsMount.innerHTML = statsHtml;
    container.appendChild(statsMount);
  }
}
```

### Step 4 — Add CSS

**Create `src/profile/reading-stats.css`** (import it at the top of `reading-stats-render.ts` or in `profile.css`):

Style rules:
- `.reading-stats` — `padding: 2rem 0; border-top: 1px solid var(--color-border)`
- `.reading-stats__tiles` — CSS grid, 2-up on mobile, 4-up on desktop
- `.rs-tile` — centered, `font-family: var(--font-mono)` for the value, `var(--font-serif)` for the label
- `.rs-tile__value` — large number (`font-size: 2.4rem`)
- `.rs-bar-track` — `background: var(--color-surface)`, height `6px`, `border-radius: 3px`
- `.rs-bar-fill` — `background: var(--color-accent)`, same height
- `.rs-geo-chip` — small pill, `background: var(--color-surface-warm)`

---

## Feature 5: Reading Card Export (阅读卡片导出)

**What it does:** In the Book detail view, an AI-generated visual "reading card" is created from the book's data — cover, a chosen highlight, and a synthesized one-liner. The card renders as an HTML preview and can be exported as a PNG image via `canvas`. Positioned in the Overview panel, below the main book info, with a dedicated "Generate Card" button.

**Why canvas:** Web Share API on iPad Safari can share files (PNG). Canvas gives full typography control with Fraunces loaded via FontFace API.

### Before writing any code, read:
- `src/book/panels/overview.js` — existing overview panel render function; find the action row at the bottom
- `src/book/panels/registry.js` — how panels are registered
- `src/services/ai-gateway.ts` — `MarginaliaAI.generateJSON()`
- `src/ai/features/registry.js` — feature + prompt registration
- `src/data/schema/highlight.ts` — Highlight fields available for the card
- `src/store/highlights-store.ts` — `HighlightsStore.getAll()`

### Step 1 — Register the AI feature

In `src/ai/features/registry.js`, add:

```js
'reading-card': {
  label: 'Generate reading card',
  panel: 'overview',       // lives in the overview panel
  outputType: 'json',
  promptId: 'reading-card',
},
```

**Create `src/ai/features/prompts/reading-card.js`:**

```js
import { AIFeatureRegistry } from '../registry.js';

AIFeatureRegistry.setPrompt('reading-card', {
  version: '1.0',
  build(book, { highlights }) {
    const hl = (highlights || []).slice(0, 5).map(h => `"${h.quote}"`).join('\n');
    return `You are creating a reading card for "${book.title}" by ${book.author || 'unknown'}.

The reader's highlights:
${hl || '(none)'}

Write ONE sentence (max 20 words) that captures what makes this book worth reading. Make it feel like a personal recommendation from someone who just finished it — not a blurb. Return JSON: { "oneliner": "<the sentence>", "mood": "<one word: meditative|provocative|illuminating|grounding|expansive>" }`;
  }
});
```

### Step 2 — Create the reading card generator

**Create `src/book/reading-card.ts`:**

```ts
export interface ReadingCardData {
  title:     string;
  author:    string;
  oneliner:  string;
  mood:      string;
  highlight: string; // the chosen quote
  coverUrl?: string;
  spineColor: string;
  textColor:  string;
}

const CARD_W = 1080;
const CARD_H = 1080; // square for Instagram; also works as 1200×630 OG crop

export async function generateReadingCardBlob(data: ReadingCardData): Promise<Blob> {
  // Load fonts first — canvas won't use CSS-loaded fonts automatically
  await Promise.all([
    loadFont('Fraunces', '/fonts/Fraunces-Italic.woff2', { style: 'italic', weight: '400' }),
    loadFont('Fraunces', '/fonts/Fraunces.woff2', { style: 'normal', weight: '600' }),
    loadFont('IBM Plex Mono', '/fonts/IBMPlexMono-Regular.woff2', { style: 'normal', weight: '400' }),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width  = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;

  // Background — use spine colour with slight lightening for readability
  ctx.fillStyle = data.spineColor;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Semi-transparent dark overlay for text contrast
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Cover image (if available) — top-left quadrant, 40% width
  if (data.coverUrl) {
    try {
      const img = await loadImage(data.coverUrl);
      const coverW = CARD_W * 0.38;
      const coverH = coverW * 1.45; // standard book aspect ratio
      ctx.drawImage(img, 60, 80, coverW, coverH);
    } catch { /* cover missing — continue */ }
  }

  // Highlight quote — italic Fraunces, large
  ctx.fillStyle = data.textColor || '#f0e8d8';
  ctx.font = `italic 400 ${CARD_W * 0.052}px Fraunces`;
  wrapText(ctx, `"${data.highlight}"`, CARD_W * 0.46, 100, CARD_W * 0.50, CARD_W * 0.068);

  // One-liner — smaller, regular weight
  ctx.font = `400 ${CARD_W * 0.032}px Fraunces`;
  ctx.fillStyle = 'rgba(240,232,216,0.82)';
  wrapText(ctx, data.oneliner, CARD_W * 0.46, CARD_H * 0.62, CARD_W * 0.50, CARD_W * 0.044);

  // Title + author — bottom section
  ctx.font = `600 ${CARD_W * 0.042}px Fraunces`;
  ctx.fillStyle = data.textColor || '#f0e8d8';
  ctx.fillText(data.title, 60, CARD_H - 120, CARD_W * 0.85);

  ctx.font = `400 ${CARD_W * 0.026}px IBM Plex Mono`;
  ctx.fillStyle = 'rgba(240,232,216,0.65)';
  ctx.fillText(data.author.toUpperCase(), 60, CARD_H - 76);

  // Marginalia watermark — bottom right
  ctx.font = `400 ${CARD_W * 0.022}px IBM Plex Mono`;
  ctx.fillStyle = 'rgba(240,232,216,0.4)';
  ctx.textAlign = 'right';
  ctx.fillText('marginalia-reading.vercel.app', CARD_W - 40, CARD_H - 40);

  return new Promise(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'));
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function loadFont(family: string, url: string, descriptors: FontFaceDescriptors): Promise<void> {
  const ff = new FontFace(family, `url(${url})`, descriptors);
  const loaded = await ff.load();
  document.fonts.add(loaded);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  maxW: number,
  lineH: number,
): void {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}
```

### Step 3 — Add the UI in the Overview panel

In `src/book/panels/overview.js`, at the bottom of the `renderOverview` function output (or in the action row), add:

```html
<div class="reading-card-section" data-reading-card-section>
  <button class="reading-card-btn" type="button" data-generate-card>
    ✦ Generate reading card
  </button>
  <div class="reading-card-preview" data-card-preview hidden></div>
</div>
```

Add a click handler for `[data-generate-card]`:

```js
container.addEventListener('click', async (e) => {
  if (!e.target.closest('[data-generate-card]')) return;
  const btn = e.target.closest('[data-generate-card]');
  btn.textContent = 'Generating…';
  btn.disabled = true;

  try {
    // 1. Pick the best highlight (most text, or first)
    const highlights = HighlightsStore.getAll().filter(h => h.bookId === book.id);
    const chosenHighlight = highlights.sort((a, b) => b.quote.length - a.quote.length)[0];

    // 2. Call AI for oneliner + mood
    const prompt = AIFeatureRegistry.buildPrompt('reading-card', book, { highlights });
    const aiResult = await MarginaliaAI.generateJSON({ featureId: 'reading-card', prompt });
    // aiResult: { oneliner, mood }

    // 3. Get spine colour from book data
    const spineColor = book.spine || '#2b2b2b';
    const textColor  = book.text  || '#f0e8d8';

    // 4. Generate the card
    const blob = await generateReadingCardBlob({
      title:      book.title,
      author:     book.author || '',
      oneliner:   aiResult.oneliner,
      mood:       aiResult.mood,
      highlight:  chosenHighlight?.quote || '',
      coverUrl:   book.cover?.image,
      spineColor,
      textColor,
    });

    // 5. Show preview
    const previewEl = container.querySelector('[data-card-preview]');
    const previewUrl = URL.createObjectURL(blob);
    previewEl.innerHTML = `
      <img src="${previewUrl}" alt="Reading card for ${book.title}" class="reading-card-img">
      <div class="reading-card-actions">
        <button type="button" data-share-card data-blob-url="${previewUrl}">Share</button>
        <button type="button" data-download-card data-blob-url="${previewUrl}" data-title="${book.title}">Download</button>
      </div>
    `;
    previewEl.hidden = false;
    btn.textContent = 'Regenerate card';
    btn.disabled = false;
  } catch (err) {
    logError(err, { context: 'reading-card generate' });
    btn.textContent = 'Generate reading card';
    btn.disabled = false;
  }
});

// Share / Download handlers
container.addEventListener('click', async (e) => {
  const shareBtn    = e.target.closest('[data-share-card]');
  const downloadBtn = e.target.closest('[data-download-card]');

  if (shareBtn) {
    const url = shareBtn.dataset.blobUrl;
    const res = await fetch(url);
    const blob = await res.blob();
    const file = new File([blob], `${book.title}-reading-card.png`, { type: 'image/png' });
    if (navigator.share && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: book.title });
    }
  }

  if (downloadBtn) {
    const a = document.createElement('a');
    a.href = downloadBtn.dataset.blobUrl;
    a.download = `${downloadBtn.dataset.title}-reading-card.png`;
    a.click();
  }
});
```

### Step 4 — Add CSS

In `src/book/book.css` or a new `reading-card.css`:

```css
.reading-card-section {
  margin-top: 2rem;
  border-top: 1px solid var(--color-border);
  padding-top: 1.5rem;
}
.reading-card-btn {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  letter-spacing: 0.06em;
  padding: 0.6rem 1.2rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
  color: var(--color-text);
  transition: background 0.15s, border-color 0.15s;
}
.reading-card-btn:hover {
  background: var(--color-surface);
  border-color: var(--color-accent);
}
.reading-card-img {
  width: 100%;
  max-width: 480px;
  border-radius: 8px;
  margin-top: 1rem;
  display: block;
}
.reading-card-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.75rem;
}
```

---

## Implementation order

| # | Feature              | Effort | Files created                                                     |
|---|----------------------|--------|-------------------------------------------------------------------|
| 1 | Reading card export  | Small  | `book/reading-card.ts`, prompt file, CSS, button in overview.js  |
| 2 | Finish ritual        | Medium | `components/finish-ritual/`, prompt file, trigger in book.js      |
| 3 | Quote resurface      | Medium | schema extension, `pickResurfaceQuote`, notes-wall updates        |
| 4 | Reading stats        | Medium | `profile/reading-stats.ts`, renderer, CSS, mount in profile.ts   |
| 5 | Quick capture        | Large  | `captures-store.ts`, `quick-capture/` component, sidebar wiring   |

Start with Feature 1 (reading card) — zero new infrastructure, zero schema changes, shippable in isolation. Feature 2 (finish ritual) and Feature 3 (quote resurface) can be built in parallel once Feature 1 ships.
