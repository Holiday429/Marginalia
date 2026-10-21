/* Marginalia · import dialog (plan 2.5): choose a source and a file (or paste), preview what would
   happen, confirm, import. One dialog for every source. Opened from the Search page. */

import './import.css';
import { MarginaliaAuth } from '../../firebase/auth.ts';
import { logError } from '../../services/analytics.ts';
import { detectSource, parseImport } from './detect.ts';
import { planFor, runImport, type ImportOutcome } from './run.ts';
import { IMPORT_SOURCE_LABEL, type ImportSource, type ParseResult } from './types.ts';
import type { ImportPlan } from './plan.ts';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

const HELP: Record<ImportSource | 'auto', string> = {
  auto: 'Choose a file from Goodreads, StoryGraph, Readwise or Kindle, or paste notes from WeChat Read. The format is detected for you.',
  goodreads: 'Export your library from Goodreads (My Books, then Import and export) and choose the CSV file. It brings books, shelves, ratings and dates.',
  storygraph: 'Export your library from StoryGraph (Manage account, then Manage your data) and choose the CSV file.',
  readwise: 'Export your highlights from Readwise as CSV and choose the file. Highlights and your notes are brought in.',
  weread: 'In WeChat Read, open the notes of a book and copy all of them, then paste the text below. Chapters and your own thoughts are kept.',
  kindle: 'Choose "My Clippings.txt" from your Kindle. Highlights and notes are brought in; bookmarks are skipped.',
};

const ACTION_LABEL = { create: 'New', merge: 'Add highlights', skip: 'Already in your library' } as const;

let dialog: HTMLElement | null = null;
let backdrop: HTMLElement | null = null;

export function closeImportDialog(): void {
  dialog?.remove();
  backdrop?.remove();
  dialog = null;
  backdrop = null;
}

