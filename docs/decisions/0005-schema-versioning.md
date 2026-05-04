# 0005 — Firestore schema versioning + Zod validation

**Status:** Accepted
**Date:** 2026-05-04

## Context

Phase 7 of the P0 migration. Firestore documents written before this phase have no version field. Without versioning, schema changes silently break reads, and there is no way to tell at runtime whether a document was written by old or new code. Additionally, writes were unvalidated — a bug or type mismatch could write malformed data that survives indefinitely in the database.

## Decision

Every Firestore document write is now:

1. **Validated by a Zod schema** before reaching Firestore. `validateWrite(schema, data)` in `src/services/db.ts` calls `schema.safeParse()` and throws a descriptive error on failure. All schemas use `.passthrough()` so unknown fields from legacy documents are preserved rather than stripped.

2. **Stamped with `_v: 1`** via `withMeta()` (updates) or `withMetaCreate()` (first writes). `_updatedAt` is always set to `FieldValue.serverTimestamp()`; `_createdAt` is added only on document creation, never on updates.

### Read paths

- Documents with no `_v` field are treated as **v0 (legacy)**. Reads are not blocked and no error is thrown.
- `isLegacyDoc(data)` in `src/services/db.ts` identifies legacy documents.
- **Migrate-on-read** is implemented only for `UserProfile`: when `ensureUserProfile` finds a doc that exists but lacks `_v`, it silently re-stamps it on the next sign-in.
- Other document types (books, highlights, graph) are not migrated on read — they will be stamped naturally on the next write (e.g., next cover upload, next note save).

### Schemas defined (all in `src/data/schema/`)

| File | Firestore path |
|------|----------------|
| `book.ts` | `.../books/{bookId}` |
| `book-note.ts` | `.../books/{bookId}/notes/main` |
| `highlight.ts` | `.../books/{bookId}/highlights/{highlightId}` |
| `reading-session.ts` | `.../books/{bookId}/sessions/{sessionId}` (stub; P1) |
| `graph-link-status.ts` | `.../graph/linkStatus` |
| `user-profile.ts` | `workspaces/{ws}/userProfiles/{uid}` |

### Write sites wrapped

| File | Function | Helper used |
|------|----------|-------------|
| `src/firebase/db.js` | `setBookCover` | `validateWrite(BookSchema)` + `withMeta` |
| `src/firebase/db.js` | graph `setStatusPersistence` callback | `validateWrite(GraphLinkStatusSchema)` + `withMeta` |
| `src/book/panels/notes.js` | `syncToFirebase` | `validateWrite(BookNoteSchema)` + `withMeta` |
| `src/firebase/auth.js` | `upsertUserProfile` (first write) | `validateWrite(UserProfileSchema)` + `withMetaCreate` |
| `src/firebase/auth.js` | `upsertUserProfile` (update) | `validateWrite(UserProfileSchema)` + `withMeta` |
| `src/firebase/auth.js` | `ensureUserProfile` (migrate-on-read) | `validateWrite(UserProfileSchema)` + `withMeta` |

## Alternatives considered

- **Validate at every call site** — rejected; write sites are scattered across JS files. Centralising at the db/auth layer is the minimum-viable approach and avoids duplicate validation logic.
- **Migration script (batch rewrite all docs)** — rejected for P0; the database is pre-launch with a small number of documents. Migrate-on-read for UserProfile (the most-read doc type) is sufficient for now.
- **Store `_v` as a Firestore subcollection field** — rejected; a top-level `_v` field is simpler to check in security rules and in client code.
- **Use Zod `strict()` instead of `passthrough()`** — rejected; legacy documents have fields not yet captured in schemas. Stripping unknown fields would silently lose data.

## Consequences

- All new Firestore documents have `_v: 1`, `_createdAt`, and `_updatedAt`.
- Legacy documents are readable without any code change.
- A malformed write throws a descriptive `[db] Schema validation failed` error before reaching Firestore.
- When a schema must change incompatibly (e.g., renaming a required field), the version is bumped to `_v: 2` and a `v1 → v2` transformer is added in the store layer.
- MIGRATION.md note: ADR numbering — this is `0005` because `0004` is already used by the AI gateway ADR.
