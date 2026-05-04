You are ending a P1 session on Marginalia. Run this protocol before stopping.

1. Check the working tree:
   ```
   git status
   ```
   If anything is uncommitted, decide: commit it, stash it, or revert it. Do not leave uncommitted changes.

2. Update `P1.md`:
   - Tick any checkboxes for tasks completed this session
   - Update the **Status** block at the top: current phase, last commit hash, next concrete action
   - If a phase was completed, mark its heading ✅ DONE with the final commit hash

3. If any non-obvious decision was made this session, write it as a new ADR in `docs/decisions/` using the next available number (check existing files first). See `docs/decisions/_template.md`.

4. Commit `P1.md` and any ADR changes if they aren't already in the last commit:
   ```
   git add P1.md docs/decisions/
   git commit -m "p1(phase-N): update P1 status and decisions"
   ```

5. Push the branch.

6. Write a 5-line handoff for the next session:
   - What was completed this session
   - What is the next concrete action
   - Any pitfalls or ambiguity to watch out for
   - Any verification that should be run before resuming
   - Any `TODO(p0-cleanup)` items noticed but not resolved
