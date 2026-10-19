# Phase 2 report — core loop

Branch: `phase-2-loop` (from `main` at `e59bd95`). Gate before every commit: `npm run check:all`
(lint, typecheck, typecheck:room, check:entitlements/hardcoded/paths/docs, functions build, unit,
rules on the emulator, production build, smoke e2e, signed-in e2e on the emulators, size budgets, room-load budget).
Nothing was deployed, nothing touched production data, nothing merged.

Environment notes that apply to every "dev environment" item below: this session has no access to a real Firebase
dev project, PostHog, DeepSeek or a deployed function. Everything was verified on the Firebase emulators. Where the
plan says "dev environment" the evidence is therefore emulator evidence, and the remaining real-environment check is
listed under "Needs you".

## Progress after tasks 2.10, 2.1, 2.2, 2.3

Order followed: 2.10 → 2.1 → 2.2 → 2.3. 2.8 is blocked on your answer to Q2.8-a (proposal written, no navigation changed).

### 2.10 Analytics events — done in code; dashboards need your PostHog key

| Acceptance | Status | Evidence |
| --- | --- | --- |
| Walk signup → add → highlight → finish in dev; each event appears once in PostHog | ✅ emulator + fake key / ⏳ real project | `tests/e2e-emulator/analytics-events.spec.ts`: production build with a fake PostHog key on the emulators; registers through the real form, adds a book, highlights, imports Kindle clippings, runs a timer, generates once, finishes. The test decodes every capture request the browser sends and asserts `signup`, `book_added`, `import_completed`, `session_completed`, `book_finished` once each, `highlight_saved` with sources `book` and `import`, and `ai_generated` (twice since 2.2: the automatic pre-read card plus the manual click). Not run against a real PostHog project |
| Funnel and weekly-active dashboard | ⏳ you | `npm run analytics:dashboards` prints the four tiles (funnel, weekly active readers, weekly retention, event volume). `--apply` needs `POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID`; payload shapes follow PostHog's query schema but were never run against a real project (Q2.10-a) |

What changed: `shared/analytics-events.ts` (one catalogue for browser and functions), typed `track()`, `book_finished` from a single status-transition hook (`src/store/book-status-events.ts`, reused by 2.3), `docs/analytics.md`.

Found on the way (all fixed in the same commit, details in `docs/open-questions.md`)
- **Email registration was impossible** (Q2.0-a): the username-uniqueness query ran before sign-in and the rules refuse it, with no visible error. Removed the pre-check, made auth errors readable. Username uniqueness and username login are your decision.
- **posthog-js drops every event from automated browsers**, so the Phase 1 consent test never saw real traffic. With the filter off in the emulator build it showed autocapture was on and the click that withdraws consent was flushed after the withdrawal. Autocapture and session recording are now off (Q2.10-d).
- `book_added` used to fire before the save succeeded; now after.
- Readers who decline analytics are invisible to retention numbers (Q2.10-b).

### 2.1 Global quick capture — done (keyboard check is simulated)

| Acceptance | Status | Evidence |
| --- | --- | --- |
| From room, Library, Book, Map: at most 2 clicks + typing | ✅ | `quick-capture.spec.ts` "from the room, Library, Book and Map…": each page = one click on "+" and one on Save; the document reaches Firestore with `source: quick`; on the Book page the book is preselected. The `C` key opens the same sheet |
| 390px: sheet not covered by the keyboard (screenshot) | ✅ simulated / ⏳ real device | Sheet follows `visualViewport`; the test fakes a 336px keyboard and asserts title, field and Save stay above it. Screenshots `tests/screenshots/phase-2/2.1-capture-sheet-{390,768,1440}.png`, `…-390-keyboard.png`. Playwright has no soft keyboard, so please look once on an iPad/phone |
| Offline save → Firestore after reconnect | ✅ | "a capture made offline…" (`context.setOffline`) and "…still waiting in the outbox is sent after a reload" (write channel cut, page reloaded, outbox re-sends on sign-in) |
| Unattributed capture dragged onto a spine → in that book's Highlights | ✅ | "ending a reading session opens the sheet; … dragged onto a spine" (Search cards) and "in Library … dragged onto a shelf spine" |

