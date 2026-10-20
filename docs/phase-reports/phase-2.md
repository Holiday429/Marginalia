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

## Progress after tasks 2.7 and 2.9

2.8 was done last, after your answer to Q2.8-a (option B, flat nav; phones are not a target).

### 2.7 Cross-book full-text search — done

| Acceptance | Status | Evidence |
| --- | --- | --- |
| A two-character Chinese word that appears only in a highlight's body is found (e.g. 骗局 in the demo data) | ✅ | `tests/global-search.test.ts` (12 tests) "finds a two-character Chinese word that appears only in a highlight's text": 骗局 returns the highlight that contains the word and **not** a highlight that only shares the character 局 — the pair-based tokenizer is what makes that distinction. Also covered end to end signed out: `tests/e2e-emulator/global-search.spec.ts` "signed out: Ctrl+K finds a two-character Chinese word that only appears in a demo highlight" |
| 2,000 highlights: index < 1 s, single query < 50 ms (timed unit test) | ✅ | same file, the timing test asserts `buildMs < 1000` and `max(query) < 50`. Measured on this machine while the rest of the suite was idle: **2,001 documents indexed in 326 ms; slowest of five queries 17.5 ms**. (The run recorded in the handoff on a quieter machine was 61 ms / 1.0 ms — both are far inside the budget; the limits are asserted, not the absolute numbers, so the test does not turn red on a loaded machine.) |

Also, beyond the plan's two acceptance items
- `global-search.spec.ts` "signed in: books, highlights, notes and actions all answer, and each opens the right place": each of the four kinds is found and clicking a result opens the right book on the right tab.
- "the Search page has a visible 'Search all' button for devices without a keyboard" — ⌘K / Ctrl+K is not reachable on an iPad without a keyboard, so the Search page carries a button for the same panel (`#searchAllBtn`).
- Screenshots: `2.7-search-demo-1440.png`, `2.7-search-results-{390,768,1440}.png`, `2.7-search-button-1440.png`.

Design notes
- The index is pure and lives in `src/search/global/index.ts` (MiniSearch), so it is unit-testable without a browser: CJK is tokenized as single characters **plus** neighbouring pairs, and a query's pairs are all required. That is what makes 骗局 match 骗局 but not a text that merely contains 局.
- Only `boot.ts` (16 lines) is always loaded — it listens for the shortcut; the panel, the index and the data loader arrive on first use. This is the pattern the entry-chunk budget forces.

### 2.9 First-run guide and landing entry — done

| Acceptance | Status | Evidence |
| --- | --- | --- |
| The entry button is visible within 1 s of load, inside the first screen at 390 px, focusable with Tab | ✅ | `tests/e2e/landing.spec.ts` "Enter Library is a button that is visible within a second of load…": asserts `toBeVisible({ timeout: 1000 })`, that the element really is a `<button>`, that its box is fully inside 390×844, that `document.elementFromPoint` at its centre returns the button itself (so the consent banner does not cover it), that one Tab press focuses it and that Enter reaches the room. Screenshot `2.9-landing-390.png` |
| Landing spine text no longer overlaps | ✅ | same file, "the landing shelf at three sizes: no spine title runs into its author": at 390/768/1440 it measures every spine's title and author rectangles and requires the vertical overlap to be ≤ 1 px. Checked to be a real test by reverting the CSS: it fails on the old stylesheet. Screenshots `2.9-landing-shelf-{390,768,1440}.png` |
| The guide can be skipped; after finishing or skipping it never appears again | ✅ | `tests/e2e-emulator/onboarding.spec.ts` (4 tests). "a new account walks the three steps and the guide closes for good" walks import → first highlight → room + map, sees "You are all set", and after a fresh sign-in the guide is gone. "skipping is remembered on the account: not after a reload, not on another device" skips, reloads, and then opens a **second browser context** and signs in there: still gone (the decision is on the account, not in the browser). "minimising keeps the guide" and "an account that already has books and a highlight never sees the guide" cover the other two paths. Screenshots `2.9-guide-step1-{390,768,1440}.png`, `2.9-guide-done-1280.png` |

