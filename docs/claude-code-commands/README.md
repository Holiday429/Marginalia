# Claude Code slash commands for the P0 migration

Three command templates live here. Copy them into `.claude/commands/` to make them available as slash commands inside Claude Code.

## One-time install

From the project root:

```bash
mkdir -p .claude/commands
cp docs/claude-code-commands/migration-status.md .claude/commands/
cp docs/claude-code-commands/start-phase.md .claude/commands/
cp docs/claude-code-commands/end-session.md .claude/commands/
```

(`.claude/` is local-only; do not commit it. Add to `.gitignore` if not already.)

## Commands

- **`/migration-status`** — run at the start of every session. Forces Claude to read `MIGRATION.md`, check git, and report the current state before doing anything.
- **`/start-phase N`** — start work on phase N. Forces a plan-then-execute flow with hard rules (one phase only, working app at every commit, etc.).
- **`/end-session`** — run before closing the session. Updates MIGRATION.md, writes ADRs if needed, commits, pushes, and produces a handoff note for the next session.

## Recommended session flow

```
/migration-status
[review the report]
/start-phase 1
[approve the plan]
[Claude executes]
/end-session
```

Keep these three in muscle memory and the migration will not lose state across the 5-hour usage window.

## Editing the templates

These templates are checked in so they can evolve with the migration. If you change a template here, copy it back to `.claude/commands/` to take effect.