Design notes
- A capture is a highlight with `source: 'quick'` and `bookId: ''` until attributed (FEATURES.md proposed a separate collection and a path with an odd number of segments, `…/data/captures/{id}`, which is not a valid document path — the same class of bug as the Phase 1 sessions path). One collection means resurface (2.4) and search (2.7) need no second code path. No path or field change that needs a migration.
- Device-first: IndexedDB copy, then an outbox (`capture-outbox.ts`, per-uid) that re-sends on `online`, on sign-in and after reload.
- Stopping a reading session now opens the sheet ("You read for 23 minutes. Want to note something?") — the hook Phase 1 left open.
- Pill "N unattributed" opens a drawer; dragging uses pointer events (mouse, finger, Pencil). A "Choose a book" picker is the non-drag fallback.

### 2.2 Book detail never blank — done (30-second check is against a fake model)

| Acceptance | Status | Evidence |
| --- | --- | --- |
| New book → pre-read card on Overview within 30 s (dev screenshot) | ✅ emulator / ⏳ real model | `book-detail.spec.ts` "a new book shows its pre-read card…": real `aiGenerate` function in the Functions emulator (auth, server-built prompt, quota, audit) against a fake model server (`tests/support/mock-llm.mjs`, 0.6 s delay): card visible 4.6 s after saving; stored as an AI block; usage counter = 1. Screenshots `2.2-overview-intro-card-{390,768,1440}.png`. Real DeepSeek latency unmeasured (Q2.2-c) |
| Quota exhausted → skipped, manual button shown | ✅ | "when the free allowance is used up…": status line, "Generate pre-read card" button, counter unchanged |
| From desk, Library, search result: default tab is Overview | ✅ | "every empty tab explains itself, and detail opens on Overview from the desk, Library and Search" (leaves the book on Actions, re-enters three ways) |
| Shelf preview action count = Actions tab count | ✅ | "the shelf preview shows the same action count as the Actions tab": 3 added, 1 done → Actions list 2, Search preview "2 open actions", Library overlay "2 open actions". One definition (`openActionCount`) feeds Overview, Actions tab, Search preview and Library overlay. Note: the preview had no action count before; "count" = open actions |
| Each tab has a guiding empty state | ✅ | same spec, plus `src/components/empty-state/` (one component) and `tests/intro-card.test.ts` |

Found on the way
- `admin.firestore.FieldValue` is undefined under the Functions emulator: the audit write in `ai-generate.ts` crashed the function after a successful generation, and `billing-webhook.ts` had the same expression. Plain Node resolves it fine, so production is probably unaffected; both now use `firebase-admin/firestore` (works everywhere). Worth knowing because unit tests fake the DB and could not catch it.
- The book page is not usable at 390px (content cut off at the right edge). Pre-existing; belongs to 3.4. Screenshot shows it.
- Landing the pre-read card re-rendered the whole page and would have thrown away typing in progress; it now updates in place.
- Imports must never trigger the card (each costs one free generation) — built that way for 2.5. Product questions: Q2.2-a (1 of 10 free per book), Q2.2-b (context length), Q2.2-c.

### 2.3 Finish ritual — done

| Acceptance | Status | Evidence |
| --- | --- | --- |
| Mark finished → three answers → card at the top of Notes; still there after reload | ✅ | `finish-ritual.spec.ts` "finish a book, answer three questions…": card first in the Notes tab, contains text from the first answer (proves the answers reached the server prompt), document `moments/{bookId}` has answers and an AI block, card visible after a reload. Screenshots `2.3-ritual-step1-1440.png`, `2.3-finish-card-{390,768,1440}.png` |
| Skip does not affect status; marking finished again does not re-open | ✅ | same spec (answered book: reading → finished again; skipped book: same) plus "skipping leaves the status alone…" — a skipped record is kept, Notes offers "Write a finish reflection" |
| Profile annual shelf: the book can open its card | ✅ | "the card exports as an image, and the Profile annual shelf opens it": the stage shows "Finish card ready", click opens the book on Notes with the card |
| Export as image (plan text) | ✅ | same test: PNG download > 20 KB, reuses the existing reading-card renderer |

Also: quota exhausted keeps the answers and the Notes tab can write the card later (tested). The gateway now accepts `params`, but only the fields a feature declares, cut to length (`functions/test/ai-handler.test.ts`, 4 new tests). New path `moments/{bookId}` with rules and a table-driven rules case; no migration (new collection, no data). Open: Q2.3-a (inline editing of the card, ritual rules).

### Gate numbers after 2.3 (`npm run check:all`, exit 0)
lint 0 errors / 160 warnings (baseline 156), unit 100, rules 63, smoke e2e 6, signed-in e2e on emulators 27, room load 10.7 MB with 0 page errors.

## Progress after tasks 2.4, 2.5, 2.6

