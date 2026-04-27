/* ==========================================================================
   Marginalia · Firebase Storage service
   --------------------------------------------------------------------------
   Stores user-owned assets under:
   workspaces/{workspaceId}/users/{uid}/...
   ========================================================================== */

window.MarginaliaStorage = (() => {
  function isEnabled() {
    return Boolean(window.MarginaliaAuth?.enabled && window.MarginaliaAuth?.storage);
  }

  async function uploadCoverImage({ file, bookId }) {
    requireAuth();
    const uid = getUid();
    const workspaceId = getWorkspaceId();
    const ext = guessExtension(file);
    const safeBookId = sanitizeSegment(bookId || 'book');
    const fileName = `${Date.now()}-${randomId(6)}.${ext}`;
    const path = `workspaces/${workspaceId}/users/${uid}/covers/${safeBookId}/${fileName}`;
    return uploadFile({ file, path, contentType: file?.type || 'image/jpeg' });
  }

  async function uploadNoteAttachment({ file, bookId, noteId }) {
    requireAuth();
    const uid = getUid();
    const workspaceId = getWorkspaceId();
    const ext = guessExtension(file);
    const safeBookId = sanitizeSegment(bookId || 'book');
    const safeNoteId = sanitizeSegment(noteId || 'note');
    const fileName = `${Date.now()}-${randomId(6)}.${ext}`;
    const path = `workspaces/${workspaceId}/users/${uid}/notes/${safeBookId}/${safeNoteId}/${fileName}`;
    return uploadFile({ file, path, contentType: file?.type || 'application/octet-stream' });
  }

  async function uploadFile({ file, path, contentType }) {
    if (!(file instanceof Blob)) throw new Error('file must be a Blob/File.');
    const storage = window.MarginaliaAuth.storage;
    const ref = storage.ref().child(path);
    await ref.put(file, {
      contentType,
      customMetadata: {
        workspaceId: getWorkspaceId(),
        uid: getUid(),
      },
    });
    const downloadURL = await ref.getDownloadURL();
    return {
      path,
      downloadURL,
      contentType,
      size: file.size || 0,
    };
  }

  function requireAuth() {
    if (!isEnabled()) throw new Error('Storage is not enabled.');
    if (!window.MarginaliaAuth?.user?.uid) throw new Error('User must be signed in.');
  }

  function getUid() {
    return window.MarginaliaAuth.user.uid;
  }

  function getWorkspaceId() {
    return window.MARGINALIA_FIREBASE?.workspaceId || 'default';
  }

  function sanitizeSegment(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item';
  }

  function guessExtension(file) {
    const mime = String(file?.type || '').toLowerCase();
    if (mime.includes('png')) return 'png';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('gif')) return 'gif';
    if (mime.includes('svg')) return 'svg';
    if (mime.includes('pdf')) return 'pdf';
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
    const name = String(file?.name || '');
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    return ext || 'bin';
  }

  function randomId(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < length; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  return {
    isEnabled,
    uploadCoverImage,
    uploadNoteAttachment,
  };
})();
