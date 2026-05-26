# Marginalia — User Pain Points & Technical Solutions

Five core pain points for readers using a post-reading record platform (not an e-reader), with implementation specs mapped to the existing codebase.

---

## Pain Point 1: Recording friction kills the habit

**Problem.** The reader has a thought while reading, puts the book down to open the app, navigates to the correct book, then enters the highlight. By step three the thought is gone or the moment is broken. The current flow requires: open app → find book → tap Highlights tab → type. That's four friction points before any value is delivered.

**Solution: Floating quick-capture, bookId optional.**

A persistent floating entry button (not per-book) that accepts a raw quote or thought immediately. `bookId` defaults to null and can be attributed to a book later.

### Implementation

**Schema change — `src/data/schema/highlight.ts`:**

```ts
// Add optional field to existing HighlightSchema
bookId: z.string().nullable().optional(), // null = unattributed capture
capturedAt: z.number().optional(),        // separate from createdAt for sort clarity
orphaned: z.boolean().optional(),         // true = not yet attributed to a book
```

**New Firestore path:** Unattributed captures live at a separate top-level collection to avoid breaking the existing `collectionGroup('highlights')` query that assumes `bookId` is non-null:

```
workspaces/{wsId}/users/{uid}/data/captures/{captureId}
  — quote, capturedAt, bookId (nullable), orphaned, source: 'quick'
```

**UI — `src/components/quick-capture/quick-capture.ts` (new):**

- A floating `+` button pinned to the bottom-right, `position: fixed`, `z-index` above panels but below transitions.
- On tap: a bottom-sheet slides up with a single `<textarea>` and an optional "Which book?" typeahead (pulls from `BooksStore.getAll()`).
- On submit: write to `captures/` collection via `withMetaCreate`. If a bookId is selected, move to `books/{bookId}/highlights/` and delete the capture doc.
- Mount in `index.html` outside all panel containers; init once in `main.js`.

**Attribution flow — `src/components/quick-capture/attribution-drawer.ts` (new):**

- A "Unattributed captures" section in the Search view (below the shelf). Count badge on the Search nav icon when `captures.length > 0`.
- Drag a capture card onto a book spine to attribute it.

**Event:** `marginalia:capture-saved` — components that display unattributed count subscribe to this.

---

## Pain Point 2: Notes sink into time and disappear

**Problem.** Highlights and notes are saved but rarely resurface. The reader invested effort in annotation but gets no return on that investment. The existing `Quote of the Day` widget is random — valuable but aimless.

**Solution: Spaced repetition resurface system (SM-2 lite).**

At 7, 30, and 90 days after a highlight is saved, a "resurface" notification prompts the reader to re-read the highlight and either confirm it still resonates, add a follow-up note, or convert it to an Action.

The `ActionSchema` already has `remind7At`, `remind30At`, `remind90At`, `reminded7/30/90` fields. Mirror this pattern for highlights.

### Implementation

**Schema change — `src/data/schema/highlight.ts`:**

```ts
// Spaced resurface timestamps (set once on create, cleared if user dismisses permanently)
resurface7At:   z.number().optional(),
resurface30At:  z.number().optional(),
resurface90At:  z.number().optional(),
resurfaced7:    z.boolean().optional(),
resurfaced30:   z.boolean().optional(),
resurfaced90:   z.boolean().optional(),
resurfaceRating: z.enum(['keep', 'edit', 'action', 'dismiss']).optional(), // user response
```

**Cloud Function — `functions/src/resurface-scheduler.ts` (new):**

```ts
// Scheduled Cloud Function — runs daily at 08:00 user local time (use timezone from user_profile)
export const dailyResurface = onSchedule('0 8 * * *', async () => {
  // Query: highlights where resurface7At <= now AND resurfaced7 != true
  // For each match: write to workspaces/{wsId}/notifications/{uid}/unread/{id}
  //   { type: 'resurface', highlightId, bookId, quote, tier: '7d' }
});
```

**Client — `src/components/action-notifications/` (existing, extend):**

The `action-notifications` component already handles action reminders. Add a `resurface` notification type that renders a highlight card with four response buttons: **Still true · Add note · Make action · Dismiss**.

```ts
// On user response:
// 'keep'   → set resurfaced7: true, schedule next tier (30d)
// 'edit'   → open the highlight in Book detail
// 'action' → create an Action doc via ActionsStore, set resurfaced7: true
// 'dismiss'→ set resurfaced7: true, resurfaced30: true, resurfaced90: true (no more resurfaces)
```

