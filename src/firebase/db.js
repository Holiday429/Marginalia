/* ==========================================================================
   Marginalia · Firebase database layer
   --------------------------------------------------------------------------
   Single point of contact for all Firestore + Storage operations.
   Consolidated from: firebase-books-sync.js, firebase-storage.js,
                      firebase-graph-sync.js
   Public surface:
     window.MarginaliaDB.books  — book metadata sync
     window.MarginaliaDB.graph  — concept graph sync
     window.MarginaliaStorage   — file upload (kept as own namespace for compat)
   ========================================================================== */

import { validateWrite, withMeta, withMetaCreate } from '../services/db.ts';
import { BookSchema } from '../data/schema/book.ts';
import { GraphLinkStatusSchema } from '../data/schema/graph-link-status.ts';
import { logError } from '../services/analytics.ts';
import { MarginaliaAuth } from './auth.js';
import { MARGINALIA_FIREBASE } from './config.js';
import { MarginaliaGraph } from '../core/graph-data.js';
import { NotesStore } from '../store/notes-store.js';

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
    };
  }

  const state = {
    enabled: true,
    uid: '',
    workspaceId: MARGINALIA_FIREBASE?.workspaceId || 'default',
    unsubscribe: null,
  };

  MarginaliaAuth.onAuthStateChange(({ user, ready }) => {
    if (!ready) return;
    detachListener();
    if (!user || !MarginaliaAuth.db) return;
    state.uid = user.uid;
    attachListener();
  });

  function attachListener() {
    state.unsubscribe = booksCollectionRef().onSnapshot((_snapshot) => {
      // No-op snapshot kept to maintain subscription lifecycle.
    }, (err) => logError(err, { context: 'db:books snapshot' }));
  }

  async function setBookCover({ bookId, imageUrl, storagePath }) {
    if (!state.uid)            throw new Error('User is not signed in.');
    if (!bookId || !imageUrl)  throw new Error('bookId and imageUrl are required.');
    const docRef = booksCollectionRef().doc(bookId);
    const raw = { cover: { image: imageUrl, storagePath: storagePath || '' } };
    const payload = withMeta(validateWrite(BookSchema, raw));
    await docRef.set(payload, { merge: true });
  }

  async function setUserNote({ bookId, userNote }) {
    if (!state.uid)  throw new Error('User is not signed in.');
    if (!bookId)     throw new Error('bookId is required.');
    const docRef = booksCollectionRef().doc(bookId);
    const raw = { userNote: String(userNote ?? '').slice(0, 280) };
    const payload = withMeta(validateWrite(BookSchema, raw));
    await docRef.set(payload, { merge: true });
  }

  async function setBookRating({ bookId, rating }) {
    if (!state.uid) throw new Error('User is not signed in.');
    if (!bookId) throw new Error('bookId is required.');
    const docRef = booksCollectionRef().doc(bookId);
    await docRef.set(withMeta({ rating: Number(rating) }), { merge: true });
  }

  async function setBookProgress({ bookId, readingProgress }) {
    if (!state.uid) throw new Error('User is not signed in.');
    if (!bookId) throw new Error('bookId is required.');
    const statusMap = { 'done': 'read', 'in-progress': 'reading', 'not-started': 'confirmed-later' };
    const status = statusMap[readingProgress] || 'confirmed-later';
    const docRef = booksCollectionRef().doc(bookId);
    await docRef.set(withMeta({ status, meta: { readingProgress: String(readingProgress) } }), { merge: true });
  }

  async function setBookTags({ bookId, tags }) {
    if (!state.uid) throw new Error('User is not signed in.');
    if (!bookId) throw new Error('bookId is required.');
    const docRef = booksCollectionRef().doc(bookId);
    await docRef.set(withMeta({ tags: Array.isArray(tags) ? tags : [] }), { merge: true });
  }

  async function setBookDouban({ bookId, douban }) {
    if (!state.uid) throw new Error('User is not signed in.');
    if (!bookId) throw new Error('bookId is required.');
    const docRef = booksCollectionRef().doc(bookId);
    await docRef.set(withMeta({ meta: { douban: String(douban || '') } }), { merge: true });
  }

  async function updateBook({ bookId, patch }) {
    if (!state.uid) throw new Error('User is not signed in.');
    if (!bookId) throw new Error('bookId is required.');
    const docRef = booksCollectionRef().doc(bookId);
    await docRef.set(withMeta(patch), { merge: true });
  }

  async function deleteBook({ bookId }) {
    if (!state.uid) throw new Error('User is not signed in.');
    if (!bookId) throw new Error('bookId is required.');
    await booksCollectionRef().doc(bookId).delete();
  }

  function booksCollectionRef() {
    return MarginaliaAuth.db
      .collection('workspaces').doc(state.workspaceId)
      .collection('users').doc(state.uid)
      .collection('books');
  }

  function detachListener() {
    if (typeof state.unsubscribe === 'function') { state.unsubscribe(); state.unsubscribe = null; }
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

  let unsubscribeDoc = null;

  MarginaliaAuth.onAuthStateChange(async ({ user, ready }) => {
    if (!ready) return;
    detachSnapshot();
    if (!user || !MarginaliaAuth.db) {
      MarginaliaGraph.setStatusPersistence(null, 'local');
      MarginaliaGraph.clearRemoteStatusOverrides();
      return;
    }
    const docRef = getLinkStatusDocRef(user.uid);
    MarginaliaGraph.setStatusPersistence(async ({ overrides }) => {
      const raw = { overrides };
      const payload = withMeta(validateWrite(GraphLinkStatusSchema, raw));
      await docRef.set(payload, { merge: true });
    }, 'firebase');
    unsubscribeDoc = docRef.onSnapshot((snapshot) => {
      const data = snapshot.exists ? snapshot.data() : {};
      MarginaliaGraph.useRemoteStatusOverrides(data?.overrides || {}, 'firebase');
    }, (err) => logError(err, { context: 'db:graph snapshot' }));
  });

  function getLinkStatusDocRef(uid) {
    const workspaceId = MARGINALIA_FIREBASE?.workspaceId || 'default';
    return MarginaliaAuth.db
      .collection('workspaces').doc(workspaceId)
      .collection('users').doc(uid)
      .collection('graph').doc('linkStatus');
  }

  function detachSnapshot() {
    if (typeof unsubscribeDoc === 'function') { unsubscribeDoc(); unsubscribeDoc = null; }
  }
})();


