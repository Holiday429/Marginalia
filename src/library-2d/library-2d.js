/* Library view — room-organize workspace */

import { logError } from '../services/analytics.ts';
import { withMeta } from '../services/db.ts';
import { renderLibraryShell } from './library-2d-template.js';
import { PanelManager } from '../core/panel-manager.js';
import { BooksStore } from '../store/books-store.ts';
import { MarginaliaAuth } from '../firebase/auth.js';
import { SpineCard } from '../components/spine-card.js';
import { NewEntry } from '../new-entry/new-entry.js';
import {
  LIBRARY_STORAGE_KEY,
  LIBRARY_WORLD_WIDTH,
  LIBRARY_WORLD_HEIGHT,
  LIBRARY_ZOOM_MIN,
  LIBRARY_ZOOM_MAX,
  LIBRARY_FIT_ZOOM_MIN,
  LIBRARY_DRAG_THRESHOLD,
  LIBRARY_MAX_ROWS,
  LIBRARY_WHEEL_STEP,
  LIBRARY_DEFAULT_SHELVES,
  LIBRARY_STATE,
  containsCJK,
  normalizeShelfMode,
  normalizeReadingStatus,
  normalizeShelfId,
  normalizeShelfName,
  mapStatusToShelfId,
  statusToLabel,
  getColorHue,
  escapeHTML,
  escapeAttr,
  slugify,
  toTitleCase,
  clamp,
  clampInt,
  cssEscape,
} from './library-2d-state.js';

function initLibrary(params = {}) {
  const host = document.getElementById('panel-library');
  if (!host) return;

  host.innerHTML = renderLibraryShell();

  syncLibraryRecords();
  bindLibraryEvents();
  // hydrateLibraryLayout is async (Firestore read when signed in).
  // It calls renderLibrary() itself after hydration completes.
  hydrateLibraryLayout(params);
}

function enterLibrary(params = {}) {
  syncLibraryRecords();
  mergeLayoutWithRecords();
  renderLibrary();
  scheduleDefaultFrontView();
  applyCameraTransform();
  applyLibraryEntry(params);
}

function scheduleDefaultFrontView() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      resetFrontView({ animated: false });
      saveLayout();
    });
  });
}

function applyLibraryEntry(params = {}, { immediate = false } = {}) {
  const source = params?.source === 'room' ? 'room' : 'library';
  const mode = params?.mode === 'search' ? 'search' : 'organize';
  LIBRARY_STATE.entrySource = source;
  LIBRARY_STATE.entryMode = mode;

  const root = document.getElementById('panel-library');
  if (root) {
    root.dataset.entrySource = source;
    root.dataset.entryMode = mode;
    if (source === 'room') {
      root.classList.add('is-room-entry');
      window.setTimeout(() => {
        if (document.body.dataset.view !== 'library-2d') return;
        root.classList.remove('is-room-entry');
      }, 520);
    } else {
      root.classList.remove('is-room-entry');
    }
  }

  syncLibrarySearchPlaceholder(mode);
  markLibraryEntryFocus(mode);
  if (source !== 'room') return;

  if (immediate) {
    focusLibraryMode(mode, false);
    return;
  }
  requestAnimationFrame(() => focusLibraryMode(mode, true));
}

function markLibraryEntryFocus(mode) {
  const search = document.getElementById('librarySearchSection');
  const organize = document.getElementById('libraryOrganizeSection');
  if (search) search.classList.toggle('is-entry-focus', mode === 'search');
  if (organize) organize.classList.toggle('is-entry-focus', mode !== 'search');
}

function syncLibrarySearchPlaceholder(mode) {
  const input = document.getElementById('librarySearchInput');
  if (input) {
    input.placeholder = mode === 'search'
      ? 'Search by title and press Enter...'
      : 'Locate a book on your shelf';
  }
}

function focusLibraryMode(mode, smooth = true) {
  const targetId = mode === 'search' ? 'librarySearchSection' : 'libraryOrganizeSection';
  const target = document.getElementById(targetId);
  if (!target) return;
  target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  if (mode === 'search') {
    const input = document.getElementById('librarySearchInput');
    if (input instanceof HTMLInputElement) {
      input.focus({ preventScroll: true });
      input.select();
    }
  }
}

function bindLibraryEvents() {
  if (LIBRARY_STATE.bound) return;
  LIBRARY_STATE.bound = true;

  const root = document.getElementById('panel-library');
  if (!root) return;

  root.addEventListener('click', (event) => {
    if (
      LIBRARY_STATE.overlay.key
      && !event.target.closest('#libraryOverlayStage')
      && !event.target.closest('.library-draggable')
    ) {
      closeBookInspector();
      return;
    }

    const panelBtn = event.target.closest('[data-library-panel]');
    if (panelBtn) {
      openLibraryPanel(panelBtn.dataset.libraryPanel || '');
      return;
    }

    const railBtn = event.target.closest('[data-library-rail]');
    if (railBtn) {
      handleRailAction(railBtn.dataset.libraryRail || '', railBtn);
      return;
    }

    const arrangeBtn = event.target.closest('[data-arrange]');
    if (arrangeBtn) {
      const mode = arrangeBtn.dataset.arrange || 'status';
      root.querySelectorAll('[data-arrange]').forEach((el) => {
        el.classList.toggle('active', el === arrangeBtn && mode !== 'reset');
      });
      applyArrangement(mode);
      renderLibrary();
      saveLayout();
      requestAnimationFrame(() => fitShelvesToViewport({ animated: true, padding: 28 }));
      return;
    }

    if (event.target.closest('#libraryZoomIn')) {
      zoomAtViewportCenter(1.03);
      return;
    }

    if (event.target.closest('#libraryZoomOut')) {
      zoomAtViewportCenter(1 / 1.03);
      return;
    }

    if (event.target.closest('#libraryZoomFit')) {
      resetFrontView({ animated: true });
      saveLayout();
      return;
    }

    if (event.target.closest('#libraryCenterView')) {
      centerViewport({ animated: true });
      saveLayout();
      return;
    }

    const removeBtn = event.target.closest('[data-remove-shelf]');
    if (removeBtn) {
      removeShelf(removeBtn.dataset.removeShelf || '');
      return;
    }

    if (event.target.closest('#libraryOverlayClose, [data-overlay-close]')) {
      closeBookInspector();
      return;
    }

    const openBookBtn = event.target.closest('[data-open-book]');
    if (openBookBtn) {
      const bookKey = openBookBtn.dataset.openBook || '';
      const record = LIBRARY_STATE.recordByKey.get(bookKey);
      if (record?.id) {
        closeBookInspector({ immediate: true });
        PanelManager.open('book', { id: record.id });
      }
      return;
    }

    const moveBookBtn = event.target.closest('[data-move-book]');
    if (moveBookBtn) {
      const bookKey = moveBookBtn.dataset.moveBook || '';
      const shelfId = moveBookBtn.dataset.toShelf || '';
      if (bookKey && shelfId) {
        moveBookToShelf(bookKey, shelfId, getShelfList(shelfId)?.length || 0);
        closeBookInspector({ immediate: true });
        renderLibrary();
        saveLayout();
      }
      return;
    }

    const addRowBtn = event.target.closest('[data-add-row]');
    if (addRowBtn) {
      addShelfRow(addRowBtn.dataset.addRow || '');
      return;
    }

    const modeBtn = event.target.closest('[data-shelf-mode]');
    if (modeBtn) {
      const shelfId = modeBtn.dataset.shelfId || '';
      const mode = modeBtn.dataset.shelfMode || 'spine';
      setShelfMode(shelfId, mode);
      setActiveShelf(shelfId);
      return;
    }

    const bayClick = event.target.closest('.library-bay');
    if (bayClick?.dataset.shelfId) {
      setActiveShelf(bayClick.dataset.shelfId);
      return;
    }

    if (event.target.closest('#libraryScene') && !event.target.closest('.library-bay')) {
      setActiveShelf('');
    }
  });

  root.addEventListener('submit', (event) => {
    const searchForm = event.target.closest('#librarySearchForm');
    if (searchForm) {
      event.preventDefault();
      focusSearchResult();
      return;
    }

    const shelfForm = event.target.closest('#libraryShelfForm');
    if (shelfForm) {
      event.preventDefault();
      createShelfFromForm();
    }
  });

  root.addEventListener('input', (event) => {
    const input = event.target.closest('#librarySearchInput');
    if (!input) return;
    setSearchQuery(input.value || '');
  });

  root.addEventListener('keydown', (event) => {
    const input = event.target.closest('#librarySearchInput');
    if (!input) return;

    if (event.key === 'ArrowDown' && LIBRARY_STATE.searchMatches.length > 1) {
      event.preventDefault();
      LIBRARY_STATE.searchIndex = (LIBRARY_STATE.searchIndex + 1) % LIBRARY_STATE.searchMatches.length;
      updateSearchHighlight();
      renderSearchFeedback();
      return;
    }

    if (event.key === 'ArrowUp' && LIBRARY_STATE.searchMatches.length > 1) {
      event.preventDefault();
      LIBRARY_STATE.searchIndex = (LIBRARY_STATE.searchIndex - 1 + LIBRARY_STATE.searchMatches.length) % LIBRARY_STATE.searchMatches.length;
      updateSearchHighlight();
      renderSearchFeedback();
    }
  });

  const scene = document.getElementById('libraryScene');
  if (scene) {
    scene.addEventListener('wheel', onSceneWheel, { passive: false });
  }
  const viewport = document.getElementById('librarySceneViewport');
  if (viewport) {
    viewport.addEventListener('scroll', onViewportScroll, { passive: true });
  }

  root.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || hasActiveInteraction()) return;

    const dragNode = event.target.closest('.library-draggable');
    if (dragNode) {
      const owningBay = dragNode.closest('.library-bay');
      const owningShelfId = owningBay?.dataset.shelfId || '';
      if (owningShelfId && LIBRARY_STATE.activeShelfId !== owningShelfId) {
        setActiveShelf(owningShelfId);
      }
      startBookDrag(event, dragNode);
      return;
    }

    const shelfSurface = event.target.closest('.library-bay');
    const isShelfAction = event.target.closest('.library-bay-actions, .library-remove-btn, [data-shelf-mode], [data-remove-shelf], [data-add-row], .library-overflow-notice, .library-overflow-btn');
    if (shelfSurface && !isShelfAction) {
      const bay = shelfSurface;
      if (bay?.dataset.shelfId) {
        setActiveShelf(bay.dataset.shelfId);
        startShelfDrag(event, bay.dataset.shelfId);
        return;
      }
    }
  });

  const viewportForResize = document.getElementById('librarySceneViewport');
  if (viewportForResize && !LIBRARY_STATE.resizeObserver && window.ResizeObserver) {
    LIBRARY_STATE.resizeObserver = new ResizeObserver(() => {
      window.clearTimeout(LIBRARY_STATE._resizeFitTimer);
      LIBRARY_STATE._resizeFitTimer = window.setTimeout(() => {
        fitShelvesToViewport({ animated: false, padding: 28 });
        saveLayout();
      }, 120);
    });
    LIBRARY_STATE.resizeObserver.observe(viewportForResize);
  }
}