**Desk slot integration:** The `DeskSlotComponent` in `src/components/reading-session/desk-slot.ts` should show a "You have 3 highlights waiting" nudge when unread resurface notifications exist. Clicking opens the notification drawer.

---

## Pain Point 3: Finishing a book leaves no synthesis moment

**Problem.** When a reader marks a book as finished, the app moves on immediately. There is no ritual, no consolidation. The reader's insights are scattered across highlights and notes but never coalesce into a single "what did this book change?" record.

**Solution: Finish ritual — AI-triggered synthesis card.**

When `status` transitions to `'read'` (or `'finished'`), trigger a modal that asks three questions, then uses AI to produce a synthesis card from the answers + existing highlights.

### Implementation

**Trigger — `src/book/book.js` (existing):**

```js
// In the status-change handler, detect the transition:
const wasFinished = prevStatus !== 'read' && nextStatus === 'read';
if (wasFinished) {
  import('../components/finish-ritual/finish-ritual.js')
    .then(({ openFinishRitual }) => openFinishRitual(book));
}
```

**`src/components/finish-ritual/finish-ritual.js` (new):**

Three-step modal (one question per step, no scrolling):
1. "What belief or assumption changed?"
2. "What will you do differently because of this book?"
3. "What do you want to read next, and why?"

Each answer is a `<textarea>`, max 280 characters. The "Next" button advances steps. On the final step: submit button triggers AI synthesis.

```js
// AI call via MarginaliaAI.generate():
const prompt = buildSynthesisPrompt(book, highlights, { belief, action, next });
// featureId: 'finish-synthesis' (add to AIFeatureRegistry)
// outputType: 'json'
// Output: { headline: string, synthesis: string, tags: string[] }
```

**Storage:** Write result to `ai_results/finish-synthesis` as an `AiBlock`. Also write the three raw answers to a new `moments/{bookId}` document:

```
workspaces/{wsId}/users/{uid}/data/moments/{bookId}
  — finishedAt, belief, action, nextBook, synthesisAiBlockRef
```

**Profile display:** The `ProfileAnnualShelf` (`profile-year-in-review.ts`) should link to the moment doc so finished books show a synthesis snippet.

**Prompt file — `src/ai/features/prompts/finish-synthesis.js` (new):**

```js
AIFeatureRegistry.setPrompt('finish-synthesis', {
  version: '1.0',
  build(book, answers) {
    return `You are a thoughtful reading companion. The reader just finished "${book.title}" by ${book.author}.
Their reflections:
- What changed: "${answers.belief}"
- What they'll do: "${answers.action}"
- What they want to read next: "${answers.next}"

Their highlights:
${answers.highlights.map(h => `"${h.quote}"`).join('\n')}

Write a 2-sentence synthesis of what this book meant to this reader. Be specific, personal, and concrete. Return JSON: { headline, synthesis, tags[] }`;
  }
});
```

---

## Pain Point 4: Readers don't know how they actually read

**Problem.** Readers sense that they read broadly or narrowly, quickly or slowly, but have no data to confirm it. The `sessions` collection is being written (schema defined, `reading-session.ts` controller active) but the data is not yet surfaced anywhere. `ProfileAnnualShelf` and the heatmap exist but don't incorporate session data.

**Solution: Reading meta-dashboard in Profile.**

A dedicated "How I read" section in the Profile view, built on top of existing session data and cross-book analysis.

### Implementation

**`src/profile/reading-stats.ts` (new):**

```ts
export interface ReadingStats {
  totalSessionMs:      number;  // aggregate of all durationMs
  avgSessionMs:        number;  // per-session mean
  avgHighlightsPerBook: number;
  avgActionsPerBook:   number;
  genreDistribution:   Record<string, number>; // bookType → count
  geoDistribution:     Record<string, number>; // authorOrigin.country → count
  deepReaderScore:     number;  // highlights+notes per 100 pages (0–100)
  peakReadingHour:     number;  // hour of day (0–23) from session startedAt
}

export async function buildReadingStats(uid: string, db: FirestoreDB): Promise<ReadingStats> {
  // 1. Query sessions collectionGroup for this user
  // 2. Aggregate durationMs, count by hour
  // 3. Cross with BooksStore for genre/geo distribution
  // 4. Compute deepReaderScore from HighlightsStore.getAll().length / estimated pages
}
```

