# Marginalia — Claude Code 实现提示词

按优先级排序。每次只给 Claude Code 一条，完成后再给下一条。

---

## Prompt 1 · Reading Card Export（阅读卡片导出）

```
Read FEATURES.md and CLAUDE.md first, then implement Feature 5 (Reading Card Export).

Before writing any code, read these files in order:
1. FEATURES.md — the full spec for Feature 5
2. src/book/panels/overview.js — find where to add the button
3. src/ai/features/registry.js — how AI features are registered
4. src/store/highlights-store.ts — how to get highlights for a book

What to build:
1. Create src/ai/features/prompts/reading-card.js — registers the 'reading-card' AI feature prompt with AIFeatureRegistry
2. Add 'reading-card' to AIFeatureRegistry._features in src/ai/features/registry.js
3. Create src/book/reading-card.ts — the canvas generator (generateReadingCardBlob). Use FontFace API to load Fraunces and IBM Plex Mono before drawing. Canvas size 1080×1080. Include wrapText helper.
4. In src/book/panels/overview.js — add a "✦ Generate reading card" button below the main book content. On click: fetch highlights, call AI for { oneliner, mood }, pass to generateReadingCardBlob, show preview image. Add Share (Web Share API) and Download buttons under the preview.
5. Add CSS for .reading-card-section, .reading-card-btn, .reading-card-img, .reading-card-actions — either in book.css or a new reading-card.css imported by overview.js.

Rules from CLAUDE.md to follow:
- No window.X globals
- Every AI call goes through MarginaliaAI in src/services/ai-gateway.ts — never call DeepSeek directly
- Use logError(err, context) from services/analytics.ts at every async catch
- Font family: var(--font-mono) for the button label; Fraunces for canvas text
- Button text: sentence case ("Generate reading card", not "GENERATE READING CARD")
- No entitlement gate — reading card is free tier (it's a growth mechanic)

Acceptance criteria:
- Clicking the button in Book detail Overview calls the AI, renders a 1080×1080 PNG preview
- Share button uses navigator.share() on iPad; falls back to download link on desktop
- Watermark "marginalia-reading.vercel.app" appears bottom-right on every card
- No console.log left in production paths
```

---

## Prompt 2 · Finish Ritual（合上一本书）

```
Read FEATURES.md and CLAUDE.md first, then implement Feature 3 (Finish Ritual).

Before writing any code, read these files in order:
1. FEATURES.md — the full spec for Feature 3
2. src/book/book.js — find the status change handler (search for status or 'read')
3. src/book/panels/notes.js — understand how notes content is loaded and saved
4. src/store/notes-store.js — find saveNote() and getNote() signatures
5. src/ai/features/registry.js — how to register a new AI feature
6. src/services/ai-gateway.ts — MarginaliaAI.generateJSON()

What to build:
1. Create src/ai/features/prompts/finish-synthesis.js — registers the 'finish-synthesis' prompt. The prompt takes book + { belief, intention, next, highlights } and returns JSON { headline, synthesis, tags[] }.
2. Add 'finish-synthesis' to AIFeatureRegistry._features in registry.js.
3. Create src/components/finish-ritual/finish-ritual.js — a three-step modal exported as openFinishRitual(book, highlights). Three questions: (1) "What shifted or surprised you?" (2) "What will you actually do because of this book?" (3) "What do you want to read next, and why?". Each step shows one textarea (max 400 chars). Last step: show loading state while AI runs.
4. Create src/components/finish-ritual/finish-ritual.css — modal overlay + slide-in animation.
5. In src/book/book.js — detect when status transitions to 'read' (prevStatus !== 'read' && newStatus === 'read'). Dynamically import and call openFinishRitual(book, highlights).
6. After AI returns { headline, synthesis, tags }: prepend a styled HTML block to the existing note content via NotesStore.saveNote(). The block uses class .finish-synthesis-card.
7. Add styles for .finish-synthesis-card to the notes panel CSS — warm background, accent top border, serif font, tag chips.

Rules from CLAUDE.md to follow:
- No window.X globals; import everything explicitly
- Zod validate before any Firestore write (notes write goes through NotesStore which handles this)
- All AI calls through MarginaliaAI only
- logError at every async catch
- The synthesis card is prepended, never overwrites the existing note content

Acceptance criteria:
- Marking any book as 'read' opens the 3-step modal automatically
- Skipping the modal (Skip button) closes it without any side effect
- After completing all 3 steps, AI runs and the synthesis card appears at the top of that book's Notes panel
- The modal is accessible: focus trapping, Escape to close (same as Skip), aria-modal
```

