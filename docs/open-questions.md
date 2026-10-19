# Open questions for Holiday

Decisions Claude Code must not make alone (plan rule 6). Each item says what is blocked, if anything.
Execution continues on other tasks meanwhile.

## Phase 1

### Q1.1-a — Paid-user list for migration 001 (blocks: running the migration on production)
`scripts/migrations/001-billing.ts` sets everyone to `free` unless listed in a `paid.json` (`{ "<uid>": "pro" | "lifetime" }`), because old `users.plan` values could be forged. If nobody has paid yet, run it with no list.
**Needed from you:** the list, or confirmation that there are no paying users.

### Q1.1-b — Deploy order for 1.1 (informational)
1. Deploy functions (webhook now writes `billing/{uid}`). 2. Run migration 001 on dev, then prod (`--apply`). 3. Deploy `firestore.rules` and the new web build together — the new rules make `users/{uid}` owner-only, so the old client's public-profile lookup breaks if rules ship first. Public profile URLs keep working because the migration creates `publicProfiles/{slug}` for every currently-public profile.

### Q1.2-a — Pro fair-use AI cap and final pricing (blocks: nothing now; needed before launch)
`functions/src/ai-config.ts`: `FREE_AI_MONTHLY = 10` (from the spec), `PRO_AI_MONTHLY_FAIR_USE = 300` is a **placeholder I chose** so Pro is not unlimited. Plan task 4.5 will replace it with a number from real token costs.
**Needed from you (before launch):** confirm or replace 300.

### Q1.2-b — Enable Firebase App Check for `aiGenerate`? (recommendation: yes, after launch-domain is known)
Origin allow-list + auth + quota already close the abuse paths the review found, but App Check (reCAPTCHA Enterprise on web) would also stop scripted clients that hold a valid account. Cost: a reCAPTCHA Enterprise key, a client init, and enforcement toggled per function; it needs the final domain (task 4.1), so I did not wire it.
**Needed from you:** yes/no, and when.

### Q1.2-c — Set `ALLOWED_ORIGINS` when deploying functions (informational, needed to deploy)
Comma-separated list, e.g. `https://marginalia-reading.vercel.app`. If unset the function allows only `http://localhost:5173` / `127.0.0.1:5173`, so production calls would be refused until it is set. Also set `WORKSPACE_ID` to the same value as `VITE_WORKSPACE_ID` (see Q1.9-c).

## Phase 1 — billing webhook (1.3)

### Q1.3-a — Grace period for `past_due` (blocks: nothing; a default is in place)
Current behaviour: a `past_due` subscription **keeps Pro** while Lemon Squeezy retries the card; if its dunning gives up, LS sends `subscription_expired` and the user drops to Free. So the grace period is whatever LS's retry schedule is (check it in your LS store settings — typically about two weeks), and the code adds no timer of its own.
**Needed from you:** keep this, or tell me a fixed number of days after which `past_due` should drop to Free regardless.

### Q1.3-b — `paused` / `unpaid` subscriptions (default chosen: treated as Free)
Not in the plan's table. I mapped `paused` and `unpaid` to Free (access follows payment). Change if you want paused users to keep access until period end.

### Q1.3-c — Customer-portal link freshness (informational, affects 4.3)
The webhook stores `urls.customer_portal`, but Lemon Squeezy signs those URLs and they expire (about 24 h). For the "Manage subscription" button in 4.3 the reliable approach is a small callable that fetches a fresh URL from the LS API at click time; the stored link is only a fallback.

### Q1.3-d — Deploy requirement
`billingWebhook` now also needs the secret `LEMON_SQUEEZY_VARIANT_LIFETIME` (same value `createCheckout` already uses). Without it every `order_created` is ignored (lifetime purchases would not unlock).

## Phase 1 — demo data removal (1.5)

### Q1.5-a — Placeholder spines use a solid border, not the dashed one the plan names (decision made; confirm)
Plan 1.5 asks for "虚线书脊 + 添加一本" on a short shelf. `CLAUDE.md` forbids dashed/dotted borders on interactive elements, and these spines are buttons, so I used a faint **solid** 1px outline with a "+". Say if you want an explicit exception for dashed.

