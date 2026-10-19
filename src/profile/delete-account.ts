/* Marginalia · Delete account (Settings)
   Flow: click → a JSON copy of the library downloads automatically → the user types DELETE →
   the `deleteAccount` Cloud Function removes Firestore data, files and the sign-in → local data is
   wiped and the app returns to the landing page. A renewing subscription blocks it with a link to
   manage the subscription (cancel first, otherwise the card keeps being charged). */

import { httpsCallable } from 'firebase/functions';
import { signOut } from 'firebase/auth';
import { exportJSON, triggerDownload } from '../api/export.ts';
import { firebaseFunctions, firebaseAuth } from '../firebase/config.ts';
import { logError, logEvent } from '../services/analytics.ts';
import { asset } from '../core/asset.ts';
import './delete-account.css';

const CONFIRM_WORD = 'DELETE';

interface DeleteResult { ok: boolean }
interface FunctionsErrorLike { code?: string; message?: string; details?: { code?: string; portalUrl?: string | null } }

export function deleteAccountSectionHTML(): string {
  return `
    <section class="prof-settings__section prof-delete" id="profDeleteSection">
      <h3 class="prof-settings__subheading">Delete account</h3>
      <p class="prof-settings__hint">Permanently deletes your library, highlights, notes, profile and sign-in. A copy of your data downloads first.</p>
      <button class="prof-delete__open" id="profDeleteOpen" type="button">Delete account</button>
      <div class="prof-delete__dialog" id="profDeleteDialog" role="alertdialog" aria-labelledby="profDeleteTitle" hidden>
        <h4 class="prof-delete__title" id="profDeleteTitle">Delete your account?</h4>
        <p class="prof-delete__text" id="profDeleteDownloaded"></p>
        <p class="prof-delete__text">This cannot be undone. Type <strong>${CONFIRM_WORD}</strong> to confirm.</p>
        <input class="prof-delete__input" id="profDeleteInput" type="text" autocomplete="off" aria-label="Type ${CONFIRM_WORD} to confirm">
        <p class="prof-delete__error" id="profDeleteError" role="alert" hidden></p>
        <div class="prof-delete__actions">
          <button class="prof-delete__btn" id="profDeleteCancel" type="button">Cancel</button>
          <button class="prof-delete__btn prof-delete__btn--danger" id="profDeleteConfirm" type="button" disabled>Delete forever</button>
        </div>
      </div>
    </section>`;
}

/** Everything this browser keeps for the signed-in user. */
export async function wipeLocalData(): Promise<void> {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('marginalia')).forEach((k) => localStorage.removeItem(k));
    sessionStorage.clear();
  } catch { /* storage blocked: nothing to wipe */ }
  await new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase('marginalia-notes');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch { resolve(); }
  });
}

export function bindDeleteAccount(container: HTMLElement): void {
  const openBtn = container.querySelector<HTMLButtonElement>('#profDeleteOpen');
  const dialog = container.querySelector<HTMLElement>('#profDeleteDialog');
  const downloaded = container.querySelector<HTMLElement>('#profDeleteDownloaded');
  const input = container.querySelector<HTMLInputElement>('#profDeleteInput');
  const confirmBtn = container.querySelector<HTMLButtonElement>('#profDeleteConfirm');
  const cancelBtn = container.querySelector<HTMLButtonElement>('#profDeleteCancel');
  const errorEl = container.querySelector<HTMLElement>('#profDeleteError');
  if (!openBtn || !dialog || !input || !confirmBtn || !cancelBtn || !errorEl || !downloaded) return;

  const showError = (html: string) => { errorEl.innerHTML = html; errorEl.hidden = !html; };

  openBtn.addEventListener('click', () => {
    showError('');
    const filename = `marginalia-export-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      triggerDownload(exportJSON(), filename);
      downloaded.textContent = `A copy of your data was downloaded as ${filename}.`;
    } catch (err) {
      logError(err, { context: 'delete-account export' });
      downloaded.textContent = 'We could not prepare a copy of your data. Use Download JSON above before deleting.';
    }
    dialog.hidden = false;
    openBtn.hidden = true;
    input.value = '';
    confirmBtn.disabled = true;
    input.focus();
  });

  input.addEventListener('input', () => { confirmBtn.disabled = input.value.trim() !== CONFIRM_WORD; });

  cancelBtn.addEventListener('click', () => {
    dialog.hidden = true;
    openBtn.hidden = false;
    showError('');
  });

  confirmBtn.addEventListener('click', async () => {
    if (!firebaseFunctions || input.value.trim() !== CONFIRM_WORD) return;
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    showError('');
    confirmBtn.textContent = 'Deleting…';
    try {
      await httpsCallable<{ confirm: string }, DeleteResult>(firebaseFunctions, 'deleteAccount')({ confirm: CONFIRM_WORD });
      logEvent('account_deleted', {});
      if (firebaseAuth) await signOut(firebaseAuth).catch(() => undefined);
      await wipeLocalData();
      window.location.assign(asset(''));
    } catch (err) {
      const e = err as FunctionsErrorLike;
      if (e.details?.code === 'subscription-active') {
        const link = e.details.portalUrl
          ? ` <a href="${e.details.portalUrl}" target="_blank" rel="noopener">Manage subscription</a>`
          : ' Open Manage subscription in Settings.';
        showError(`Cancel your subscription first, then delete your account.${link}`);
      } else {
        logError(err, { context: 'deleteAccount' });
        showError('We could not delete your account. Nothing was lost. Try again in a moment.');
      }
      confirmBtn.textContent = 'Delete forever';
      confirmBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  });
}
