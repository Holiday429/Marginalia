import './notes-wall.css';
import { HighlightsStore } from '../../store/highlights-store.ts';
import { BooksStore } from '../../store/books-store.ts';
import { NotesStore } from '../../store/notes-store.js';

const WALL_WIDTH = 880;
const WALL_HEIGHT = 520;
const FOLLOWUP_MS = 7 * 24 * 60 * 60 * 1000;
const FOLLOWUP_EXIT_MS = 520;
const TODOS_KEY = 'marginalia_wall_todos';
const FOLLOWUP_SWATCHES = [
  { h: 34, s: 38, l: 83 },
  { h: 48, s: 32, l: 84 },
  { h: 72, s: 28, l: 82 },
  { h: 96, s: 26, l: 84 },
  { h: 182, s: 18, l: 84 },
  { h: 212, s: 18, l: 84 },
  { h: 328, s: 22, l: 86 },
];
const FOLLOWUP_ROTATIONS = [-3, 2, -1, 4, -4, 1];

function esc(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickTodayQuote(highlights) {
  if (!highlights.length) return null;
  const day = Math.floor(Date.now() / 86400000);
  return highlights[day % highlights.length];
}

function isFollowUp(item) {
  const age = Date.now() - (item.createdAt || 0);
  return age >= FOLLOWUP_MS && item.status !== 'done';
}

function formatBoardDate(date = new Date()) {
  return {
    month: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date),
    weekday: new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date),
    day: String(date.getDate()).padStart(2, '0'),
    year: String(date.getFullYear()),
  };
}

function getFollowUpColor(id) {
  const tone = FOLLOWUP_SWATCHES[hashString(id) % FOLLOWUP_SWATCHES.length];
  return `hsl(${tone.h} ${tone.s}% ${tone.l}%)`;
}

function getFollowUpRotation(index) {
  return FOLLOWUP_ROTATIONS[index % FOLLOWUP_ROTATIONS.length];
}

function getFollowUpAgeLabel(createdAt) {
  const days = Math.max(7, Math.floor((Date.now() - (createdAt || 0)) / 86400000));
  return `${days}d+ pending`;
}

function loadLocalTodos() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TODOS_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.map((todo, index) => ({
          id: todo.id || `todo-${index}`,
          text: typeof todo.text === 'string' ? todo.text : '',
          status: todo.status === 'done' ? 'done' : 'todo',
          createdAt: Number.isFinite(todo.createdAt) ? todo.createdAt : Date.now(),
        }))
      : [];
  } catch {
    return [];
  }
}

function saveLocalTodos(todos) {
  try {
    localStorage.setItem(TODOS_KEY, JSON.stringify(todos));
  } catch {}
}