### Q1.5-b — What the signed-out demo should contain (decision made; confirm)
I merged the three old demo sets into `src/data/demo/`: the Sapiens detail book (only demo book with written notes, highlights, mind map), the 12 Chinese-language reads that have covers/geography, and the 22 shelf spines (two "reading", seven "to read", rest finished) = 35 books. Every demo page derives its numbers from that one list. Open demo books other than Sapiens now show an empty book page (honest) instead of a clone of Sapiens. Two invented quote attributions from the old Profile demo ("人是可以被消灭的…" credited to 刀锋, "一切存在皆短暂…" credited to 活山) were dropped; demo highlights are now only Sapiens' real ones.
**Needed from you:** keep this scope, or tell me which demo books should get richer content.

### Q1.5-c — Default picture-frame photo (placeholder art by me)
`public/3d/frame-photo-default.png` is a small pixel-art reader I generated (32×32 scaled ×8). Signed-in users with an avatar see their avatar on the desk frame; everyone else sees this. Replace the file if you have a preferred pixel avatar.

### Q1.5-d — Desk book with nothing being read (behaviour until 2.8)
Clicking the desk book used to open Sapiens as a stand-in. It now opens the book with status "reading", and if there is none it opens the Add Book dialog. Task 2.8 redefines this ("当前在读" panel), so this is a stopgap.

### Q1.5-e — Brief demo flash at page load for signed-in users (known limitation)
On a hard reload the app starts in demo mode until Firebase restores the session (a few hundred ms), so a signed-in user can glimpse demo books before their own load. Fixing it means holding the first render until auth resolves; that touches boot ordering, so I left it. Once signed in, demo data is never read.

## Phase 1 — room assets (1.6)

### Q1.6-a — Please confirm the compressed room still looks right (needs your eyes)
Side-by-side before | after for the four camera poses: `tests/screenshots/phase-1/room-compare.png` (left before, right after). What changed visually: wall/floor/desk/board/carpet now use 1K JPG maps and **no displacement map** (slightly smoother surfaces, fewer scuffs on the desk edge), model textures are WebP capped at 2048 (interactive objects), 1024 (furniture) or 512 (`book_shelf`, the shelf full of tiny books — this was the one cut I made to fit the budget). If anything looks worse, tell me which object and I will raise its cap (the budget has ~1.3 MB of headroom).

### Q1.6-b — Where do the original 3D files live now? (needs you)
The uncompressed originals (~460 MB: models + textures) are in `assets-src/` on this machine and are git-ignored, as the plan intends. They are not backed up anywhere else. Please copy `assets-src/` to cloud storage; `npm run assets:optimize` rebuilds `public/3d` and `public/textures` from it.

### Q1.6-c — Poster needs regenerating when the room changes (informational)
`public/room-poster.webp` is a still of the default room (front camera). The notes wall in it shows a demo quote for about half a second before the live scene fades in, including for signed-in users. Regenerate after any room change with `node scripts/capture-room.mjs --poster=1 --out=poster.png` then `cwebp -q 72 poster.png -o public/room-poster.webp`. Task 3.5 (themes) should make this per-theme.

## Phase 1 — repository cleanup (1.7)

### Q1.7-a — Rewrite git history with `git filter-repo` to shrink `.git`? (needs your decision; I did not do it)
`.git` is ~560 MB on disk (≈ 500 MB packed). Uncompressed blob sizes in history by top-level path: `assets/` 390 MB (the root duplicate of `public/`), `public/` 90 MB (old uncompressed GLBs/textures), `.npm-cache/` 55 MB, `tmp/` 19 MB, `reference_delete when complete/` 18 MB, root `book.glb` 7 MB. Removing those paths from history would shrink a fresh clone to a fraction of its size, but it **rewrites every commit id**: every clone, the Vercel/GitHub connections' pinned SHAs, open branches (there are ~25) and any PR would need to be re-created or force-pushed. Options: (1) leave history as is (fresh clones are slow, nothing breaks); (2) filter-repo on a fresh mirror after you have merged phase 1 and archived the old repo. Recommendation: (1) now, revisit before inviting other contributors.

