# 0001 — Incremental P0 migration with bridge code

**Status:** Accepted
**Date:** 2026-04-30

## Context

Marginalia is moving from a prototype (raw `<script>` tags, `window.X` globals, client-side AI key, no schema versioning) to a production foundation that supports multi-user, payments, data export, and an iPad PWA. The full target architecture is described in `CLAUDE.md`.

The migration is large enough that it cannot be completed in a single session or PR. It will run across many sessions and contributor-types (the project owner working in Claude Code, possibly other engineers later).

The prototype is also being actively used to produce social-media demo content. The app must remain functional throughout the migration.

## Decision

Execute P0 as eight sequential phases (`MIGRATION.md`), one phase per session, with each phase landing as one or more small commits that leave the app in a working state. Where a phase requires changing many call sites at once, introduce **bridge code** (e.g., `window.X = M.x.y` aliases) so callers can be migrated incrementally. Bridge code is always tagged `// TODO(p0-cleanup): remove after phase N` and a later phase is responsible for its removal.

State of the migration is tracked in `MIGRATION.md`, which is the first file every session reads.

## Alternatives considered

- **Big-bang rewrite on a long-lived branch.** Rejected because it blocks the active demo-video pipeline, accumulates merge conflicts, and concentrates all risk into one massive merge.
- **Greenfield rewrite in a new repo.** Rejected because the existing prototype already encodes hundreds of design and product decisions that aren't in the spec — they live in the code. Throwing it away and rebuilding would lose most of that.
- **Single PR per phase, no bridge code.** Rejected for phases that touch dozens of call sites (specifically Phase 3, the namespace consolidation) — would force a single unreviewable PR and a long broken-app window.

## Consequences

- The codebase will look temporarily inconsistent during the migration: old patterns (`window.X`) and new patterns (ES imports) coexist. This is acceptable but must be visible — bridge code carries a `TODO(p0-cleanup)` marker.
- Each session must read `MIGRATION.md` before doing anything. Sessions that skip this step will fight bridge code or duplicate work already done.
- Phases are sequenced by risk (low first) and by dependency. Vite (Phase 1) unlocks every later phase by enabling hot reload and module imports. The AI gateway (Phase 5) is a security-critical step and must land before any external user signs up.
- This decision implies a hard rule: **do not start P1 work until all eight P0 phases are complete and verified.** Mixing P0 and P1 work undoes the discipline that makes the migration tractable.
