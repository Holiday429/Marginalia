# Marginalia — Product Specification

> Engineering reference lives in `CLAUDE.md`. This document captures **product intent**: who Marginalia is for, what it does, and why.

---

## What it is

Marginalia is a personal reading-records platform. Not a reader, not a social network, not a collection. It owns the *after* of reading: cultural context, knowledge connection, and the conversion of insight into action.

**Core thesis.** The point of reading is not to finish more books. It is to internalize what you read and convert it into action. Most reading apps optimize for the *before* (discovery, lists) or the *during* (the reading itself). Marginalia optimizes for the *after*.

## Who it is for

People who already read seriously and want a system that holds them accountable to their own thinking. They care about depth more than count. They have likely tried Notion or Obsidian and found the blank-canvas tax too high; they have likely used Readwise and felt that surfacing highlights isn't enough.

## What makes it different

| Adjacent product | What they do                          | Why Marginalia is different               |
|------------------|---------------------------------------|-------------------------------------------|
| Goodreads        | Social book tracking                  | Not a social product. No follows or feeds. |
| Douban Book      | Catalog + ratings                     | Not a collection. Rewards depth, not count. |
| Notion           | Blank database                        | Opinionated structure for reading.        |
| Readwise         | Highlight resurfacing                 | Highlights are an input, not the output.  |
| Obsidian         | Personal knowledge graph              | Pre-built mechanics; no setup tax.        |
| Apple Books      | Reader + library                      | Not a reader. Works alongside one.        |

Marginalia's protected position is the **after-reading layer plus cultural context**: pulling reading out of isolation into time and place, and converting reflection into action.

---

## Modules

### 1. Shelf

Browse all books, filter by status (`want`, `reading`, `finished`, `shelved`). The fast utility view — find a book quickly, change its status, jump to detail.

### 2. Library

The signature view. A 3D room with planar surfaces holding 2D content:

- **North wall** — shelves of books (the same component used by Library 2D), drag-to-arrange.
- **West wall** — sticky-note wall of recent or pinned highlights.
- **Desk** — covers of currently-reading books, with reading-session controls.
- **Future walls** — map snapshots, year-end recaps, and other planar views.

**Why this exists.** E-book readers stripped away the physical sensation of arranging your books. The act of arranging triggered planning and habit formation; without it, casual readers forget they're reading. Library puts that ritual back, in a form that feels deliberate (not skeuomorphic-cute).

The 2D fallback (Library 2D) renders the same shelves flat — used on mobile, low-GPU devices, and as a fast path for users who don't want the cinematic view. Both views share one shelf component; features added to one appear in the other automatically.

### 3. Map

Reading geography. Each book is placed at its author's origin and (optionally) its setting. Hover a country to see its books; click to see a short AI-generated cultural primer.

A secondary cultural-coordinate view plots time × place to reveal reading blind spots ("you have never read contemporary African fiction").

### 4. Graph

Concepts and books connected by tag. Intentionally minimal. Tags come from `book.tags`; the graph is computed at read time, not stored as an edge collection. The graph view is supportive, not central — knowledge graphs have a long history of looking impressive in screenshots and being unused daily.

### 5. Booklist

Yearly and quarterly digests. Auto-generated shareable cards (think Spotify Wrapped, but for what you read and what it changed). Public-profile owners can publish theirs to `marginalia.app/{slug}`.

### 6. Book (detail)

The single-book page. Sections:

- **Overview** — title, author, cover, your reading dates, your reading location.
- **Cultural context** — AI-generated background on the author and the period the book was written in. Editable.
- **Highlights & notes** — imported from Notion / Apple Books / Kindle, or added manually. Each highlight can carry a note and an optional cultural annotation.
- **Visualizations** — AI-generated and tailored to book type: concept cards / mind maps for nonfiction, character maps / timelines for fiction, argument breakdowns for argumentative work. Always editable.
- **Takeaways** — free-text personal reflection.
- **Action list** — structured next-actions, each with status and follow-up timing (30-day, quarterly).
- **Reading context** — where you were in life when you read this. The memory anchor.

### 7. Reading session

Not a view, a cross-cutting feature. Start a session from the desk in Library, from a book detail page, or from anywhere a current book is shown. The session timer is an honor system — it does not read EPUB content. When the session ends, Marginalia prompts: "You read for 23 minutes. Want to note something?"

Reading sessions create the daily-return habit. They are the single most important engagement mechanic in the product.

---

## AI features

