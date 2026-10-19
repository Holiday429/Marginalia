# Phase 1 report — stabilize

Branch: `phase-1-stabilize`. Gate before every commit: `npm run check:all`
(lint, typecheck, typecheck:room, check:entitlements, functions build, test:unit, test:rules under the Firestore emulator, build, size).

Baseline on `main` before any change: lint 0 errors / 156 warnings, unit 12 pass, rules 7 pass, `dist` 508M.

## 1.1 Lock billing fields — code done; items marked ⚠ need a dev project

| Acceptance | Status | Evidence |
| --- | --- | --- |
| Rules tests: user writes `users/{uid}.plan` denied; writes `billing/{uid}` denied; reads own billing OK / other's denied; anon reads `users/{uid}` denied and `publicProfiles/{slug}` OK | ✅ | `npm run test:rules:emu` → 18 passed (11 new, `tests/firestore-rules.test.ts`, blocks "billing fields (1.1)" and "users/{uid} privacy and publicProfiles (1.1)") |
| `grep -rn plan src … \| grep -i setDoc` empty; `check:entitlements` passes | ✅ | grep returns nothing; `npm run check:entitlements` exit 0 |
| Dev project: console write of plan → `permission-denied` | ⚠ | Not run — no dev project access from this session. Same rule exercised in the emulator test "owner cannot write plan, entitlements or quota on users/{uid}". Run once after deploying rules to dev. |
| Public profile unauthenticated shows no email/plan in network | ⚠ | Not run in a browser. By construction: anonymous visitors read only `publicProfiles/{slug}`, whose rule is `hasOnly(uid, slug, displayName, avatarUrl, bio, location, joinedAt, sections, updatedAt)` (tested: extra `email`/`plan` fields rejected), and `users/{uid}` + `users` queries are denied (tested). |

Also verified: migration 001 against the emulator (3 seeded users incl. one with forged `plan: 'lifetime'`): forged user → `billing` free and legacy fields deleted; listed user → `pro`; public user → `publicProfiles/payer` created, no `email` in it. Unit tests in `tests/migration-001.test.ts` (3 pass).

Design notes
- `billing/{uid}` and `usage/{uid}/months/{YYYY-MM}`: owner read, `write: false`.
- `users/{uid}`: owner-only; create/update may not touch `plan`, `entitlements`, `quota`, `billing`; client delete denied.
- `publicProfiles/{slug}`: doc id is the slug, so Firestore enforces uniqueness; only the creating uid can update/delete; slug format and reserved list checked in rules. The client derives the card from `users/{uid}` (`src/profile/public-profile.ts`) and removes it when the profile goes private or the slug changes. `profileSlugCheck` now checks this collection.
- `shared/entitlements.ts` is the single entitlement table; `functions/src/_shared/` is a git-ignored build-time copy (`scripts/sync-shared.mjs`, run by functions `prebuild`).
- `billing-webhook.ts` already writes `billing/{uid}` (minimal change); the state machine is task 1.3. `ai-generate.ts` still reads `users.quota` (absent now) until 1.2.
- Book-level public reads (`shareInProfile`) still use rules `get(users/{uid}).settings.profilePublic`, which works because rules bypass read restrictions.

Open items: see `docs/open-questions.md` (Q1.1-a, Q1.1-b).