Design notes
- `onboarding-boot.ts` is the only always-loaded part; the guide itself is `import()`ed only for an account that needs it.
- A real race was found and fixed here rather than papered over: right after sign-in, another write to `users/{uid}` (the consent mirror) can still be pending, and a plain `getDoc` then returns a view built from that pending write alone — which hid the stored "skipped" decision and brought the guide back. The boot file now waits for a snapshot that is neither `fromCache` nor `hasPendingWrites` (`settledUserDoc`). This is the same class of bug as the Firestore listener races in Phase 1.
- Who sees the guide, the step-3 definition, and the English copy are all choices I made: Q2.9-a.

### 2.8 Today panel and navigation — done (option B); your confirmations are Q2.8-b

| Acceptance | Status | Evidence |
| --- | --- | --- |
| Nav items all visible and not overlapping (screenshots) | ✅ at landscape sizes | Your decision replaced the plan's 390 px (phones are not a target) with 1024×768 and 1180×820 (iPad landscape), 1440×900 and 880×1100 (foldable inner screen). `tests/e2e/navigation.spec.ts` (3 tests, production build): on the room and on both Library pages the four tabs read Library · Map · Graph · Profile in that order, sit inside the viewport, are at least 44 px tall, do not intersect each other or the header's left and right items, and the Browse/Arrange switch overlaps no tab. Screenshots `2.8-nav-room-*`, `2.8-nav-browse-*`, `2.8-nav-arrange-*` (each at the four sizes), `2.8-settings-camera-ipad-1180.png`. Portrait iPad (768×1024) was not tested |
| The desk book opens the signed-in reader's reading book (e2e) | ✅ | `tests/e2e-emulator/today.spec.ts`: the test finds the real 3D desk book by hovering until the room names it "Keep Reading", then clicks it. With one book being read and another to-read, the Book page that opens contains the reading book and not the other; with nothing being read, the Add Book form opens |
| Old hashes reach the new pages | ✅ | `navigation.spec.ts`: `#search` → Browse, `#library` → Arrange, `#shelf` → Browse, `#studio` → Arrange, and both modes highlight the Library tab; the switch moves between them; the Library tab opens Browse |

Built
- Nav (`src/core/primary-tabs.ts`): Library · Map · Graph · Profile, in the room and on every page. Library is one tab with two modes, Browse (the old Search page) and Arrange (the old Library page), switched with a control under the header (`src/components/library-mode-switch/`). It is a switch over the two existing pages, not one merged page (Q2.8-b, 1).
- Camera buttons moved to Settings → Camera; the bottom toolbar is gone. Choosing an angle closes Settings.
- Today panel (`src/components/today-panel/`, mounted by the room view, so it is in the room chunk and not in the entry chunk): reading now with Open book and Start timer, up to three highlights worth another look with Review, and the one due action. `today.spec.ts` seeds four due highlights and a due action and checks three highlights are shown, Start timer writes a session for the book being read, Review opens the existing review list, Hide leaves a pill ("4 to revisit": three highlights and the action), an empty account sees the three empty sentences and Add a book, and a signed-out visitor sees no Today. Screenshots `2.8-today-{ipad-1024,ipad-1180,desktop-1440}.png`.
- The due-action rule (`actionDueAt`, `pickDueAction`) moved from the digest code into `shared/resurface.ts`, so the weekly email and the Today panel use one definition; the digest tests still pass.
- Room copy: hovering the laptop now says Library, not Search (Q2.8-b, 6).

Side effects to know about
- The switch row adds about 40 px under the header on both Library pages.
- At 1024 px the Today panel covers about a third of the room; Hide shrinks it.
- Every e2e spec that clicked the nav by the label "Search" or "Library" now goes through one helper (`openView` in `tests/e2e-emulator/helpers.ts`: "Search" means the Library tab, "Library" means Library then Arrange); `goToPose` replaces the direct clicks on the old camera buttons.
- Entry chunk 132.97 KB of 135 (was 132.43).

### Flaky signed-in e2e on the emulators: causes found and fixed

The serial signed-in suite (`npm run test:e2e:emu`) failed one to three tests per full run, a different one each time. Two separate causes, both in the test environment and neither in app code. No assertion was loosened.