### 2.4 Resurface and weekly email — done; real sending waits for your email provider

| Acceptance | Status | Evidence |
| --- | --- | --- |
| Emulator: build due data, trigger the scheduled job, the test mailbox receives a correct email (HTML screenshot) | ✅ | `functions/test/weekly-digest.emulator.test.ts` (9 tests, Firestore + Auth emulators, mock sender) and `tests/e2e-emulator/email-digest.spec.ts` (runs the digest against the emulators, reads the mock mailbox in `mail_outbox/`). 5 readers: only the right one gets an email; it has 3 due highlights + 1 due action. Screenshots of the email: `tests/screenshots/phase-2/2.4-digest-email-{390,768,1440}.png`. The scheduled wrapper itself (`weeklyDigest`) is not invoked by the emulator; the run logic it calls is |
| "Still holds" updates the field; same link again → "already handled"; expired link refused | ✅ | e2e opens the links in a browser against the real `emailAction` function: first click "Done", second "Already handled", a changed link "not valid", an expired link (14 days) "expired" and nothing changes. Also tested: "add a thought" (form first, recorded on submit), "turn into action" (creates the action), action buttons (done / remind next week), a highlight answered in the app meanwhile is reported as handled |
| Unsubscribe stops sending; no empty emails | ✅ | Unsubscribe link (GET, and the one-click POST mail clients send, valid 180 days) switches the setting off, the next run sends nothing. A reader with nothing due, one who emailed within 5 days, one on another weekday, one with the email off and one with no address all get nothing |
| The room shows 3 due highlights daily; answering updates | ✅ | `resurface-home.spec.ts`: four due → the wall shows three; each of the four answers (still holds / add a thought / turn into action / stop reminding) writes the highlight, and the wall refills. Screenshot `2.4-wall-1440.png` |

Also: settings (Profile → Settings → Weekly email: on/off and weekday; screenshot `2.4-settings-weekly-email.png`), `action-reminders.ts` is now documented in-app only and the due action travels in the weekly email, migration `scripts/migrations/002-resurface-fields.ts` (backfills a review schedule for existing highlights; dev/emulator run: dry run 2 to schedule, apply, second apply 0 — idempotent; production run is yours), server-side `email_action_clicked` only for readers whose stored consent is "granted" (the browser mirrors its choice to the account).

Design notes
- Schedule logic is one pure module, `shared/resurface.ts`, used by the browser and the server (10 unit tests). A highlight's schedule is written once and never reset by later saves (the store keeps the stored schedule; a test edits a comment on an answered highlight and checks the answer survives). Answering pushes the following moments at least a week apart, so a highlight never comes back on consecutive days.
- Single-use links: signed payload (HMAC), expiry in the payload, a ledger document `email_tokens/{jti}` written on first use.
- Real provider: `createEmailSender()` in `functions/src/digest/senders.ts` is the one place to add it; without `EMAIL_PROVIDER` the scheduled job logs and sends nothing, so deploying is safe. The list of what I need from you is Q2.4-a.

Open for your decision: Q2.4-b (opt-in by default), Q2.4-c (mail scanners can click buttons), Q2.4-d (UTC weekday), Q2.4-e (run migration 002 on dev, then production, after deploying the new build).

### 2.5 Import — done (sample files are mine, not real exports)