### Q1.7-b — Things I left in the repo root that you may want to remove
`Marginalia Book - Sapiens.html` (a 53 KB static prototype page, unreferenced) and `404.html`. Also `firebase.json` has `hosting.public: "."`, so a `firebase deploy` of Hosting would publish the whole repo directory (source, docs, env examples). If Hosting is not used (you deploy via Vercel / GitHub Pages), remove the `hosting` block; I did not change it.

### Q1.7-c — "CI all green" cannot be shown from here
Nothing has been pushed, so GitHub Actions has not run. Locally, `npm run check:all` runs the same steps the workflow runs (lint, typecheck, rules under the emulator, unit, build, size, both e2e suites). I also edited `ci.yml` (npm ci, functions deps and build, `check:hardcoded`, a new signed-in emulator e2e job) — those edits are only validated as YAML so far; the first run on GitHub may need small fixes.

## Phase 1 — launch compliance (1.8)

### Q1.8-a — Privacy Policy and Terms text must be reviewed and completed by you (blocks: launch)
`/privacy` and `/terms` are **drafts I wrote** from how the app actually behaves (processors, AI transfer to DeepSeek, deletion, consent). Every page shows a visible "Draft" notice until you set `"draft": false` in `scripts/legal/legal.config.json` and run `npm run legal:build`. Please have a legal professional read them. Still blank (shown in square brackets on the pages) and needed from you in `scripts/legal/legal.config.json`: operator legal name, address/country, contact email, governing law and venue; and in `scripts/legal/content.mjs`: the refund policy and what "lifetime" means. I chose a minimum age of 16 (conservative for the EU); change `minimumAge` if you prefer 13.

### Q1.8-b — DeepSeek processes your users' reading data in China (needs your decision, disclosed in the policy)
The AI features send a book's title/author/summary/tags and the user's highlights, notes and actions (or, for profile features, a library summary) to DeepSeek. The privacy page says so plainly. If that is not acceptable for some users (for example EU customers), the options are a different provider with EU/US processing, or an "AI off" switch. I did not add either.

### Q1.8-c — Chinese translation of the legal pages?
Pages are English only (the UI rule is English). The policy applies to zh-CN users too; tell me if you want a Chinese version (it needs the same legal review).

### Q1.8-d — Google Fonts is still listed as a processor
The main app loads fonts from Google Fonts until task 3.1 self-hosts them; the policy lists it. Remove that row from `PROCESSORS` in `scripts/legal/content.mjs` after 3.1.

### Q1.8-e — Deletion does not require a recent sign-in
`deleteAccount` requires a signed-in user and the typed word DELETE, but does not force re-authentication. A stolen, still-valid session could delete an account (it could already read all its data). Say if you want a "signed in within the last 10 minutes" check (costs one re-login prompt).

### Q1.8-f — Which PostHog region?
The code defaults to the US PostHog host unless `VITE_POSTHOG_HOST` is set; the privacy page does not name a region. Tell me the one you use so it can be stated.

## Phase 1 — unified paths and docs (1.9)

### Q1.9-a — Deploy the new `firestore.rules` BEFORE users notice data "appearing" (heads-up, needs you at deploy time)
The table-driven rules test found five paths the app writes that the old rules silently denied (the writes were wrapped in `.catch(() => {})`, so nothing was reported): book notes (`books/{id}/notes/main`), per-book AI results (`books/{id}/ai/*`), imported visual notes, profile-level `ai_results`, and the annual Top-10 shelf. They were therefore **never saved to the cloud**; only the local IndexedDB copy existed. The new rules allow owner access to all five, so after deploy those features start syncing. No user data is deleted or rewritten by this; things that exist only locally will upload on their next save.