function openLibraryPanel(panelId) {
  if (!panelId || panelId === 'library' || panelId === 'search' || panelId === 'shelf') return;
  if (PanelManager?.open) {
    PanelManager.open(panelId);
    return;
  }
  App.show(panelId);
}

function handleRailAction(action, sourceBtn) {
  if (!action) return;
  if (action === 'new-shelf') {
    toggleShelfCreatePanel();
    return;
  }
  if (action === 'add-books') {
    NewEntry?.mount?.();
    return;
  }
  if (action === 'rename') {
    const target = getShelfById(LIBRARY_STATE.activeShelfId);
    if (!target) return;
    const next = window.prompt('Rename shelf', target.name);
    if (!next || !next.trim()) return;
    target.name = next.trim().slice(0, 28);
    renderLibrary();
    saveLayout();
    return;
  }
  if (action === 'delete') {
    if (!LIBRARY_STATE.activeShelfId) return;
    removeShelf(LIBRARY_STATE.activeShelfId);
  }
}

function syncLibraryRailState() {
  const edit = document.getElementById('libraryRailEdit');
  if (edit) edit.hidden = !Boolean(getShelfById(LIBRARY_STATE.activeShelfId));

  document.querySelectorAll('#panel-library [data-arrange]').forEach((button) => {
    const mode = button.getAttribute('data-arrange') || '';
    button.classList.toggle('is-active', mode === LIBRARY_STATE.arrangeMode);
  });
}

function syncLibraryRecords() {
  const next = [];
  const map = new Map();
  const seen = new Map();

  (BooksStore.getShelfBooks() || []).forEach((book, index) => {
    const rawBase = String(book.id || `${book.title || 'book'}-${book.author || 'author'}`).toLowerCase();
    const base = slugify(rawBase);
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    const key = count === 1 ? base : `${base}-${count}`;

    const detail = book.id ? BooksStore.getById(book.id) : null;
    const record = {
      key,
      id: book.id || '',
      title: toTitleCase(book.title || `Book ${index + 1}`),
      author: toTitleCase(book.author || ''),
      status: normalizeReadingStatus(book.status || 'confirmed-later'),
      spine: book.spine || '#2b2b2b',
      text: book.text || '#e8dfc8',
      w: Number(book.w) || 34,
      h: Number(book.h) || 0.86,
      font: book.font || "'Fraunces', serif",
      weight: Number(book.weight) || 500,
      size: Number(book.size) || 11,
      tracking: book.tracking || '0.03em',
      topMark: book.topMark || '',
      band: book.band || '',
      coverPreview: book.coverPreview || '',
      coverImage: detail?.cover?.image || '',
      tags: Array.isArray(detail?.tags) ? detail.tags.slice(0, 4) : [statusToLabel(book.status || 'confirmed-later')],
      summary: detail?.summary || `${toTitleCase(book.title || '')} is part of your library collection.`,
      sourceIndex: index,
      searchText: [book.title || '', book.author || '', detail?.title || '', detail?.author || '', ...(detail?.tags || [])].join(' ').toLowerCase(),
    };

    next.push(record);
    map.set(key, record);
  });

  LIBRARY_STATE.records = next;
  LIBRARY_STATE.recordByKey = map;
}

async function hydrateLibraryLayout(initParams = {}) {
  const saved = await readStoredLayout();
  if (!saved) {
    arrangeByStatus();
    saveLayout();
  } else {
    LIBRARY_STATE.shelves = (saved.shelves || []).map((shelf) => ({
      id: normalizeShelfId(shelf.id),
      name: normalizeShelfName(shelf.name, shelf.id),
      color: shelf.color || '#7a6040',
      rows: clampInt(shelf.rows, 1, LIBRARY_MAX_ROWS, 2),
      viewMode: normalizeShelfMode(shelf.viewMode || 'spine'),
      status: normalizeReadingStatus(shelf.status || ''),
      x: Number(shelf.x) || 0,
      y: Number(shelf.y) || 0,
      tilt: 0,
      pitch: 0,
      yaw: clamp(Number(shelf.yaw), -55, 55, 0),
      bookKeys: Array.isArray(shelf.bookKeys) ? shelf.bookKeys.slice() : [],
    }));

    LIBRARY_STATE.shelves = dedupeShelvesById(LIBRARY_STATE.shelves);
    LIBRARY_STATE.pool = [];
    const rawViewX = Number(saved.view?.x) || 0;
    const rawViewY = Number(saved.view?.y) || 0;
    // v5 and earlier stored translate offsets (can be negative). v6 uses scroll offsets.
    LIBRARY_STATE.view.x = Math.max(0, rawViewX < 0 ? Math.abs(rawViewX) : rawViewX);
    LIBRARY_STATE.view.y = Math.max(0, rawViewY < 0 ? Math.abs(rawViewY) : rawViewY);
    LIBRARY_STATE.view.scale = clamp(Number(saved.view?.scale), LIBRARY_ZOOM_MIN, LIBRARY_ZOOM_MAX, 1);
    LIBRARY_STATE.camera.yaw = 0;
    LIBRARY_STATE.camera.pitch = 0;
    LIBRARY_STATE.sceneMode = 'flat';

    ensureBaseShelves();

    const legacyPool = Array.isArray(saved.pool) ? saved.pool : [];
    if (legacyPool.length) {
      const confirmShelf = getShelfById('confirm-later');
      if (confirmShelf) confirmShelf.bookKeys.push(...legacyPool);
    }

    mergeLayoutWithRecords();
  }

  // Render after hydration (was called synchronously after hydrateLibraryLayout before).
  renderLibrary();
  scheduleDefaultFrontView();
  applyCameraTransform();
  applyLibraryEntry(initParams, { immediate: true });
}

function dedupeShelvesById(input) {
  const out = [];
  const seen = new Set();
  input.forEach((shelf) => {
    if (seen.has(shelf.id)) return;
    seen.add(shelf.id);
    out.push(shelf);
  });
  return out;
}

function ensureBaseShelves() {
  LIBRARY_DEFAULT_SHELVES.forEach((base) => {
    if (!LIBRARY_STATE.shelves.some((shelf) => shelf.id === base.id)) {
      LIBRARY_STATE.shelves.push({ ...base, bookKeys: [] });
    }
  });
}

