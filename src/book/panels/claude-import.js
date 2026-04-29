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
    if (window.NotesStore.getVisualNotes) return;

    const _mem = {};

    Object.assign(window.NotesStore, {
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
    const auth = window.MarginaliaAuth;
    if (!auth?.user || !auth?.db) return;
    const workspaceId = window.MARGINALIA_FIREBASE?.workspaceId || 'default';
    auth.db
      .collection('workspaces').doc(workspaceId)
      .collection('users').doc(auth.user.uid)
      .collection('books').doc(bookId)
      .collection('visualNotes').doc(note.id)
      .set({ title: note.title, content: note.content, createdAt: note.createdAt },
           { merge: true })
      .catch(() => {});
  }

  /* ── Panel render ─────────────────────────────────────────────────────── */
  window.PanelRegistry.set('claude-import', async function renderVisualNotes(book, container) {
    ensureVisualNotesStore();
    await window.NotesStore.ready?.();

    const bookId = book.id;
    let notes = await window.NotesStore.getVisualNotes(bookId);
    let activeId = notes[0]?.id || null;

    function render() {
      container.innerHTML = buildHTML(notes, activeId);
      bindEvents();
    }

    function buildHTML(notes, activeId) {
      return `
        <section class="vn-panel">
          <div class="vn-head">
            <h2>Visual Notes</h2>
            <label class="vn-upload-btn" title="Import HTML file">
              + Import
              <input type="file" accept=".html,text/html" class="vn-file-input" hidden multiple>
            </label>
          </div>

          ${notes.length === 0 ? `
            <div class="vn-empty">
              <p>Import any HTML visual note — Claude Chat exports, mind maps, diagrams.</p>
              <label class="vn-upload-btn vn-upload-btn--large">
                Choose file
                <input type="file" accept=".html,text/html" class="vn-file-input" hidden multiple>
              </label>
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
          await window.NotesStore.deleteVisualNote(bookId, id);
          notes = await window.NotesStore.getVisualNotes(bookId);
          activeId = notes[0]?.id || null;
          render();
        });
      });

      // File import
      container.querySelectorAll('.vn-file-input').forEach(input => {
        input.addEventListener('change', () => handleFiles(input.files));
      });

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
        await window.NotesStore.saveVisualNote(bookId, note);
      }
      notes = await window.NotesStore.getVisualNotes(bookId);
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
  });

  function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]);
  }

})();
