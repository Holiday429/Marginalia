/* Library view — movable shelf room */

const LIBRARY_STORAGE_KEY = 'marginalia:library-layout:v5';
const LIBRARY_WORLD_WIDTH = 2400;
const LIBRARY_WORLD_HEIGHT = 2400;

const LIBRARY_DEFAULT_SHELVES = [
  { id: 'reading-now', name: 'Reading Now', rows: 2, color: '#8da6d9', viewMode: 'spine', status: 'reading', bookKeys: [], x: 80, y: 40, tilt: 0, pitch: 0, yaw: 0 },
  { id: 'reading-plan', name: 'Reading Plan', rows: 2, color: '#d4a869', viewMode: 'cover', status: 'want', bookKeys: [], x: 540, y: 140, tilt: 0, pitch: 0, yaw: 0 },
  { id: 'finished', name: 'Finished', rows: 2, color: '#95a78d', viewMode: 'mix', status: 'finished', bookKeys: [], x: 980, y: 70, tilt: 0, pitch: 0, yaw: 0 },
];

const LIBRARY_STATE = {
  records: [],
  recordByKey: new Map(),
  shelves: [],
  pool: [],
  drag: null,
  shelfDrag: null,
  shelfRotateDrag: null,
  lookDrag: null,
  view: { x: 0, y: 0, scale: 1 },
  camera: { yaw: 0, pitch: 0 },
  searchQuery: '',
  searchMatches: [],
  searchIndex: 0,
  overlay: { playing: false, key: '', sourceShelfId: '', timers: [] },
  activeShelfId: '',
  bound: false,
};

const LIBRARY_MAX_ROWS = 6;

function initLibrary() {
  const host = document.getElementById('view-studio');
  if (!host) return;

  host.innerHTML = `
    <div class="page library-page">
      ${typeof window.renderPrimaryHeader === 'function'
        ? window.renderPrimaryHeader('studio', { actionLabel: 'Add Book', actionId: 'libraryAddBookBtn' })
        : ''
      }

      <section class="library-main">
        <header class="library-head section-head">
          <div class="library-head-copy">
            <h2 class="section-subtitle">Library Room</h2>
            <p class="library-subtitle">Move shelves like furniture, zoom through your room, and organize by touch.</p>
          </div>

          <div class="library-head-tools">
            <form class="library-search" id="librarySearchForm" autocomplete="off">
              <label class="service-ui-label" for="librarySearchInput">Search In Library</label>
              <div class="library-search-row">
                <input id="librarySearchInput" type="search" placeholder="Title, author" />
                <button type="submit" class="chip">Locate</button>
              </div>
            </form>

            <div class="library-toolbar-row">
              <button type="button" class="chip active" data-arrange="status">Auto By Status</button>
              <button type="button" class="chip" data-arrange="color">Auto By Color</button>
              <button type="button" class="chip" data-arrange="size">Auto By Size</button>
              <button type="button" class="chip" data-arrange="reset">Reset</button>
              <button type="button" class="chip chip-ghost" id="libraryToggleShelfPanel">Add Shelf</button>
            </div>
          </div>
        </header>

        <div class="library-shelf-create" id="libraryShelfCreate" hidden>
          <form id="libraryShelfForm" class="library-shelf-form" autocomplete="off">
            <label>
              <span>Name</span>
              <input id="libraryShelfName" type="text" placeholder="Poetry" maxlength="28" />
            </label>
            <label>
              <span>Rows</span>
              <select id="libraryShelfRows">
                <option value="1">1</option>
                <option value="2" selected>2</option>
                <option value="3">3</option>
              </select>
            </label>
            <label>
              <span>Tint</span>
              <input id="libraryShelfColor" type="color" value="#8f6f44" />
            </label>
            <button type="submit" class="chip">Create Shelf</button>
          </form>
        </div>

        <div class="library-meta-row">
          <div class="library-stats" id="libraryStats"></div>
          <p class="library-status-line" id="libraryStatusLine">Drag books across shelves. Drag shelf titles to move shelves.</p>
        </div>

        <section class="library-arrival-section">
          <div class="library-arrival-head">
            <h3>Arrival Books</h3>
            <span id="libraryPoolCount">0 waiting</span>
          </div>
          <div class="library-arrival-pile" id="libraryPool" data-shelf-id="pool" data-lane="true"></div>
        </section>

        <section class="library-scene-wrap">
          <div class="library-scene" id="libraryScene">
            <div class="library-scene-viewport" id="librarySceneViewport">
              <div class="library-wall-grid" id="libraryShelves"></div>
            </div>
          </div>
          <div class="library-zoom" aria-label="Library zoom controls">
            <button type="button" class="library-zoom-btn" id="libraryZoomIn">+</button>
            <button type="button" class="library-zoom-btn" id="libraryZoomOut">−</button>
            <div class="library-zoom-sep"></div>
            <button type="button" class="library-zoom-btn library-zoom-fit" id="libraryZoomFit">Fit</button>
            <button type="button" class="library-zoom-btn library-zoom-fit" id="libraryCenterView">Ctr</button>
          </div>

          <div class="library-book-overlay" id="libraryBookOverlay" hidden>
            <div class="library-overlay-book" id="libraryOverlayBook">
              <div class="library-overlay-book-face library-overlay-book-spine" id="libraryOverlaySpine"></div>
              <div class="library-overlay-book-face library-overlay-book-cover" id="libraryOverlayCover"></div>
            </div>
            <article class="library-overlay-info" id="libraryOverlayInfo">
              <button type="button" class="library-overlay-close" id="libraryOverlayClose" aria-label="Close book inspector">×</button>
              <h4 id="libraryOverlayTitle"></h4>
              <p id="libraryOverlayAuthor"></p>
              <p id="libraryOverlaySummary"></p>
              <div class="library-overlay-tags" id="libraryOverlayTags"></div>
              <div class="library-overlay-actions" id="libraryOverlayActions"></div>
            </article>
          </div>
        </section>
      </section>
    </div>
  `;

  syncLibraryRecords();
  hydrateLibraryLayout();
  bindLibraryEvents();
  renderLibrary();
  requestAnimationFrame(() => fitShelvesToViewport({ animated: false }));
  applyCameraTransform();
}