**Profile section — add to `profile.ts`:**

```ts
// After the annual shelf section, render:
const stats = await buildReadingStats(uid, db);
container.insertAdjacentHTML('beforeend', renderReadingStats(stats));
```

**`src/profile/reading-stats-render.ts` (new):**

Four stat tiles (mirroring the existing `12 BOOKS FINISHED / 60 READING DAYS` pattern):
- **Avg session** — "42 min focus blocks"
- **Peak hour** — "You read most at 9pm"
- **Deep reader score** — "High — 4.2 highlights per book"
- **Range score** — genre/geo spread as a breadth index

Below the tiles: a small bar chart (no D3 dependency — pure CSS `width: X%` bars) showing genre distribution.

**Data freshness:** Stats are computed client-side on Profile enter. For performance: memoize the result keyed by `uid + BooksStore.version` in `sessionStorage`. Invalidate on `marginalia:books-changed`.

---

## Pain Point 5: Insights have no exit — they stay locked in the app

**Problem.** The reader accumulates highlights, synthesis cards, and action items, but can't share a meaningful artefact from their reading without copy-pasting. The existing JSON export is functional but not human-readable or shareable. A public profile exists, but sharing a single book's record isn't possible.

**Solution: Reading card export — single-book shareable image.**

A "Share this book" action in the Book detail view that generates a canvas-based image card and offers download + copy-to-clipboard.

### Implementation

**`src/book/reading-card.ts` (new):**

```ts
export async function generateReadingCard(book: Book, options: {
  highlight?: string;   // user's chosen highlight (defaults to first)
  showRating?: boolean;
  showDate?: boolean;
}): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width  = 1200;
  canvas.height = 630;  // OG image ratio
  const ctx = canvas.getContext('2d')!;

  // 1. Background: book's spine color (from SpineCard data) or dark fallback
  // 2. Book cover image (if available from Firebase Storage)
  // 3. Title + author in Fraunces (loaded via FontFace API)
  // 4. Chosen highlight quote in italic Fraunces
  // 5. Reader name + Marginalia wordmark bottom-right
  // 6. Rating dots + finish date bottom-left (if opted in)

  return new Promise(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'));
}
```

**UI — add to `src/book/panels/overview.js`:**

```js
// "Share" button in the overview panel action row
btn.addEventListener('click', async () => {
  const blob = await generateReadingCard(book, { showRating: true, showDate: true });
  // Web Share API (primary — works on iPad Safari):
  if (navigator.share && navigator.canShare({ files: [new File([blob], 'reading-card.png')] })) {
    await navigator.share({ files: [new File([blob], 'reading-card.png', { type: 'image/png' })], title: book.title });
  } else {
    // Fallback: download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${book.title}.png`; a.click();
    URL.revokeObjectURL(url);
  }
});
```

**Font loading:** Fraunces and Bodoni Moda must be loaded as `FontFace` objects before drawing to canvas — they don't auto-load for `CanvasRenderingContext2D`.

```ts
await Promise.all([
  new FontFace('Fraunces', 'url(/fonts/Fraunces.woff2)').load(),
  new FontFace('Bodoni Moda', 'url(/fonts/BodoniModa.woff2)').load(),
].map(f => f.then(ff => document.fonts.add(ff))));
```

**Highlight chooser:** Before generating, show a small sheet with the book's top 3 highlights so the reader can pick which one to feature. Default to the one with the most annotation text.

**Entitlement:** Reading card export is free tier. No gate. It is a growth mechanic — every shared card includes the Marginalia URL.

---

## Implementation Priority Order

| # | Feature              | Effort | Impact | Depends on          |
|---|----------------------|--------|--------|---------------------|
| 1 | Reading card export  | Low    | High   | Nothing new          |
| 2 | Quick capture        | Medium | High   | Schema change + new component |
| 3 | Finish ritual        | Medium | High   | AI feature (new prompt) |
| 4 | Reading meta-stats   | Medium | Medium | Session data being written |
| 5 | Spaced resurface     | High   | High   | Cloud Function scheduler |

Start with reading card export — it's self-contained, has no new infrastructure requirements, and every card shared is organic acquisition. Quick capture and finish ritual are the two highest-impact habit-formation features and can be built in parallel. Spaced resurface requires the Cloud Function scheduler to be wired up first.
