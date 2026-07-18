/* ==========================================================================
   Marginalia · Visual Notes import panel (4C)
   --------------------------------------------------------------------------
   Accepts any HTML file (Claude Chat exports, Miro, Mermaid, etc.).
   Renders each file in a sandboxed iframe with injected CSS that fixes
   common truncation issues (fixed widths, overflow:hidden, chat max-widths).
   Multiple imports are stored per book and shown as tabs.

   Storage:
     IndexedDB: NotesStore.getVisualNotes(bookId) / saveVisualNote / deleteVisualNote
     Firebase:  users/{uid}/books/{bookId}/visualNotes/{id}  (content as string)
   ========================================================================== */

import { doc, setDoc } from 'firebase/firestore';
import { MarginaliaAuth } from '../../firebase/auth.ts';
import { MARGINALIA_FIREBASE } from '../../firebase/config.ts';
import { PanelRegistry } from './registry.js';
import { NotesStore } from '../../store/notes-store.js';

(function registerVisualNotesPanel() {

  /* ── CSS injected into every iframe to fix truncation ─────────────────── */
  const IFRAME_FIX_CSS = `
    <style id="__marginalia-fix">
      html, body {
        width: auto !important;
        max-width: none !important;
        min-width: 0 !important;
        overflow-x: auto !important;
        box-sizing: border-box;
      }
      /* Common chat-wrapper selectors that cap width */
      .container, .wrapper, .content, .main, [class*="chat"],
      [class*="message"], [class*="response"], [class*="output"] {
        max-width: none !important;
        width: auto !important;
      }
      /* SVG / canvas should never be clipped */
      svg, canvas { overflow: visible !important; }
    </style>
  `;

  /* ── Extend NotesStore with visualNotes if not already present ─────────── */
  function ensureVisualNotesStore() {
    if (NotesStore.getVisualNotes) return;

    const _mem = {};

    Object.assign(NotesStore, {
      async getVisualNotes(bookId) {
        return _mem[bookId] || [];
      },
      async saveVisualNote(bookId, note) {
        if (!_mem[bookId]) _mem[bookId] = [];
        const existing = _mem[bookId].findIndex(n => n.id === note.id);
        if (existing >= 0) _mem[bookId][existing] = note;
        else _mem[bookId].push(note);
        syncVisualNoteToFirebase(bookId, note);
      },
      async deleteVisualNote(bookId, noteId) {
        if (_mem[bookId]) _mem[bookId] = _mem[bookId].filter(n => n.id !== noteId);
      },
    });
  }

  function syncVisualNoteToFirebase(bookId, note) {
    const auth = MarginaliaAuth;
    if (!auth?.user || !auth?.db) return;
    const workspaceId = MARGINALIA_FIREBASE?.workspaceId || 'default';
    const docRef = doc(
      auth.db,
      'workspaces', workspaceId,
      'users', auth.user.uid,
      'books', bookId,
      'visualNotes', note.id,
    );
    setDoc(docRef, { title: note.title, content: note.content, createdAt: note.createdAt }, { merge: true })
      .catch(() => {});
  }

  /* ── Panel render ─────────────────────────────────────────────────────── */
  async function renderVisualNotes(book, container) {
    ensureVisualNotesStore();
    await NotesStore.ready?.();

    const bookId = book.id;
    let notes = await NotesStore.getVisualNotes(bookId);
    let activeId = notes[0]?.id || null;

    function render() {
      container.innerHTML = buildHTML(notes, activeId);
      bindEvents();
    }

    function buildHTML(notes, activeId) {
      return `
        <section class="vn-panel">
          ${notes.length === 0 ? `
            <div class="vn-empty">
              <p>No visual notes imported yet. Use the Import button above.</p>
            </div>
          ` : `
            <div class="vn-tabs">
              ${notes.map(n => `
                <button class="vn-tab${n.id === activeId ? ' is-active' : ''}" data-vn-tab="${esc(n.id)}">
                  ${esc(n.title)}
                  <span class="vn-tab-delete" data-vn-delete="${esc(n.id)}" title="Remove">×</span>
                </button>
              `).join('')}
            </div>
            <div class="vn-frame-wrap">
              ${notes.map(n => `
                <div class="vn-frame-slot${n.id === activeId ? ' is-active' : ''}" data-vn-slot="${esc(n.id)}">
                  <iframe
                    class="vn-iframe"
                    sandbox="allow-scripts allow-same-origin"
                    title="${esc(n.title)}"
                    data-vn-iframe="${esc(n.id)}"
                  ></iframe>
                </div>
              `).join('')}
            </div>
          `}
        </section>
      `;
    }

    function bindEvents() {
      // Tab switching
      container.querySelectorAll('[data-vn-tab]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          if (e.target.closest('[data-vn-delete]')) return;
          activeId = btn.dataset.vnTab;
          container.querySelectorAll('.vn-tab').forEach(b => b.classList.toggle('is-active', b.dataset.vnTab === activeId));
          container.querySelectorAll('.vn-frame-slot').forEach(s => s.classList.toggle('is-active', s.dataset.vnSlot === activeId));
        });
      });

      // Delete
      container.querySelectorAll('[data-vn-delete]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.vnDelete;
          await NotesStore.deleteVisualNote(bookId, id);
          notes = await NotesStore.getVisualNotes(bookId);
          activeId = notes[0]?.id || null;
          render();
        });
      });

      // File import (button in visual-notes section header)
      const sectionRoot = container.closest('.book-section') || container.parentElement;
      if (sectionRoot) {
        sectionRoot.querySelectorAll('.vn-file-input').forEach((input) => {
          if (input.dataset.vnBound === '1') return;
          input.dataset.vnBound = '1';
          input.addEventListener('change', async () => {
            await handleFiles(input.files);
            input.value = '';
          });
        });
      }

      // Write content into iframes after DOM is ready
      container.querySelectorAll('[data-vn-iframe]').forEach(iframe => {
        const id = iframe.dataset.vnIframe;
        const note = notes.find(n => n.id === id);
        if (note) writeIframe(iframe, note.content);
      });
    }

    async function handleFiles(files) {
      for (const file of Array.from(files)) {
        const raw = await file.text();
        const note = {
          id: `vn-${bookId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: file.name.replace(/\.html?$/i, ''),
          content: injectFix(raw),
          createdAt: Date.now(),
        };
        await NotesStore.saveVisualNote(bookId, note);
      }
      notes = await NotesStore.getVisualNotes(bookId);
      activeId = notes[notes.length - 1]?.id || null;
      render();
    }

    function injectFix(html) {
      // Inject fix CSS right after <head> or at the very top
      if (/<head[^>]*>/i.test(html)) {
        return html.replace(/(<head[^>]*>)/i, `$1\n${IFRAME_FIX_CSS}`);
      }
      return IFRAME_FIX_CSS + html;
    }

    function writeIframe(iframe, html) {
      // Use srcdoc when possible, fall back to document.write
      try {
        iframe.srcdoc = html;
      } catch {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) { doc.open(); doc.write(html); doc.close(); }
      }

      // Auto-resize iframe to fit content height
      iframe.addEventListener('load', () => {
        try {
          const body = iframe.contentDocument?.body;
          if (body) {
            const h = Math.max(400, body.scrollHeight + 32);
            iframe.style.height = h + 'px';
          }
        } catch {}
      });
    }

    render();
  }

  PanelRegistry.set('visual-notes', renderVisualNotes);
  PanelRegistry.set('claude-import', renderVisualNotes);

  function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]);
  }

})();