function enterLibrary() {
  syncLibraryRecords();
  mergeLayoutWithRecords();
  renderLibrary();
  requestAnimationFrame(() => applyViewTransform(false));
  applyCameraTransform();
}

function bindLibraryEvents() {
  if (LIBRARY_STATE.bound) return;
  LIBRARY_STATE.bound = true;

  const root = document.getElementById('view-studio');
  if (!root) return;

  root.addEventListener('click', (event) => {
    if (event.target.closest('#libraryAddBookBtn')) {
      window.NewEntry?.mount?.();
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
      requestAnimationFrame(() => fitShelvesToViewport({ animated: true, padding: 84 }));
      return;
    }

    if (event.target.closest('#libraryToggleShelfPanel')) {
      const panel = document.getElementById('libraryShelfCreate');
      if (panel) panel.hidden = !panel.hidden;
      return;
    }

    if (event.target.closest('#libraryZoomIn')) {
      zoomAtViewportCenter(1.1);
      return;
    }

    if (event.target.closest('#libraryZoomOut')) {
      zoomAtViewportCenter(1 / 1.1);
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
      if (record?.id && window.BOOK_BY_ID?.[record.id]) {
        closeBookInspector({ immediate: true });
        App.show('book', { id: record.id });
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

    if (event.target.closest('[data-rotate-shelf]')) return;

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
      renderStatusLine();
      return;
    }

    if (event.key === 'ArrowUp' && LIBRARY_STATE.searchMatches.length > 1) {
      event.preventDefault();
      LIBRARY_STATE.searchIndex = (LIBRARY_STATE.searchIndex - 1 + LIBRARY_STATE.searchMatches.length) % LIBRARY_STATE.searchMatches.length;
      updateSearchHighlight();
      renderStatusLine();
    }
  });

  const scene = document.getElementById('libraryScene');
  if (scene) {
    scene.addEventListener('wheel', onSceneWheel, { passive: false });
  }

  root.addEventListener('pointerdown', (event) => {
    const dragNode = event.target.closest('.library-draggable');
    if (dragNode && event.button === 0) {
      const owningBay = dragNode.closest('.library-bay');
      const owningShelfId = owningBay?.dataset.shelfId || '';
      const inPool = !owningBay && dragNode.closest('#libraryPool');
      if (owningShelfId && LIBRARY_STATE.activeShelfId !== owningShelfId) {
        setActiveShelf(owningShelfId);
        event.preventDefault();
        return;
      }
      if (owningShelfId || inPool) {
        startBookDrag(event, dragNode);
        return;
      }
      startBookDrag(event, dragNode);
      return;
    }

    const rotateHandle = event.target.closest('[data-rotate-shelf]');
    if (rotateHandle && event.button === 0) {
      const shelfId = rotateHandle.dataset.rotateShelf || '';
      if (shelfId) {
        setActiveShelf(shelfId);
        startShelfRotateDrag(event, shelfId);
        return;
      }
    }

    const shelfSurface = event.target.closest('.library-bay');
    const head = event.target.closest('.library-bay-head-drag');
    const isShelfAction = event.target.closest('.library-bay-actions, .library-remove-btn, [data-shelf-mode], [data-remove-shelf], [data-rotate-shelf], [data-add-row], .library-overflow-notice');
    if ((head || shelfSurface) && !isShelfAction && event.button === 0) {
      const bay = shelfSurface || head.closest('.library-bay');
      if (bay?.dataset.shelfId) {
        setActiveShelf(bay.dataset.shelfId);
        startShelfDrag(event, bay.dataset.shelfId);
        return;
      }
    }

    maybeStartPan(event);
  });
}

function syncLibraryRecords() {
  const next = [];
  const map = new Map();
  const seen = new Map();

  (window.SHELF_BOOKS || []).forEach((book, index) => {
    const rawBase = String(book.id || `${book.title || 'book'}-${book.author || 'author'}`).toLowerCase();
    const base = slugify(rawBase);
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    const key = count === 1 ? base : `${base}-${count}`;

    const detail = book.id ? window.BOOK_BY_ID?.[book.id] : null;
    const record = {
      key,
      id: book.id || '',
      title: toTitleCase(book.title || `Book ${index + 1}`),
      author: toTitleCase(book.author || ''),
      status: book.status || 'want',
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
      tags: Array.isArray(detail?.tags) ? detail.tags.slice(0, 4) : [statusToLabel(book.status || 'want')],
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

function hydrateLibraryLayout() {
  const saved = readStoredLayout();
  if (!saved) {
    arrangeByStatus();
    saveLayout();
    return;
  }

  LIBRARY_STATE.shelves = (saved.shelves || []).map((shelf) => ({
    id: shelf.id,
    name: shelf.name,
    color: shelf.color || '#7a6040',
    rows: clampInt(shelf.rows, 1, LIBRARY_MAX_ROWS, 2),
    viewMode: normalizeShelfMode(shelf.viewMode || 'spine'),
    status: shelf.status || '',
    x: Number(shelf.x) || 0,
    y: Number(shelf.y) || 0,
    tilt: 0,
    pitch: 0,
    yaw: clamp(Number(shelf.yaw), -55, 55, 0),
    bookKeys: Array.isArray(shelf.bookKeys) ? shelf.bookKeys.slice() : [],
  }));

  LIBRARY_STATE.pool = Array.isArray(saved.pool) ? saved.pool.slice() : [];
  LIBRARY_STATE.view.x = Number(saved.view?.x) || 0;
  LIBRARY_STATE.view.y = Number(saved.view?.y) || 0;
  LIBRARY_STATE.view.scale = clamp(Number(saved.view?.scale), 0.72, 1.35, 1);
  LIBRARY_STATE.camera.yaw = clamp(Number(saved.camera?.yaw), -24, 24, 0);
  LIBRARY_STATE.camera.pitch = clamp(Number(saved.camera?.pitch), -18, 18, 0);

  ensureBaseShelves();
  mergeLayoutWithRecords();
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
  LIBRARY_STATE.pool = LIBRARY_STATE.pool.filter((key) => valid.has(key));

  const used = new Set();
  LIBRARY_STATE.shelves.forEach((shelf) => shelf.bookKeys.forEach((key) => used.add(key)));
  LIBRARY_STATE.pool.forEach((key) => used.add(key));

  LIBRARY_STATE.records.forEach((record) => {
    if (!used.has(record.key)) LIBRARY_STATE.pool.push(record.key);
  });
}

function renderLibrary() {
  renderStats();
  renderStatusLine();
  renderPool();
  renderShelves();
  updateSearchHighlight();
  applyViewTransform(false);
  syncOverlayWithRenderedBook();
}

function renderStats() {
  const el = document.getElementById('libraryStats');
  if (!el) return;

  const total = LIBRARY_STATE.records.length;
  const shelved = LIBRARY_STATE.shelves.reduce((sum, shelf) => sum + shelf.bookKeys.length, 0);
  const pool = LIBRARY_STATE.pool.length;

  el.innerHTML = `
    <span><strong>${total}</strong> Books</span>
    <span>·</span>
    <span><strong>${LIBRARY_STATE.shelves.length}</strong> Shelves</span>
    <span>·</span>
    <span><strong>${shelved}</strong> Placed</span>
    <span>·</span>
    <span><strong>${pool}</strong> Arrival</span>
  `;
}

function renderStatusLine(customText) {
  const line = document.getElementById('libraryStatusLine');
  if (!line) return;

  if (customText) {
    line.textContent = customText;
    return;
  }

  if (LIBRARY_STATE.searchQuery && LIBRARY_STATE.searchMatches.length) {
    const current = LIBRARY_STATE.searchMatches[LIBRARY_STATE.searchIndex] || LIBRARY_STATE.searchMatches[0];
    const record = current ? LIBRARY_STATE.recordByKey.get(current.key) : null;
    if (record) {
      line.textContent = `Match ${LIBRARY_STATE.searchIndex + 1}/${LIBRARY_STATE.searchMatches.length}: ${record.title}`;
      return;
    }
  }

  if (LIBRARY_STATE.pool.length) {
    line.textContent = `${LIBRARY_STATE.pool.length} books are waiting in Arrival. Drag them onto a shelf.`;
    return;
  }

  const queue = getShelfById('reading-plan');
  const nextThree = (queue?.bookKeys || [])
    .slice(0, 3)
    .map((key) => LIBRARY_STATE.recordByKey.get(key)?.title)
    .filter(Boolean);

  if (nextThree.length) {
    line.textContent = `Next queue: ${nextThree.join(' / ')}`;
    return;
  }

  line.textContent = 'Drag books across shelves. Drag shelf titles to move shelves.';
}

function renderPool() {
  const poolHost = document.getElementById('libraryPool');
  const countEl = document.getElementById('libraryPoolCount');
  if (!poolHost || !countEl) return;

  poolHost.innerHTML = '';
  LIBRARY_STATE.pool.forEach((key, index) => {
    const record = LIBRARY_STATE.recordByKey.get(key);
    if (!record) return;
    poolHost.appendChild(createArrivalCard(record, index));
  });

  countEl.textContent = `${LIBRARY_STATE.pool.length} waiting`;
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
    bay.style.left = `${Math.round(shelf.x)}px`;
    bay.style.top = `${Math.round(shelf.y)}px`;
    setShelfTransform(bay, shelf);

    const canRemove = !LIBRARY_DEFAULT_SHELVES.some((base) => base.id === shelf.id);
    const canAddRow = (shelf.rows || 2) < LIBRARY_MAX_ROWS;

    bay.innerHTML = `
      <div class="library-bay-titlebar library-bay-head-drag" data-drag-shelf="${escapeHTML(shelf.id)}">
        <div class="library-bay-head">
          <button type="button" class="library-rotate-handle" data-rotate-shelf="${escapeHTML(shelf.id)}" aria-label="Adjust shelf angle">
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M3.2 2.4h7.2c1 0 1.8.8 1.8 1.8v9.4H4.6c-.8 0-1.4-.6-1.4-1.4V2.4z" fill="currentColor" opacity="0.92"/>
              <path d="M3.2 12.2c0-.7.6-1.2 1.3-1.2h7.7v2.6H4.6c-.8 0-1.4-.6-1.4-1.4z" fill="rgba(20,14,10,0.32)"/>
              <line x1="5.2" y1="4.8" x2="9.6" y2="4.8" stroke="rgba(20,14,10,0.42)" stroke-width="0.7" stroke-linecap="round"/>
              <line x1="5.2" y1="6.6" x2="9.0" y2="6.6" stroke="rgba(20,14,10,0.42)" stroke-width="0.7" stroke-linecap="round"/>
            </svg>
          </button>
          <div class="library-bay-head-text">
            <h3>${escapeHTML(shelf.name)}</h3>
            <p>${shelf.bookKeys.length} books</p>
          </div>
          <div class="library-bay-actions">
            <button type="button" class="chip chip-mini${shelf.viewMode === 'spine' ? ' active' : ''}" data-shelf-id="${escapeHTML(shelf.id)}" data-shelf-mode="spine">Spine</button>
            <button type="button" class="chip chip-mini${shelf.viewMode === 'cover' ? ' active' : ''}" data-shelf-id="${escapeHTML(shelf.id)}" data-shelf-mode="cover">Cover</button>
            <button type="button" class="chip chip-mini${shelf.viewMode === 'mix' ? ' active' : ''}" data-shelf-id="${escapeHTML(shelf.id)}" data-shelf-mode="mix">Mix</button>
            ${canRemove ? `<button type="button" class="library-remove-btn" data-remove-shelf="${escapeHTML(shelf.id)}" aria-label="Remove shelf">×</button>` : ''}
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
  document.querySelectorAll('#view-studio .library-bay').forEach((bay) => {
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
  document.querySelectorAll('#view-studio .library-bay').forEach((bay) => {
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
  const node = window.SpineCard.create({
    title: record.title,
    author: record.author,
    spine: record.spine,
    text: record.text,
    width: size.width,
    height: size.height,
    className: 'library-spine library-draggable',
    dataAttrs: { bookKey: record.key, shelfId },
    ariaLabel: `${record.title} by ${record.author}`,
    titleClass: 'library-spine-title',
    authorClass: 'library-spine-author',
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

function createArrivalCard(record, index) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'arrival-book library-draggable';
  el.dataset.bookKey = record.key;
  el.dataset.shelfId = 'pool';
  el.style.setProperty('--arrival-tilt', `${((index % 5) - 2) * 1.5}deg`);
  el.style.setProperty('--arrival-shift', `${Math.max(0, 12 - (index % 6) * 2)}px`);
  el.style.background = record.spine;
  el.style.color = record.text;
  el.innerHTML = `
    <span class="arrival-book-title">${escapeHTML(record.title)}</span>
    <span class="arrival-book-author">${escapeHTML(record.author)}</span>
  `;
  return el;
}

function startBookDrag(event, sourceEl) {
  if (LIBRARY_STATE.overlay.playing) return;
  if (LIBRARY_STATE.overlay.key && LIBRARY_STATE.overlay.key === (sourceEl.dataset.bookKey || '')) {
    closeBookInspector();
    return;
  }

  const lane = sourceEl.closest('[data-lane="true"]');
  if (!lane) return;

  const bookKey = sourceEl.dataset.bookKey || '';
  const sourceShelfId = sourceEl.dataset.shelfId || 'pool';
  if (!bookKey) return;

  const list = getShelfList(sourceShelfId);
  if (!list) return;
  const sourceIndex = list.indexOf(bookKey);
  if (sourceIndex === -1) return;

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

  const placeholder = document.createElement('div');
  placeholder.className = 'library-drop-placeholder';
  placeholder.style.width = `${rect.width}px`;
  placeholder.style.height = `${rect.height}px`;

  lane.insertBefore(placeholder, sourceEl);
  sourceEl.style.visibility = 'hidden';

  LIBRARY_STATE.drag = {
    bookKey,
    sourceShelfId,
    sourceEl,
    placeholder,
    ghost,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
  };

  positionGhost(event.clientX, event.clientY);

  window.addEventListener('pointermove', onBookDragMove);
  window.addEventListener('pointerup', onBookDragEnd);
  window.addEventListener('pointercancel', onBookDragEnd);
}

function onBookDragMove(event) {
  const drag = LIBRARY_STATE.drag;
  if (!drag) return;

  const movedEnough = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6;
  if (movedEnough) drag.moved = true;

  positionGhost(event.clientX, event.clientY);

  if (!drag.moved) return;

  const lane = findLaneAtPoint(event.clientX, event.clientY);
  if (!lane) return;
  movePlaceholderToLane(lane, event.clientX);
}

function onBookDragEnd() {
  const drag = LIBRARY_STATE.drag;
  if (!drag) return;

  const lane = drag.placeholder.parentElement;

  if (!drag.moved) {
    const record = LIBRARY_STATE.recordByKey.get(drag.bookKey);
    if (record) playBookInteraction(drag.sourceEl, record, drag.sourceShelfId);
    cleanupBookDrag();
    return;
  }

  const targetShelfId = lane?.dataset.shelfId || drag.sourceShelfId;
  const targetIndex = computeTargetIndex(lane, drag.placeholder);
  moveBookToShelf(drag.bookKey, targetShelfId, targetIndex);
  cleanupBookDrag();
  renderLibrary();
  saveLayout();
}

function cleanupBookDrag() {
  const drag = LIBRARY_STATE.drag;
  if (!drag) return;

  drag.sourceEl.style.visibility = '';
  drag.placeholder.remove();
  drag.ghost.remove();

  LIBRARY_STATE.drag = null;
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

  event.preventDefault();

  const bay = document.querySelector(`#view-studio .library-bay[data-shelf-id="${cssEscape(shelf.id)}"]`);
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
  };

  window.addEventListener('pointermove', onShelfDragMove);
  window.addEventListener('pointerup', stopShelfDrag);
  window.addEventListener('pointercancel', stopShelfDrag);
}

function onShelfDragMove(event) {
  const drag = LIBRARY_STATE.shelfDrag;
  if (!drag) return;

  const shelf = getShelfById(drag.shelfId);
  if (!shelf) return;

  const scale = Math.max(0.001, LIBRARY_STATE.view.scale);
  const dx = (event.clientX - drag.startX) / scale;
  const dy = (event.clientY - drag.startY) / scale;
  const bay = document.querySelector(`#view-studio .library-bay[data-shelf-id="${cssEscape(shelf.id)}"]`);
  const bounds = getShelfMovementBounds(bay);
  shelf.x = clamp(drag.shelfX + dx, bounds.minX, bounds.maxX, drag.shelfX);
  shelf.y = clamp(drag.shelfY + dy, bounds.minY, bounds.maxY, drag.shelfY);

  if (bay) {
    bay.style.left = `${Math.round(shelf.x)}px`;
    bay.style.top = `${Math.round(shelf.y)}px`;
    setShelfTransform(bay, shelf);
  }
}

function startShelfRotateDrag(event, shelfId) {
  const shelf = getShelfById(shelfId);
  if (!shelf) return;

  event.preventDefault();
  event.stopPropagation();

  const bay = document.querySelector(`#view-studio .library-bay[data-shelf-id="${cssEscape(shelf.id)}"]`);
  if (bay) bay.classList.add('is-shelf-rotating');
  const rect = bay?.getBoundingClientRect();
  const centerX = rect ? rect.left + rect.width / 2 : event.clientX;
  const centerY = rect ? rect.top + rect.height / 2 : event.clientY;
  const dx = event.clientX - centerX;
  const dy = event.clientY - centerY;

  LIBRARY_STATE.shelfRotateDrag = {
    shelfId,
    startX: event.clientX,
    startY: event.clientY,
    centerX,
    centerY,
    radiusX: Math.max(140, (rect?.width || 420) * 0.58),
    radiusY: Math.max(120, (rect?.height || 320) * 0.56),
    lastAngle: Math.atan2(dy, dx),
    tilt: shelf.tilt || 0,
    pitch: shelf.pitch || 0,
    yaw: shelf.yaw || 0,
  };

  window.addEventListener('pointermove', onShelfRotateMove);
  window.addEventListener('pointerup', stopShelfRotateDrag);
  window.addEventListener('pointercancel', stopShelfRotateDrag);
}

function onShelfRotateMove(event) {
  const drag = LIBRARY_STATE.shelfRotateDrag;
  if (!drag) return;

  const shelf = getShelfById(drag.shelfId);
  if (!shelf) return;

  const dx = event.clientX - drag.centerX;
  const dy = event.clientY - drag.centerY;
  const angle = Math.atan2(dy, dx);
  const angleDelta = normalizeAngleDelta(angle - drag.lastAngle);
  drag.lastAngle = angle;

  void angleDelta;
  shelf.tilt = 0;
  shelf.pitch = 0;
  shelf.yaw = clamp(drag.yaw + (dx / drag.radiusX) * 60, -55, 55, drag.yaw);

  const bay = document.querySelector(`#view-studio .library-bay[data-shelf-id="${cssEscape(shelf.id)}"]`);
  if (bay) setShelfTransform(bay, shelf);
}

function stopShelfRotateDrag() {
  if (!LIBRARY_STATE.shelfRotateDrag) return;
  const shelfId = LIBRARY_STATE.shelfRotateDrag.shelfId;
  const bay = document.querySelector(`#view-studio .library-bay[data-shelf-id="${cssEscape(shelfId)}"]`);
  if (bay) bay.classList.remove('is-shelf-rotating');
  LIBRARY_STATE.shelfRotateDrag = null;
  window.removeEventListener('pointermove', onShelfRotateMove);
  window.removeEventListener('pointerup', stopShelfRotateDrag);
  window.removeEventListener('pointercancel', stopShelfRotateDrag);
  saveLayout();
}

function stopShelfDrag() {
  if (!LIBRARY_STATE.shelfDrag) return;
  const shelfId = LIBRARY_STATE.shelfDrag.shelfId;
  const bay = document.querySelector(`#view-studio .library-bay[data-shelf-id="${cssEscape(shelfId)}"]`);
  if (bay) bay.classList.remove('is-shelf-dragging');
  LIBRARY_STATE.shelfDrag = null;
  window.removeEventListener('pointermove', onShelfDragMove);
  window.removeEventListener('pointerup', stopShelfDrag);
  window.removeEventListener('pointercancel', stopShelfDrag);
  saveLayout();
}

function maybeStartPan(event) {
  if (event.button !== 0) return;
  if (!event.target.closest('#libraryScene')) return;
  if (event.target.closest('button, input, .library-bay, .library-draggable, .library-book-overlay')) return;

  const viewport = document.getElementById('librarySceneViewport');
  if (viewport) viewport.classList.add('is-panning');

  LIBRARY_STATE.lookDrag = {
    startX: event.clientX,
    startY: event.clientY,
    yaw: LIBRARY_STATE.camera.yaw,
    pitch: LIBRARY_STATE.camera.pitch,
  };

  window.addEventListener('pointermove', onPanMove);
  window.addEventListener('pointerup', stopPan);
  window.addEventListener('pointercancel', stopPan);
}

function onPanMove(event) {
  const pan = LIBRARY_STATE.lookDrag;
  if (!pan) return;

  const dx = event.clientX - pan.startX;
  const dy = event.clientY - pan.startY;
  LIBRARY_STATE.camera.yaw = clamp(pan.yaw + dx * 0.08, -24, 24, pan.yaw);
  LIBRARY_STATE.camera.pitch = 0;
  applyCameraTransform();
}

function stopPan() {
  if (!LIBRARY_STATE.lookDrag) return;
  const viewport = document.getElementById('librarySceneViewport');
  if (viewport) viewport.classList.remove('is-panning');
  LIBRARY_STATE.lookDrag = null;
  window.removeEventListener('pointermove', onPanMove);
  window.removeEventListener('pointerup', stopPan);
  window.removeEventListener('pointercancel', stopPan);
  saveLayout();
}

function onSceneWheel(event) {
  if (!event.target.closest('#libraryScene')) return;
  event.preventDefault();

  const factor = event.deltaY > 0 ? 1 / 1.08 : 1.08;
  zoomAtClientPoint(event.clientX, event.clientY, factor);
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
  const newScale = clamp(oldScale * factor, 0.72, 1.35, 1);
  if (Math.abs(newScale - oldScale) < 0.0001) return;

  const pointX = clientX - rect.left;
  const pointY = clientY - rect.top;

  const worldX = (pointX - LIBRARY_STATE.view.x) / oldScale;
  const worldY = (pointY - LIBRARY_STATE.view.y) / oldScale;

  LIBRARY_STATE.view.scale = newScale;
  LIBRARY_STATE.view.x = pointX - (worldX * newScale);
  LIBRARY_STATE.view.y = pointY - (worldY * newScale);

  applyViewTransform(true);
  saveLayout();
}

function centerViewport({ animated }) {
  const viewport = document.getElementById('librarySceneViewport');
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();

  const bounds = computeShelfBounds();
  if (!bounds) return;

  LIBRARY_STATE.view.x = (rect.width / 2) - ((bounds.minX + bounds.maxX) / 2) * LIBRARY_STATE.view.scale;
  LIBRARY_STATE.view.y = (rect.height / 2) - ((bounds.minY + bounds.maxY) / 2) * LIBRARY_STATE.view.scale;
  applyViewTransform(Boolean(animated));
}

function fitShelvesToViewport({ animated, padding = 70 }) {
  const viewport = document.getElementById('librarySceneViewport');
  if (!viewport) return;

  const rect = viewport.getBoundingClientRect();
  const bounds = computeShelfBounds();
  if (!bounds) return;

  const worldW = Math.max(320, bounds.maxX - bounds.minX);
  const worldH = Math.max(220, bounds.maxY - bounds.minY);

  const scaleX = (rect.width - padding * 2) / worldW;
  const scaleY = (rect.height - padding * 2) / worldH;
  const nextScale = clamp(Math.min(scaleX, scaleY), 0.45, 1.2, 1);

  LIBRARY_STATE.view.scale = nextScale;
  LIBRARY_STATE.view.x = (rect.width / 2) - ((bounds.minX + bounds.maxX) / 2) * nextScale;
  LIBRARY_STATE.view.y = (rect.height / 2) - ((bounds.minY + bounds.maxY) / 2) * nextScale;

  applyViewTransform(Boolean(animated));
}

function resetFrontView({ animated }) {
  arrangeShelvesForFrontView();
  LIBRARY_STATE.camera.yaw = 0;
  LIBRARY_STATE.camera.pitch = 0;
  applyCameraTransform();
  fitShelvesToViewport({ animated, padding: 56 });
}

function computeShelfBounds() {
  const shelves = document.querySelectorAll('#view-studio .library-bay');
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
  const world = document.getElementById('libraryShelves');
  if (!world) return;
  world.classList.toggle('is-animated', !!animated);
  world.style.transform = `translate(${LIBRARY_STATE.view.x}px, ${LIBRARY_STATE.view.y}px) scale(${LIBRARY_STATE.view.scale})`;
}

function applyCameraTransform() {
  document.querySelectorAll('#view-studio .library-bay').forEach((node) => {
    const shelf = getShelfById(node.dataset.shelfId || '');
    if (shelf) setShelfTransform(node, shelf);
  });
}

function findLaneAtPoint(x, y) {
  const lanes = Array.from(document.querySelectorAll('#view-studio [data-lane="true"]'));
  return lanes.find((lane) => {
    const rect = lane.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }) || null;
}

function movePlaceholderToLane(lane, x) {
  const drag = LIBRARY_STATE.drag;
  if (!drag || !lane) return;

  const children = Array.from(lane.children).filter((node) => node !== drag.placeholder && node !== drag.sourceEl);
  let before = null;

  for (const child of children) {
    const rect = child.getBoundingClientRect();
    if (x < rect.left + (rect.width / 2)) {
      before = child;
      break;
    }
  }

  if (before) lane.insertBefore(drag.placeholder, before);
  else lane.appendChild(drag.placeholder);
}

function computeTargetIndex(lane, placeholder) {
  if (!lane || !placeholder) return 0;
  const startIndex = Number(lane.dataset.startIndex || 0);
  const drag = LIBRARY_STATE.drag;
  const children = Array.from(lane.children).filter((node) => node !== drag?.sourceEl);
  const localIndex = Math.max(0, children.indexOf(placeholder));
  return lane.dataset.shelfId === 'pool' ? localIndex : startIndex + localIndex;
}

function moveBookToShelf(bookKey, targetShelfId, targetIndex) {
  const allLists = [LIBRARY_STATE.pool, ...LIBRARY_STATE.shelves.map((shelf) => shelf.bookKeys)];
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

function playBookInteraction(sourceEl, record, sourceShelfId) {
  const overlay = document.getElementById('libraryBookOverlay');
  const book = document.getElementById('libraryOverlayBook');
  const spineFace = document.getElementById('libraryOverlaySpine');
  const coverFace = document.getElementById('libraryOverlayCover');
  const info = document.getElementById('libraryOverlayInfo');
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

  const localLeft = rect.left - sceneRect.left;
  const localTop = rect.top - sceneRect.top;
  const liftY = clampInt(rect.height * 0.28, 34, 74, 48);
  const expandedHeight = clampInt(rect.height * 1.48, Math.max(220, rect.height + 64), 332, rect.height + 108);
  const coverWidth = clampInt(expandedHeight * 0.68, 126, 204, 164);
  const infoWidth = clampInt(expandedHeight * 1.42, 286, 430, 336);
  const gap = 0;
  const expandedWidth = rect.width + gap + Math.max(coverWidth, infoWidth);
  const expandedLeft = clamp(localLeft, 24, sceneRect.width - expandedWidth - 24, localLeft);
  const expandedTop = clamp(localTop - ((expandedHeight - rect.height) * 0.48) - liftY, 24, sceneRect.height - expandedHeight - 24, localTop - liftY);
  const titleSize = clampInt(expandedHeight * 0.27, 34, 82, 54);

  overlay.hidden = false;
  overlay.className = 'library-book-overlay is-start';
  overlay.dataset.bookKey = record.key;
  overlay.dataset.sourceShelfId = LIBRARY_STATE.overlay.sourceShelfId;
  overlay.style.setProperty('--overlay-source-width', `${rect.width}px`);
  overlay.style.setProperty('--overlay-source-height', `${rect.height}px`);
  overlay.style.setProperty('--overlay-open-width', `${expandedWidth}px`);
  overlay.style.setProperty('--overlay-open-height', `${expandedHeight}px`);
  overlay.style.setProperty('--overlay-cover-width', `${coverWidth}px`);
  overlay.style.setProperty('--overlay-info-width', `${infoWidth}px`);
  overlay.style.setProperty('--overlay-gap', `${gap}px`);
  overlay.style.setProperty('--overlay-lift-y', `${liftY}px`);
  overlay.style.setProperty('--overlay-title-size', `${titleSize}px`);
  overlay.style.left = `${expandedLeft}px`;
  overlay.style.top = `${expandedTop}px`;
  overlay.style.width = `${expandedWidth}px`;
  overlay.style.height = `${expandedHeight}px`;

  sourceEl.classList.add('is-lift-origin');

  spineFace.style.background = record.spine;
  spineFace.style.color = record.text;
  spineFace.innerHTML = `
    <span class="library-overlay-spine-title">${escapeHTML(record.title)}</span>
    <span class="library-overlay-spine-author">${escapeHTML(record.author)}</span>
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

  title.textContent = record.title;
  author.textContent = record.author;
  summary.textContent = record.summary;
  tags.innerHTML = (record.tags || []).slice(0, 4).map((tag) => `<span>${escapeHTML(tag)}</span>`).join('');
  actions.innerHTML = buildOverlayActions(record, LIBRARY_STATE.overlay.sourceShelfId);

  requestAnimationFrame(() => {
    document.getElementById('view-studio')?.classList.add('is-inspecting');
    overlay.className = 'library-book-overlay is-lift';
  });

  LIBRARY_STATE.overlay.timers.push(window.setTimeout(() => {
    overlay.className = 'library-book-overlay is-cover';
  }, 260));

  LIBRARY_STATE.overlay.timers.push(window.setTimeout(() => {
    overlay.className = 'library-book-overlay is-open';
    LIBRARY_STATE.overlay.playing = false;
  }, 760));

  // Optional hook: if Rive mesh runtime is attached by user, allow override
  if (window.LibraryRiveMesh && typeof window.LibraryRiveMesh.play === 'function') {
    try {
      window.LibraryRiveMesh.play({ sourceEl, record, overlayEl: overlay });
    } catch (err) {
      console.warn('[Library] Rive mesh hook failed:', err);
    }
  }
}

function buildOverlayActions(record, sourceShelfId) {
  const actions = [];
  if (record.id && window.BOOK_BY_ID?.[record.id]) {
    actions.push(`<button type="button" class="chip" data-open-book="${escapeHTML(record.key)}">Read More</button>`);
  }

  LIBRARY_STATE.shelves
    .filter((shelf) => shelf.id !== sourceShelfId)
    .slice(0, 3)
    .forEach((shelf) => {
      actions.push(`<button type="button" class="chip chip-mini" data-move-book="${escapeHTML(record.key)}" data-to-shelf="${escapeHTML(shelf.id)}">Move To ${escapeHTML(shelf.name)}</button>`);
    });

  actions.push('<button type="button" class="chip chip-ghost" data-overlay-close="true">Close</button>');
  return actions.join('');
}

function closeBookInspector({ immediate = false } = {}) {
  const overlay = document.getElementById('libraryBookOverlay');
  if (!overlay || overlay.hidden) return;

  clearOverlayTimers();
  const finalize = () => {
    overlay.hidden = true;
    overlay.className = 'library-book-overlay';
    delete overlay.dataset.bookKey;
    delete overlay.dataset.sourceShelfId;
    document.querySelectorAll('#view-studio .is-lift-origin').forEach((node) => {
      node.classList.remove('is-lift-origin');
    });
    LIBRARY_STATE.overlay.playing = false;
    LIBRARY_STATE.overlay.key = '';
    LIBRARY_STATE.overlay.sourceShelfId = '';
    document.getElementById('view-studio')?.classList.remove('is-inspecting');
  };

  if (immediate || overlay.classList.contains('is-start')) {
    finalize();
    return;
  }

  overlay.className = 'library-book-overlay is-closing';
  LIBRARY_STATE.overlay.playing = true;
  LIBRARY_STATE.overlay.timers.push(window.setTimeout(finalize, 280));
}

function clearOverlayTimers() {
  LIBRARY_STATE.overlay.timers.forEach((timerId) => window.clearTimeout(timerId));
  LIBRARY_STATE.overlay.timers = [];
}

function syncOverlayWithRenderedBook() {
  if (!LIBRARY_STATE.overlay.key) return;
  const overlay = document.getElementById('libraryBookOverlay');
  const sourceNode = document.querySelector(`#view-studio .library-draggable[data-book-key="${cssEscape(LIBRARY_STATE.overlay.key)}"]`);
  if (!overlay || overlay.hidden || !sourceNode) return;
  sourceNode.classList.add('is-lift-origin');
}

function setShelfTransform(node, shelf) {
  const depth = Number(node?.dataset.depth || 2);
  const baseZ = depth === 1 ? -20 : depth === 3 ? -24 : 10;
  const baseYaw = depth === 1 ? -3.5 : depth === 3 ? 3.5 : 0;
  const cameraYaw = LIBRARY_STATE.camera.yaw || 0;
  const shelfYaw = shelf.yaw || 0;

  node.style.transform = [
    `perspective(1400px)`,
    `translateZ(${baseZ}px)`,
    `rotateY(${cameraYaw + baseYaw + shelfYaw}deg)`,
  ].join(' ');
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

  const paddingX = 68;
  const paddingTop = 60;
  const gapX = 70;
  const gapY = 86;
  const maxColumns = LIBRARY_STATE.shelves.length <= 3 ? LIBRARY_STATE.shelves.length : 3;
  const widths = [];
  const heights = [];

  LIBRARY_STATE.shelves.forEach((shelf) => {
    const node = document.querySelector(`#view-studio .library-bay[data-shelf-id="${cssEscape(shelf.id)}"]`);
    widths.push(node?.offsetWidth || 420);
    heights.push(node?.offsetHeight || 360);
  });

  const maxWidth = Math.max(...widths, 420);
  const maxHeight = Math.max(...heights, 360);
  const cellWidth = maxWidth + gapX;
  const usableWidth = LIBRARY_WORLD_WIDTH - paddingX * 2;
  const columns = Math.max(1, Math.min(maxColumns, Math.floor((usableWidth + gapX) / cellWidth) || 1));

  LIBRARY_STATE.shelves.forEach((shelf, index) => {
    const node = document.querySelector(`#view-studio .library-bay[data-shelf-id="${cssEscape(shelf.id)}"]`);
    const width = node?.offsetWidth || 420;
    const height = node?.offsetHeight || 360;
    const col = index % columns;
    const row = Math.floor(index / columns);
    const slotWidth = columns === 1 ? usableWidth : (usableWidth - gapX * (columns - 1)) / columns;

    shelf.x = paddingX + col * (slotWidth + gapX) + Math.max(0, (slotWidth - width) / 2);
    shelf.y = paddingTop + row * (maxHeight + gapY) + Math.max(0, (maxHeight - height) / 2);
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
  renderStatusLine();
}

function updateSearchHighlight() {
  const keySet = new Set(LIBRARY_STATE.searchMatches.map((item) => item.key));
  const active = LIBRARY_STATE.searchMatches[LIBRARY_STATE.searchIndex] || null;

  document.querySelectorAll('#view-studio .library-draggable').forEach((node) => {
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
    renderStatusLine('No matching books found.');
    return;
  }

  const match = LIBRARY_STATE.searchMatches[LIBRARY_STATE.searchIndex] || LIBRARY_STATE.searchMatches[0];
  focusShelfForMatch(match);
}

function focusShelfForMatch(match) {
  const shelfId = match?.shelfId;
  const key = match?.key;
  if (!shelfId || !key) return;

  if (shelfId !== 'pool') {
    const shelfEl = document.querySelector(`#view-studio .library-bay[data-shelf-id="${cssEscape(shelfId)}"]`);
    const viewport = document.getElementById('librarySceneViewport');
    if (shelfEl && viewport) {
      const bayRect = shelfEl.getBoundingClientRect();
      const vpRect = viewport.getBoundingClientRect();
      const shelf = getShelfById(shelfId);

      const worldCenterX = (shelf?.x || 0) + (bayRect.width / 2);
      const worldCenterY = (shelf?.y || 0) + (bayRect.height / 2);

      const targetScale = clamp(Math.max(LIBRARY_STATE.view.scale, 1.08), 0.72, 1.35, 1);
      LIBRARY_STATE.view.scale = targetScale;
      LIBRARY_STATE.view.x = (vpRect.width / 2) - worldCenterX * targetScale;
      LIBRARY_STATE.view.y = (vpRect.height / 2) - worldCenterY * targetScale;
      applyViewTransform(true);
    }
  }

  renderStatusLine();

  window.setTimeout(() => {
    const node = document.querySelector(`#view-studio .library-draggable[data-book-key="${cssEscape(key)}"]`);
    const record = LIBRARY_STATE.recordByKey.get(key);
    if (node && record) playBookInteraction(node, record, match.shelfId);
  }, 320);

  saveLayout();
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

  LIBRARY_STATE.pool.forEach((key) => {
    const record = LIBRARY_STATE.recordByKey.get(key);
    if (!record || !record.searchText.includes(query)) return;
    matches.push({ key, shelfId: 'pool' });
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
  renderLibrary();
  saveLayout();
  requestAnimationFrame(() => fitShelvesToViewport({ animated: true, padding: 82 }));
}

function removeShelf(shelfId) {
  const shelf = getShelfById(shelfId);
  if (!shelf) return;

  LIBRARY_STATE.pool.push(...shelf.bookKeys);
  LIBRARY_STATE.shelves = LIBRARY_STATE.shelves.filter((item) => item.id !== shelfId);

  renderLibrary();
  saveLayout();
  requestAnimationFrame(() => fitShelvesToViewport({ animated: true, padding: 82 }));
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
  requestAnimationFrame(() => fitShelvesToViewport({ animated: true, padding: 80 }));
  saveLayout();
}

function setActiveShelf(shelfId) {
  if (LIBRARY_STATE.activeShelfId === shelfId) return;
  LIBRARY_STATE.activeShelfId = shelfId || '';
  document.querySelectorAll('#view-studio .library-bay').forEach((bay) => {
    bay.classList.toggle('is-active', bay.dataset.shelfId === LIBRARY_STATE.activeShelfId);
  });
}

function applyArrangement(mode) {
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
    LIBRARY_STATE.pool = [];
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
    LIBRARY_STATE.pool = [];
  }
}

function arrangeByStatus() {
  ensureBaseShelves();
  clearLayoutBooks();

  LIBRARY_STATE.records.forEach((record) => {
    const targetId = mapStatusToShelfId(record.status);
    const shelf = getShelfById(targetId);
    if (shelf) shelf.bookKeys.push(record.key);
    else LIBRARY_STATE.pool.push(record.key);
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
  LIBRARY_STATE.pool = [];
}

function getShelfList(shelfId) {
  if (shelfId === 'pool') return LIBRARY_STATE.pool;
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

  const source = window.SHELF_BOOKS?.[record.sourceIndex];
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
  const bay = document.querySelector('#view-studio .library-bay');
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

function mapStatusToShelfId(status) {
  if (status === 'reading') return 'reading-now';
  if (status === 'finished') return 'finished';
  if (status === 'want') return 'reading-plan';
  return '';
}

function statusToLabel(status) {
  if (status === 'reading') return 'Reading';
  if (status === 'finished') return 'Finished';
  if (status === 'want') return 'To Read';
  return 'Library';
}

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
    pool: LIBRARY_STATE.pool.slice(),
    view: {
      x: LIBRARY_STATE.view.x,
      y: LIBRARY_STATE.view.y,
      scale: LIBRARY_STATE.view.scale,
    },
    camera: {
      yaw: LIBRARY_STATE.camera.yaw,
      pitch: LIBRARY_STATE.camera.pitch,
    },
  };

  try {
    localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[Library] save skipped', error);
  }
}

function readStoredLayout() {
  try {
    const raw = localStorage.getItem(LIBRARY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.shelves) || !Array.isArray(parsed.pool)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeShelfMode(value) {
  if (value === 'cover') return 'cover';
  if (value === 'mix') return 'mix';
  return 'spine';
}

function getColorHue(input) {
  if (!input || typeof input !== 'string') return 0;
  const hex = input.trim().toLowerCase();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(hex)) return 0;

  const norm = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;

  const r = parseInt(norm.slice(1, 3), 16) / 255;
  const g = parseInt(norm.slice(3, 5), 16) / 255;
  const b = parseInt(norm.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;

  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = ((b - r) / delta) + 2;
  else hue = ((r - g) / delta) + 4;

  const deg = hue * 60;
  return Math.round(deg < 0 ? deg + 360 : deg);
}

function escapeHTML(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(value) {
  return escapeHTML(value).replaceAll("'", '&#39;');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-') || 'book';
}

function toTitleCase(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
    .join(' ');
}

function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function clampInt(value, min, max, fallback) {
  return Math.round(clamp(Number(value), min, max, fallback));
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function normalizeAngleDelta(value) {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

window.initStudio = initLibrary;
window.enterStudio = enterLibrary;
