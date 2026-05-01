You are starting work on a single phase of the Marginalia P0 migration.

Phase number to execute: $ARGUMENTS

Steps:

1. Open `MIGRATION.md` and locate the phase block matching the phase number above.
2. Re-read the phase's **Goal**, **Tasks**, **Verification**, **Out of scope** (if present), and **Commit pattern** sections in full.
3. Check `docs/decisions/` for any ADR relevant to this phase.
4. **Plan first.** Write out a concrete plan covering:
   - Files you will create or modify (exact paths)
   - The order of changes
   - What each commit will contain
   - How you will verify each step
5. Stop and present the plan. Do not execute yet.

After I approve the plan, execute it commit-by-commit. After each commit, briefly state what was done and what's next.

Hard rules for this session:
- Stay inside this phase. Do not start the next phase even if time permits.
- Each commit must leave the app in a working state (`npm run dev` boots, no view crashes).
- Bridge code (temporary shims) must carry `// TODO(p0-cleanup): remove after phase N` comments.
- Update `MIGRATION.md` (tick checkboxes, update Status block) in the same commit as the code change that completes a task.
- Commit messages start with `p0(phase-N): ...`.

When the phase is complete (all tasks ticked, verification passes), stop. Run the end-of-session protocol: see `docs/claude-code-commands/end-session.md`.
