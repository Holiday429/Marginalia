/* Marginalia · finish ritual (plan 2.3)
   When a book moves into "finished", a three-question dialog asks what shifted, what the reader will do
   and what comes next, then an AI finish card is written from the answers and the reader's highlights.
   Skippable at any step. Whatever happens (skip, answers, failure) is recorded in moments/{bookId}, so
   marking the same book finished again never asks again; the Notes tab offers a manual way back in.
*/

import './finish-ritual.css';
import { BooksStore } from '../../store/books-store.ts';
import { MomentsStore } from '../../store/moments-store.ts';
import { generateFinishCard } from '../../ai/features/finish-synthesis-service.ts';
import { PanelManager } from '../../core/panel-manager.ts';
import { MarginaliaAuth } from '../../firebase/auth.ts';
import { logError } from '../../services/analytics.ts';
import type { FinishAnswers } from '../../data/schema/moment.ts';

const QUESTIONS: ReadonlyArray<{ key: keyof FinishAnswers; text: string; hint: string }> = [
  { key: 'belief', text: 'What shifted or surprised you?', hint: 'An idea you now see differently, or one that caught you off guard.' },
  { key: 'intention', text: 'What will you actually do because of this book?', hint: 'One small thing is enough.' },
  { key: 'next', text: 'What do you want to read next, and why?', hint: 'A title, a topic, or a feeling you want more of.' },
];

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

let dialog: HTMLElement | null = null;
let backdrop: HTMLElement | null = null;

function close(): void {
  dialog?.remove();
  backdrop?.remove();
  dialog = null;
  backdrop = null;
}

function openNotes(bookId: string): void {
  close();
  PanelManager.open('book', { id: bookId, tab: 'notes' });
}

/** Opens the dialog for a book. `force` reopens it even when a record already exists (the Notes tab button). */
export async function openFinishRitual(bookId: string, { force = false }: { force?: boolean } = {}): Promise<void> {
  if (dialog) return;
  if (!MarginaliaAuth?.user) return;
  const book = BooksStore.getById(bookId) as { title?: string } | undefined;
  if (!book || BooksStore.isDemoBook(bookId)) return;
  if (!force && (await MomentsStore.get(bookId))) return;
  if (dialog) return; // a second event arrived while we were checking

  const answers: FinishAnswers = { belief: '', intention: '', next: '' };
  let step = 0;

  backdrop = document.createElement('div');
  backdrop.className = 'fr-backdrop';
  dialog = document.createElement('section');
  dialog.className = 'fr-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Finish ritual');
  document.body.append(backdrop, dialog);

  const skip = async () => {
    try { await MomentsStore.saveSkipped(bookId); } catch (err) { logError(err, { context: 'finish ritual skip', bookId }); }
    close();
  };

  const renderStep = () => {
    const q = QUESTIONS[step];
    const last = step === QUESTIONS.length - 1;
    dialog!.innerHTML = `
      <header class="fr-head">
        <span class="fr-step" data-fr-step>${step + 1} of ${QUESTIONS.length}</span>
        <button type="button" class="btn btn--quiet fr-skip" data-fr-skip>Skip</button>
      </header>
      <p class="fr-book">You finished ${esc(book.title ?? 'this book')}.</p>
      <label class="fr-question" for="frAnswer">${esc(q.text)}</label>
      <p class="fr-hint">${esc(q.hint)}</p>
      <textarea id="frAnswer" class="fr-answer" data-fr-answer rows="4" maxlength="400"></textarea>
      <footer class="fr-foot">
        ${step > 0 ? '<button type="button" class="btn btn--quiet fr-back" data-fr-back>Back</button>' : '<span></span>'}
        <button type="button" class="btn btn--primary fr-next" data-fr-next>${last ? 'Write my finish card' : 'Next'}</button>
      </footer>`;
    const area = dialog!.querySelector<HTMLTextAreaElement>('[data-fr-answer]')!;
    area.value = answers[q.key];
    area.focus();
  };

  const renderResult = (message: string) => {
    dialog!.innerHTML = `
      <p class="fr-book">${esc(message)}</p>
      <footer class="fr-foot"><span></span><button type="button" class="btn btn--primary fr-next" data-fr-open>Open notes</button></footer>`;
  };

  const finish = async () => {
    if (!answers.belief.trim() && !answers.intention.trim() && !answers.next.trim()) { await skip(); return; }
    dialog!.innerHTML = '<p class="fr-book" role="status">Writing your finish card…</p>';
    const result = await generateFinishCard(bookId, answers);
    try {
      await MomentsStore.saveCompleted(bookId, answers, result.ok ? result.card : null);
    } catch (err) {
      logError(err, { context: 'finish ritual save', bookId });
      renderResult('Your answers could not be saved. Check your connection and try again from the Notes tab.');
      return;
    }
    if (result.ok) { openNotes(bookId); return; }
    renderResult(result.reason === 'quota'
      ? 'Your answers are saved. This month\'s free AI generations are used up, so the card was not written. You can write it from the Notes tab later.'
      : 'Your answers are saved, but the card could not be written. You can try again from the Notes tab.');
  };

  dialog.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-fr-skip]')) { void skip(); return; }
    if (target.closest('[data-fr-open]')) { openNotes(bookId); return; }
    if (target.closest('[data-fr-back]')) { answers[QUESTIONS[step].key] = dialog!.querySelector<HTMLTextAreaElement>('[data-fr-answer]')!.value; step -= 1; renderStep(); return; }
    if (target.closest('[data-fr-next]')) {
      answers[QUESTIONS[step].key] = dialog!.querySelector<HTMLTextAreaElement>('[data-fr-answer]')!.value;
      if (step < QUESTIONS.length - 1) { step += 1; renderStep(); } else { void finish(); }
    }
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); void skip(); }
  });
  backdrop.addEventListener('click', () => { void skip(); });
  renderStep();
}
