// Marginalia · AiResultsStore
// Persists AI-generated content as AiBlock documents in Firestore.
// Path: workspaces/{wsId}/users/{uid}/books/{bookId}/ai/{featureId}
//
// Falls back to in-memory cache when user is not signed in (unauthenticated
// demo path). No migration from the legacy IndexedDB (NotesStore) store —
// old results are simply re-generated on demand.
import type { AiBlock, AiBlockRaw } from '../data/schema/ai-block.ts';
import { AiBlockSchema } from '../data/schema/ai-block.ts';
import { ENV } from '../core/env.ts';

let _uid: string | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any = null;

// In-memory fallback for unauthenticated / offline path
const _memCache = new Map<string, AiBlockRaw>();

function cacheKey(bookId: string, featureId: string) {
  return `${bookId}::${featureId}`;
}

function aiDocRef(bookId: string, featureId: string) {
  if (!_uid || !_db) return null;
  const wsId = ENV.WORKSPACE_ID || (window as any).MARGINALIA_FIREBASE?.workspaceId || 'default';
  return _db
    .collection('workspaces').doc(wsId)
    .collection('users').doc(_uid)
    .collection('books').doc(bookId)
    .collection('ai').doc(featureId);
}

// Called from main.js on auth-changed (signed in)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function initAiResultsStore(uid: string, db: any) {
  _uid = uid;
  _db = db;
  _memCache.clear();
}

// Called from main.js on auth-changed (signed out)
export function teardownAiResultsStore() {
  _uid = null;
  _db = null;
  _memCache.clear();
}

export async function getAiBlock<T>(
  bookId: string, featureId: string,
): Promise<AiBlock<T> | null> {
  const ref = aiDocRef(bookId, featureId);
  if (ref) {
    const snap = await ref.get();
    if (!snap.exists()) return null;
    const parsed = AiBlockSchema.safeParse(snap.data());
    return parsed.success ? (parsed.data as AiBlock<T>) : null;
  }
  // Unauthenticated: try memory cache
  const cached = _memCache.get(cacheKey(bookId, featureId));
  return cached ? (cached as AiBlock<T>) : null;
}

export async function saveAiOriginal<T>(
  bookId: string, featureId: string,
  original: T, promptVersion: string,
): Promise<void> {
  const block: AiBlock<T> = {
    original,
    generatedAt: Date.now(),
    promptVersion,
  };
  const ref = aiDocRef(bookId, featureId);
  if (ref) {
    await ref.set(block);
  } else {
    _memCache.set(cacheKey(bookId, featureId), block as AiBlockRaw);
  }
}

export async function saveAiUserEdit<T>(
  bookId: string, featureId: string, userEdited: T,
): Promise<void> {
  const ref = aiDocRef(bookId, featureId);
  if (ref) {
    // Partial update — only touch userEdited, preserve original + metadata
    await ref.set({ userEdited }, { merge: true });
  } else {
    const key = cacheKey(bookId, featureId);
    const existing = _memCache.get(key);
    if (existing) _memCache.set(key, { ...existing, userEdited });
  }
}

export async function clearAiUserEdit(
  bookId: string, featureId: string,
): Promise<void> {
  const ref = aiDocRef(bookId, featureId);
  if (ref) {
    const deleteField = (window as any).firebase?.firestore?.FieldValue?.delete?.();
    if (deleteField) {
      await ref.update({ userEdited: deleteField });
    } else {
      await ref.set({ userEdited: null }, { merge: true });
    }
  } else {
    const key = cacheKey(bookId, featureId);
    const existing = _memCache.get(key);
    if (existing) {
      const { userEdited: _removed, ...rest } = existing as Record<string, unknown>;
      _memCache.set(key, rest as AiBlockRaw);
    }
  }
}

export async function deleteAiBlock(
  bookId: string, featureId: string,
): Promise<void> {
  const ref = aiDocRef(bookId, featureId);
  if (ref) {
    await ref.delete();
  } else {
    _memCache.delete(cacheKey(bookId, featureId));
  }
}

export const AiResultsStore = {
  init: initAiResultsStore,
  teardown: teardownAiResultsStore,
  getAiBlock,
  saveAiOriginal,
  saveAiUserEdit,
  clearAiUserEdit,
  deleteAiBlock,
};