function mergeLayoutWithRecords() {
  ensureBaseShelves();

  const valid = new Set(LIBRARY_STATE.records.map((record) => record.key));
  LIBRARY_STATE.shelves.forEach((shelf) => {
    shelf.bookKeys = shelf.bookKeys.filter((key) => valid.has(key));
  });
  const used = new Set();
  LIBRARY_STATE.shelves.forEach((shelf) => shelf.bookKeys.forEach((key) => used.add(key)));
  const confirmShelf = getShelfById('confirm-later');

  LIBRARY_STATE.records.forEach((record) => {
    if (!used.has(record.key)) confirmShelf?.bookKeys.push(record.key);
  });
}

function renderLibrary() {
  applySceneModeState();
  renderStats();
  renderSearchFeedback();
  renderShelves();
  syncLibraryRailState();
  updateSearchHighlight();
  applyViewTransform(false);
  syncOverlayWithRenderedBook();
}

function renderStats() {
  const el = document.getElementById('libraryStats');
  if (!el) return;

  const total = LIBRARY_STATE.records.length;
  const shelved = LIBRARY_STATE.shelves.reduce((sum, shelf) => sum + shelf.bookKeys.length, 0);
  const confirmLater = getShelfById('confirm-later')?.bookKeys.length || 0;

  el.innerHTML = `
    <span><strong>${total}</strong> Books</span>
    <span>·</span>
    <span><strong>${LIBRARY_STATE.shelves.length}</strong> Shelves</span>
    <span>·</span>
    <span><strong>${shelved}</strong> Placed</span>
    <span>·</span>
    <span><strong>${confirmLater}</strong> Confirm Later</span>
  `;
}

function renderStatusLine(customText) {
  const line = document.getElementById('libraryStatusLine');
  if (!line) return;

  if (customText) {
    line.textContent = customText;
    return;
  }

  line.textContent = '';
}

function renderSearchFeedback(customText) {
  const feedback = document.getElementById('librarySearchFeedback');
  if (!feedback) return;

  if (customText) {
    feedback.textContent = customText;
    feedback.hidden = false;
    return;
  }

  if (!LIBRARY_STATE.searchQuery) {
    feedback.textContent = '';
    feedback.hidden = true;
    return;
  }

  if (!LIBRARY_STATE.searchMatches.length) {
    feedback.textContent = 'No matching books found.';
    feedback.hidden = false;
    return;
  }

  const current = LIBRARY_STATE.searchMatches[LIBRARY_STATE.searchIndex] || LIBRARY_STATE.searchMatches[0];
  const record = current ? LIBRARY_STATE.recordByKey.get(current.key) : null;
  feedback.textContent = record
    ? `Match ${LIBRARY_STATE.searchIndex + 1}/${LIBRARY_STATE.searchMatches.length}: ${record.title}`
    : `${LIBRARY_STATE.searchMatches.length} matches`;
  feedback.hidden = false;
}

function renderShelves() {
  const host = document.getElementById('libraryShelves');
  if (!host) return;
  host.innerHTML = '';

  LIBRARY_STATE.shelves.forEach((shelf, index) => {
    const bay = document.createElement('article');
    const isActive = LIBRARY_STATE.activeShelfId === shelf.id;
    bay.className = `library-bay is-depth-${(index % 3) + 1}${isActive ? ' is-active' : ''}`;
    bay.dataset.shelfId = shelf.id;
    bay.dataset.depth = String((index % 3) + 1);
    bay.style.setProperty('--shelf-tint', shelf.color || '#8f6f44');
    bay.style.zIndex = String(isActive ? 40 : 10 + index);
    bay.style.left = `${Math.round(shelf.x)}px`;
    bay.style.top = `${Math.round(shelf.y)}px`;
    setShelfTransform(bay, shelf);

    const canAddRow = (shelf.rows || 2) < LIBRARY_MAX_ROWS;

    bay.innerHTML = `
      <div class="library-bay-backboard" data-drag-shelf="${escapeHTML(shelf.id)}">
        <div class="library-bay-head">
          <div class="library-bay-head-text">
            <h3>${escapeHTML(shelf.name)}</h3>
            <p>${shelf.bookKeys.length} books</p>
          </div>
          <div class="library-bay-actions">
            <button type="button" class="chip chip-mini${shelf.viewMode === 'spine' ? ' active' : ''}" data-shelf-id="${escapeHTML(shelf.id)}" data-shelf-mode="spine">Spine</button>
            <button type="button" class="chip chip-mini${shelf.viewMode === 'cover' ? ' active' : ''}" data-shelf-id="${escapeHTML(shelf.id)}" data-shelf-mode="cover">Cover</button>
            <button type="button" class="chip chip-mini${shelf.viewMode === 'mix' ? ' active' : ''}" data-shelf-id="${escapeHTML(shelf.id)}" data-shelf-mode="mix">Mix</button>
          </div>
        </div>
      </div>
      <div class="library-rows" data-shelf-id="${escapeHTML(shelf.id)}"></div>
      <div class="library-overflow-notice" data-shelf-id="${escapeHTML(shelf.id)}" hidden>
        <span class="library-overflow-text">This shelf is full. Add a row to fit all books.</span>
        <button type="button" class="library-overflow-btn" data-add-row="${escapeHTML(shelf.id)}" ${canAddRow ? '' : 'disabled'}>+ Add row</button>
      </div>
    `;

    const rowsHost = bay.querySelector('.library-rows');
    const rowGroups = splitRows(shelf.bookKeys, shelf.rows || 2, shelf);
    rowGroups.forEach((group, rowIndex) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'library-row';
      rowEl.dataset.shelfId = shelf.id;
      rowEl.dataset.rowIndex = String(rowIndex);
      rowEl.dataset.startIndex = String(group.start);
      rowEl.dataset.lane = 'true';

      group.keys.forEach((key, localIndex) => {
        const record = LIBRARY_STATE.recordByKey.get(key);
        if (!record) return;
        rowEl.appendChild(createShelfBook(record, shelf, group.start + localIndex));
      });

      rowsHost?.appendChild(rowEl);
    });

    host.appendChild(bay);
    clampShelfIntoPlane(shelf, bay);
    bay.style.left = `${Math.round(shelf.x)}px`;
    bay.style.top = `${Math.round(shelf.y)}px`;
  });

  requestAnimationFrame(() => {
    if (reflowIfMisestimated()) return;
    checkAllShelvesOverflow();
  });
}

function reflowIfMisestimated() {
  if (LIBRARY_STATE._reflowingShelves) return false;
  let needs = false;
  document.querySelectorAll('#panel-library .library-bay').forEach((bay) => {
    const rows = bay.querySelectorAll('.library-row');
    const shelfId = bay.dataset.shelfId || '';
    const shelf = getShelfById(shelfId);
    if (!shelf) return;
    rows.forEach((row, idx) => {
      const total = row.scrollWidth;
      const avail = row.clientWidth;
      if (avail > 0 && total - avail > 2 && idx < (shelf.rows || 2) - 1) {
        needs = true;
      }
    });
  });
  if (!needs) return false;
  LIBRARY_STATE._reflowingShelves = true;
  renderShelves();
  LIBRARY_STATE._reflowingShelves = false;
  return true;
}

function checkAllShelvesOverflow() {
  document.querySelectorAll('#panel-library .library-bay').forEach((bay) => {
    checkShelfOverflow(bay);
  });
}

function checkShelfOverflow(bay) {
  if (!bay) return;
  const rows = bay.querySelectorAll('.library-row');
  const notice = bay.querySelector('.library-overflow-notice');
  if (!notice) return;
  let overflow = false;
  rows.forEach((row) => {
    if (row.scrollWidth - row.clientWidth > 2) overflow = true;
  });
  notice.hidden = !overflow;
}

function createShelfBook(record, shelf, indexInShelf) {
  const mode = resolveBookMode(shelf.viewMode, indexInShelf);
  return mode === 'cover' ? createCoverCard(record, shelf.id) : createSpineCard(record, shelf.id);
}

function resolveBookMode(mode, index) {
  const normalized = normalizeShelfMode(mode);
  if (normalized === 'cover') return 'cover';
  if (normalized === 'mix') return (index % 3 === 0) ? 'cover' : 'spine';
  return 'spine';
}

