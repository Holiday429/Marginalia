// Marginalia · Firestore write helpers
// Provides withMeta() to stamp every document write with _v, _updatedAt,
// and (on creates only) _createdAt. Also exports validateWrite() to run
// a Zod schema before a write reaches Firestore.
//
// Usage:
//   import { withMeta, withMetaCreate, validateWrite } from '../services/db.ts';
//   import { BookSchema } from '../data/schema/book.ts';
//   const payload = validateWrite(BookSchema, rawData);
//   await docRef.set(withMetaCreate(payload), { merge: true });   // first write
//   await docRef.set(withMeta(payload), { merge: true });          // update

import type { ZodTypeAny } from 'zod';

// FieldValue is from the Firebase compat CDN global — typed as unknown here.
function serverTimestamp(): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).firebase?.firestore?.FieldValue?.serverTimestamp?.() ?? Date.now();
}

type WithMeta<T> = T & { _v: 1; _updatedAt: unknown };
type WithMetaCreate<T> = T & { _v: 1; _updatedAt: unknown; _createdAt: unknown };

/** Stamp a document update with _v and _updatedAt. Never adds _createdAt. */
export function withMeta<T extends object>(data: T): WithMeta<T> {
  return { ...data, _v: 1, _updatedAt: serverTimestamp() };
}

/** Stamp a document create with _v, _createdAt, and _updatedAt. */
export function withMetaCreate<T extends object>(data: T): WithMetaCreate<T> {
  const ts = serverTimestamp();
  return { ...data, _v: 1, _createdAt: ts, _updatedAt: ts };
}

/**
 * Validate data against a Zod schema before writing to Firestore.
 * Throws a descriptive error on failure — caught at the call site like any
 * other Firestore error. Returns the parsed (passthrough-preserved) data.
 */
export function validateWrite<S extends ZodTypeAny>(schema: S, data: unknown): S['_output'] {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`[db] Schema validation failed — ${msg}`);
  }
  return result.data;
}

/**
 * Read-path helper: returns true if a Firestore document is legacy (no _v field).
 * Use this to decide whether to migrate-on-read.
 */
export function isLegacyDoc(data: Record<string, unknown> | undefined): boolean {
  return !data || !('_v' in data);
}
