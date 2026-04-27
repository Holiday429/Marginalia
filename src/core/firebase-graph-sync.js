/* ==========================================================================
   Marginalia · Firebase graph sync
   --------------------------------------------------------------------------
   Syncs bookConceptLink status overrides per logged-in user.
   Path:
   workspaces/{workspaceId}/users/{uid}/graph/linkStatus
   ========================================================================== */

(function initFirebaseGraphSync() {
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
    }, (error) => {
      console.warn('[graph-sync] Snapshot listener failed.', error);
    });
  });

  function getLinkStatusDocRef(uid) {
    const workspaceId = window.MARGINALIA_FIREBASE?.workspaceId || 'default';
    return window.MarginaliaAuth.db
      .collection('workspaces')
      .doc(workspaceId)
      .collection('users')
      .doc(uid)
      .collection('graph')
      .doc('linkStatus');
  }

  function detachSnapshot() {
    if (typeof unsubscribeDoc === 'function') {
      unsubscribeDoc();
      unsubscribeDoc = null;
    }
  }
})();