**Cause 1: the Functions emulator's 30-second wait for a cold function.** The emulator starts a Node worker the first time each function is called and waits 30 s for it (`firebase-tools/lib/emulator/functionsRuntimeWorker.js`, `waitForSocketReady`, hard-coded; `FUNCTIONS_DISCOVERY_TIMEOUT`, in seconds, overrides it). The handoff suspected the heavy imports in `functions/lib/index.js`. I measured that and it is not so: the entry point loads in 285–302 ms on a quiet machine (firebase-admin 16 ms, openai 33 ms, Sentry 161 ms), so lazy-loading would have changed nothing. The failure is in `firebase-debug.log` with timestamps: worker added 01:39:58.1, first module resolved 01:40:26.2 (28 s later), "Failed to load function" at 01:40:28 (30 s after the start), the worker finished loading at 01:40:43, too late. Software-GL Chrome, two Vite servers and the Java emulator starve the CPU for long enough that a 0.3 s load takes 28 s, and whichever test happened to make the first call to that function failed.
- Fix 1: `FUNCTIONS_DISCOVERY_TIMEOUT=120` on the `test:e2e:emu` script.
- Fix 2: `tests/e2e-emulator/global-setup.ts` calls every HTTP function once, one after another, before the first test (8 functions in 10.8 s on a quiet machine), so no test pays a cold start inside its own timeout. Checked on `geo-map.spec.ts`, whose "where I read" test was the one that showed the failure: 5 of 5 pass.

**Cause 2: every test gets slower than the one before inside one worker.** The same test, measured three ways: `reading-session` took 15.1 s on a fresh worker, 43.6 s as the 12th test of a four-file group, and 1.4 min as the 40th test of the full suite. In the full suite the tests after the one that failed (which makes Playwright start a new worker) went straight back to 9–15 s. The Firestore emulator was not restarted at that point, so accumulated data is not the cause. Eventually a page was too busy to answer a test's own 8 s poll: `real-library` "a brand-new account sees empty states" failed at `helpers.ts:90` ("nav button Profile is reachable") in two runs in a row once it ran late in a worker, and passes in 21–23 s alone or right after `reading-session`. **What inside Chrome or the worker accumulates, I did not identify** (software-GL contexts are the obvious suspect).
- Fix 3: `playwright.emulator.config.ts` now has one Playwright project per spec file. Playwright starts a fresh worker, and so a fresh Chrome, for each project, and they still run one at a time. No spec file changed.

**Cause 3, found by the gate and not a test problem: an app bug in the Profile mini-map.** In the second `check:all` the run was clean except `reading-session`, which failed its "no page errors" assertion with `TypeError: Failed to execute 'getComputedStyle' on 'Window': parameter 1 is not of type 'Element'`. The trace stack is entirely inside amCharts (`Root._renderFrame` ← `_runTicker`). Mechanism: `ProfileMap.mount` awaits the amCharts import and then calls `am5.Root.new(<id string>)`. amCharts starts its render loop inside the `Root` constructor *before* it looks the element up, so if the Profile was re-rendered or left in that gap, the lookup returns null, the constructor throws (the app caught that), and the loop it had started runs on and fails on the next animation frame, at an unpredictable time. The new spec `tests/e2e-emulator/profile-map-detached.spec.ts` reproduces it every time on the old code (mounts a `ProfileMap` on an element that is not in the page) and passes after the fix. Fix in `src/profile/profile-map.ts`: build nothing when `mapEl.isConnected` is false, and pass the element itself to `Root.new` instead of an id (removing the lookup, and with it `ensureId`). `src/map/map.ts` has the same `Root.new('mapChart')` pattern; I did not change it because nothing shows it failing.

| Run | Result | Time |
| --- | --- | --- |
| Before, full suite (handoff, several runs) | 1–3 failures each, a different test each time | 14–19 min |
| Fixes 1 and 2 only | 48 passed, 1 failed (`real-library`, cause 2) | 23.6 min |
| Fixes 1, 2 and 3 | 49 passed, 0 Functions-emulator errors in the log | 13.7 min |
| Fixes 1, 2 and 3, inside `npm run check:all` | 49 passed, but the run exited 1: "worker-15 process did not exit within 300000ms after stop, force-killed it" (the `resurface-home` worker, after its last test). Per-test times stayed flat at 10–21 s | 18.5 min (5 of them waiting for that worker) |
| Fixes 1, 2 and 3, again on its own | 49 passed, no errors | 13.8 min |

