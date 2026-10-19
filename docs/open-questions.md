# Open questions for Holiday

Decisions Claude Code must not make alone (plan rule 6). Each item says what is blocked, if anything.
Execution continues on other tasks meanwhile.

## Phase 1

### Q1.1-a — Paid-user list for migration 001 (blocks: running the migration on production)
`scripts/migrations/001-billing.ts` sets everyone to `free` unless listed in a `paid.json` (`{ "<uid>": "pro" | "lifetime" }`), because old `users.plan` values could be forged. If nobody has paid yet, run it with no list.
**Needed from you:** the list, or confirmation that there are no paying users.

### Q1.1-b — Deploy order for 1.1 (informational)
1. Deploy functions (webhook now writes `billing/{uid}`). 2. Run migration 001 on dev, then prod (`--apply`). 3. Deploy `firestore.rules` and the new web build together — the new rules make `users/{uid}` owner-only, so the old client's public-profile lookup breaks if rules ship first. Public profile URLs keep working because the migration creates `publicProfiles/{slug}` for every currently-public profile.
