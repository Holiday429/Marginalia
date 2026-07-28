import { doc, setDoc } from 'firebase/firestore';
import { validateWrite, withMeta } from '../../services/db.ts';
import { BookNoteSchema } from '../../data/schema/book-note.ts';
import { MarginaliaAuth } from '../../firebase/auth.ts';
import { MARGINALIA_FIREBASE } from '../../firebase/config.ts';
import { PanelRegistry } from './registry.ts';
import { NotesStore } from '../../store/notes-store.ts';

/* ==========================================================================
   Marginalia · Notes panel
   --------------------------------------------------------------------------
   Per-book free-form note editor. Autosaves to NotesStore (IndexedDB) with
   a 600ms debounce. Syncs to Firebase when the user is signed in.
   Registered into PanelRegistry so book.js picks it up automatically.
   ========================================================================== */

(function registerNotesPanel() {
  PanelRegistry.set('notes', function renderNotes(book, container) {
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
      await NotesStore?.ready?.();
      const record = await NotesStore?.getNote(bookId);
      if (record?.content) {
        editor.innerHTML = record.content;
      }
      setStatus('');
    }

    async function save() {
      const content = editor.innerHTML;
      try {
        await NotesStore?.saveNote(bookId, content);
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
    const auth = MarginaliaAuth;
    if (!auth?.user || !auth?.db) return;
    const workspaceId = MARGINALIA_FIREBASE?.workspaceId || 'default';
    try {
      const payload = withMeta(validateWrite(BookNoteSchema, { content }));
      const docRef = doc(
        auth.db,
        'workspaces', workspaceId,
        'users', auth.user.uid,
        'books', bookId,
        'notes', 'main',
      );
      setDoc(docRef, payload, { merge: true }).catch(() => {});
    } catch {
      // Validation failure is surfaced in dev via the thrown error; silently skip in prod.
    }
  }
})();
