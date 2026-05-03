/* Notes Wall — SlotComponent for the room's right wall.
   Renders three sticky note groups: Quote of the Day, To-Do, Follow-Up. */

import './notes-wall.css';

// slot scale=0.005 → 1300×760px = 6.5×3.8 world units (matches cork board)
const WALL_WIDTH  = 1300;
const WALL_HEIGHT = 760;

const ROTATIONS = [-4, -2, 0, 2, 3, -3, 1, -1, 4];

function rot(index) {
  return ROTATIONS[index % ROTATIONS.length];
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Pick today's quote deterministically by date so it stays stable across refreshes.
function pickTodayQuote(highlights) {
  if (!highlights.length) return null;
  const day = Math.floor(Date.now() / 86400000);
  return highlights[day % highlights.length];
}

// Actions older than 7 days that are still not done.
const FOLLOWUP_MS = 7 * 24 * 60 * 60 * 1000;
function isFollowUp(action) {
  const age = Date.now() - (action.createdAt || 0);
  return age >= FOLLOWUP_MS && action.status !== 'done';
}

export function createNotesWallComponent() {
  let containerRef = null;
  let unsubscribe  = null;

  // ── Data ──────────────────────────────────────────────────────────────────

  async function loadData() {
    const store = window.NotesStore;
    if (!store) return { quote: null, todos: [], followUps: [] };

    await store.ready();

    // Collect all highlights across all books for Quote of the Day
    const allHighlights = [];

    // Seed highlights from sapiens (always available)
    const sapiens = window.__SEED_SAPIENS;
    if (sapiens?.highlights) {
      sapiens.highlights.forEach(h => {
        if (h.quote) allHighlights.push({ quote: h.quote, bookTitle: sapiens.titleZh || sapiens.title || 'Sapiens' });
      });
    }

    // User highlights from IndexedDB
    const books = await store.getAllBooks();
    for (const book of books) {
      const bookHighlights = await store.getHighlights(book.id);
      bookHighlights.forEach(h => {
        if (h.quote) allHighlights.push({ quote: h.quote, bookTitle: book.titleZh || book.title || '' });
      });
    }

    const quote = pickTodayQuote(allHighlights);

    // To-dos: stored as { id, text, status, createdAt } in localStorage for now
    const todos = loadLocalTodos();

    // Follow-ups: old todos + seed actions not done
    const followUps = [];
    todos.filter(isFollowUp).forEach(t => followUps.push({ text: t.text, createdAt: t.createdAt }));
    if (sapiens?.actions) {
      sapiens.actions
        .filter(a => a.status === 'todo' || !a.status)
        .slice(0, 3)
        .forEach(a => followUps.push({ text: a.text, createdAt: Date.now() - FOLLOWUP_MS - 1 }));
    }

    return { quote, todos, followUps };
  }

  // ── Local todo persistence (localStorage, no auth required) ───────────────

  const TODOS_KEY = 'marginalia_wall_todos';

  function loadLocalTodos() {
    try {
      return JSON.parse(localStorage.getItem(TODOS_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function saveLocalTodos(todos) {
    try {
      localStorage.setItem(TODOS_KEY, JSON.stringify(todos));
    } catch {}
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  async function render() {
    if (!containerRef) return;
    const { quote, todos, followUps } = await loadData();

    containerRef.innerHTML = `
      <div class="notes-wall">
        ${renderQuoteNote(quote, 0)}
        ${renderTodoNote(todos, 1)}
        ${followUps.length ? renderFollowUpNote(followUps, 2) : ''}
      </div>
    `;

    bindEvents();

    // Re-apply zoom after every render
    if (zoomScale !== 1) {
      const inner = containerRef?.querySelector('.notes-wall');
      if (inner) applyZoom(inner);
    }
  }

  function renderQuoteNote(quote, index) {
    const style = `transform: rotate(${rot(index)}deg)`;
    if (!quote) {
      return `
        <div class="sticky-note sticky-note--quote sticky-note--empty" style="${style}">
          <span>Highlight a sentence<br>to see it here</span>
        </div>`;
    }
    return `
      <div class="sticky-note sticky-note--quote" style="${style}">
        <span class="sticky-note__label">Quote of the Day</span>
        <p class="sticky-note__quote">${esc(quote.quote)}</p>
        <p class="sticky-note__source">— ${esc(quote.bookTitle)}</p>
      </div>`;
  }

  function renderTodoNote(todos, index) {
    const style = `transform: rotate(${rot(index)}deg)`;
    const activeTodos = todos.filter(t => !isFollowUp(t));
    const itemsHtml = activeTodos.map(t => `
      <li class="todo-item${t.status === 'done' ? ' is-done' : ''}" data-id="${esc(t.id)}">
        <span class="todo-item__check" role="checkbox" aria-checked="${t.status === 'done'}" tabindex="0"></span>
        <span class="todo-item__text" contenteditable="true" data-placeholder="Write something...">${esc(t.text)}</span>
      </li>`).join('');

    return `
      <div class="sticky-note sticky-note--todo" style="${style}">
        <span class="sticky-note__label">To Do</span>
        <ul class="sticky-note__items">${itemsHtml}</ul>
        <button class="sticky-note__add-btn" id="notesWallAddTodo">+ Add item</button>
      </div>`;
  }

  function renderFollowUpNote(followUps, index) {
    const style = `transform: rotate(${rot(index)}deg)`;
    const itemsHtml = followUps.slice(0, 4).map(f => `
      <li class="followup-item">
        <span class="followup-item__text">${esc(f.text)}</span>
        <span class="followup-item__meta">7d+ pending</span>
      </li>`).join('');

    return `
      <div class="sticky-note sticky-note--followup" style="${style}">
        <span class="sticky-note__label">Follow Up</span>
        <ul class="sticky-note__items">${itemsHtml}</ul>
      </div>`;
  }

  // ── Event binding ──────────────────────────────────────────────────────────

  function bindEvents() {
    if (!containerRef) return;

    // Add todo item
    const addBtn = containerRef.querySelector('#notesWallAddTodo');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const todos = loadLocalTodos();
        todos.push({ id: `td-${Date.now()}`, text: '', status: 'todo', createdAt: Date.now() });
        saveLocalTodos(todos);
        render();
        // Focus the new item after render
        requestAnimationFrame(() => {
          const items = containerRef?.querySelectorAll('.todo-item__text');
          items?.[items.length - 1]?.focus();
        });
      });
    }

    // Toggle done / edit text
    containerRef.querySelectorAll('.todo-item').forEach(item => {
      const id = item.dataset.id;

      // Checkbox toggle
      const check = item.querySelector('.todo-item__check');
      check?.addEventListener('click', () => toggleTodoDone(id));
      check?.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') toggleTodoDone(id); });

      // Save text on blur
      const textEl = item.querySelector('.todo-item__text');
      textEl?.addEventListener('blur', () => {
        const todos = loadLocalTodos();
        const todo = todos.find(t => t.id === id);
        if (todo) {
          todo.text = textEl.textContent.trim();
          saveLocalTodos(todos);
        }
      });
    });
  }

  function toggleTodoDone(id) {
    const todos = loadLocalTodos();
    const todo = todos.find(t => t.id === id);
    if (!todo) return;
    todo.status = todo.status === 'done' ? 'todo' : 'done';
    saveLocalTodos(todos);
    render();
  }

  // ── Zoom (wheel + pinch) on the inner .notes-wall div ─────────────────────

  let zoomScale = 1;
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 2.5;

  function applyZoom(inner) {
    inner.style.transform = `scale(${zoomScale})`;
    inner.style.transformOrigin = 'top left';
  }

  function attachZoom(container) {
    // Wheel zoom
    container.addEventListener('wheel', e => {
      e.preventDefault();
      const inner = container.querySelector('.notes-wall');
      if (!inner) return;
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      zoomScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomScale + delta));
      applyZoom(inner);
    }, { passive: false });

    // Pinch zoom (touch)
    let lastDist = null;
    container.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        lastDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
      }
    }, { passive: true });
    container.addEventListener('touchmove', e => {
      if (e.touches.length !== 2 || lastDist === null) return;
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const ratio = dist / lastDist;
      zoomScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomScale * ratio));
      lastDist = dist;
      const inner = container.querySelector('.notes-wall');
      if (inner) applyZoom(inner);
    }, { passive: true });
    container.addEventListener('touchend', () => { lastDist = null; }, { passive: true });
  }

  // ── SlotComponent interface ────────────────────────────────────────────────

  return {
    mount(container) {
      containerRef = container;
      render();
      attachZoom(container);
      // Re-render when notes change
      unsubscribe = window.NotesStore?.onChange(() => render());
    },

    unmount() {
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      if (containerRef) containerRef.innerHTML = '';
      containerRef = null;
    },

    refresh() {
      render();
    },

    getDimensions() {
      return { width: WALL_WIDTH, height: WALL_HEIGHT };
    },
  };
}