All AI generation produces **editable** output. Each block stores `original` + `userEdited`; the view always shows the user's version when present. Users can edit, fork, or mark a block as "this is wrong" in one click.

| Feature              | What it does                                          |
|----------------------|-------------------------------------------------------|
| Intro card           | Pre-read summary: argument, audience, difficulty       |
| Cultural context     | Author + period + place, ~300 words                   |
| Concept cards        | Key concepts from nonfiction                           |
| Mind map             | Hierarchical structure of a nonfiction book            |
| Character map        | Relationship graph for fiction                         |
| Timeline             | Events ordered chronologically                         |
| Argument breakdown   | Structured pro/con analysis                            |
| Action suggestions   | "Things you might do because of this book"             |

In v1, all cultural-context content is AI-generated. Human-curated content (UGC or editorial) is a far-future possibility, not a near-term commitment.

---

## Cross-cutting product mechanics

### Quote of the Day

The home screen shows three of the user's past highlights, rotating daily. Drawn from their own library. Free users get a small daily set; Pro users get more controls (themed selection, per-tag filters).

The lowest-effort, highest-return engagement loop in the product. Also forms the basis of `marginalia.app/{slug}` public profiles.

### Action follow-up

Action items have due dates and review intervals. Thirty days after creation, Marginalia asks: "Is this still relevant? Did you do it?" Quarterly, the system surfaces a digest. Without follow-up, action lists die.

### Cross-book full-text search

Search spans every book, every highlight, every note. Once data accumulates this becomes the highest-frequency operation. Designed to feel instant.

### Public profile

Users can opt into a public profile at `marginalia.app/{slug}`. Read-only. Shows: map, recent finished books, year stats, optional Quote of the Day feed. The natural acquisition surface — every shared profile is marketing.

---

## Import & export

**Import.** Notion (two-way sync), Apple Books (`.epub` annotation export), Kindle (`.html` export), manual entry.

**Export** (in scope from day one):

- JSON — full data dump (required for trust)
- Markdown — per-book, for note-takers
- PDF — year-end recap, Pro plan

Account deletion exports user data first, then deletes — not the reverse.

---

## Internationalization

UI is in English by default. Initial locales: `en`, `zh-CN`. Expansion (`ja`, `ko`, `es`, etc.) follows demand.

User-generated content is locale-agnostic — users write in whatever language they want, including mixing languages within a single note. Functional UI text never mixes languages within one element.

---

## Monetization

**Model.** Freemium with **usage gating**, not feature gating.

A common mistake is to put the best features behind a paywall and watch free users never experience why the product is worth paying for. Marginalia does the opposite: every feature is available to free users, with usage caps that real readers will hit naturally if the product is working.

### Free

- Unlimited books, unlimited manual notes
- Public profile, basic map, JSON export
- AI: generous monthly cap (target: ~10 generations / month)
- Cultural context: short version (~200 words)

### Pro (~$5–8 / month or annual discount)

- Unlimited AI
- Full-length cultural context
- PDF export, year-end recap
- Custom domain for public profile
- Notion two-way sync
- 3D Library
- Action-list reminder customization

### Lifetime (early-adopter offer)

- Equivalent to Pro, one-time payment

No team or family plans. This is a personal product.

---

## What Marginalia is NOT

These are deliberate scope decisions, not "things we haven't gotten to yet."

- **Not a reader.** EPUB / PDF rendering is not Marginalia's job. Read where you already read; Marginalia captures the after.
- **Not a social network.** No follows, comments, feeds, or DMs. Public profiles are read-only.
- **Not a Mac or Android native app.** PWA is the cross-platform target. iPad app is on the table only if iPad usage justifies it.
- **Not a heavy knowledge graph.** Graph view stays minimal; Marginalia is not Obsidian.
- **Not a curated content corpus.** Cultural context comes from AI in v1; UGC is far future.
- **Not a team product.** Reading is personal.

---

## Design principles

1. **Internalization first.** Every feature serves the *read → internalize → action* loop. Features that feel cool but don't serve it get cut.
2. **Depth over count.** No reading-streak gamification, no books-read counter on profile. Anything that turns reading into a numbers game is rejected.
3. **Cultural context is the moat.** It is the layer competitors haven't built and won't easily build.
4. **The user owns their data.** Full export from day one. Deletion exports first.
5. **AI is a draft, not a verdict.** Every AI output is editable, and the user's edit takes precedence in the UI.
6. **Manual ritual matters.** Drag-arrange-shelves is a product mechanic, not UI fluff. It exists to restore what e-readers took away.