function createSpineCard(record, shelfId) {
  const size = getSpineSize(record);
  const titleIsCJK = containsCJK(record.title);
  const authorIsCJK = containsCJK(record.author);
  const node = SpineCard.create({
    title: record.title,
    author: record.author,
    spine: record.spine,
    text: record.text,
    width: size.width,
    height: size.height,
    className: 'library-spine library-draggable',
    dataAttrs: { bookKey: record.key, shelfId },
    ariaLabel: `${record.title} by ${record.author}`,
    titleClass: `library-spine-title${titleIsCJK ? ' is-cjk' : ''}`,
    authorClass: `library-spine-author${authorIsCJK ? ' is-cjk' : ''}`,
    fontFamily: record.font,
    fontWeight: record.weight,
    fontSize: clampInt(record.size, 9, 18, 11),
    letterSpacing: record.tracking,
    topMark: record.topMark,
    band: record.band,
  });
  return node;
}

function createCoverCard(record, shelfId) {
  const cover = document.createElement('button');
  cover.type = 'button';
  cover.className = 'library-cover library-draggable';
  cover.dataset.bookKey = record.key;
  cover.dataset.shelfId = shelfId;
  cover.setAttribute('aria-label', `${record.title} by ${record.author}`);

  const src = resolveCoverImage(record);
  cover.style.setProperty('--cover-color', record.spine);
  cover.style.setProperty('--cover-text', record.text);
  cover.style.width = `${clampInt(Math.round(record.w * 2.35), 58, 124, 86)}px`;
  cover.style.height = `${clampInt(Math.round(record.h * 170), 116, 196, 148)}px`;

  if (src) {
    cover.innerHTML = `<img src="${escapeAttr(src)}" alt="" loading="lazy" /><span class="library-cover-fade"></span>`;
  } else {
    cover.innerHTML = `
      <div class="library-cover-inner">
        <span class="library-cover-title">${escapeHTML(record.title)}</span>
        <span class="library-cover-author">${escapeHTML(record.author)}</span>
      </div>
    `;
  }

  return cover;
}

function hasActiveInteraction() {
  return LIBRARY_STATE.interaction.type !== 'idle';
}

function applySceneModeState() {
  const host = document.getElementById('panel-library');
  if (host) host.dataset.sceneMode = 'flat';
}

function toggleShelfCreatePanel(forceOpen) {
  const panel = document.getElementById('libraryShelfCreate');
  if (!panel) return;
  panel.hidden = typeof forceOpen === 'boolean' ? !forceOpen : !panel.hidden;
}

function beginInteraction(type, event, target) {
  if (hasActiveInteraction()) return false;
  LIBRARY_STATE.interaction = {
    type,
    pointerId: event.pointerId,
    target: target || event.currentTarget || event.target || null,
  };
  try {
    LIBRARY_STATE.interaction.target?.setPointerCapture?.(event.pointerId);
  } catch {}
  return true;
}

function endInteraction(type) {
  const active = LIBRARY_STATE.interaction;
  if (type && active.type !== type) return;
  try {
    active.target?.releasePointerCapture?.(active.pointerId);
  } catch {}
  LIBRARY_STATE.interaction = { type: 'idle', pointerId: null, target: null };
}

function matchesActivePointer(event, type) {
  const active = LIBRARY_STATE.interaction;
  return active.type === type && (!event || active.pointerId === event.pointerId);
}

function startBookDrag(event, sourceEl) {
  if (LIBRARY_STATE.overlay.playing) return;
  if (!beginInteraction('book-drag', event, sourceEl)) return;
  event.preventDefault();

  if (LIBRARY_STATE.overlay.key && LIBRARY_STATE.overlay.key === (sourceEl.dataset.bookKey || '')) {
    closeBookInspector();
    endInteraction('book-drag');
    return;
  }

  const lane = sourceEl.closest('[data-lane="true"]');
  if (!lane) {
    endInteraction('book-drag');
    return;
  }

  const bookKey = sourceEl.dataset.bookKey || '';
  const sourceShelfId = sourceEl.dataset.shelfId || '';
  if (!bookKey) {
    endInteraction('book-drag');
    return;
  }

  const list = getShelfList(sourceShelfId);
  if (!list) {
    endInteraction('book-drag');
    return;
  }
  const sourceIndex = list.indexOf(bookKey);
  if (sourceIndex === -1) {
    endInteraction('book-drag');
    return;
  }

  const rect = sourceEl.getBoundingClientRect();
  const ghost = sourceEl.cloneNode(true);
  ghost.classList.add('library-drag-ghost');
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.position = 'fixed';
  ghost.style.margin = '0';
  document.body.appendChild(ghost);
  sourceEl.style.visibility = 'hidden';

  LIBRARY_STATE.drag = {
    bookKey,
    sourceShelfId,
    sourceEl,
    ghost,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    startX: event.clientX,
    startY: event.clientY,
    pointerId: event.pointerId,
    moved: false,
    targetLane: lane,
    targetIndex: sourceIndex,
  };

  positionGhost(event.clientX, event.clientY);

  window.addEventListener('pointermove', onBookDragMove);
  window.addEventListener('pointerup', onBookDragEnd);
  window.addEventListener('pointercancel', onBookDragEnd);
}

function onBookDragMove(event) {
  const drag = LIBRARY_STATE.drag;
  if (!drag || !matchesActivePointer(event, 'book-drag')) return;

  const movedEnough = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > LIBRARY_DRAG_THRESHOLD;
  if (movedEnough) drag.moved = true;

  positionGhost(event.clientX, event.clientY);

  if (!drag.moved) return;

  const lane = findLaneAtPoint(event.clientX, event.clientY);
  if (!lane) return;
  drag.targetLane = lane;
  drag.targetIndex = computeTargetIndexAtPoint(lane, event.clientX, drag.sourceEl);
}

function onBookDragEnd(event) {
  const drag = LIBRARY_STATE.drag;
  if (!drag || !matchesActivePointer(event, 'book-drag')) return;

  if (!drag.moved) {
    const record = LIBRARY_STATE.recordByKey.get(drag.bookKey);
    const sourceEl = drag.sourceEl;
    const sourceShelfId = drag.sourceShelfId;
    cleanupBookDrag();
    if (record && sourceEl?.isConnected) {
      playBookInteraction(sourceEl, record, sourceShelfId);
    }
    return;
  }

  const lane = drag.targetLane;
  const targetShelfId = lane?.dataset.shelfId || drag.sourceShelfId;
  const targetIndex = Number.isFinite(drag.targetIndex) ? drag.targetIndex : 0;
  moveBookToShelf(drag.bookKey, targetShelfId, targetIndex);
  cleanupBookDrag();
  renderLibrary();
  saveLayout();
}

function cleanupBookDrag() {
  const drag = LIBRARY_STATE.drag;
  if (!drag) return;

  drag.sourceEl.style.visibility = '';
  drag.ghost.remove();

  LIBRARY_STATE.drag = null;
  endInteraction('book-drag');
  window.removeEventListener('pointermove', onBookDragMove);
  window.removeEventListener('pointerup', onBookDragEnd);
  window.removeEventListener('pointercancel', onBookDragEnd);
}

function positionGhost(x, y) {
  const drag = LIBRARY_STATE.drag;
  if (!drag) return;
  drag.ghost.style.left = `${x - drag.offsetX}px`;
  drag.ghost.style.top = `${y - drag.offsetY}px`;
}

function startShelfDrag(event, shelfId) {
  const shelf = getShelfById(shelfId);
  if (!shelf) return;

  if (!beginInteraction('shelf-move', event, event.target.closest('.library-bay-backboard'))) return;
  event.preventDefault();

  const bay = document.querySelector(`#panel-library .library-bay[data-shelf-id="${cssEscape(shelf.id)}"]`);
  if (bay) bay.classList.add('is-shelf-dragging');

  LIBRARY_STATE.shelfDrag = {
    shelfId,
    startX: event.clientX,
    startY: event.clientY,
    shelfX: shelf.x,
    shelfY: shelf.y,
    tilt: shelf.tilt || 0,
    pitch: shelf.pitch || 0,
    yaw: shelf.yaw || 0,
    pointerId: event.pointerId,
  };

  window.addEventListener('pointermove', onShelfDragMove);
  window.addEventListener('pointerup', stopShelfDrag);
  window.addEventListener('pointercancel', stopShelfDrag);
}

function onShelfDragMove(event) {
  const drag = LIBRARY_STATE.shelfDrag;
  if (!drag || !matchesActivePointer(event, 'shelf-move')) return;

  const shelf = getShelfById(drag.shelfId);
  if (!shelf) return;

  const scale = Math.max(0.001, LIBRARY_STATE.view.scale);
  const dx = (event.clientX - drag.startX) / scale;
  const dy = (event.clientY - drag.startY) / scale;
  const bay = document.querySelector(`#panel-library .library-bay[data-shelf-id="${cssEscape(shelf.id)}"]`);
  const bounds = getShelfMovementBounds(bay);

  const candidateX = clamp(drag.shelfX + dx, bounds.minX, bounds.maxX, drag.shelfX);
  const candidateY = clamp(drag.shelfY + dy, bounds.minY, bounds.maxY, drag.shelfY);

  const w = bay?.offsetWidth || 420;
  const h = bay?.offsetHeight || 360;
  if (!shelfCollides(shelf.id, candidateX, candidateY, w, h)) {
    shelf.x = candidateX;
    shelf.y = candidateY;
  }

  if (bay) {
    bay.style.left = `${Math.round(shelf.x)}px`;
    bay.style.top = `${Math.round(shelf.y)}px`;
    setShelfTransform(bay, shelf);
  }
}

