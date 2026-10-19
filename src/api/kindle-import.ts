/* ==========================================================================
   Marginalia · Kindle My Clippings parser
   --------------------------------------------------------------------------
   Parses the "My Clippings.txt" file exported from a Kindle device.

   Public surface:
     KindleImport.parse(text)           → { books: Map<title, clipping[]> }
     KindleImport.importToBook(bookId, clippings) → Promise<number>  (count saved)
     KindleImport.mountUI(containerEl)  — renders a drag-drop zone
   ========================================================================== */

import { NotesStore } from '../store/notes-store.ts';
import { track } from '../services/events.ts';
import { parseClippingsRaw, type KindleBookEntry, type KindleClipping } from './import/kindle.ts';

type Clipping = KindleClipping;
type BookEntry = KindleBookEntry;

export const KindleImport = (() => {
  // ── Parser ───────────────────────────────────────────────────────────────

  function parse(text: string): { books: Map<string, BookEntry> } {
    return { books: parseClippingsRaw(text) };
  }

  // ── Import ───────────────────────────────────────────────────────────────

  async function importToBook(bookId: string, clippings: Clipping[]): Promise<number> {
    if (!NotesStore) throw new Error('NotesStore not available');
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
    await NotesStore.importHighlights(bookId, highlights);
    track('import_completed', { source: 'kindle', books: 1, highlights: highlights.length });
    track('highlight_saved', { source: 'import', bookId, count: highlights.length });
    return highlights.length;
  }

  function hashStr(str: string): string {
    let h = 0;
    for (let i = 0; i < Math.min(str.length, 40); i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36);
  }

  // ── UI ───────────────────────────────────────────────────────────────────

  function mountUI(container: HTMLElement): void {
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

    const zone   = container.querySelector('#kindleDropZone') as HTMLElement;
    const input  = container.querySelector('#kindleFileInput') as HTMLInputElement;
    const status = container.querySelector('#kindleStatus') as HTMLElement;
    const preview = container.querySelector('#kindlePreview') as HTMLElement;

    function handleFile(file: File | null | undefined): void {
      if (!file || !file.name.endsWith('.txt')) {
        showStatus('Please select a .txt file from your Kindle.', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = e => processText(e.target?.result as string);
      reader.readAsText(file, 'utf-8');
    }

    function processText(text: string): void {
      const { books } = parse(text);
      if (!books.size) { showStatus('No clippings found in this file.', 'error'); return; }
      showPreview(books);
    }

    function showPreview(books: Map<string, BookEntry>): void {
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
          const title = (btn as HTMLElement).dataset.title;
          const entry = title ? books.get(title) : undefined;
          if (!entry) return;
          (btn as HTMLButtonElement).disabled = true;
          btn.textContent = 'Importing…';
          const count = await importToBook(bookId, entry.clippings);
          btn.textContent = `✓ ${count} imported`;
          container.dispatchEvent(new CustomEvent('kindle:imported', { bubbles: true, detail: { bookId, count } }));
        });
      });
    }

    function showStatus(msg: string, type: 'info' | 'error' = 'info'): void {
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
      handleFile((e as DragEvent).dataTransfer?.files[0]);
    });
    input.addEventListener('change', () => handleFile(input.files?.[0]));
  }

  function esc(s: unknown): string {
    return String(s ?? '').replace(/[&<>"]/g, c => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }) as Record<string, string>)[c]);
  }

  return { parse, importToBook, mountUI };
})();