export function openImportDialog(): void {
  if (dialog) return;
  backdrop = document.createElement('div');
  backdrop.className = 'imp-backdrop';
  dialog = document.createElement('section');
  dialog.className = 'imp-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Import your reading');
  document.body.append(backdrop, dialog);

  let parsed: ParseResult | null = null;
  let plan: ImportPlan | null = null;
  const included = new Set<number>();

  const shell = (body: string) => {
    dialog!.innerHTML = `
      <header class="imp-head"><h2 class="imp-title">Import your reading</h2><button type="button" class="btn btn--icon btn--sm imp-close" data-imp-close aria-label="Close">×</button></header>
      ${body}`;
  };

  const renderChoose = (message = '', source: ImportSource | 'auto' = 'auto', pasted = '') => {
    const signedIn = Boolean(MarginaliaAuth?.user);
    shell(`
      ${signedIn ? '' : '<p class="imp-note" role="status">Sign in to import into your library.</p>'}
      <label class="imp-label" for="impSource">Where is it from?</label>
      <select class="imp-select" id="impSource" data-imp-source>
        <option value="auto"${source === 'auto' ? ' selected' : ''}>Detect automatically</option>
        ${(Object.keys(IMPORT_SOURCE_LABEL) as ImportSource[]).map((s) => `<option value="${s}"${source === s ? ' selected' : ''}>${esc(IMPORT_SOURCE_LABEL[s])}</option>`).join('')}
      </select>
      <p class="imp-help" data-imp-help>${esc(HELP[source])}</p>
      <label class="imp-label" for="impFile">File</label>
      <input class="imp-file" id="impFile" type="file" accept=".csv,.txt,text/csv,text/plain" data-imp-file>
      <label class="imp-label" for="impPaste">Or paste text</label>
      <textarea class="imp-paste" id="impPaste" rows="5" placeholder="Paste exported notes here" data-imp-paste>${esc(pasted)}</textarea>
      <p class="imp-error" role="alert" data-imp-error ${message ? '' : 'hidden'}>${esc(message)}</p>
      <footer class="imp-foot"><span></span><button type="button" class="btn btn--primary imp-primary" data-imp-preview ${signedIn ? '' : 'disabled'}>Preview</button></footer>`);
  };

  const renderPreview = () => {
    if (!parsed || !plan) return;
    const t = plan.totals;
    const chosen = plan.entries.filter((e) => included.has(e.index) && e.action !== 'skip');
    const rows = plan.entries.map((e) => `
      <li class="imp-row${e.action === 'skip' ? ' is-skip' : ''}">
        <label>
          <input type="checkbox" data-imp-include="${e.index}" ${included.has(e.index) ? 'checked' : ''} ${e.action === 'skip' ? 'disabled' : ''}>
          <span class="imp-row__title">${esc(e.book.title)}</span>
          <span class="imp-row__author">${esc(e.book.author)}</span>
          <span class="imp-row__state imp-row__state--${e.action}">${esc(ACTION_LABEL[e.action])}${e.action !== 'skip' && e.newHighlights.length ? ` · ${e.newHighlights.length} highlights` : ''}</span>
        </label>
      </li>`).join('');
    shell(`
      <p class="imp-summary" data-imp-summary>${esc(IMPORT_SOURCE_LABEL[parsed.source])}: ${t.books} books. ${t.create} new, ${t.merge} get more highlights, ${t.skip} already in your library. ${t.newHighlights} new highlights${t.duplicateHighlights ? `, ${t.duplicateHighlights} already there` : ''}.</p>
      ${parsed.warnings.length ? `<details class="imp-warnings"><summary>${parsed.warnings.length} notes about this file</summary><ul>${parsed.warnings.slice(0, 50).map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
      <ul class="imp-list" data-imp-list>${rows}</ul>
      <footer class="imp-foot">
        <button type="button" class="btn imp-secondary" data-imp-back>Back</button>
        <button type="button" class="btn btn--primary imp-primary" data-imp-confirm ${chosen.length ? '' : 'disabled'}>${chosen.length ? `Import ${chosen.length} ${chosen.length === 1 ? 'book' : 'books'}` : 'Nothing to import'}</button>
      </footer>`);
  };

  const renderProgress = (done: number, total: number) => {
    shell(`<p class="imp-summary" role="status" data-imp-progress>Importing… ${done} of ${total}</p><progress class="imp-bar" max="${Math.max(1, total)}" value="${done}"></progress>`);
  };

  const renderDone = (o: ImportOutcome) => {
    shell(`
      <p class="imp-summary" role="status" data-imp-done>Done. ${o.createdBookIds.length} new ${o.createdBookIds.length === 1 ? 'book' : 'books'}${o.mergedBooks ? `, ${o.mergedBooks} existing ${o.mergedBooks === 1 ? 'book' : 'books'} with new highlights` : ''}, ${o.highlights} highlights.</p>
      <footer class="imp-foot"><span></span><button type="button" class="btn btn--primary imp-primary" data-imp-close>Close</button></footer>`);
  };

  const readFile = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });

  dialog.addEventListener('change', (event) => {
    const target = event.target as HTMLElement;
    if (target.matches('[data-imp-source]')) {
      const help = dialog!.querySelector('[data-imp-help]');
      if (help) help.textContent = HELP[(target as HTMLSelectElement).value as ImportSource | 'auto'];
    }
    if (target.matches('[data-imp-include]')) {
      const i = Number((target as HTMLInputElement).dataset.impInclude);
      if ((target as HTMLInputElement).checked) included.add(i); else included.delete(i);
      renderPreviewKeepScroll();
    }
  });

  const renderPreviewKeepScroll = () => {
    const list = dialog!.querySelector<HTMLElement>('[data-imp-list]');
    const top = list?.scrollTop ?? 0;
    renderPreview();
    const next = dialog!.querySelector<HTMLElement>('[data-imp-list]');
    if (next) next.scrollTop = top;
  };

  dialog.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-imp-close]')) { closeImportDialog(); return; }
    if (target.closest('[data-imp-back]')) { renderChoose(); return; }

    if (target.closest('[data-imp-preview]')) {
      const select = dialog!.querySelector<HTMLSelectElement>('[data-imp-source]')!;
      const fileInput = dialog!.querySelector<HTMLInputElement>('[data-imp-file]')!;
      const pasteBox = dialog!.querySelector<HTMLTextAreaElement>('[data-imp-paste]')!;
      const chosen = select.value as ImportSource | 'auto';
      let text = pasteBox.value;
      try {
        if (fileInput.files?.[0]) text = await readFile(fileInput.files[0]);
      } catch (err) {
        logError(err, { context: 'import read file' });
        renderChoose('The file could not be read.', chosen);
        return;
      }
      if (!text.trim()) { renderChoose('Choose a file or paste some text first.', chosen); return; }
      parsed = parseImport(text, chosen === 'auto' ? undefined : chosen);
      if (!parsed.books.length) {
        renderChoose(parsed.warnings[0] ?? 'Nothing to import was found in this file.', chosen, pasteBox.value);
        return;
      }
      plan = planFor(parsed);
      included.clear();
      plan.entries.forEach((e) => { if (e.action !== 'skip') included.add(e.index); });
      renderPreview();
      return;
    }

    if (target.closest('[data-imp-confirm]') && parsed && plan) {
      const entries = plan.entries.filter((e) => included.has(e.index));
      renderProgress(0, entries.filter((e) => e.action !== 'skip').length);
      try {
        const outcome = await runImport(parsed.source, entries, (done, total) => renderProgress(done, total));
        renderDone(outcome);
      } catch (err) {
        logError(err, { context: 'import run' });
        renderChoose('The import did not finish. Nothing is lost; try again, and already imported books will not be duplicated.');
      }
    }
  });
  dialog.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeImportDialog(); });
  backdrop.addEventListener('click', closeImportDialog);
  renderChoose();
  dialog.querySelector<HTMLElement>('[data-imp-source]')?.focus();
}

export { detectSource };