function shelfCollides(movingId, x, y, w, h) {
  void movingId;
  void x;
  void y;
  void w;
  void h;
  return false;
}

function stopShelfDrag(event) {
  if (!LIBRARY_STATE.shelfDrag || !matchesActivePointer(event, 'shelf-move')) return;
  const shelfId = LIBRARY_STATE.shelfDrag.shelfId;
  const bay = document.querySelector(`#panel-library .library-bay[data-shelf-id="${cssEscape(shelfId)}"]`);
  if (bay) bay.classList.remove('is-shelf-dragging');
  LIBRARY_STATE.shelfDrag = null;
  endInteraction('shelf-move');
  window.removeEventListener('pointermove', onShelfDragMove);
  window.removeEventListener('pointerup', stopShelfDrag);
  window.removeEventListener('pointercancel', stopShelfDrag);
  saveLayout();
}

function onSceneWheel(event) {
  if (!event.target.closest('#libraryScene')) return;
  event.preventDefault();

  if (!event.ctrlKey && !event.metaKey) return;

  const direction = event.deltaY > 0 ? -1 : 1;
  const factor = 1 + (direction * LIBRARY_WHEEL_STEP);
  zoomAtClientPoint(event.clientX, event.clientY, factor);
}

function onViewportScroll() {
  syncViewFromViewport();
  window.clearTimeout(LIBRARY_STATE._scrollSaveTimer);
  LIBRARY_STATE._scrollSaveTimer = window.setTimeout(() => {
    saveLayout();
  }, 160);
}

function zoomAtViewportCenter(factor) {
  const viewport = document.getElementById('librarySceneViewport');
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  zoomAtClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
}

function zoomAtClientPoint(clientX, clientY, factor) {
  const viewport = document.getElementById('librarySceneViewport');
  if (!viewport) return;

  const rect = viewport.getBoundingClientRect();
  const oldScale = LIBRARY_STATE.view.scale;
  const newScale = clamp(oldScale * factor, LIBRARY_ZOOM_MIN, LIBRARY_ZOOM_MAX, 1);
  if (Math.abs(newScale - oldScale) < 0.0001) return;

  const pointX = clientX - rect.left;
  const pointY = clientY - rect.top;
  const worldX = (viewport.scrollLeft + pointX) / oldScale;
  const worldY = (viewport.scrollTop + pointY) / oldScale;

  LIBRARY_STATE.view.scale = newScale;
  applyViewTransform(true);
  viewport.scrollLeft = Math.max(0, worldX * newScale - pointX);
  viewport.scrollTop = Math.max(0, worldY * newScale - pointY);
  syncViewFromViewport();
  saveLayout();
}

function centerViewport({ animated }) {
  const viewport = document.getElementById('librarySceneViewport');
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();

  const bounds = computeShelfBounds();
  if (!bounds) return;

  LIBRARY_STATE.view.x = Math.max(0, ((bounds.minX + bounds.maxX) / 2) * LIBRARY_STATE.view.scale - (rect.width / 2));
  LIBRARY_STATE.view.y = Math.max(0, ((bounds.minY + bounds.maxY) / 2) * LIBRARY_STATE.view.scale - (rect.height / 2));
  applyViewTransform(Boolean(animated));
}

function fitShelvesToViewport({ animated, padding = 28, forceFit = false }) {
  const viewport = document.getElementById('librarySceneViewport');
  if (!viewport) return;

  const rect = viewport.getBoundingClientRect();
  const bounds = computeShelfBounds();
  if (!bounds) return;

  const worldW = Math.max(320, bounds.maxX - bounds.minX);
  const worldH = Math.max(220, bounds.maxY - bounds.minY);

  const availW = Math.max(120, rect.width - (padding * 2));
  const availH = Math.max(120, rect.height - (padding * 2));
  const scaleX = availW / worldW;
  const scaleY = availH / worldH;
  const fitMin = forceFit ? LIBRARY_FIT_ZOOM_MIN : LIBRARY_ZOOM_MIN;
  const nextScale = clamp(Math.min(scaleX, scaleY), fitMin, LIBRARY_ZOOM_MAX, 1);

  LIBRARY_STATE.view.scale = nextScale;
  LIBRARY_STATE.view.x = Math.max(0, ((bounds.minX + bounds.maxX) / 2) * nextScale - (rect.width / 2));
  LIBRARY_STATE.view.y = Math.max(0, ((bounds.minY + bounds.maxY) / 2) * nextScale - (rect.height / 2));

  applyViewTransform(Boolean(animated));
}

function resetFrontView({ animated }) {
  arrangeShelvesForFrontView();
  applyCameraTransform();
  fitShelvesToViewport({ animated, padding: 10, forceFit: true });
}

