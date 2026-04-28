/* ==========================================================================
   Marginalia · Notes panel
   --------------------------------------------------------------------------
   Per-book free-form note editor. Autosaves to NotesStore (IndexedDB) with
   a 600ms debounce. Syncs to Firebase when the user is signed in.
   Registered into PanelRegistry so book.js picks it up automatically.
   ========================================================================== */

(function registerNotesPanel() {
  window.PanelRegistry.set('notes', function renderNotes(book, container) {
    container.innerHTML = `
      <section class="notes-panel">
        <div class="notes-panel-head">
          <h2>Notes</h2>
          <span class="notes-save-status" data-notes-status></span>
        </div>
        <div
          class="notes-editor"
          data-notes-editor
          contenteditable="true"
          spellcheck="true"
          placeholder="Start writing your notes…"
          aria-label="Book notes editor"
        ></div>
      </section>
    `;

    const editor    = container.querySelector('[data-notes-editor]');
    const statusEl  = container.querySelector('[data-notes-status]');
    const bookId    = book.id;
    let debounceTimer = null;

    function setStatus(text) {
      if (!statusEl) return;
      statusEl.textContent = text;
    }

    async function load() {
      await window.NotesStore?.ready?.();
      const record = await window.NotesStore?.getNote(bookId);
      if (record?.content) {
        editor.innerHTML = record.content;
      }
      setStatus('');
    }

    async function save() {
      const content = editor.innerHTML;
      try {
        await window.NotesStore?.saveNote(bookId, content);
        setStatus('Saved');
        // Firebase sync if signed in
        syncToFirebase(bookId, content);
      } catch {
        setStatus('Save failed');
      }
    }

    editor.addEventListener('input', () => {
      setStatus('Saving…');
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(save, 600);
    });

    // Basic formatting toolbar support via keyboard
    editor.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        document.execCommand('bold');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        e.preventDefault();
        document.execCommand('italic');
      }
    });

    load();
  });

  function syncToFirebase(bookId, content) {
    const auth = window.MarginaliaAuth;
    if (!auth?.user || !auth?.db) return;
    const workspaceId = window.MARGINALIA_FIREBASE?.workspaceId || 'default';
    auth.db
      .collection('workspaces').doc(workspaceId)
      .collection('users').doc(auth.user.uid)
      .collection('books').doc(bookId)
      .collection('notes').doc('main')
      .set({ content, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
      .catch(() => {});
  }
})();
