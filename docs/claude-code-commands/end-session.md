You are ending a session on the Marginalia P0 migration. Run this protocol before stopping.

1. Check the working tree:
   ```
   git status
   ```
   If anything is uncommitted, decide: commit it, or stash it, or revert it. Do not leave uncommitted changes.

2. Update `MIGRATION.md`:
   - Tick any checkboxes for tasks completed this session
   - Update the **Status** block at the top: current phase, last commit hash, next concrete action
   - If a phase was completed, mark its heading ✅ DONE with the final commit hash

3. If any non-obvious decision was made this session, write it as a new ADR in `docs/decisions/` using the next available number. See `docs/decisions/_template.md`.

4. Commit the MIGRATION.md and ADR changes if they aren't already in the last commit:
   ```
   git add MIGRATION.md docs/decisions/
   git commit -m "p0(phase-N): update migration status and decisions"
   ```

5. Push the branch.

6. Write a 5-line handoff for the next session:
   - What was completed
   - What is the next concrete action
   - Any pitfalls or ambiguity to watch for
   - Any verification that should happen before resuming