function computeShelfBounds() {
  const shelves = document.querySelectorAll('#panel-library .library-bay');
  if (!shelves.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  shelves.forEach((bay) => {
    const shelfId = bay.dataset.shelfId || '';
    const model = getShelfById(shelfId);
    if (!model) return;

    const width = bay.offsetWidth || 420;
    const height = bay.offsetHeight || 360;

    minX = Math.min(minX, model.x);
    minY = Math.min(minY, model.y);
    maxX = Math.max(maxX, model.x + width);
    maxY = Math.max(maxY, model.y + height);
  });

  return { minX, minY, maxX, maxY };
}

function applyViewTransform(animated) {
  const viewport = document.getElementById('librarySceneViewport');
  const world = document.getElementById('libraryShelves');
  if (!world || !viewport) return;
  world.classList.toggle('is-animated', !!animated);
  world.style.transform = `scale(${LIBRARY_STATE.view.scale})`;
  viewport.scrollLeft = Math.max(0, LIBRARY_STATE.view.x);
  viewport.scrollTop = Math.max(0, LIBRARY_STATE.view.y);
  syncViewFromViewport();
}

function syncViewFromViewport() {
  const viewport = document.getElementById('librarySceneViewport');
  if (!viewport) return;
  LIBRARY_STATE.view.x = Math.max(0, viewport.scrollLeft || 0);
  LIBRARY_STATE.view.y = Math.max(0, viewport.scrollTop || 0);
}

function applyCameraTransform() {
  applySceneModeState();
  document.querySelectorAll('#panel-library .library-bay').forEach((node) => {
    const shelf = getShelfById(node.dataset.shelfId || '');
    if (shelf) setShelfTransform(node, shelf);
  });
}

function findLaneAtPoint(x, y) {
  const lanes = Array.from(document.querySelectorAll('#panel-library [data-lane="true"]'));
  return lanes.find((lane) => {
    const rect = lane.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }) || null;
}

function computeTargetIndexAtPoint(lane, x, sourceEl) {
  if (!lane) return 0;
  const startIndex = Number(lane.dataset.startIndex || 0);
  const children = Array.from(lane.children).filter((node) => node !== sourceEl);

  for (let i = 0; i < children.length; i += 1) {
    const rect = children[i].getBoundingClientRect();
    if (x < rect.left + (rect.width / 2)) {
      return startIndex + i;
    }
  }

  return startIndex + children.length;
}

function moveBookToShelf(bookKey, targetShelfId, targetIndex) {
  const allLists = LIBRARY_STATE.shelves.map((shelf) => shelf.bookKeys);
  allLists.forEach((list) => {
    const idx = list.indexOf(bookKey);
    if (idx !== -1) list.splice(idx, 1);
  });

  const target = getShelfList(targetShelfId);
  if (!target) return;

  const safeIndex = clampInt(targetIndex, 0, target.length, target.length);
  target.splice(safeIndex, 0, bookKey);

  syncStatusToSource(bookKey, targetShelfId);
}

function setOverlayPhase(overlay, phase) {
  if (!overlay) return;
  overlay.className = phase
    ? `library-book-overlay is-${phase}`
    : 'library-book-overlay';
}

function playBookInteraction(sourceEl, record, sourceShelfId) {
  const overlay = document.getElementById('libraryBookOverlay');
  const book = document.getElementById('libraryOverlayBook');
  const spineFace = document.getElementById('libraryOverlaySpine');
  const coverFace = document.getElementById('libraryOverlayCover');
  const info = document.getElementById('libraryOverlayInfo');
  const eyebrow = document.getElementById('libraryOverlayEyebrow');
  const divider = document.getElementById('libraryOverlayDivider');
  const title = document.getElementById('libraryOverlayTitle');
  const author = document.getElementById('libraryOverlayAuthor');
  const summary = document.getElementById('libraryOverlaySummary');
  const tags = document.getElementById('libraryOverlayTags');
  const actions = document.getElementById('libraryOverlayActions');

  if (!overlay || !book || !spineFace || !coverFace || !info || !sourceEl || !record || !actions) return;

  if (LIBRARY_STATE.overlay.key && LIBRARY_STATE.overlay.key !== record.key) {
    closeBookInspector({ immediate: true });
  }
  if (LIBRARY_STATE.overlay.playing) return;
  const rect = sourceEl.getBoundingClientRect();
  const sceneRect = document.getElementById('libraryScene')?.getBoundingClientRect();
  if (!sceneRect) return;

  clearOverlayTimers();
  LIBRARY_STATE.overlay.playing = true;
  LIBRARY_STATE.overlay.key = record.key;
  LIBRARY_STATE.overlay.sourceShelfId = sourceShelfId || sourceEl.dataset.shelfId || '';
  const sourceFace = sourceEl.classList.contains('library-cover') ? 'cover' : 'spine';
  const spineSize = getSpineSize(record);

  const expandedHeight = clampInt(
    Math.max(rect.height * 1.86, spineSize.height + 138),
    300,
    420,
    368,
  );
  const coverWidth = clampInt(Math.max(spineSize.width * 5.1, expandedHeight * 0.62), 220, 280, 248);
  const infoWidth = clampInt(Math.round(coverWidth * 0.86), 198, 244, 220);
  const gap = clampInt(coverWidth * 0.02, 4, 8, 6);
  const expandedWidth = spineSize.width + gap + infoWidth;
  const viewportInset = 18;
  const minLeft = Math.max(viewportInset, sceneRect.left + 24);
  const maxLeft = Math.min(window.innerWidth - expandedWidth - viewportInset, sceneRect.right - expandedWidth - 24);
  const minTop = Math.max(viewportInset, sceneRect.top + 24);
  const maxTop = Math.min(window.innerHeight - expandedHeight - viewportInset, sceneRect.bottom - expandedHeight - 24);
  const expandedLeft = clamp(
    sceneRect.left + ((sceneRect.width - expandedWidth) / 2),
    minLeft,
    Math.max(minLeft, maxLeft),
    sceneRect.left + ((sceneRect.width - expandedWidth) / 2),
  );
  const expandedTop = clamp(
    sceneRect.top + ((sceneRect.height - expandedHeight) / 2),
    minTop,
    Math.max(minTop, maxTop),
    sceneRect.top + ((sceneRect.height - expandedHeight) / 2),
  );
  const originX = rect.left - expandedLeft;
  const originY = rect.top - expandedTop;
  const titleSize = clampInt(
    containsCJK(record.title)
      ? coverWidth * (record.title.length > 10 ? 0.18 : 0.21)
      : coverWidth * (record.title.length > 26 ? 0.13 : 0.145),
    24,
    40,
    containsCJK(record.title) ? 34 : 30,
  );

  overlay.hidden = false;
  setOverlayPhase(overlay, 'start');
  overlay.dataset.bookKey = record.key;
  overlay.dataset.sourceShelfId = LIBRARY_STATE.overlay.sourceShelfId;
  overlay.dataset.sourceFace = sourceFace;
  overlay.style.setProperty('--overlay-origin-width', `${rect.width}px`);
  overlay.style.setProperty('--overlay-origin-height', `${rect.height}px`);
  overlay.style.setProperty('--overlay-origin-x', `${originX}px`);
  overlay.style.setProperty('--overlay-origin-y', `${originY}px`);
  overlay.style.setProperty('--overlay-origin-scale-x', `${(rect.width / Math.max(1, spineSize.width)).toFixed(4)}`);
  overlay.style.setProperty('--overlay-origin-scale-y', `${(rect.height / Math.max(1, expandedHeight)).toFixed(4)}`);
  overlay.style.setProperty('--overlay-spine-width', `${spineSize.width}px`);
  overlay.style.setProperty('--overlay-open-width', `${expandedWidth}px`);
  overlay.style.setProperty('--overlay-open-height', `${expandedHeight}px`);
  overlay.style.setProperty('--overlay-cover-width', `${coverWidth}px`);
  overlay.style.setProperty('--overlay-info-width', `${infoWidth}px`);
  overlay.style.setProperty('--overlay-gap', `${gap}px`);
  overlay.style.setProperty('--overlay-title-size', `${titleSize}px`);

  sourceEl.classList.add('is-lift-origin');

  spineFace.style.background = record.spine;
  spineFace.style.color = record.text;
  spineFace.innerHTML = `
    <span class="library-overlay-spine-title${containsCJK(record.title) ? ' is-cjk' : ''}">${escapeHTML(record.title)}</span>
    <span class="library-overlay-spine-author${containsCJK(record.author) ? ' is-cjk' : ''}">${escapeHTML(record.author)}</span>
  `;

  const src = resolveCoverImage(record);
  coverFace.style.background = record.spine;
  coverFace.style.color = record.text;
  if (src) {
    coverFace.innerHTML = `<img src="${escapeAttr(src)}" alt="" loading="lazy"><span class="library-overlay-cover-gloss"></span>`;
  } else {
    coverFace.innerHTML = `
      <div class="library-overlay-cover-inner">
        <span class="library-overlay-cover-title">${escapeHTML(record.title)}</span>
        <span class="library-overlay-cover-author">${escapeHTML(record.author)}</span>
      </div>
    `;
  }

  if (eyebrow) eyebrow.textContent = '';
  if (divider) divider.hidden = !firstOverlaySentence(record.summary);
  title.textContent = primaryOverlayTitle(record.title);
  author.textContent = record.author;
  summary.textContent = firstOverlaySentence(record.summary);
  tags.innerHTML = (record.tags || []).slice(0, 4).map((tag) => `<span>${escapeHTML(tag)}</span>`).join('');
  actions.innerHTML = buildOverlayActions(record, LIBRARY_STATE.overlay.sourceShelfId);

  requestAnimationFrame(() => {
    document.getElementById('panel-library')?.classList.add('is-inspecting');
    setOverlayPhase(overlay, 'open');
    LIBRARY_STATE.overlay.playing = false;
  });
}

function buildOverlayActions(record, sourceShelfId) {
  void sourceShelfId;
  if (!record.id) {
    return '<button type="button" class="library-overlay-readmore" data-overlay-close="true">Close</button>';
  }
  return `<button type="button" class="library-overlay-readmore" data-open-book="${escapeHTML(record.key)}">Read More <span aria-hidden="true">→</span></button>`;
}

function firstOverlaySentence(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/^(.+?[。！？.!?])(?:\s|$)/);
  if (match) return match[1].trim();
  return text.length > 86 ? `${text.slice(0, 85).trim()}…` : text;
}

function primaryOverlayTitle(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/^(.+?)(?:\s*[:：]\s*|\s+[—-]\s+|\s+\|\s+)/);
  return (match?.[1] || text).trim();
}

function closeBookInspector({ immediate = false } = {}) {
  const overlay = document.getElementById('libraryBookOverlay');
  if (!overlay || overlay.hidden) return;

  clearOverlayTimers();
  const finalize = () => {
    overlay.hidden = true;
    setOverlayPhase(overlay, '');
    delete overlay.dataset.bookKey;
    delete overlay.dataset.sourceShelfId;
    delete overlay.dataset.sourceFace;
    document.querySelectorAll('#panel-library .is-lift-origin').forEach((node) => {
      node.classList.remove('is-lift-origin');
    });
    LIBRARY_STATE.overlay.playing = false;
    LIBRARY_STATE.overlay.key = '';
    LIBRARY_STATE.overlay.sourceShelfId = '';
    document.getElementById('panel-library')?.classList.remove('is-inspecting');
  };

  if (immediate || overlay.classList.contains('is-start')) {
    finalize();
    return;
  }

  setOverlayPhase(overlay, 'closing');
  LIBRARY_STATE.overlay.playing = true;
  LIBRARY_STATE.overlay.timers.push(window.setTimeout(finalize, 360));
}

function clearOverlayTimers() {
  LIBRARY_STATE.overlay.timers.forEach((timerId) => window.clearTimeout(timerId));
  LIBRARY_STATE.overlay.timers = [];
}

