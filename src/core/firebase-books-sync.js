/* ==========================================================================
   Marginalia · Firebase book overrides sync
   --------------------------------------------------------------------------
   Stores user-specific book metadata:
   /workspaces/{workspaceId}/users/{uid}/books/{bookId}
   ========================================================================== */

window.MarginaliaBooksCloud = (() => {
  if (!window.MarginaliaAuth?.enabled) {
    return {
      enabled: false,
      async setBookCover() {
        throw new Error('Firebase auth is not enabled.');
      },
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
    const collectionRef = booksCollectionRef();
    state.unsubscribe = collectionRef.onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const bookId = change.doc.id;
        const data = change.doc.data() || {};
        if (change.type === 'removed') {
          applyBookOverride(bookId, {});
          return;
        }
        applyBookOverride(bookId, data);
      });
      window.dispatchEvent(new CustomEvent('marginalia:books-overrides-changed'));
    }, (error) => {
      console.warn('[books-sync] Snapshot failed.', error);
    });
  }

  async function setBookCover({ bookId, imageUrl, storagePath }) {
    if (!state.uid) throw new Error('User is not signed in.');
    if (!bookId || !imageUrl) throw new Error('bookId and imageUrl are required.');
    const docRef = booksCollectionRef().doc(bookId);
    await docRef.set({
      cover: {
        image: imageUrl,
        storagePath: storagePath || '',
      },
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
      const item = (window.BOOK_DETAILS || []).find((book) => book.id === bookId);
      if (item) {
        if (!item.cover) item.cover = {};
        item.cover.image = data.cover.image;
      }
    }
  }

  function booksCollectionRef() {
    return window.MarginaliaAuth.db
      .collection('workspaces')
      .doc(state.workspaceId)
      .collection('users')
      .doc(state.uid)
      .collection('books');
  }

  function detachListener() {
    if (typeof state.unsubscribe === 'function') {
      state.unsubscribe();
      state.unsubscribe = null;
    }
  }

  return {
    get enabled() { return state.enabled; },
    setBookCover,
  };
})();
