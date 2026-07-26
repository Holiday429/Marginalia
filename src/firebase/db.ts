/* ==========================================================================
   Marginalia · Firebase database layer (modular SDK)
   --------------------------------------------------------------------------
   Single point of contact for all Firestore + Storage operations.
   Public surface:
     MarginaliaBooksCloud  — book metadata sync
     MarginaliaStorage     — file upload
   ========================================================================== */

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { validateWrite, withMeta } from '../services/db.ts';
import { BookSchema } from '../data/schema/book.ts';
import { GraphLinkStatusSchema } from '../data/schema/graph-link-status.ts';
import { logError } from '../services/analytics.ts';
import { MarginaliaAuth } from './auth.ts';
import { MARGINALIA_FIREBASE } from './config.ts';
import { MarginaliaGraph } from '../core/graph-data.ts';

/* ── Books sync ─────────────────────────────────────────────────────────── */

export const MarginaliaBooksCloud = (() => {
  if (!MarginaliaAuth?.enabled) {
    const _noop = async () => {};
    return {
      enabled: false,
      setBookCover: _noop,
      setUserNote: _noop,
      setBookRating: _noop,
      setBookProgress: _noop,
      setBookTags: _noop,
      setBookDouban: _noop,
      updateBook: _noop,
      deleteBook: _noop,
    };
  }

  const state = {
    enabled: true,
    uid: '',
    workspaceId: MARGINALIA_FIREBASE?.workspaceId || 'default',
    unsubscribe: null as Unsubscribe | null,
  };

  MarginaliaAuth.onAuthStateChange(({ user, ready }) => {
    if (!ready) return;
    detachListener();
    if (!user || !MarginaliaAuth.db) return;
    state.uid = user.uid;
    attachListener();
  });

  function attachListener() {
    state.unsubscribe = onSnapshot(booksCollectionRef(), () => {
      // No-op snapshot kept to maintain subscription lifecycle.
    }, (err) => logError(err, { context: 'db:books snapshot' }));
  }

  async function setBookCover({ bookId, imageUrl, storagePath }: { bookId: string; imageUrl: string; storagePath?: string }) {
    if (!state.uid)            throw new Error('User is not signed in.');
    if (!bookId || !imageUrl)  throw new Error('bookId and imageUrl are required.');
    const docRef = doc(booksCollectionRef(), bookId);
    const raw = { cover: { image: imageUrl, storagePath: storagePath || '' } };
    const payload = withMeta(validateWrite(BookSchema, raw));
    await setDoc(docRef, payload, { merge: true });
  }

  async function setUserNote({ bookId, userNote }: { bookId: string; userNote: string }) {
    if (!state.uid)  throw new Error('User is not signed in.');
    if (!bookId)     throw new Error('bookId is required.');
    const docRef = doc(booksCollectionRef(), bookId);
    const raw = { userNote: String(userNote ?? '').slice(0, 280) };
    const payload = withMeta(validateWrite(BookSchema, raw));
    await setDoc(docRef, payload, { merge: true });
  }

  async function setBookRating({ bookId, rating }: { bookId: string; rating: number }) {
    if (!state.uid) throw new Error('User is not signed in.');
    if (!bookId) throw new Error('bookId is required.');
    const docRef = doc(booksCollectionRef(), bookId);
    await setDoc(docRef, withMeta({ rating: Number(rating) }), { merge: true });
  }

  async function setBookProgress({ bookId, readingProgress }: { bookId: string; readingProgress: string }) {
    if (!state.uid) throw new Error('User is not signed in.');
    if (!bookId) throw new Error('bookId is required.');
    const statusMap: Record<string, string> = { 'done': 'read', 'in-progress': 'reading', 'not-started': 'confirmed-later' };
    const status = statusMap[readingProgress] || 'confirmed-later';
    const docRef = doc(booksCollectionRef(), bookId);
    await setDoc(docRef, withMeta({ status, meta: { readingProgress: String(readingProgress) } }), { merge: true });
  }

  async function setBookTags({ bookId, tags }: { bookId: string; tags: string[] }) {
    if (!state.uid) throw new Error('User is not signed in.');
    if (!bookId) throw new Error('bookId is required.');
    const docRef = doc(booksCollectionRef(), bookId);
    await setDoc(docRef, withMeta({ tags: Array.isArray(tags) ? tags : [] }), { merge: true });
  }

  async function setBookDouban({ bookId, douban }: { bookId: string; douban: string }) {
    if (!state.uid) throw new Error('User is not signed in.');
    if (!bookId) throw new Error('bookId is required.');
    const docRef = doc(booksCollectionRef(), bookId);
    await setDoc(docRef, withMeta({ meta: { douban: String(douban || '') } }), { merge: true });
  }

  async function updateBook({ bookId, patch }: { bookId: string; patch: Record<string, unknown> }) {
    if (!state.uid) throw new Error('User is not signed in.');
    if (!bookId) throw new Error('bookId is required.');
    const docRef = doc(booksCollectionRef(), bookId);
    await setDoc(docRef, withMeta(patch), { merge: true });
  }

  async function deleteBook({ bookId }: { bookId: string }) {
    if (!state.uid) throw new Error('User is not signed in.');
    if (!bookId) throw new Error('bookId is required.');
    await deleteDoc(doc(booksCollectionRef(), bookId));
  }

  function booksCollectionRef() {
    if (!MarginaliaAuth.db) throw new Error('Firestore is not initialized.');
    return collection(MarginaliaAuth.db, 'workspaces', state.workspaceId, 'users', state.uid, 'books');
  }

  function detachListener() {
    if (state.unsubscribe) { state.unsubscribe(); state.unsubscribe = null; }
  }

  return {
    get enabled() { return state.enabled; },
    setBookCover,
    setUserNote,
    setBookRating,
    setBookProgress,
    setBookTags,
    setBookDouban,
    updateBook,
    deleteBook,
  };
})();