### Q1.9-b — Public visitors cannot see highlights, notes or the reader portrait of a public profile (product decision)
Public book pages and the public profile try to read highlights, notes and `ai_results/reader-portrait` of the profile owner. The rules only allow public reads of the profile card and of books with `shareInProfile`; reading highlights/notes would need per-book rules (`get(book).shareInProfile`). Today those sections are silently empty for visitors. Decide whether public pages should show highlights/notes of shared books; I did not widen what strangers can read.

### Q1.9-c — Default workspace id is now `marginalia-main` everywhere (set the same value in functions)
Client code had two different fallbacks (`marginalia-main` in `config.ts`, `default` in ~15 other places). It is now one function (`getWorkspaceId()`), defaulting to `marginalia-main` as in `.env.example`. Production should set `VITE_WORKSPACE_ID`, so nothing changes there — but please make sure the **functions** have `WORKSPACE_ID` set to the same value (`aiGenerate` and `deleteAccount` read it; the code default is also `marginalia-main`). If your production data lives under a different id, tell me now.

## Phase 2 — core loop

### Q2.0-a — Username uniqueness and username login do not work under the current rules (found by 2.10; decision needed)
Registering by email failed for everyone: `registerWithUsername` first ran a query over **all** users' `userProfiles` docs to check the username is free, and the rules (correctly) allow only the owner to read their profile, so it always returned `permission-denied` — and the failure showed no message. The same query is how "log in with a username" works, so that path is dead too (email login works). The rules have been like this since the first commit, so this is not a Phase 1 regression.
What I changed (minimum to make sign-up work, in 2.10): removed the uniqueness pre-check and made auth errors show a readable message. Usernames are now display names and may repeat; email login is unchanged; username login is still broken.
**Needed from you:** do you want unique usernames / username login? If yes, the safe design is a `usernames/{lowercase}` doc (`{ uid }`, public `get`, create-only by the owner) for uniqueness, and login by username through a callable function so emails are never readable by strangers. If no, drop the username field from Register and the "Email or Username" label.

### Q2.10-a — PostHog dashboards need a personal API key from you (blocks: the dashboards only)
`npm run analytics:dashboards -- --apply` creates the funnel, the weekly-active tile, retention and event volume. It needs `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` (and `POSTHOG_HOST` if you use the EU cloud — also answers Q1.8-f). I could not run it against a real project, so please check the four tiles after the first run.
Also: the e2e proves each event leaves the browser once, with a fake key. "Each event appears once in PostHog" on your dev project still needs one manual walkthrough with the real key.

### Q2.10-b — Readers who decline analytics are invisible to the retention numbers (decision for the beta)
PostHog only starts after consent (task 1.8). For the 20 beta users, the gate metric ("half saved a highlight or answered a resurface in week 4") is computed from PostHog, so anyone who clicked Decline counts as inactive. Options: tell beta users to accept analytics (simplest), or also store `lastActiveAt` on the server for the gate only. Not built.

### Q2.10-c — `email_action_clicked` is sent from the server (decision before 2.4 ships)
A click on an email button never has the browser's consent state. If it is sent to PostHog under the user's id, it is processing of someone who may have declined analytics. Default I will build: send it only for users whose stored consent is "granted" (consent will be mirrored to the user doc when the reader chooses). Say if you would rather never send it.

### Q2.10-d — PostHog autocapture and session recording are now off (decision made; confirm)
posthog-js was running with autocapture on: every click was sent with the clicked element's text (book titles, note buttons), and the click that withdraws consent was flushed after the withdrawal. The Phase 1 consent test did not catch this because posthog-js silently drops events from automated browsers, so that test never saw real traffic. I set `autocapture: false` and `disable_session_recording: true`; only the catalogue events are sent. Say if you want autocapture or recordings back (the privacy page would then need to describe them).