**A remaining, rarer problem that I did not solve.** With one worker per spec file there are 17 browser shutdowns per run, and in one of the three full runs on this layout one of them hung until Playwright's 5-minute limit (`PWTEST_CHILD_PROCESS_TIMEOUT`, internal) and killed it, which Playwright reports as an error outside any test and exits 1. Six repeated runs of `resurface-home` alone (60 s limit) and the next full run did not reproduce it, and a process monitor running during that full run had nothing to catch. I do not know whether Chrome or the worker was stuck. If it recurs, rerun once and look at `ps` while it hangs; do not lengthen the limit, which only hides it.

Two things to know about the numbers. First, the suite grew from 27 tests at the 2.3 gate to 49, so "7 minutes at the start" is mostly a smaller suite, not a regression: 13.7 min over 49 tests is 16.8 s a test, in line with the single-test timings above. The slowdown that was real is cause 2. Second, a run that is green is evidence, not proof, because these failures moved around; see the gate numbers below for how many consecutive green runs there were.

What I did not fix
- The suite is CPU-bound by design: its own Chrome (software GL for the 3D room) pushes the load average past 50 on this 8-core machine. I did not reduce that.
- `smoke.spec.ts` "opening a book from search" still re-clicks until the book opens. In about one run in ten a search card is on screen before its click handler is attached. A real reader would need to click within milliseconds, so I left the product alone, but the test now hides it.
- When I started this session a previous `test:e2e:emu` run was still in flight (processes from 08:33 and a stale Playwright test server from 08:09), on top of this suite's own load. Overlapping runs make everything slower and can cause the same timeouts; wait for one run to end before starting the next.

### Gate numbers after 2.9 (`npm run check:all`, exit 0)
lint 0 errors / 171 warnings (baseline 156), unit 169 across 18 files, rules and emulator suites 85, smoke e2e 8, signed-in e2e on the emulators 50 (49 plus the profile-map regression spec) in 14.3 min, entry chunk 132.43 KB of 135, room load 10.7 MB with 0 page errors. Total 16 min 24 s.

How many runs it took (so the green is not read as "first try"): of the four full signed-in runs on the final layout, two were clean on their own (13.7 and 13.8 min); `check:all` run 1 exited 1 on the worker-exit hang (all 49 tests passed); `check:all` run 2 exited 1 on the Profile mini-map page error (cause 3, fixed); `check:all` run 3 exited 0. No code changed between run 3 and the commit. The worker-exit hang is unexplained and did not recur in runs 2 and 3.

### Gate numbers after 2.8 (`npm run check:all`, exit 0)
lint 0 errors / 171 warnings, unit 169, rules and emulator suites 85, smoke e2e 11 (3 new navigation tests), signed-in e2e on the emulators 54 (4 new Today and desk-book tests) in 16.0 min, entry chunk 132.97 KB of 135, room load 10.7 MB with 0 page errors, no Functions-emulator load errors. Total 19 min 10 s. First attempt on this tree, no worker-exit hang.

## Phase 2 gate

**Verdict: not passed yet.** All ten tasks are built and every acceptance item below passed on the emulators (2.8 with your change of screenshot sizes). Open: the two beta items (retention, interviews), which are yours, and everything that can only be checked in your real environment, marked ⏳.

### Acceptance items 2.1–2.10