/* ── Storage service ─────────────────────────────────────────────────────── */

export const MarginaliaStorage = (() => {
  function isEnabled() {
    return Boolean(MarginaliaAuth?.enabled && MarginaliaAuth?.storage);
  }

  async function uploadCoverImage({ file, bookId }) {
    requireAuth();
    const path = buildPath(`covers/${sanitize(bookId || 'book')}`, file);
    return uploadFile({ file, path, contentType: file?.type || 'image/jpeg' });
  }

  async function uploadNoteAttachment({ file, bookId, noteId }) {
    requireAuth();
    const path = buildPath(`notes/${sanitize(bookId || 'book')}/${sanitize(noteId || 'note')}`, file);
    return uploadFile({ file, path, contentType: file?.type || 'application/octet-stream' });
  }

  async function uploadFile({ file, path, contentType }) {
    if (!(file instanceof Blob)) throw new Error('file must be a Blob/File.');
    const ref = MarginaliaAuth.storage.ref().child(path);
    await ref.put(file, {
      contentType,
      customMetadata: { workspaceId: getWorkspaceId(), uid: getUid() },
    });
    return { path, downloadURL: await ref.getDownloadURL(), contentType, size: file.size || 0 };
  }

  function buildPath(subPath, file) {
    return `workspaces/${getWorkspaceId()}/users/${getUid()}/${subPath}/${Date.now()}-${randomId(6)}.${guessExt(file)}`;
  }

  function requireAuth() {
    if (!isEnabled()) throw new Error('Storage is not enabled.');
    if (!MarginaliaAuth?.user?.uid) throw new Error('User must be signed in.');
  }

  function getUid()         { return MarginaliaAuth.user.uid; }
  function getWorkspaceId() { return MARGINALIA_FIREBASE?.workspaceId || 'default'; }

  function sanitize(value) {
    return String(value || '').trim().toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '') || 'item';
  }

  function guessExt(file) {
    const mime = String(file?.type || '').toLowerCase();
    if (mime.includes('png'))  return 'png';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('gif'))  return 'gif';
    if (mime.includes('svg'))  return 'svg';
    if (mime.includes('pdf'))  return 'pdf';
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
    const ext = String(file?.name || '').split('.').pop().toLowerCase();
    return ext || 'bin';
  }

  function randomId(n) {
    const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: n }, () => c[Math.floor(Math.random() * c.length)]).join('');
  }

  return { isEnabled, uploadCoverImage, uploadNoteAttachment };
})();