function syncOverlayWithRenderedBook() {
  if (!LIBRARY_STATE.overlay.key) return;
  const overlay = document.getElementById('libraryBookOverlay');
  const sourceNode = document.querySelector(`#panel-library .library-draggable[data-book-key="${cssEscape(LIBRARY_STATE.overlay.key)}"]`);
  if (!overlay || overlay.hidden || !sourceNode) return;
  sourceNode.classList.add('is-lift-origin');
}

function setShelfTransform(node, shelf) {
  void shelf;
  node.style.transform = 'none';
}

function getShelfMovementBounds(node) {
  const world = document.getElementById('libraryShelves');
  const planeWidth = world?.offsetWidth || LIBRARY_WORLD_WIDTH;
  const planeHeight = world?.offsetHeight || LIBRARY_WORLD_HEIGHT;
  const shelfWidth = node?.offsetWidth || node?.width || 420;
  const shelfHeight = node?.offsetHeight || node?.height || 360;
  const paddingX = 22;
  const paddingY = 28;

  return {
    minX: paddingX,
    maxX: Math.max(paddingX, planeWidth - shelfWidth - paddingX),
    minY: paddingY,
    maxY: Math.max(paddingY, planeHeight - shelfHeight - paddingY),
  };
}

function clampShelfIntoPlane(shelf, node) {
  if (!shelf) return;
  const bounds = getShelfMovementBounds(node);
  shelf.x = clamp(Number(shelf.x) || 0, bounds.minX, bounds.maxX, bounds.minX);
  shelf.y = clamp(Number(shelf.y) || 0, bounds.minY, bounds.maxY, bounds.minY);
}

function arrangeShelvesForFrontView() {
  if (!LIBRARY_STATE.shelves.length) return;

  const paddingX = 32;
  const paddingTop = 28;
  const gapX = 14;
  const gapY = 24;
  const preferredColumns = LIBRARY_STATE.shelves.length >= 4 ? 4 : Math.min(3, LIBRARY_STATE.shelves.length);
  const maxColumns = Math.min(preferredColumns, LIBRARY_STATE.shelves.length);
  const widths = [];
  const heights = [];

  LIBRARY_STATE.shelves.forEach((shelf) => {
    const node = document.querySelector(`#panel-library .library-bay[data-shelf-id="${cssEscape(shelf.id)}"]`);
    widths.push(node?.offsetWidth || 420);
    heights.push(node?.offsetHeight || 360);
  });

  const maxWidth = Math.max(...widths, 420);
  const maxHeight = Math.max(...heights, 360);
  const columns = Math.max(1, maxColumns);
  const rows = Math.ceil(LIBRARY_STATE.shelves.length / columns);
  const totalWidth = (columns * maxWidth) + ((columns - 1) * gapX);
  const totalHeight = (rows * maxHeight) + ((rows - 1) * gapY);
  const originX = Math.max(paddingX, Math.round((LIBRARY_WORLD_WIDTH - totalWidth) / 2));
  const originY = Math.max(paddingTop, Math.round((LIBRARY_WORLD_HEIGHT - totalHeight) / 2));

  LIBRARY_STATE.shelves.forEach((shelf, index) => {
    const node = document.querySelector(`#panel-library .library-bay[data-shelf-id="${cssEscape(shelf.id)}"]`);
    const width = node?.offsetWidth || 420;
    const height = node?.offsetHeight || 360;
    const col = index % columns;
    const row = Math.floor(index / columns);
    const colX = originX + col * (maxWidth + gapX);
    const rowY = originY + row * (maxHeight + gapY);

    shelf.x = colX + Math.max(0, (maxWidth - width) / 2);
    shelf.y = rowY + Math.max(0, (maxHeight - height) / 2);
    shelf.tilt = 0;
    shelf.pitch = 0;
    shelf.yaw = 0;

    clampShelfIntoPlane(shelf, node);
    if (node) {
      node.style.left = `${Math.round(shelf.x)}px`;
      node.style.top = `${Math.round(shelf.y)}px`;
      setShelfTransform(node, shelf);
    }
  });
}

function setSearchQuery(value) {
  LIBRARY_STATE.searchQuery = String(value || '').trim().toLowerCase();
  LIBRARY_STATE.searchMatches = findSearchMatches(LIBRARY_STATE.searchQuery);
  LIBRARY_STATE.searchIndex = 0;
  updateSearchHighlight();
  renderSearchFeedback();
}

function updateSearchHighlight() {
  const keySet = new Set(LIBRARY_STATE.searchMatches.map((item) => item.key));
  const active = LIBRARY_STATE.searchMatches[LIBRARY_STATE.searchIndex] || null;

  document.querySelectorAll('#panel-library .library-draggable').forEach((node) => {
    const key = node.dataset.bookKey || '';
    node.classList.remove('is-search-hit', 'is-search-active');
    if (!LIBRARY_STATE.searchQuery || !keySet.has(key)) return;
    node.classList.add('is-search-hit');
    if (active && active.key === key) node.classList.add('is-search-active');
  });
}

function focusSearchResult() {
  if (!LIBRARY_STATE.searchQuery) return;

  if (!LIBRARY_STATE.searchMatches.length) {
    renderSearchFeedback('No matching books found.');
    return;
  }

  const match = LIBRARY_STATE.searchMatches[LIBRARY_STATE.searchIndex] || LIBRARY_STATE.searchMatches[0];
  focusShelfForMatch(match);
}

function focusShelfForMatch(match) {
  const shelfId = match?.shelfId;
  const key = match?.key;
  if (!shelfId || !key) return;

  const shelfEl = document.querySelector(`#panel-library .library-bay[data-shelf-id="${cssEscape(shelfId)}"]`);
  const viewport = document.getElementById('librarySceneViewport');
  if (shelfEl && viewport) {
    const bayRect = shelfEl.getBoundingClientRect();
    const vpRect = viewport.getBoundingClientRect();
    const shelf = getShelfById(shelfId);

    const worldCenterX = (shelf?.x || 0) + (bayRect.width / 2);
    const worldCenterY = (shelf?.y || 0) + (bayRect.height / 2);

    const targetScale = clamp(Math.max(LIBRARY_STATE.view.scale, 1.08), LIBRARY_ZOOM_MIN, LIBRARY_ZOOM_MAX, 1);
    LIBRARY_STATE.view.scale = targetScale;
    LIBRARY_STATE.view.x = Math.max(0, worldCenterX * targetScale - (vpRect.width / 2));
    LIBRARY_STATE.view.y = Math.max(0, worldCenterY * targetScale - (vpRect.height / 2));
    applyViewTransform(true);
  }

  setActiveShelf(shelfId);
  const found = LIBRARY_STATE.recordByKey.get(key);
  renderSearchFeedback(`Located: ${found?.title || 'Book'}`);
  window.setTimeout(() => triggerLocateLift(key), 120);

  saveLayout();
}

function triggerLocateLift(bookKey) {
  const node = document.querySelector(`#panel-library .library-draggable[data-book-key="${cssEscape(bookKey)}"]`);
  if (!node) return;
  node.classList.remove('is-locate-lift');
  void node.offsetWidth;
  node.classList.add('is-locate-lift');
  window.setTimeout(() => node.classList.remove('is-locate-lift'), 760);
}

function findSearchMatches(query) {
  if (!query) return [];
  const matches = [];

  LIBRARY_STATE.shelves.forEach((shelf) => {
    shelf.bookKeys.forEach((key) => {
      const record = LIBRARY_STATE.recordByKey.get(key);
      if (!record || !record.searchText.includes(query)) return;
      matches.push({ key, shelfId: shelf.id });
    });
  });

  return matches;
}

function createShelfFromForm() {
  const nameInput = document.getElementById('libraryShelfName');
  const rowsInput = document.getElementById('libraryShelfRows');
  const colorInput = document.getElementById('libraryShelfColor');
  if (!nameInput || !rowsInput || !colorInput) return;

  const name = nameInput.value.trim();
  if (!name) return;

  const idBase = slugify(name);
  let id = idBase;
  let i = 2;
  while (LIBRARY_STATE.shelves.some((shelf) => shelf.id === id)) {
    id = `${idBase}-${i}`;
    i += 1;
  }

  LIBRARY_STATE.shelves.push({
    id,
    name,
    rows: clampInt(Number(rowsInput.value), 1, LIBRARY_MAX_ROWS, 2),
    color: colorInput.value || '#8f6f44',
    viewMode: 'spine',
    status: '',
    x: 220 + (LIBRARY_STATE.shelves.length % 3) * 120,
    y: 220 + Math.floor(LIBRARY_STATE.shelves.length / 3) * 220,
    tilt: 0,
    pitch: 0,
    yaw: 0,
    bookKeys: [],
  });

  nameInput.value = '';
  toggleShelfCreatePanel(false);
  renderLibrary();
  saveLayout();
  requestAnimationFrame(() => fitShelvesToViewport({ animated: true, padding: 28 }));
}