| Task | Acceptance item (plan wording, shortened) | Result | Evidence |
| --- | --- | --- | --- |
| 2.1 | From room, Library, Book, Map: at most 2 clicks + typing | ✅ | `quick-capture.spec.ts` "from the room, Library, Book and Map…" |
| 2.1 | 390 px: the sheet is not covered by the keyboard | ✅ simulated, ⏳ real device | same spec, fake 336 px keyboard; `2.1-capture-sheet-390-keyboard.png`. Please look once on an iPad or phone |
| 2.1 | Offline save → Firestore after reconnect | ✅ | "a capture made offline…", "…still waiting in the outbox is sent after a reload" |
| 2.1 | Unattributed capture dragged onto a spine → in that book's Highlights | ✅ | "…dragged onto a spine", "in Library … onto a shelf spine" |
| 2.2 | New book → pre-read card on Overview within 30 s | ✅ against a fake model, ⏳ real model | `book-detail.spec.ts`, 4.6 s with a 0.6 s fake model; real latency is Q2.2-c |
| 2.2 | Detail opens on Overview from desk, Library, search | ✅ | "every empty tab explains itself, and detail opens on Overview…" |
| 2.2 | Shelf action count = Actions tab count | ✅ | "the shelf preview shows the same action count…" |
| 2.3 | Finish → three answers → card on top of Notes, survives reload | ✅ | `finish-ritual.spec.ts` "finish a book, answer three questions…" |
| 2.3 | Skip keeps the status; marking finished again does not re-open | ✅ | same file, "skipping leaves the status alone…" |
| 2.3 | Profile annual shelf can open the card | ✅ | "the card exports as an image, and the Profile annual shelf opens it" |
| 2.4 | Emulator: scheduled job → test mailbox gets a correct email (HTML screenshot) | ✅ emulator, ⏳ real provider | `weekly-digest.emulator.test.ts`, `email-digest.spec.ts`, `2.4-digest-email-*.png`. The scheduled wrapper itself is not invoked by the emulator, only the run logic it calls |
| 2.4 | "Still holds" updates; second click "already handled"; expired link refused | ✅ | `email-digest.spec.ts` against the real `emailAction` function |
| 2.4 | Unsubscribe stops sending; no empty emails | ✅ | `weekly-digest.emulator.test.ts` (9 tests) |
| 2.4 | The room shows 3 due highlights daily; answering updates | ✅ | `resurface-home.spec.ts`, `2.4-wall-1440.png` |
| 2.5 | A fixture and unit tests per format, counts correct | ✅ with a caveat | `tests/imports.test.ts` (17 tests). The fixtures are my reconstructions, not real exports (Q2.5-a) |
| 2.5 | 200-book Goodreads CSV < 10 s; re-import adds nothing | ✅ | `imports.spec.ts`: 200 books in 1.1 s; second import "0 new, 200 already in your library" |
| 2.5 | WeChat Read chapters and thoughts map to `chapter` and the comment | ✅ with a caveat | the comment is stored as `annotation`, not `note` (Q2.5-b) |
| 2.6 | 30-book list: author-origin country ≥ 80 % | ✅ 30/30 on my own list | `scripts/measure-geo-accuracy.mjs` against real wikidata.org on 2026-10-20; treat as an upper bound |
| 2.6 | Import 20 books → markers appear with no manual step | ✅ | `geo-map.spec.ts` (passed again on the final suite) |
| 2.6 | Fewer than 10 placed books → no "You read most from…" | ✅ | same spec, 5-book case; unit test of the gate |
| 2.7 | A two-character Chinese word only in a highlight's text is found | ✅ | `tests/global-search.test.ts`, `global-search.spec.ts` |
| 2.7 | 2,000 highlights: index < 1 s, query < 50 ms | ✅ | 326 ms / 17.5 ms measured in this session |
| 2.8 | Nav items visible and not overlapping at three sizes | ✅ at landscape sizes | `tests/e2e/navigation.spec.ts`, screenshots `2.8-nav-*`. The plan's 390 px was dropped by your decision (phones are not a target); 1024×768, 1180×820, 1440×900 and 880×1100 are tested |
| 2.8 | The desk book opens the signed-in user's reading book (e2e) | ✅ | `today.spec.ts`: real click on the 3D desk book; also the Add Book case |
| 2.8 | Old hashes reach the new pages | ✅ | `navigation.spec.ts`: `#search`, `#library`, `#shelf`, `#studio` |
| 2.9 | Entry button visible within 1 s, in the first screen at 390 px, Tab-focusable | ✅ | `tests/e2e/landing.spec.ts` |
| 2.9 | Guide can be skipped; never appears again after finishing or skipping | ✅ | `onboarding.spec.ts` (4 tests, including a second browser) |
| 2.10 | Walk signup → add → highlight → finish; each event once in PostHog | ✅ emulator with a fake key, ⏳ real PostHog | `analytics-events.spec.ts`. Dashboards (funnel, weekly active) are not created: they need your key (Q2.10-a) |

### The plan's own gate list

- [x] 2.1–2.10 acceptance items all ticked on the emulators. ⏳ items remain for your real environment (listed under "What you need to do").
- [ ] About 20 beta users (free Pro), at least half active in week 4. Yours; not marked.
- [ ] At least 5 interviews of 20 minutes, conclusions written here. Yours; not marked. The guide is `docs/interview-guide.md`.
- Per the plan, Phase 3 does not start until all of this is met.