export function createNotesWallComponent() {
  let containerRef = null;
  let unsubscribe = null;
  let unsubscribeHighlights = null;
  let activeCard = null;
  let pendingFocusTodoId = null;
  let removingIds = new Set();
  let renderToken = 0;

  function loadHighlights() {
    // Authenticated: read live highlights from HighlightsStore, join bookTitle from BooksStore.
    if (HighlightsStore?.getUid()) {
      return HighlightsStore.getAll()
        .filter((h) => h.quote)
        .map((h) => {
          const book = BooksStore?.getById(h.bookId);
          return {
            quote: h.quote,
            bookTitle: book?.titleZh || book?.title || h.bookTitle || '',
          };
        });
    }

    // Unauthenticated: fall back to seed highlights.
    const sapiens = window.__SEED_SAPIENS;
    if (sapiens?.highlights) {
      return sapiens.highlights
        .filter((h) => h.quote)
        .map((h) => ({
          quote: h.quote,
          bookTitle: sapiens.titleZh || sapiens.title || 'Sapiens',
        }));
    }

    return [];
  }

  async function loadData() {
    const now = new Date();
    const todos = loadLocalTodos();
    const followUps = [];

    const allHighlights = loadHighlights();

    // Follow-ups from old-style todo items (localStorage only for now).
    todos
      .filter(isFollowUp)
      .forEach((todo) => {
        followUps.push({
          id: `todo:${todo.id}`,
          source: 'todo',
          todoId: todo.id,
          text: todo.text,
          createdAt: todo.createdAt,
          status: todo.status,
        });
      });

    followUps.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    return {
      now,
      quote: pickTodayQuote(allHighlights),
      todos,
      activeTodos: todos.filter((todo) => todo.status !== 'done' && !isFollowUp(todo)),
      followUps,
    };
  }

  function findFollowUp(data, id) {
    return data.followUps.find((item) => item.id === id) || null;
  }

  function renderZoneTag(title, accent) {
    return `
      <div class="notes-zone__tag notes-zone__tag--${accent}">
        <span>${esc(title)}</span>
      </div>
    `;
  }

  function renderQuoteZone(data) {
    const date = formatBoardDate(data.now);
    const quote = data.quote;

    return `
      <section class="notes-zone notes-zone--quote">
        ${renderZoneTag('Quotes of the Day', 'quote')}
        <button
          class="calendar-card${quote ? '' : ' is-empty'}"
          type="button"
          data-open-card="quote"
        >
          <span class="calendar-card__rings" aria-hidden="true">
            <i></i><i></i><i></i>
          </span>
          <span class="calendar-card__month">${esc(date.month)}</span>
          <span class="calendar-card__day">${esc(date.day)}</span>
          <span class="calendar-card__weekday">${esc(date.weekday)}</span>
          ${
            quote
              ? `
                <p class="calendar-card__quote">${esc(quote.quote)}</p>
                <p class="calendar-card__source">— ${esc(quote.bookTitle)}</p>
              `
              : `
                <p class="calendar-card__quote">Highlight a sentence to pin it here.</p>
                <p class="calendar-card__source">Your reading wall updates daily.</p>
              `
          }
        </button>
      </section>
    `;
  }

  function renderTodoZone(data) {
    const rows = data.activeTodos.slice(0, 6);

    return `
      <section class="notes-zone notes-zone--todo">
        ${renderZoneTag('To Do', 'todo')}
        <div class="todo-paper-wrap">
          <button class="todo-paper" type="button" data-open-card="todo">
            <span class="todo-paper__pin" aria-hidden="true"></span>
            <span class="todo-paper__meta">${esc(`${rows.length} open lines`)}</span>
            <ul class="todo-paper__rows">
              ${
                rows.length
                  ? rows.map((todo) => `
                      <li class="todo-paper__row">
                        <span class="todo-paper__dot"></span>
                        <span class="todo-paper__text">${esc(todo.text || 'Untitled item')}</span>
                      </li>
                    `).join('')
                  : `
                    <li class="todo-paper__row is-empty">
                      <span class="todo-paper__dot"></span>
                      <span class="todo-paper__text">Start a new line for your next reading task.</span>
                    </li>
                  `
              }
            </ul>
          </button>
          <button class="todo-paper__add" type="button" data-add-todo>+ Add line</button>
        </div>
      </section>
    `;
  }

  function renderFollowUpSticky(item, index) {
    const style = [
      `--sticky-bg:${getFollowUpColor(item.id)}`,
      `--sticky-rotate:${getFollowUpRotation(index)}deg`,
    ].join(';');

    return `
      <button
        class="followup-sticky${removingIds.has(item.id) ? ' is-removing' : ''}"
        type="button"
        style="${style}"
        data-open-card="followup"
        data-card-id="${esc(item.id)}"
        data-followup-id="${esc(item.id)}"
      >
        <span class="followup-sticky__pin" aria-hidden="true"></span>
        <span class="followup-sticky__text">${esc(item.text)}</span>
      </button>
    `;
  }

  function renderFollowUpZone(data) {
    return `
      <section class="notes-zone notes-zone--followup">
        ${renderZoneTag('Follow Up', 'followup')}
        <div class="followup-cluster">
          ${
            data.followUps.length
              ? data.followUps.slice(0, 6).map(renderFollowUpSticky).join('')
              : '<div class="followup-empty">Older unfinished actions will gather here.</div>'
          }
        </div>
      </section>
    `;
  }

  function renderQuoteOverlay(data) {
    const date = formatBoardDate(data.now);
    const quote = data.quote;

    return `
      <article class="notes-overlay__card notes-overlay__card--quote" data-overlay-card>
        <button class="notes-overlay__close" type="button" data-close-overlay aria-label="Close detail">x</button>
        <div class="quote-detail">
          <div class="quote-detail__header">
            <span class="quote-detail__eyebrow">Quotes of the Day</span>
            <div class="quote-detail__date">
              <strong>${esc(`${date.month} ${date.day}`)}</strong>
              <span>${esc(`${date.weekday} · ${date.year}`)}</span>
            </div>
          </div>
          ${
            quote
              ? `
                <p class="quote-detail__body">${esc(quote.quote)}</p>
                <p class="quote-detail__source">— ${esc(quote.bookTitle)}</p>
              `
              : `
                <p class="quote-detail__body is-empty">Highlight a sentence in your books and the wall will switch to a daily tear-off card.</p>
              `
          }
        </div>
      </article>
    `;
  }

  function renderTodoOverlay(data) {
    return `
      <article class="notes-overlay__card notes-overlay__card--todo" data-overlay-card>
        <button class="notes-overlay__close" type="button" data-close-overlay aria-label="Close detail">x</button>
        <div class="todo-detail">
          <header class="todo-detail__head">
            <span class="todo-detail__eyebrow">To Do</span>
            <h3>Reading Lines</h3>
          </header>
          <ul class="todo-detail__rows">
            ${
              data.activeTodos.length
                ? data.activeTodos.map((todo) => `
                    <li class="todo-editor-row" data-todo-row="${esc(todo.id)}">
                      <button
                        class="todo-editor-row__check${todo.status === 'done' ? ' is-done' : ''}"
                        type="button"
                        data-toggle-todo="${esc(todo.id)}"
                        aria-label="${todo.status === 'done' ? 'Mark as pending' : 'Mark as done'}"
                      ></button>
                      <span
                        class="todo-editor-row__text"
                        contenteditable="true"
                        spellcheck="false"
                        data-edit-todo="${esc(todo.id)}"
                        data-placeholder="Write something..."
                      >${esc(todo.text)}</span>
                    </li>
                  `).join('')
                : `
                  <li class="todo-editor-row is-empty">
                    <span class="todo-editor-row__ghost">No active lines yet. Add one below.</span>
                  </li>
                `
            }
          </ul>
          <button class="todo-detail__add" type="button" data-add-todo>+ Add line</button>
        </div>
      </article>
    `;
  }

  function renderFollowUpOverlay(data, id) {
    const item = findFollowUp(data, id);
    if (!item) return '';

    const overlayClasses = [
      'notes-overlay__card',
      'notes-overlay__card--followup',
      removingIds.has(item.id) ? 'is-removing' : '',
    ].filter(Boolean).join(' ');

    return `
      <article
        class="${overlayClasses}"
        data-overlay-card
        style="--sticky-bg:${getFollowUpColor(item.id)}"
      >
        <button class="notes-overlay__close" type="button" data-close-overlay aria-label="Close detail">x</button>
        <div class="followup-detail">
          <span class="followup-detail__pin" aria-hidden="true"></span>
          <span class="followup-detail__eyebrow">${esc(getFollowUpAgeLabel(item.createdAt))}</span>
          ${
            item.source === 'todo'
              ? `
                <p
                  class="followup-detail__body is-editable"
                  contenteditable="true"
                  spellcheck="false"
                  data-edit-followup="${esc(item.todoId)}"
                >${esc(item.text)}</p>
              `
              : `<p class="followup-detail__body">${esc(item.text)}</p>`
          }
          <div class="followup-detail__actions">
            <button class="followup-detail__done" type="button" data-complete-followup="${esc(item.id)}">Mark Complete</button>
            ${
              item.source === 'todo'
                ? '<span class="followup-detail__hint">Editable note</span>'
                : '<span class="followup-detail__hint">Seeded action</span>'
            }
          </div>
        </div>
      </article>
    `;
  }

  function renderOverlay(data) {
    if (!activeCard) return '';

    let content = '';
    if (activeCard.kind === 'quote') content = renderQuoteOverlay(data);
    if (activeCard.kind === 'todo') content = renderTodoOverlay(data);
    if (activeCard.kind === 'followup' && activeCard.id) {
      content = renderFollowUpOverlay(data, activeCard.id);
    }
    if (!content) {
      activeCard = null;
      return '';
    }

    return `
      <div class="notes-overlay">
        <button class="notes-overlay__scrim" type="button" data-close-overlay aria-label="Close detail"></button>
        ${content}
      </div>
    `;
  }

  async function render() {
    if (!containerRef) return;
    const token = ++renderToken;
    const data = await loadData();
    if (!containerRef || token !== renderToken) return;

    if (activeCard?.kind === 'followup' && activeCard.id && !findFollowUp(data, activeCard.id)) {
      activeCard = null;
    }

    containerRef.innerHTML = `
      <div class="notes-wall" lang="zh-CN">
        <div class="notes-wall__board">
          ${renderQuoteZone(data)}
          ${renderTodoZone(data)}
          ${renderFollowUpZone(data)}
        </div>
        ${renderOverlay(data)}
      </div>
    `;

    if (pendingFocusTodoId) {
      const focusId = pendingFocusTodoId;
      pendingFocusTodoId = null;
      requestAnimationFrame(() => {
        const target = containerRef?.querySelector(`[data-edit-todo="${focusId}"]`);
        if (!target) return;
        target.focus();
        if (document.createRange && window.getSelection) {
          const range = document.createRange();
          range.selectNodeContents(target);
          range.collapse(false);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      });
    }
  }

  function createTodo() {
    const todos = loadLocalTodos();
    const todo = {
      id: `todo-${Date.now()}`,
      text: '',
      status: 'todo',
      createdAt: Date.now(),
    };
    todos.unshift(todo);
    saveLocalTodos(todos);
    activeCard = { kind: 'todo' };
    pendingFocusTodoId = todo.id;
    render();
  }

  function updateTodoText(id, text) {
    const todos = loadLocalTodos();
    const todo = todos.find((item) => item.id === id);
    if (!todo) return;
    todo.text = String(text || '').trim();
    saveLocalTodos(todos);
    render();
  }

  function toggleTodoDone(id) {
    const todos = loadLocalTodos();
    const todo = todos.find((item) => item.id === id);
    if (!todo) return;
    todo.status = todo.status === 'done' ? 'todo' : 'done';
    saveLocalTodos(todos);
    render();
  }

  async function persistFollowUpDone(id) {
    if (id.startsWith('todo:')) {
      const todoId = id.slice('todo:'.length);
      const todos = loadLocalTodos();
      const todo = todos.find((item) => item.id === todoId);
      if (todo) {
        todo.status = 'done';
        saveLocalTodos(todos);
      }
      return;
    }

    if (id.startsWith('action:')) {
      const [, bookId, actionId] = id.split(':');
      await NotesStore?.setActionStatus(bookId, actionId, 'done');
    }
  }

  function completeFollowUp(id) {
    if (!id || removingIds.has(id)) return;
    removingIds = new Set(removingIds).add(id);

    const sticky = containerRef?.querySelector(`[data-followup-id="${id}"]`);
    sticky?.classList.add('is-removing');

    if (activeCard?.kind === 'followup' && activeCard.id === id) {
      const card = containerRef?.querySelector('.notes-overlay__card--followup');
      card?.classList.add('is-removing');
    }

    window.setTimeout(async () => {
      await persistFollowUpDone(id);
      removingIds.delete(id);
      if (activeCard?.kind === 'followup' && activeCard.id === id) {
        activeCard = null;
      }
      render();
    }, FOLLOWUP_EXIT_MS);
  }

  function handleClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const closeTrigger = target.closest('[data-close-overlay]');
    if (closeTrigger) {
      activeCard = null;
      render();
      return;
    }

    const completeTrigger = target.closest('[data-complete-followup]');
    if (completeTrigger) {
      completeFollowUp(completeTrigger.dataset.completeFollowup || '');
      return;
    }

    const addTrigger = target.closest('[data-add-todo]');
    if (addTrigger) {
      event.stopPropagation();
      createTodo();
      return;
    }

    const toggleTrigger = target.closest('[data-toggle-todo]');
    if (toggleTrigger) {
      toggleTodoDone(toggleTrigger.dataset.toggleTodo || '');
      return;
    }

    const openTrigger = target.closest('[data-open-card]');
    if (openTrigger) {
      const kind = openTrigger.dataset.openCard || '';
      activeCard = {
        kind,
        id: openTrigger.dataset.cardId || null,
      };
      render();
    }
  }

  function handleKeyDown(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (event.key === 'Escape' && activeCard) {
      activeCard = null;
      render();
      return;
    }

    if (event.key === 'Enter' && target.matches('[data-edit-todo], [data-edit-followup]')) {
      event.preventDefault();
      target.blur();
    }
  }

  function handleFocusOut(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.matches('[data-edit-todo]')) {
      updateTodoText(target.dataset.editTodo || '', target.textContent || '');
      return;
    }

    if (target.matches('[data-edit-followup]')) {
      updateTodoText(target.dataset.editFollowup || '', target.textContent || '');
    }
  }

  return {
    mount(container) {
      containerRef = container;
      containerRef.classList.add('notes-wall-root');
      containerRef.addEventListener('click', handleClick);
      containerRef.addEventListener('keydown', handleKeyDown);
      containerRef.addEventListener('focusout', handleFocusOut);
      render();
      // Re-render when Firestore highlights arrive (async after mount).
      const onHighlightsChanged = () => render();
      window.addEventListener('marginalia:highlights-changed', onHighlightsChanged);
      unsubscribeHighlights = () => window.removeEventListener('marginalia:highlights-changed', onHighlightsChanged);
    },

    unmount() {
      if (unsubscribeHighlights) {
        unsubscribeHighlights();
        unsubscribeHighlights = null;
      }
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      if (containerRef) {
        containerRef.removeEventListener('click', handleClick);
        containerRef.removeEventListener('keydown', handleKeyDown);
        containerRef.removeEventListener('focusout', handleFocusOut);
        containerRef.innerHTML = '';
      }
      containerRef = null;
      activeCard = null;
      pendingFocusTodoId = null;
      removingIds = new Set();
      renderToken += 1;
    },

    refresh() {
      render();
    },

    getDimensions() {
      return { width: WALL_WIDTH, height: WALL_HEIGHT };
    },
  };
}