### Q2.8-a — New navigation structure (task 2.8 is BLOCKED until you confirm; I have not changed any navigation)
Today: the room is home. Top nav has five peers: Search · Library · Map · Graph · Profile. Search (browse + filter) and Library (drag to arrange) are two views of the same books. Camera buttons (Front / Desk / Shelf Wall / Notes Wall / Free Look) sit at the bottom of the room. At 390px the top nav shows only the Map icon (Phase 1 finding), so Profile and Library are unreachable on a phone.

Proposed:
```
Room (home, Today panel)              Top nav (≥768px)           Bottom tab bar (<768px)
├── Today panel (over the room)       Library · Insights · Profile   Home · Library · Insights · Profile
│   ├── Currently reading → Book
│   ├── 3 resurfaced highlights (respond in place)
│   ├── Due action (1)
│   └── Start timer
├── Library  (one view, two modes)    modes: Browse (old Search: filter/list)  |  Arrange (old Library: drag shelves)
├── Insights (one view, three tabs)   Map · Graph · Year in review   (annual shelf moves here from Profile)
├── Profile                           public profile, reading identity, heatmap, Settings
└── Book (panel, opened from anywhere; always starts on Overview)

Global, on every page:  + capture button (bottom right, key C)  ·  ⌘K / Ctrl+K search  ·  focus timer pill
Settings → "Camera": Front / Desk / Shelf Wall / Notes Wall / Free Look (moved out of the room UI)
```
Routes: `#search`, `#library` → Library (browse / arrange mode respectively); `#map`, `#graph` → Insights tab; `#shelf`, `#studio` keep working; `#profile`, `#room` unchanged.
Room objects keep their fly-ins: laptop → Library (Browse), bookshelves → Library (Arrange), globe → Insights/Map, tack board → Insights/Graph, picture frame → Profile, desk book → current book (or Add a book when none is being read).

**Needed from you, one answer per line:**
1. Is the structure above right (Library / Insights / Profile, Today inside the room)?
2. Phones: bottom tab bar (my recommendation: thumb reach, and it frees the top for the room) or keep a top bar?
3. Year in review: move from Profile into Insights as proposed, or keep it on Profile?
4. Should "Home" on the bottom bar be the room, or should phones (no 3D) land on a flat Today page instead? The plan says 3D is an iPad/desktop experience and the flat fallback already exists.

### Q2.2-a — The pre-read card spends 1 of the 10 free generations on every book a reader adds (decision for you)
Per the plan, adding a book starts one `intro-card` generation (pre-read card plus a short cultural context). A free reader who adds ten books in a month has then used the whole allowance before touching mind maps or concept cards. Imports never trigger it (2.5). Options: keep (matches the plan), give the card its own separate allowance (e.g. 20 a month, not counted against the 10), or only generate it for the first N books. I built the plan's version; changing it is one condition in `src/new-entry/new-entry.ts` plus the quota code.

### Q2.2-b — Cultural context length (decision for you)
`MARGINALIA_SPEC.md` says free users get a short version (~200 words) and Pro the full ~300-word context. The pre-read card carries one 60–90 word paragraph plus author / period / place lines for everyone. A longer Pro-only version is not built; say if you want it in this phase or with pricing.

### Q2.2-c — The 30-second check was made against a fake model (needs one run by you)
The e2e runs the real `aiGenerate` function (auth, server-built prompt, quota, audit log) but against a fake model server that answers after 0.6 s; the card appeared 4.6 s after saving the book. Real DeepSeek latency is not measured. On your dev project please add one book and check the card appears within 30 s.

### Q2.3-a — Finish card editing and when the ritual should appear (small decisions; defaults chosen)
- The finish card is stored as an AI block (`original` / `userEdited`), but there is no edit button yet; CLAUDE.md says every AI output is editable. Say if you want inline editing now (it is the same pattern as the other AI blocks).
- The ritual opens for every move into "finished" except a book that already has a record: finishing (answered or skipped) is remembered per book, so marking it finished again never asks again. Adding a book that is already marked finished is not a transition and does not ask. Escape or a click outside counts as Skip.
- The ritual is for signed-in readers with their own books (it needs the AI gateway); signed-out demo visitors never see it.
- No migration for `moments/{bookId}`: it is a new collection with no existing data.

