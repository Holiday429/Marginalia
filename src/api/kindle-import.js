/* ==========================================================================
   Marginalia · Kindle My Clippings parser
   --------------------------------------------------------------------------
   Parses the "My Clippings.txt" file exported from a Kindle device.

   Public surface:
     KindleImport.parse(text)           → { books: Map<title, clipping[]> }
     KindleImport.importToBook(bookId, clippings) → Promise<number>  (count saved)
     KindleImport.mountUI(containerEl)  — renders a drag-drop zone
   ========================================================================== */

window.KindleImport = (() => {
  const SEPARATOR = '==========';

  // ── Parser ───────────────────────────────────────────────────────────────

  function parse(text) {
    const entries = text.split(SEPARATOR).map(s => s.trim()).filter(Boolean);
    const books = new Map();

    for (const entry of entries) {
      const lines = entry.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) continue;

      const titleLine  = lines[0];
      const metaLine   = lines[1];  // e.g. "- Your Highlight on page 12 | location 123-125 | Added on ..."
      const quoteLines = lines.slice(2);
      const quote      = quoteLines.join(' ').trim();
      if (!quote) continue;

      const { title, author } = parseTitleLine(titleLine);
      const { page, location, kind } = parseMetaLine(metaLine);
      const clipping = { quote, page, location, kind, source: 'kindle' };

      if (!books.has(title)) books.set(title, { title, author, clippings: [] });
      books.get(title).clippings.push(clipping);
    }

    return { books };
  }

  function parseTitleLine(line) {
    // Format: "Title (Author Name)" or "Title - Author Name"
    const parenMatch = line.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (parenMatch) return { title: parenMatch[1].trim(), author: parenMatch[2].trim() };
    const dashMatch  = line.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if (dashMatch)  return { title: dashMatch[1].trim(),  author: dashMatch[2].trim() };
    return { title: line.trim(), author: '' };
  }

  function parseMetaLine(line) {
    const pageMatch = line.match(/page\s+(\d+)/i);
    const locMatch  = line.match(/location\s+([\d-]+)/i);
    const isNote    = /your note/i.test(line);
    const isBookmark = /your bookmark/i.test(line);
    return {
      page:     pageMatch  ? parseInt(pageMatch[1])  : null,
      location: locMatch   ? locMatch[1]             : null,
      kind:     isNote ? 'note' : isBookmark ? 'bookmark' : 'highlight',
    };
  }

  // ── Import ───────────────────────────────────────────────────────────────

  async function importToBook(bookId, clippings) {
    if (!window.NotesStore) throw new Error('NotesStore not available');
    const highlights = clippings
      .filter(c => c.kind !== 'bookmark' && c.quote)
      .map(c => ({
        id:       `kindle-${bookId}-${c.location || c.page || ''}-${hashStr(c.quote)}`,
        quote:    c.quote,
        page:     c.page,
        chapter:  c.location ? `loc. ${c.location}` : null,
        kind:     c.kind === 'note' ? 'concept' : null,
        source:   'kindle',
      }));
    await window.NotesStore.importHighlights(bookId, highlights);
    return highlights.length;
  }

  function hashStr(str) {
    let h = 0;
    for (let i = 0; i < Math.min(str.length, 40); i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36);
  }

  // ── UI ───────────────────────────────────────────────────────────────────

  function mountUI(container) {
    container.innerHTML = `
      <div class="kindle-import-zone" id="kindleDropZone">
        <div class="kindle-import-icon">📖</div>
        <div class="kindle-import-label">Drop <code>My Clippings.txt</code> here</div>
        <div class="kindle-import-sub">or <label class="kindle-import-browse" for="kindleFileInput">browse</label></div>
        <input type="file" id="kindleFileInput" accept=".txt" hidden>
      </div>
      <div class="kindle-import-status" id="kindleStatus" hidden></div>
      <div class="kindle-import-preview" id="kindlePreview" hidden></div>
    `;

    const zone   = container.querySelector('#kindleDropZone');
    const input  = container.querySelector('#kindleFileInput');
    const status = container.querySelector('#kindleStatus');
    const preview = container.querySelector('#kindlePreview');

    function handleFile(file) {
      if (!file || !file.name.endsWith('.txt')) {
        showStatus('Please select a .txt file from your Kindle.', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = e => processText(e.target.result);
      reader.readAsText(file, 'utf-8');
    }

    function processText(text) {
      const { books } = parse(text);
      if (!books.size) { showStatus('No clippings found in this file.', 'error'); return; }
      showPreview(books);
    }

    function showPreview(books) {
      status.hidden = true;
      preview.hidden = false;
      const bookId = container.dataset.bookId || '';

      let html = `<div class="kindle-preview-head">${books.size} book${books.size > 1 ? 's' : ''} found</div>`;
      books.forEach(({ title, author, clippings }) => {
        const highlights = clippings.filter(c => c.kind !== 'bookmark');
        html += `
          <div class="kindle-preview-book">
            <div class="kindle-preview-title">${esc(title)}</div>
            <div class="kindle-preview-meta">${esc(author)} · ${highlights.length} highlights</div>
            ${bookId ? `<button class="kindle-preview-import" type="button" data-title="${esc(title)}">Import into this book</button>` : ''}
          </div>`;
      });
      preview.innerHTML = html;

      preview.querySelectorAll('.kindle-preview-import').forEach(btn => {
        btn.addEventListener('click', async () => {
          const title = btn.dataset.title;
          const entry = books.get(title);
          if (!entry) return;
          btn.disabled = true;
          btn.textContent = 'Importing…';
          const count = await importToBook(bookId, entry.clippings);
          btn.textContent = `✓ ${count} imported`;
          container.dispatchEvent(new CustomEvent('kindle:imported', { bubbles: true, detail: { bookId, count } }));
        });
      });
    }

    function showStatus(msg, type = 'info') {
      preview.hidden = true;
      status.hidden = false;
      status.className = `kindle-import-status kindle-status--${type}`;
      status.textContent = msg;
    }

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('is-over'); });
    zone.addEventListener('dragleave', ()  => zone.classList.remove('is-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('is-over');
      handleFile(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', () => handleFile(input.files[0]));
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  }

  return { parse, importToBook, mountUI };
})();
