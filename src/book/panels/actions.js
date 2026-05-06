/* Marginalia · Actions panel
   Per-book knowledge-conversion tasks.
   Registered into PanelRegistry so book.js picks it up automatically.
   Reads/writes via ActionsStore (Firestore-backed, see ADR 0007).
*/

import { ActionsStore } from '../../store/actions-store.ts';
import { PanelRegistry } from './registry.js';

(function registerActionsPanel() {
  PanelRegistry.set('actions', function renderActions(book, container) {
    const bookId = book.id;

    // ── Initial render ────────────────────────────────────────────────────
    render();

    // Re-render when any action changes (other device, or after a write).
    const unsub = ActionsStore.subscribe(render);

    // Clean up listener when the panel is replaced (book.js swaps innerHTML).
    // Use a MutationObserver on the container's parent to detect removal.
    const observer = new MutationObserver(() => {
      if (!container.isConnected) {
        unsub();
        observer.disconnect();
      }
    });
    if (container.parentElement) {
      observer.observe(container.parentElement, { childList: true });
    }

    // ── Render ────────────────────────────────────────────────────────────
    function render() {
      const actions = ActionsStore.getByBook(bookId);
      const open     = actions.filter((a) => a.status === 'open' || a.status === 'snoozed');
      const resolved = actions.filter((a) => a.status === 'done' || a.status === 'archived');

      container.innerHTML = `
        <section class="actions-panel">
          <div class="actions-panel-head">
            <h2 class="actions-panel-title">Action Items</h2>
            <p class="actions-panel-desc">Knowledge you intend to act on from this book.</p>
          </div>

          <ul class="actions-list" data-actions-list>
            ${open.length === 0
              ? `<li class="actions-empty">No open actions yet.</li>`
              : open.map(renderItem).join('')}
          </ul>

          <form class="actions-add-form" data-actions-add-form autocomplete="off">
            <input
              class="actions-add-input"
              type="text"
              name="text"
              placeholder="Add an action from this book…"
              maxlength="400"
              aria-label="New action"
            />
            <button class="actions-add-btn" type="submit">Add</button>
          </form>

          ${resolved.length > 0 ? `
            <details class="actions-resolved">
              <summary class="actions-resolved-toggle">
                ${resolved.length} resolved
              </summary>
              <ul class="actions-list actions-list--resolved">
                ${resolved.map(renderItem).join('')}
              </ul>
            </details>
          ` : ''}
        </section>
      `;

      bindEvents();
    }

    // ── Item template ─────────────────────────────────────────────────────
    function renderItem(action) {
      const isDone     = action.status === 'done';
      const isArchived = action.status === 'archived';
      const isSnoozed  = action.status === 'snoozed';
      const isResolved = isDone || isArchived;

      const snoozeLabel = isSnoozed ? 'Snoozed' : 'Snooze 7d';

      return `
        <li class="actions-item ${isResolved ? 'actions-item--resolved' : ''} ${isSnoozed ? 'actions-item--snoozed' : ''}"
            data-action-id="${action.id}">
          <label class="actions-item-check-label">
            <input
              class="actions-item-checkbox"
              type="checkbox"
              data-action-done="${action.id}"
              ${isDone ? 'checked' : ''}
              ${isArchived ? 'disabled' : ''}
              aria-label="Mark done"
            />
          </label>
          <span class="actions-item-text ${isDone ? 'actions-item-text--done' : ''}">${escHtml(action.text)}</span>
          ${!isResolved ? `
            <div class="actions-item-controls">
              <button class="actions-ctrl-btn" data-action-snooze="${action.id}" title="${snoozeLabel}">
                ${isSnoozed ? '⏸' : '⏱'}
              </button>
              <button class="actions-ctrl-btn actions-ctrl-btn--archive" data-action-archive="${action.id}" title="Archive">
                ×
              </button>
            </div>
          ` : `
            <span class="actions-item-status-tag">${isArchived ? 'Archived' : 'Done'}</span>
          `}
        </li>
      `;
    }

    // ── Event binding ─────────────────────────────────────────────────────
    function bindEvents() {
      // Add form submit
      const form = container.querySelector('[data-actions-add-form]');
      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = form.querySelector('input[name="text"]');
        const text  = input?.value.trim();
        if (!text) return;

        input.value    = '';
        input.disabled = true;
        try {
          await ActionsStore.add(bookId, text);
        } catch (err) {
          input.value = text;
          const msg = err?.message?.includes('Not initialised')
            ? 'Sign in to save action items.'
            : 'Could not save — please try again.';
          _showFormError(form, msg);
        } finally {
          input.disabled = false;
          input.focus();
        }
      });

      // Checkboxes — mark done / reopen
      container.querySelectorAll('[data-action-done]').forEach((checkbox) => {
        checkbox.addEventListener('change', async (e) => {
          const id = e.currentTarget.dataset.actionDone;
          try {
            if (e.currentTarget.checked) {
              await ActionsStore.markDone(id, bookId);
            } else {
              await ActionsStore.reopen(id);
            }
          } catch {
            // Revert checkbox state on failure
            e.currentTarget.checked = !e.currentTarget.checked;
          }
        });
      });

      // Snooze buttons
      container.querySelectorAll('[data-action-snooze]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try { await ActionsStore.snooze(btn.dataset.actionSnooze); } catch { /* no-op */ }
        });
      });

      // Archive buttons
      container.querySelectorAll('[data-action-archive]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try { await ActionsStore.archive(btn.dataset.actionArchive); } catch { /* no-op */ }
        });
      });
    }
  });
})();

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _showFormError(form, message) {
  let err = form.querySelector('.actions-form-error');
  if (!err) {
    err = document.createElement('p');
    err.className = 'actions-form-error';
    form.after(err);
  }
  err.textContent = message;
  setTimeout(() => err.remove(), 4000);
}
