You are starting a session on the Marginalia P0 foundation migration.

Before doing anything else:

1. Read `MIGRATION.md` end-to-end. This is the source of truth for what is in progress.
2. Read `CLAUDE.md` (already in your auto-loaded context, but confirm the section on Roadmap/P0 matches MIGRATION.md).
3. List files in `docs/decisions/` and read the most recent ADR (highest number).
4. Run:
   ```
   git status
   git log -5 --oneline
   git branch --show-current
   ```
5. If a phase appears partially done in the working tree but not committed, stop and report — do not assume what to do.

Then write a short status report (10 lines or fewer) covering:
- Current phase number and name
- What was the last committed step
- What the next concrete action is, per MIGRATION.md
- Any uncommitted changes in the working tree
- Any concerns (failed verification, broken state, ambiguity in MIGRATION.md)

Do not write any code. Do not start the next task. Wait for me to confirm "go" before proceeding.
