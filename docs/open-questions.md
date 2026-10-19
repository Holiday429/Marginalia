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
Comma-separated list, e.g. `https://marginalia-reading.vercel.app`. If unset the function allows only `http://localhost:5173` / `127.0.0.1:5173`, so production calls would be refused until it is set. Also set `WORKSPACE_ID` if it is not `default`.

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