function removeShelf(shelfId) {
  const shelf = getShelfById(shelfId);
  if (!shelf) return;

  const confirmShelf = getShelfById('confirm-later');
  if (confirmShelf && confirmShelf.id !== shelfId) {
    confirmShelf.bookKeys.push(...shelf.bookKeys);
  }
  LIBRARY_STATE.shelves = LIBRARY_STATE.shelves.filter((item) => item.id !== shelfId);
  if (LIBRARY_STATE.activeShelfId === shelfId) LIBRARY_STATE.activeShelfId = '';

  renderLibrary();
  saveLayout();
  requestAnimationFrame(() => fitShelvesToViewport({ animated: true, padding: 28 }));
}

function setShelfMode(shelfId, mode) {
  const shelf = getShelfById(shelfId);
  if (!shelf) return;
  shelf.viewMode = normalizeShelfMode(mode);
  renderLibrary();
  saveLayout();
}

function addShelfRow(shelfId) {
  const shelf = getShelfById(shelfId);
  if (!shelf) return;
  const current = clampInt(shelf.rows, 1, LIBRARY_MAX_ROWS, 2);
  if (current >= LIBRARY_MAX_ROWS) return;
  shelf.rows = current + 1;
  renderLibrary();
  requestAnimationFrame(() => fitShelvesToViewport({ animated: true, padding: 28 }));
  saveLayout();
}

function setActiveShelf(shelfId) {
  if (LIBRARY_STATE.activeShelfId === shelfId) return;
  LIBRARY_STATE.activeShelfId = shelfId || '';
  document.querySelectorAll('#panel-library .library-bay').forEach((bay) => {
    bay.classList.toggle('is-active', bay.dataset.shelfId === LIBRARY_STATE.activeShelfId);
  });
  syncLibraryRailState();
}

function applyArrangement(mode) {
  LIBRARY_STATE.arrangeMode = mode === 'reset' ? 'status' : mode;
  if (mode === 'status' || mode === 'reset') {
    arrangeByStatus();
    return;
  }

  if (mode === 'color') {
    clearLayoutBooks();
    const shelves = getPlacementShelves();
    LIBRARY_STATE.records
      .slice()
      .sort((a, b) => getColorHue(a.spine) - getColorHue(b.spine))
      .forEach((record, index) => {
        const shelf = shelves[index % shelves.length];
        shelf.bookKeys.push(record.key);
        syncStatusToSource(record.key, shelf.id);
      });
    return;
  }

  if (mode === 'size') {
    clearLayoutBooks();
    const shelves = getPlacementShelves();
    LIBRARY_STATE.records
      .slice()
      .sort((a, b) => (b.h * b.w) - (a.h * a.w))
      .forEach((record, index) => {
        const shelf = shelves[index % shelves.length];
        shelf.bookKeys.push(record.key);
        syncStatusToSource(record.key, shelf.id);
      });
  }
}

function arrangeByStatus() {
  ensureBaseShelves();
  clearLayoutBooks();

  LIBRARY_STATE.records.forEach((record) => {
    const targetId = mapStatusToShelfId(record.status);
    const shelf = getShelfById(targetId);
    if (shelf) shelf.bookKeys.push(record.key);
  });
}

function getPlacementShelves() {
  ensureBaseShelves();
  return LIBRARY_STATE.shelves.length ? LIBRARY_STATE.shelves : [];
}

function clearLayoutBooks() {
  LIBRARY_STATE.shelves.forEach((shelf) => {
    shelf.bookKeys = [];
  });
}

function getShelfList(shelfId) {
  const shelf = getShelfById(shelfId);
  return shelf ? shelf.bookKeys : null;
}

function getShelfById(shelfId) {
  return LIBRARY_STATE.shelves.find((shelf) => shelf.id === shelfId) || null;
}

function syncStatusToSource(bookKey, shelfId) {
  const shelf = getShelfById(shelfId);
  const status = shelf?.status || '';
  if (!status) return;

  const record = LIBRARY_STATE.recordByKey.get(bookKey);
  if (!record) return;
  record.status = status;

  const source = BooksStore.getShelfBooks()?.[record.sourceIndex];
  if (source) source.status = status;
}

function splitRows(bookKeys, rowCount, shelf) {
  const rows = clampInt(rowCount, 1, LIBRARY_MAX_ROWS, 2);
  if (!bookKeys.length) return Array.from({ length: rows }, () => ({ start: 0, keys: [] }));

  const list = Array.from({ length: rows }, () => ({ start: 0, keys: [] }));
  const widths = bookKeys.map((key, i) => estimateBookSlot(LIBRARY_STATE.recordByKey.get(key), shelf, i));
  const rowCap = getRowCapacityPx();
  const gap = 6;

  let rowIndex = 0;
  let used = 0;
  let started = false;
  bookKeys.forEach((key, i) => {
    const w = widths[i];
    const next = used === 0 ? w : used + gap + w;
    if (next > rowCap && rowIndex < rows - 1 && used > 0) {
      rowIndex += 1;
      used = w;
      list[rowIndex].start = i;
      list[rowIndex].keys.push(key);
      return;
    }
    if (!started) {
      list[rowIndex].start = i;
      started = true;
    }
    used = next;
    list[rowIndex].keys.push(key);
  });

  return list;
}

function estimateBookSlot(record, shelf, indexInShelf) {
  if (!record) return 50;
  const mode = resolveBookMode(shelf?.viewMode || 'spine', indexInShelf);
  if (mode === 'cover') return clampInt(Math.round(record.w * 2.35), 58, 124, 86);
  return clampInt(Math.round(record.w), 24, 62, 36);
}

function getRowCapacityPx() {
  const bay = document.querySelector('#panel-library .library-bay');
  if (bay) {
    const row = bay.querySelector('.library-row');
    if (row) {
      const width = row.clientWidth;
      if (width > 40) return Math.max(120, width - 18);
    }
    const bayWidth = bay.clientWidth;
    if (bayWidth > 40) return Math.max(120, bayWidth - 38);
  }
  return 340;
}

function resolveCoverImage(record) {
  return record.coverPreview || record.coverImage || '';
}

function getSpineSize(record) {
  return {
    width: clampInt(Math.round(record.w), 24, 62, 36),
    height: clampInt(Math.round(record.h * 194), 122, 218, 172),
  };
}

let _layoutSaveTimer = null;

function saveLayout() {
  const payload = {
    shelves: LIBRARY_STATE.shelves.map((shelf) => ({
      id: shelf.id,
      name: shelf.name,
      rows: shelf.rows,
      color: shelf.color,
      viewMode: shelf.viewMode,
      status: shelf.status,
      x: shelf.x,
      y: shelf.y,
      tilt: shelf.tilt,
      pitch: shelf.pitch,
      yaw: shelf.yaw,
      bookKeys: shelf.bookKeys.slice(),
    })),
    view: {
      x: LIBRARY_STATE.view.x,
      y: LIBRARY_STATE.view.y,
      scale: LIBRARY_STATE.view.scale,
    },
    camera: { yaw: 0, pitch: 0 },
    sceneMode: 'flat',
  };

  // Always write localStorage as a fast local cache.
  try {
    localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    logError(error, { context: 'Library localStorage save' });
  }

  // Debounced Firestore write (≥500ms after last drag-end) when signed in.
  const auth = MarginaliaAuth;
  const uid  = auth?.user?.uid;
  const db   = auth?.db;
  if (!uid || !db) return;

  if (_layoutSaveTimer) clearTimeout(_layoutSaveTimer);
  _layoutSaveTimer = setTimeout(() => {
    _layoutSaveTimer = null;
    db.collection('users').doc(uid).collection('data').doc('library_layout')
      .set(withMeta(payload), { merge: true })
      .catch((err) => logError(err, { context: 'Library Firestore layout save' }));
  }, 500);
}

async function readStoredLayout() {
  // Prefer Firestore when signed in; fall back to localStorage.
  const auth = MarginaliaAuth;
  const uid  = auth?.user?.uid;
  const db   = auth?.db;

  if (uid && db) {
    try {
      const doc = await db.collection('users').doc(uid).collection('data').doc('library_layout').get();
      if (doc.exists) {
        const data = doc.data();
        if (data && Array.isArray(data.shelves)) return data;
      }
    } catch (err) {
      logError(err, { context: 'Library Firestore layout read' });
    }
  }

  // localStorage fallback (unauthenticated or Firestore miss).
  try {
    const raw = localStorage.getItem(LIBRARY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.shelves)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export { initLibrary, enterLibrary };
export function enterPanel_library(params = {}) { enterLibrary(params); }
