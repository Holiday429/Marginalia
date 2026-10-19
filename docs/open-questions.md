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