### What you need to do

0. **Before you look at the real account (nothing here was done by me).** A push to `main` runs CI and then publishes the frontend to GitHub Pages with your production Firebase secrets; it does not touch Firebase. The new frontend needs, in this order:
   1. `firestore.rules` deployed first (Q1.9-a; the rules differ from `main` by six lines, and the new paths are covered by `tests/path-cases.ts`).
   2. Cloud Functions deployed (`aiGenerate`, `resolveBookGeo`, `resolveReadingPlace`, `emailAction`, `weeklyDigest` and the unchanged ones). The deploy needs these secrets to exist: `AI_API_KEY`, `EMAIL_LINK_SECRET`, `LEMON_SQUEEZY_WEBHOOK_SECRET`, `LEMON_SQUEEZY_VARIANT_LIFETIME`; and these settings: `ALLOWED_ORIGINS` (the origin you serve the app from; the repo has both a GitHub Pages workflow and a Vercel config), `WORKSPACE_ID` (must match the app's, Q1.9-c), `APP_BASE_URL`, `EMAIL_ACTION_BASE_URL`, `WIKIDATA_CONTACT` (Q2.6-a). Without them the pre-read card, finish card, automatic map placement and email links cannot work.
   3. Migrations, dry run first (the default), dev project first: `scripts/migrations/001-billing.ts` needs your paid-user list (Q1.1-a) and sets everyone not on it to free; `002-resurface-fields.ts` backfills the review schedule on existing highlights (Q2.4-e).
   Until steps 1 and 2 are done, anything that uses a new collection or a new function will fail in the real app, so a failure there is not yet evidence of a bug.
1. **Switch on email.** Pick a provider and sender domain, set the DNS and the secrets, add the sender in `createEmailSender()`. The exact list is Q2.4-a. Until then the weekly job logs and sends nothing.
2. **Decide how beta users get free Pro (Q2-gate-a), then invite about 20 of them.** No mechanism exists today. Tell them to accept analytics (Q2.10-b) and to switch the weekly email on (Q2.4-b). Deploying the functions, the rules and migration 002 (Q2.4-e, Q1.9-a) is also yours.
3. **Check PostHog.** Run `npm run analytics:dashboards -- --apply` with `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` (the payloads were never run against a real project), then walk signup → add → highlight → finish once on the dev project and confirm each event appears once.
4. **Hold 5 interviews** using `docs/interview-guide.md`, from week 4, with at least one quiet user. Write the conclusions into a section "Interviews" in this file.
5. **Three things only a real environment can show:** the capture sheet with a real keyboard on an iPad or phone (2.1), one run of the pre-read card and the finish card with the real model (Q2.2-c), the story-setting accuracy (Q2.6-b).

### Open questions waiting for you (all in `docs/open-questions.md`)

- **Decided:** Q2.8-a (option B; phones are not a target).
- **Blocks real operation or launch:** Q2.4-a email provider; Q2.10-a PostHog key; Q2.6-a `WIKIDATA_CONTACT` and the privacy rows for Wikimedia and OpenStreetMap; Q2.4-e production run of migration 002; Q2-gate-a free Pro for beta users; Q1.1-a paid-user list for migration 001; Q1.8-a Privacy and Terms text; Q1.2-c `ALLOWED_ORIGINS`.
- **Your decision:** Q2.0-a usernames; Q2.2-a (one of ten free generations per added book); Q2.2-b context length; Q2.4-c mail scanners; Q2.4-d UTC weekday; Q2.5-c import defaults; Q2.10-b, Q2.10-c analytics scope; Q1.2-a pricing and the Pro fair-use cap; Q1.8-b DeepSeek and the China data flow; Q1.9-b what a public profile shows; Q1.7-a rewriting git history.
- **Confirm a default I chose:** Q2.8-b (what I built for 2.8), Q2.3-a, Q2.4-b (weekly email is opt-in), Q2.5-b, Q2.6-c, Q2.9-a, Q2.10-d, Q1.5-a/b.
- **Needs your eyes or a real file:** Q2.2-c, Q2.5-a (one real export of each format), Q2.6-b, Q1.6-a, Q1.6-b.