| Acceptance | Status | Evidence |
| --- | --- | --- |
| A sample file and unit tests per format; book and highlight counts correct | ✅ | `tests/fixtures/imports/{goodreads.csv,storygraph.csv,readwise.csv,kindle-clippings.txt,weread.txt}` and `tests/imports.test.ts` (17 tests): statuses, ratings, ISBNs (incl. Goodreads' `="…"` wrapping), dates, shelves, quoted commas and line breaks, Kindle notes vs bookmarks, ISBN-10/13 and title+author matching |
| 200-book Goodreads CSV in 10 s; re-importing adds no books | ✅ | `imports.spec.ts`: 200 books written in 1.1 s on the emulator; the same file again → preview says "0 new, 200 already in your library" and Import is disabled; Firestore still has 200. Unit test: a 200-row file parses and plans in well under a second |
| WeChat Read chapters and thoughts map to `chapter` and the comment | ✅ with a caveat | `weread.txt` fixture: chapter on each highlight, the thought on the highlight above it, a thought with nothing above becomes its own highlight, plain lines continue a highlight. **The comment is stored as `annotation`, the field the book page shows, not `note`** (Q2.5-b). **The sample is my reconstruction of the app's copy-all format, not a real export** (Q2.5-a) |

Also: one dialog for all five sources (choose or detect, file or paste, preview with per-book checkboxes, progress, summary), reachable from the Search page and from the empty shelf; imported highlights get stable ids (importing again adds nothing) and a review schedule; `import_completed` and `highlight_saved` (source import) are reported once per import; no automatic pre-read card for imports (it would spend a free generation per book). Screenshots `2.5-import-preview-{390,768,1440}.png`, `2.5-search-import-button-1440.png`.

Found on the way: the Firestore emulator REST listing returns only the first page, which made a 200-document assertion see 30; the test helper now pages through.

### 2.6 Automatic map placement — done; the model part is not measured

| Acceptance | Status | Evidence |
| --- | --- | --- |
| 30-book list (15 Chinese, 15 English, with answers): author-origin country ≥ 80% | ✅ **30/30** live | `tests/fixtures/geo-books.json`; `node --experimental-strip-types scripts/measure-geo-accuracy.mjs` against the real wikidata.org on 2026-10-20: 30/30 (first run 29/30, one hyphenated transliteration; fixed with a fallback). `tests/geo-wikidata.test.ts` replays the recorded responses offline (`tests/fixtures/wikidata-recorded.json`, ~400 KB). It is my own list, so treat it as an upper bound |
| Import 20 books → markers appear without manual steps | ✅ | `geo-map.spec.ts`: after the import, with no other action, all 20 books get an author origin and a setting (real `resolveBookGeo` against a fake Wikidata and fake model), are marked pending, and the map shows 20 books mapped. Screenshots `2.6-map-20-books-{390,768,1440}.png` |
| Fewer than 10 placed books: no "You read most from…" | ✅ | same spec with 5 books: "Place 5 more books on the map…" and no insight line (`2.6-map-5-books-1440.png`); unit test of the gate |
| Internal AI call not counted against the reader, but logged | ✅ | the spec reads `audit/ai_calls/{uid}`: 20 documents with `internal: true`, `countedAgainstQuota: false`, token counts; `usage/{uid}/months` stays empty. Author lookups are cached globally per author (`geoCache/`), settings per book |

Also: "to confirm" on the map's book rows and stats card and on the book page (Confirm / Change); a place the reader typed is never replaced (tested); optional "Note where I read (city only)" beside Start, off by default, behind the browser's permission, coordinates cut to two decimals and not stored (tested both with permission and when declined). New server-only paths `geoCache/`, `users/{uid}/rateLimits/geo`, `email_tokens/`, `mail_outbox/` have rules cases.
Not measured: the story-setting inference (no model key here) — Q2.6-b. Needed from you: `WIKIDATA_CONTACT`, privacy page rows for Wikimedia and OpenStreetMap (Q2.6-a).

Found on the way / cross-cutting
- The entry bundle went over its 135 KB budget (136.1 KB); the capture sheet, the unattributed drawer and the finish dialog are now loaded on demand (131.9 KB). That briefly broke offline capture (a chunk never loaded cannot be fetched offline), so the sheet is preloaded when the browser is idle; the offline e2e caught it.
- `check:paths` caught a literal `collection('users')` in the digest; the path now comes from `paths.ts` (`Paths.users()`).

### Gate numbers after 2.6 (`npm run check:all`, exit 0)
lint 0 errors / 171 warnings (baseline 156), unit 157 across 17 files, rules and emulator suites incl. digest and geo (85 + 9 geo), smoke e2e 6, signed-in e2e on emulators 42, entry chunk 131.9 KB of 135, room load 10.7 MB with 0 page errors.

**Gate defect found and fixed after the 2.6 commit:** while writing this report I noticed that the `test:unit` line in `package.json` had lost an `--exclude` when I added the geo emulator test, so for the 2.6 gate it ran only one (skipped) file instead of the whole unit suite. After the fix `npm run test:unit` runs 157 tests in 17 files and all pass, so nothing was hiding; but the 2.6 commit's gate did not include the unit suite. The fix is in the commit with this report, and every later gate runs the full unit suite.

### Needs you so far
- Q2.0-a (usernames), Q2.2-a/b/c, Q2.3-a, Q2.4-a…e, Q2.5-a…c, Q2.6-a…c, Q2.8-a (navigation; blocks 2.8), Q2.10-a/b/c/d — all in `docs/open-questions.md`.
- A real-device look at the capture sheet with the keyboard open, and one real-model run for the pre-read card and the finish card.
- PostHog personal API key to create the dashboards.
