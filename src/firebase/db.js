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

/* ── Books sync ─────────────────────────────────────────────────────────── */

window.MarginaliaBooksCloud = (() => {
  if (!window.MarginaliaAuth?.enabled) {
    return {
      enabled: false,
      async setBookCover() { throw new Error('Firebase auth is not enabled.'); },
    };
  }

  const state = {
    enabled: true,
    uid: '',
    workspaceId: window.MARGINALIA_FIREBASE?.workspaceId || 'default',
    unsubscribe: null,
  };

  window.MarginaliaAuth.onAuthStateChange(({ user, ready }) => {
    if (!ready) return;
    detachListener();
    if (!user || !window.MarginaliaAuth.db) return;
    state.uid = user.uid;
    attachListener();
  });

  function attachListener() {
    state.unsubscribe = booksCollectionRef().onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const bookId = change.doc.id;
        const data   = change.doc.data() || {};
        applyBookOverride(bookId, change.type === 'removed' ? {} : data);
      });
      window.dispatchEvent(new CustomEvent('marginalia:books-overrides-changed'));
    }, (err) => console.warn('[db:books] Snapshot failed.', err));
  }

  async function setBookCover({ bookId, imageUrl, storagePath }) {
    if (!state.uid)            throw new Error('User is not signed in.');
    if (!bookId || !imageUrl)  throw new Error('bookId and imageUrl are required.');
    const docRef = booksCollectionRef().doc(bookId);
    await docRef.set({
      cover: { image: imageUrl, storagePath: storagePath || '' },
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    applyBookOverride(bookId, { cover: { image: imageUrl, storagePath: storagePath || '' } });
    window.dispatchEvent(new CustomEvent('marginalia:books-overrides-changed'));
  }

  function applyBookOverride(bookId, data) {
    const detail = window.BOOK_BY_ID?.[bookId];
    if (!detail) return;
    if (!detail.cover) detail.cover = {};
    if (data.cover?.image) {
      detail.cover.image = data.cover.image;
      const item = (window.BOOK_DETAILS || []).find((b) => b.id === bookId);
      if (item) { if (!item.cover) item.cover = {}; item.cover.image = data.cover.image; }
    }
  }

  function booksCollectionRef() {
    return window.MarginaliaAuth.db
      .collection('workspaces').doc(state.workspaceId)
      .collection('users').doc(state.uid)
      .collection('books');
  }

  function detachListener() {
    if (typeof state.unsubscribe === 'function') { state.unsubscribe(); state.unsubscribe = null; }
  }

  return { get enabled() { return state.enabled; }, setBookCover };
})();


/* ── Graph sync ─────────────────────────────────────────────────────────── */

(function initGraphSync() {
  if (!window.MarginaliaGraph || !window.MarginaliaAuth?.enabled) return;

  let unsubscribeDoc = null;

  window.MarginaliaAuth.onAuthStateChange(async ({ user, ready }) => {
    if (!ready) return;
    detachSnapshot();
    if (!user || !window.MarginaliaAuth.db) {
      window.MarginaliaGraph.setStatusPersistence(null, 'local');
      window.MarginaliaGraph.clearRemoteStatusOverrides();
      return;
    }
    const docRef = getLinkStatusDocRef(user.uid);
    window.MarginaliaGraph.setStatusPersistence(async ({ overrides }) => {
      await docRef.set({
        overrides,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }, 'firebase');
    unsubscribeDoc = docRef.onSnapshot((snapshot) => {
      const data = snapshot.exists ? snapshot.data() : {};
      window.MarginaliaGraph.useRemoteStatusOverrides(data?.overrides || {}, 'firebase');
    }, (err) => console.warn('[db:graph] Snapshot listener failed.', err));
  });

  function getLinkStatusDocRef(uid) {
    const workspaceId = window.MARGINALIA_FIREBASE?.workspaceId || 'default';
    return window.MarginaliaAuth.db
      .collection('workspaces').doc(workspaceId)
      .collection('users').doc(uid)
      .collection('graph').doc('linkStatus');
  }

  function detachSnapshot() {
    if (typeof unsubscribeDoc === 'function') { unsubscribeDoc(); unsubscribeDoc = null; }
  }
})();


/* ── Storage service ─────────────────────────────────────────────────────── */

window.MarginaliaStorage = (() => {
  function isEnabled() {
    return Boolean(window.MarginaliaAuth?.enabled && window.MarginaliaAuth?.storage);
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
    const ref = window.MarginaliaAuth.storage.ref().child(path);
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
    if (!window.MarginaliaAuth?.user?.uid) throw new Error('User must be signed in.');
  }

  function getUid()         { return window.MarginaliaAuth.user.uid; }
  function getWorkspaceId() { return window.MARGINALIA_FIREBASE?.workspaceId || 'default'; }

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