---

## Prompt 3 · Spaced Resurface for Quote of the Day（间隔复现）

```
Read FEATURES.md and CLAUDE.md first, then implement Feature 2 (Spaced Resurface).

Before writing any code, read these files in order:
1. FEATURES.md — the full spec for Feature 2
2. src/components/notes-wall/notes-wall.js — read the entire file carefully. Find pickTodayQuote(), renderQuoteZone(), and the card open/close logic.
3. src/data/schema/highlight.ts — current HighlightSchema fields
4. src/store/highlights-store.ts — how highlights are stored and updated
5. src/store/notes-store.js — find saveHighlight() to understand how to persist resurface fields

What to build:
1. In src/data/schema/highlight.ts — add optional resurface fields to HighlightSchema: resurface7At, resurface30At, resurface90At (z.number().optional()) and resurfaced7, resurfaced30, resurfaced90 (z.boolean().optional()) and resurfaceRating (z.enum(['resonates', 'thought', 'action', 'dismiss']).optional()).
2. In src/store/highlights-store.ts (or notes-store.js, wherever highlights are created) — when a new highlight is saved, also set resurface7At = Date.now() + 7d, resurface30At = Date.now() + 30d, resurface90At = Date.now() + 90d.
3. In src/components/notes-wall/notes-wall.js — replace pickTodayQuote() with pickResurfaceQuote(highlights) that checks due tiers in priority order (7d → 30d → 90d) and falls back to the most recent highlight.
4. Update renderQuoteZone() to show a tier badge ("Resurface · 7d") when the shown quote is due for resurface, or "Quote of the Day" when it's a fallback.
5. In the expanded quote card (data-open-card="quote" handler) — add four response buttons: "Still resonates", "Add a thought", "Turn into action", "Dismiss". Handle each:
   - resonates: mark current tier done, leave next tiers scheduled
   - thought: show a small textarea, save text as a follow-up note appended to the highlight, then mark tier done
   - action: call ActionsStore.add({ bookId, text: highlight.quote }), mark tier done
   - dismiss: set resurfaced7/30/90 all true — never resurface again
6. Persist tier updates via NotesStore.saveHighlight() (IndexedDB) and sync to Firestore if signed in.

Rules from CLAUDE.md to follow:
- No window.X globals
- Every Firestore write through withMeta/withMetaCreate + Zod validation
- logError at every async catch
- Use existing ActionsStore.add() — do not write to actions collection directly

Acceptance criteria:
- Notes Wall shows the highest-priority due highlight, not a random one
- All four response buttons work and persist correctly
- After responding, the next open of Notes Wall shows the next due highlight (or Quote of the Day if none due)
- Existing highlights without resurface fields gracefully fall back (undefined checks)
```

---

## Prompt 4 · Reading Stats in Profile（阅读数据面板）

```
Read FEATURES.md and CLAUDE.md first, then implement Feature 4 (Reading Stats in Profile).

Before writing any code, read these files in order:
1. FEATURES.md — the full spec for Feature 4
2. src/profile/profile.ts — find renderResolvedProfile() and where existing sections (annualShelf, heatmap, readingIdentity) are appended
3. src/profile/profile-heatmap.ts — pattern for a self-contained profile section
4. src/profile/profile-types.ts — PublicProfileData, PublicBook, SessionDay types
5. src/store/books-store.ts — BooksStore.getAll() return shape
6. src/store/highlights-store.ts — HighlightsStore.getAll()

What to build:
1. Create src/profile/reading-stats.ts — exports buildReadingStats(books, sessionDays, highlightCount): ReadingStats. Compute: totalBooks, totalFinished, totalHighlights, totalSessionMinutes, avgSessionMinutes, genreDistribution (from book.type field), geoDistribution (from book.geo.authorOrigin.country), deepReaderScore (highlights per finished book, normalised 0–100).
2. Create src/profile/reading-stats-render.ts — exports renderReadingStats(stats, isOwner): string. Returns empty string if !isOwner or stats.totalBooks === 0. Render: 4 stat tiles (avg session, total highlights, total reading time, deep reader score) + genre bar chart (pure CSS width:X% bars, no D3) + geo chips. Use var(--font-mono) for numbers, var(--font-serif) for labels.
3. Create src/profile/reading-stats.css — styles for .reading-stats, .reading-stats__tiles, .rs-tile, .rs-bar-row, .rs-bar-track, .rs-bar-fill, .rs-geo-chip. Use CSS variables only, no raw hex.
4. In src/profile/profile.ts — inside renderResolvedProfile(), after the annual shelf section mounts, if isOwner: get highlightCount from HighlightsStore.getAll().length, call buildReadingStats(), call renderReadingStats(), append the resulting HTML to the profile container.

Rules from CLAUDE.md to follow:
- Owner-only — never show this section on public profile views (check isOwner flag)
- No D3 dependency — CSS bars only
- No raw hex in CSS — tokens only
- logError if the stats build throws

Acceptance criteria:
- "How you read" section appears below the annual shelf on your own profile
- Section is completely absent on public profile views
- Genre bars are proportional and correctly labelled
- Stats are 0-safe (no divide-by-zero when user has no sessions or no finished books)
```