/* ── Graph sync ─────────────────────────────────────────────────────────── */

(function initGraphSync() {
  if (!MarginaliaGraph || !MarginaliaAuth?.enabled) return;

  let unsubscribeDoc: Unsubscribe | null = null;

  MarginaliaAuth.onAuthStateChange(async ({ user, ready }) => {
    if (!ready) return;
    detachSnapshot();
    if (!user || !MarginaliaAuth.db) {
      MarginaliaGraph.setStatusPersistence(null, 'local');
      MarginaliaGraph.clearRemoteStatusOverrides();
      return;
    }
    const docRef = getLinkStatusDocRef(user.uid);
    MarginaliaGraph.setStatusPersistence(async ({ overrides }: { overrides: Record<string, unknown> }) => {
      const raw = { overrides };
      const payload = withMeta(validateWrite(GraphLinkStatusSchema, raw));
      await setDoc(docRef, payload, { merge: true });
    }, 'firebase');
    unsubscribeDoc = onSnapshot(docRef, (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : {};
      MarginaliaGraph.useRemoteStatusOverrides(data?.overrides || {}, 'firebase');
    }, (err) => logError(err, { context: 'db:graph snapshot' }));
  });

  function getLinkStatusDocRef(uid: string) {
    const workspaceId = MARGINALIA_FIREBASE?.workspaceId || 'default';
    if (!MarginaliaAuth.db) throw new Error('Firestore is not initialized.');
    return doc(MarginaliaAuth.db, 'workspaces', workspaceId, 'users', uid, 'graph', 'linkStatus');
  }

  function detachSnapshot() {
    if (unsubscribeDoc) { unsubscribeDoc(); unsubscribeDoc = null; }
  }
})();


/* ── Storage service ─────────────────────────────────────────────────────── */

export const MarginaliaStorage = (() => {
  function isEnabled(): boolean {
    return Boolean(MarginaliaAuth?.enabled && MarginaliaAuth?.storage);
  }

  async function uploadCoverImage({ file, bookId }: { file: Blob & { type?: string }; bookId?: string }) {
    requireAuth();
    const path = buildPath(`covers/${sanitize(bookId || 'book')}`, file);
    return uploadFile({ file, path, contentType: file?.type || 'image/jpeg' });
  }

  async function uploadNoteAttachment({ file, bookId, noteId }: { file: Blob & { type?: string }; bookId?: string; noteId?: string }) {
    requireAuth();
    const path = buildPath(`notes/${sanitize(bookId || 'book')}/${sanitize(noteId || 'note')}`, file);
    return uploadFile({ file, path, contentType: file?.type || 'application/octet-stream' });
  }

  async function uploadFile({ file, path, contentType }: { file: Blob; path: string; contentType: string }) {
    if (!(file instanceof Blob)) throw new Error('file must be a Blob/File.');
    if (!MarginaliaAuth.storage) throw new Error('Storage is not initialized.');
    const fileRef = ref(MarginaliaAuth.storage, path);
    await uploadBytes(fileRef, file, {
      contentType,
      customMetadata: { workspaceId: getWorkspaceId(), uid: getUid() },
    });
    return { path, downloadURL: await getDownloadURL(fileRef), contentType, size: (file as File).size || 0 };
  }

  function buildPath(subPath: string, file: { name?: string; type?: string }): string {
    return `workspaces/${getWorkspaceId()}/users/${getUid()}/${subPath}/${Date.now()}-${randomId(6)}.${guessExt(file)}`;
  }

  function requireAuth() {
    if (!isEnabled()) throw new Error('Storage is not enabled.');
    if (!MarginaliaAuth?.user?.uid) throw new Error('User must be signed in.');
  }

  function getUid()         { return MarginaliaAuth.user!.uid; }
  function getWorkspaceId() { return MARGINALIA_FIREBASE?.workspaceId || 'default'; }

  function sanitize(value: string): string {
    return String(value || '').trim().toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '') || 'item';
  }

  function guessExt(file: { name?: string; type?: string }): string {
    const mime = String(file?.type || '').toLowerCase();
    if (mime.includes('png'))  return 'png';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('gif'))  return 'gif';
    if (mime.includes('svg'))  return 'svg';
    if (mime.includes('pdf'))  return 'pdf';
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
    const ext = String(file?.name || '').split('.').pop()?.toLowerCase();
    return ext || 'bin';
  }

  function randomId(n: number): string {
    const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: n }, () => c[Math.floor(Math.random() * c.length)]).join('');
  }

  return { isEnabled, uploadCoverImage, uploadNoteAttachment };
})();