### Q2.4-a — Email provider and sender domain: what I need from you (blocks: real sending only)
Everything except the actual delivery is built and tested: the four answers, signed one-time links (14 days; unsubscribe links 180 days), the weekly content (up to 3 due highlights + 1 due action), unsubscribe, the send-day setting, and the action reminders now travelling in the same email. Delivery goes through an `EmailSender` interface (`functions/src/digest/types.ts`); a mock sender is used locally and in tests. **The place to plug in a real provider is `createEmailSender()` in `functions/src/digest/senders.ts`** (commented cases for Resend and Postmark). Until `EMAIL_PROVIDER` names a real, wired provider the scheduled function logs "no email provider configured" and sends nothing, so deploying it is safe.

Please provide / decide:
1. **Provider** (Resend or Postmark are the usual picks) and an account; then tell me, and I write the ~30-line sender.
2. **Sender address and domain** (`EMAIL_FROM`, e.g. `hello@yourdomain`) and the **DNS records** your provider asks for (SPF, DKIM, and a DMARC policy). Without them mail lands in spam.
3. **Secrets** (Firebase secrets, never in git): `EMAIL_API_KEY` and `EMAIL_LINK_SECRET` (a long random string; it signs every link, rotating it invalidates links already sent).
4. **URLs** for the function environment: `EMAIL_ACTION_BASE_URL` (the public URL of the deployed `emailAction` function) and `APP_BASE_URL` (the web app).
5. **A postal address** for the email footer (`EMAIL_POSTAL_ADDRESS`); CAN-SPAM and similar laws expect one in commercial email.
6. Optional: `POSTHOG_KEY` / `POSTHOG_HOST` for the server-side `email_action_clicked` event (Q2.10-c).
7. The **privacy page** must name the email provider as a processor (Q1.8-a); I will add the row once you pick one.

### Q2.4-b — Weekly email is opt-in, off by default (decision made; confirm)
A reader has to switch it on in Profile → Settings → Weekly email. I chose opt-in because it is the safe default legally and for trust. The cost for the beta: nobody gets the email until they turn it on, so the retention loop depends on the first-run guide (2.9) asking for it, or on you telling the 20 beta users to switch it on. Say if you want it on by default for new accounts (then a consent line at sign-up is advisable).

### Q2.4-c — Link scanners can "click" the buttons (known limitation, your call)
Some corporate mail scanners open every link in an email. A prefetch of "Still holds" would answer it for the reader, and because links are single-use the reader's real click then says "already handled". The plan asks for one-click answers, so I built it that way (the "Add a thought" link is safe: it only shows a form first). If this shows up in the beta, the fix is to show a confirm button on the page before applying; it costs one extra click.

### Q2.4-d — "Send on" is a UTC weekday; no per-reader time zone yet
The daily job runs at 07:00 UTC and sends to readers whose chosen weekday (UTC) is today, at most once every 5 days. Readers far from UTC may get it on the evening before or the morning after their chosen day. The user document has no time zone today; say if you want one captured (the browser knows it).

### Q2.4-e — Existing highlights and the production run of migration 002 (needs you)
`scripts/migrations/002-resurface-fields.ts` gives every existing highlight a schedule (first review spread over the next 7 days by highlight id, so 300 old highlights do not become 300 things on day one). It is idempotent, never overwrites a schedule that exists, and defaults to a dry run. I ran it only against the emulator. Run it on dev first, then production with `--apply`, **after** deploying the new web build (highlights saved by the old build have no schedule until the script runs).

### Q2.5-a — The import fixtures are written by me, not real exports (needs one real file of each from you)
The sample files in `tests/fixtures/imports/` follow the column layouts of the Goodreads, StoryGraph and Readwise CSV exports and the Kindle "My Clippings.txt" format as I know them, and the WeChat Read file follows the "copy all notes" layout described in the parser's header comment. I could not download real exports from here. The WeChat Read parser is the least certain: its markers (`◆` chapter, `>>` highlight, `发表想法：` thought) are my reading of that app's output and it is deliberately forgiving. **Please send one real, anonymised export per source** (a WeChat Read paste matters most) and I will turn it into a fixture and fix whatever differs.

