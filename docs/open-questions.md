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