---

## Prompt 5 · Quick Capture（闪现记录）

```
Read FEATURES.md and CLAUDE.md first, then implement Feature 1 (Quick Capture).

Before writing any code, read these files in order:
1. FEATURES.md — the full spec for Feature 1
2. src/three-room/three-room-view.js — find QUICK_ACTION_ITEMS array and the sidebar click handler
3. src/components/notes-wall/notes-wall.js — find the todo zone render and click handling
4. src/store/actions-store.ts — mirror this pattern exactly for the new captures store
5. src/data/schema/action.ts — reference for schema pattern
6. src/store/books-store.ts — BooksStore.getAll() for the typeahead

What to build:
1. Create src/data/schema/capture.ts — CaptureSchema with quote (string, 1–1000), bookId (string nullable optional), capturedAt (number), source ('quick' literal), attributed (boolean default false). Use .passthrough().
2. Create src/store/captures-store.ts — mirrors actions-store.ts exactly. Methods: initWithUser(uid, db), getAll(), getUnattributed(), add(quote, bookId?), attribute(captureId, bookId), subscribe(fn). Firestore path: workspaces/{wsId}/users/{uid}/data/captures/{captureId}. Emit marginalia:captures-changed on every change.
3. Create src/components/quick-capture/quick-capture.ts — a bottom-sheet component. Exports openQuickCapture() and closeQuickCapture(). Appended to document.body, position fixed. Contains: textarea for the quote, optional book typeahead (filters BooksStore.getAll() on input, shows 5 suggestions), Save button. On save: call CapturesStore.add(). If bookId selected, immediately call CapturesStore.attribute(). Close on backdrop click, Escape, or after save. The sheet must sit above all panels (high z-index).
4. Create src/components/quick-capture/quick-capture.css — slide-up animation from translateY(100%) to translateY(0).
5. In src/three-room/three-room-view.js — add { id: 'capture', label: 'Capture', icon: 'capture' } to QUICK_ACTION_ITEMS. In the sidebar click handler, add a case for 'capture' that dynamically imports and calls openQuickCapture(). Add an SVG <symbol id="icon-capture"> to index.html (pencil or lightning bolt, same style as existing icons).
6. In src/components/notes-wall/notes-wall.js — in the todo zone header, add a small "+" button with data-open-capture. In the click event handler, import and call openQuickCapture() when that button is clicked.
7. In src/search/search.js — when CapturesStore.getUnattributed().length > 0, show a "◎ N unattributed" chip in the search header. Clicking opens a simple drawer listing unattributed captures with an "Attribute to book…" button on each that triggers the typeahead.

Rules from CLAUDE.md to follow:
- No window.X globals — dynamic import pattern for lazy loading the sheet
- Every Firestore write: Zod validate → withMetaCreate → Firestore (in that order, mandatory)
- The attribute() method must write a valid HighlightSchema doc to books/{bookId}/highlights/{id} before deleting the capture doc
- Emit marginalia:captures-changed so the Search chip updates reactively
- logError at every async catch

Acceptance criteria:
- The "Capture" item appears in the 3D room sidebar quick actions
- "+" button appears in the Notes Wall todo zone header
- Bottom sheet opens from both entry points, slides up smoothly
- Book typeahead filters correctly and selecting a book auto-attributes on save
- Unattributed count badge appears in Search view and updates in real time
- Attributed captures become proper highlights visible in the book's Highlights panel
```