### Q2.5-b — Where the reader's comment lives: `annotation`, not `note` (naming)
The plan says WeChat Read thoughts map to the highlight's `note` field. The book page already stores and shows a highlight's comment as `annotation`, so imports write `annotation` (the parser's own field is called `note`, and the test asserts the mapping). Using a second field name would make imported comments invisible on the book page.

### Q2.5-c — Choices made for imported books (confirm or change)
New books from an import get type "nonfiction" (the default panels and AI features), language "zh" when the title has Chinese characters and "en" otherwise, a spine colour picked from the title, and status mapped as Goodreads/StoryGraph "read / currently reading / to read" → finished / reading / want, StoryGraph "did not finish" and "paused" → "confirm later". A book already in the library is matched by ISBN, else by title + author (subtitle and "(Series #1)" ignored); it is never overwritten, it only receives highlights it does not have. Imports do not start the automatic pre-read card (that costs a free generation per book). The geographic auto-placement after import is task 2.6; the import already announces `marginalia:books-imported` for it.

### Q2.6-a — Things I need from you for automatic map placement
1. **`WIKIDATA_CONTACT`** (an email or URL, set as a function environment variable): Wikimedia's policy requires every client to identify itself with contact details, and may block anonymous traffic. Until it is set the user-agent says "contact not configured".
2. **Reverse geocoding for "where I read" uses OpenStreetMap's public Nominatim**, whose usage policy allows about one request per second, requires a real identifying user-agent (same variable) and attribution. That is fine for a beta; for real traffic you would host it or pay for a geocoder. The browser sends rounded coordinates (two decimals) to our function, the function forwards them, and nothing is kept except the country and city name.
3. **Privacy page:** it should list Wikimedia (author names and book titles go there, no reader data) and OpenStreetMap/Nominatim (rounded coordinates, from our server, only when the reader ticks "Note where I read"). Rows to add with Q1.8-a.

### Q2.6-b — Measured and not measured (so you know what the numbers mean)
- **Author origin, measured live:** 30 of 30 books on `tests/fixtures/geo-books.json` (15 Chinese-language, 15 English-language) got the right birth country from the real wikidata.org (`node --experimental-strip-types scripts/measure-geo-accuracy.mjs`, run on 2026-10-20). The first version missed one (圣-埃克苏佩里, a transliteration written with a hyphen); the fallback that tries the longest part of a Chinese name fixed it. 30/30 on a list I chose myself is an upper bound, not a promise: expect misses on common names and on authors with no Wikidata entry (those stay unplaced, never guessed). The unit test replays the recorded responses so CI does not need the network.
- **Story setting (the model call) is NOT measured:** there is no model key here, so only the plumbing is tested (fake model). Nonfiction should come back empty; please eyeball ten real books when you have a key.
- **Cost:** every uncached book costs one small internal model call (about 100 tokens in, 50 out in the fake; the real prompt is similar). They are not counted against the reader's allowance and are logged in `audit/ai_calls/{uid}` with `internal: true`, `featureId: resolve-book-geo`, `inputTokens`, `outputTokens`, ready for task 4.5. Results are cached for everyone by book (`geoCache/`), so a popular book costs once.

### Q2.6-c — Definitions I chose (confirm or change)
"Author origin" = the author's **country of birth in today's borders** (Orwell → India, Camus → Algeria, Ishiguro → Japan), falling back to citizenship when no birthplace is recorded. The plan names both P19 and P27; birth country matches the map's "Author origin" wording. Automatically placed books are marked "To confirm" (on the map's book rows, the stats card and the book page) until the reader clicks Confirm or changes the country in Edit book info. The background placement also runs when the Map opens, for books that were never placed.
