# Analytics events (plan 2.10)

One catalogue, `shared/analytics-events.ts`, shared by the app and the Cloud Functions. Browser code
sends them through `track()` in `src/services/events.ts` (typed: a wrong name or property does not
compile). Incidental events (`view_changed`, `profile_viewed`, …) still use `logEvent()`.

| Event | Fired when | Properties | Where |
| --- | --- | --- | --- |
| `signup` | an account is created | `method`: `email` \| `google` | `src/firebase/auth.ts` |
| `book_added` | a book was saved from Add Book (after the write succeeded) | `bookId`, `status`, `source: manual` | `src/new-entry/new-entry.ts` |
| `import_completed` | one import run finished | `source`, `books`, `highlights` | `src/api/kindle-import.ts` (2.5 adds the other formats) |
| `highlight_saved` | a highlight was saved | `source`: `quick` \| `book` \| `import`, `bookId`, `count` (an import sends one event per run) | `src/book/book.js`, `kindle-import.ts`; quick capture in 2.1 |
| `resurface_responded` | a resurfaced highlight was answered | `rating`, `tier`, `via`: `app` \| `email` | 2.4 |
| `email_action_clicked` | a weekly-email button was used | `action`, `outcome` | 2.4, sent from the server |
| `session_completed` | a reading session ended | `bookId`, `durationMs` | `src/components/reading-session/reading-session.ts` |
| `book_finished` | a book moved into `finished` from another status | `bookId` | `src/store/book-status-events.ts` (called by book detail, Library drag, Add Book edit) |
| `ai_generated` | an AI generation completed | `featureId`, `provider`, `model` | `src/services/ai-gateway.ts` |

Rules of thumb
- `book_added` counts books a reader added by hand. Imported books are counted by `import_completed`, not once per book, so the funnel is not inflated by a 200-book import.
- Creating a book that is already `finished` is not a `book_finished` (backfilling past reads is not finishing a book). Only a status transition is.
- Events carry the signed-in user: `identifyUser(uid)` runs on every sign-in and merges the pre-signup anonymous id.
- Nothing is sent before the reader accepts analytics (`src/services/consent.ts`). Readers who decline are invisible to every dashboard, so retention is a lower bound.

## Dashboard

`npm run analytics:dashboards` prints the four tiles (dry run). With `POSTHOG_PERSONAL_API_KEY` and
`POSTHOG_PROJECT_ID` plus `-- --apply` it creates the "Marginalia core loop" dashboard:
funnel `signup → book_added → highlight_saved → book_finished`, weekly active readers,
weekly retention, and event volume by name.

"Active in a week" means at least one of `highlight_saved`, `resurface_responded`,
`session_completed`, `book_finished`. That is also the bar for the phase-2 gate ("saved a highlight or
answered a resurface in week 4"). Opening the app does not count.

## How this is tested

`tests/e2e-emulator/analytics-events.spec.ts` runs a production build with a fake PostHog key on the
Firebase emulators: it registers through the real form, adds a book, highlights, imports Kindle clippings, generates
once (stubbed gateway), runs a timer and finishes the book, decodes every capture request the browser
sends and asserts each event arrived exactly once with the right properties. The emulator build turns off posthog-js's
bot filter (`opt_out_useragent_filter`), because posthog-js drops all events from automated browsers.
