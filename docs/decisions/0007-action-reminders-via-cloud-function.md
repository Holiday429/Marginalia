# ADR 0007 — Action reminders via scheduled Cloud Function

**Date:** 2026-05-05  
**Status:** Accepted

---

## Context

Phase 3 introduces per-book action items: knowledge-to-action tasks that a user captures while reading. Actions need a reminder system so that insights don't get buried. Two design questions drove this ADR:

1. **Reminder cadence** — when and how many times should the user be notified about an open action?
2. **Unfinished action lifecycle** — what happens to actions that are never completed?

## Decision

### Reminder tiers (3-stage, purpose-differentiated)

| Tier | Offset from `createdAt` | Intent |
|---|---|---|
| 7 days | `remind7At = createdAt + 7d` | Light nudge while memory is fresh |
| 30 days | `remind30At = createdAt + 30d` | One-month review: is this still worth doing? |
| 90 days | `remind90At = createdAt + 90d` | Quarterly archive prompt: keep or close? |

Each tier fires **once** (tracked via `reminded7: boolean`, `reminded30: boolean`, `reminded90: boolean` on the action doc). A snooze resets all three offsets from the snooze date, giving the user a fresh 7/30/90-day window.

### Unfinished action lifecycle

Actions are **never automatically deleted or hidden**. The only terminal states are `done` (user completed it) and `archived` (user chose to close without completing). The 90-day reminder CTA offers `Archive` or `Keep open` — not silent deletion.

```
status: 'open' | 'done' | 'snoozed' | 'archived'
```

Rationale: auto-disappearance erodes trust in the system. Users who see items vanish stop adding items. Explicit archival is low-friction and preserves history.

### Scope: per-book only

Actions are knowledge-conversion tasks extracted from a specific book. Global to-do management (reading plans, note-organisation tasks) is out of scope — that is a task manager's job, and Marginalia is not a task manager.

### Delivery mechanism

A Firebase Cloud Function scheduled daily (`pubsub.onSchedule('every 24 hours')`) queries all `open` or `snoozed` actions across all users where a reminder tier's timestamp is in the past and the corresponding `remindedN` flag is `false`. For each match it writes a `notifications/{uid}/unread/{id}` document. The client reads this collection on sign-in and displays a badge + dismissible panel.

Rationale for a scheduled function over Firestore triggers: reminder logic depends on wall-clock time, not on document writes. A scheduled function is simpler, cheaper, and avoids per-write trigger costs.

## Alternatives rejected

- **Client-side timers / localStorage** — lost on device switch; unreliable for multi-device users.
- **Single 30-day reminder** — misses the "memory still fresh" window at 7 days and the quarterly cleanup at 90 days.
- **Auto-delete at 90 days** — destroys reading history; users can't review what they once intended to act on.
- **Global to-do list** — scope creep; duplicates existing task managers; dilutes Marginalia's "after reading" positioning.
