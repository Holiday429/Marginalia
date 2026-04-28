/* Library view — spatial shelf organizer */

const STUDIO_STORAGE_KEY = 'marginalia:library-layout:v2';
const STUDIO_DEFAULT_SHELVES = [
  { id: 'reading-now', name: 'Reading Now', bookKeys: [] },
  { id: 'to-read', name: 'To Read', bookKeys: [] },
  { id: 'finished', name: 'Finished', bookKeys: [] },
  { id: 'holding-bay', name: 'Holding Bay', bookKeys: [] },
];

const STUDIO_STATE = {
  records: [],
  recordByKey: new Map(),
  shelves: [],
  pool: [],
  drag: null,
  camera: { yaw: -8, pitch: 8 },
  lookDrag: null,
  bound: false,
};

function initStudio() {
  const host = document.getElementById('view-studio');
  if (!host) return;

  host.innerHTML = `
    <div class="page studio-page">
      ${typeof window.renderPrimaryHeader === 'function'
        ? window.renderPrimaryHeader('studio', { actionLabel: 'Add Shelf', actionId: 'studioAddShelfBtn' })
        : ''
      }

      <section class="studio-main">
        <header class="studio-head section-head">
          <div class="studio-head-copy">
            <h2 class="section-subtitle">Library</h2>
            <p class="studio-subtitle">Build a reading order by placing books into a spatial library.</p>
          </div>
          <div class="studio-head-actions">
            <button type="button" class="chip active" data-studio-arrange="status">By Status</button>
            <button type="button" class="chip" data-studio-arrange="size">By Size</button>
            <button type="button" class="chip" data-studio-arrange="color">By Color</button>
            <button type="button" class="chip chip-ghost" data-studio-arrange="reset">Reset</button>
          </div>
        </header>

        <div class="studio-meta-row">
          <div class="studio-stats" id="studioStats"></div>
          <p class="studio-insight" id="studioInsight"></p>
        </div>

        <div class="library-view-controls">
          <div class="library-view-buttons">
            <button type="button" class="chip" data-library-view="left">Left View</button>
            <button type="button" class="chip" data-library-view="front">Front View</button>
            <button type="button" class="chip" data-library-view="right">Right View</button>
          </div>
          <p class="library-view-hint">Drag empty space to rotate the room.</p>
        </div>

        <section class="library-scene-wrap">
          <div class="library-scene" id="studioScene">
            <div class="library-room">
              <div class="library-wall-grid" id="studioShelves"></div>
            </div>
          </div>
        </section>

        <section class="library-pool-zone">
          <div class="studio-block-head">
            <h3>Library Pool</h3>
            <span id="studioPoolCount">0 books</span>
          </div>
          <div class="library-pool-books" data-shelf-id="pool" id="studioPool"></div>
          <div class="library-pool-plank"></div>
        </section>
      </section>
    </div>
  `;

  syncStudioRecords();
  hydrateStudioLayout();
  bindStudioEvents();
  renderStudio();
  applyCameraTransform();
}

function enterStudio() {
  syncStudioRecords();
  mergeLayoutWithRecords();
  renderStudio();
  applyCameraTransform();
}

function bindStudioEvents() {
  if (STUDIO_STATE.bound) return;
  STUDIO_STATE.bound = true;

  const root = document.getElementById('view-studio');
  if (!root) return;

  root.addEventListener('click', (event) => {
    const arrangeBtn = event.target.closest('[data-studio-arrange]');
    if (arrangeBtn) {
      document.querySelectorAll('#view-studio [data-studio-arrange]').forEach((el) => {
        el.classList.toggle('active', el === arrangeBtn && arrangeBtn.dataset.studioArrange !== 'reset');
      });
      applyArrangement(arrangeBtn.dataset.studioArrange || 'status');
      renderStudio();
      saveStudioLayout();
      return;
    }

    const cameraBtn = event.target.closest('[data-library-view]');
    if (cameraBtn) {
      applyCameraPreset(cameraBtn.dataset.libraryView || 'front');
      return;
    }

    if (event.target.closest('#studioAddShelfBtn')) {
      addShelfPrompt();
      return;
    }

    const removeBtn = event.target.closest('[data-remove-shelf]');
    if (removeBtn) removeShelf(removeBtn.dataset.removeShelf || '');
  });

  root.addEventListener('pointerdown', (event) => {
    const spine = event.target.closest('.studio-spine');
    if (spine && event.button === 0) {
      startDrag(event, spine);
      return;
    }
    maybeStartLookDrag(event);
  });
}

function syncStudioRecords() {
  const seen = new Map();
  const next = [];
  const nextMap = new Map();

  (window.SHELF_BOOKS || []).forEach((book, index) => {
    const rawBase = String(book.id || `${book.title || 'book'}-${book.author || 'author'}`).toLowerCase();
    const base = slugify(rawBase);
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    const key = count === 1 ? base : `${base}-${count}`;

    const record = {
      key,
      id: book.id || '',
      title: toTitleCase(book.title || `Book ${index + 1}`),
      author: toTitleCase(book.author || ''),
      status: book.status || 'want',
      spine: book.spine || '#2b2b2b',
      text: book.text || '#e8dfc8',
      w: Number(book.w) || 34,
      h: Number(book.h) || 0.82,
      sourceIndex: index,
    };
    next.push(record);
    nextMap.set(record.key, record);
  });

  STUDIO_STATE.records = next;
  STUDIO_STATE.recordByKey = nextMap;
}

function hydrateStudioLayout() {
  const saved = readStoredLayout();
  if (!saved) {
    arrangeByStatus();
    saveStudioLayout();
    return;
  }

  STUDIO_STATE.shelves = saved.shelves.map((shelf) => ({
    id: shelf.id,
    name: shelf.name,
    bookKeys: shelf.bookKeys.filter((key) => STUDIO_STATE.recordByKey.has(key)),
  }));
  STUDIO_STATE.pool = saved.pool.filter((key) => STUDIO_STATE.recordByKey.has(key));
  if (saved.camera) {
    STUDIO_STATE.camera.yaw = clamp(Number(saved.camera.yaw), -24, 24);
    STUDIO_STATE.camera.pitch = clamp(Number(saved.camera.pitch), 2, 18);
  }
  mergeLayoutWithRecords();
}

function mergeLayoutWithRecords() {
  if (!STUDIO_STATE.shelves.length) {
    arrangeByStatus();
    return;
  }

  const validKeys = new Set(STUDIO_STATE.records.map((record) => record.key));
  STUDIO_STATE.shelves.forEach((shelf) => {
    shelf.bookKeys = shelf.bookKeys.filter((key) => validKeys.has(key));
  });
  STUDIO_STATE.pool = STUDIO_STATE.pool.filter((key) => validKeys.has(key));

  const used = new Set();
  STUDIO_STATE.shelves.forEach((shelf) => shelf.bookKeys.forEach((key) => used.add(key)));
  STUDIO_STATE.pool.forEach((key) => used.add(key));

  STUDIO_STATE.records.forEach((record) => {
    if (!used.has(record.key)) STUDIO_STATE.pool.push(record.key);
  });
}

function renderStudio() {
  renderStudioStats();
  renderPool();
  renderShelves();
  renderInsight();
}

function renderStudioStats() {
  const statsEl = document.getElementById('studioStats');
  if (!statsEl) return;
  const total = STUDIO_STATE.records.length;
  const shelved = STUDIO_STATE.shelves.reduce((sum, shelf) => sum + shelf.bookKeys.length, 0);
  const unshelved = STUDIO_STATE.pool.length;
  const shelfCount = STUDIO_STATE.shelves.length;

  statsEl.innerHTML = `
    <span><strong>${total}</strong> Books</span>
    <span>·</span>
    <span><strong>${shelfCount}</strong> Shelves</span>
    <span>·</span>
    <span><strong>${shelved}</strong> Placed</span>
    <span>·</span>
    <span><strong>${unshelved}</strong> In Pool</span>
  `;
}

function renderPool() {
  const pool = document.getElementById('studioPool');
  const count = document.getElementById('studioPoolCount');
  if (!pool || !count) return;

  pool.innerHTML = '';
  STUDIO_STATE.pool.forEach((key) => {
    const record = STUDIO_STATE.recordByKey.get(key);
    if (record) pool.appendChild(createStudioSpine(record, 'pool'));
  });
  count.textContent = `${STUDIO_STATE.pool.length} book${STUDIO_STATE.pool.length === 1 ? '' : 's'}`;
}

function renderShelves() {
  const host = document.getElementById('studioShelves');
  if (!host) return;
  host.innerHTML = '';

  STUDIO_STATE.shelves.forEach((shelf, index) => {
    const bay = document.createElement('article');
    const depthClass = `is-depth-${(index % 3) + 1}`;
    bay.className = `library-bay ${depthClass}`;
    bay.dataset.shelfId = shelf.id;

    const canRemove = !STUDIO_DEFAULT_SHELVES.some((base) => base.id === shelf.id);
    bay.innerHTML = `
      <div class="library-bay-head">
        <h3>${escapeHTML(shelf.name)}</h3>
        <div class="library-bay-meta">
          <span>${shelf.bookKeys.length} books</span>
          ${canRemove ? `<button type="button" class="library-remove-btn" data-remove-shelf="${escapeHTML(shelf.id)}" aria-label="Remove shelf">x</button>` : ''}
        </div>
      </div>
      <div class="library-rows" data-shelf-id="${escapeHTML(shelf.id)}"></div>
      <div class="library-base"></div>
    `;

    const rowsHost = bay.querySelector('.library-rows');
    const rowGroups = splitShelfRows(shelf.bookKeys);
    rowGroups.forEach((group, rowIndex) => {
      const row = document.createElement('div');
      row.className = 'library-row';
      row.dataset.shelfId = shelf.id;
      row.dataset.rowIndex = String(rowIndex);
      row.dataset.startIndex = String(group.start);

      group.keys.forEach((key) => {
        const record = STUDIO_STATE.recordByKey.get(key);
        if (record) row.appendChild(createStudioSpine(record, shelf.id));
      });

      rowsHost?.appendChild(row);
    });

    host.appendChild(bay);
  });
}

function renderInsight() {
  const el = document.getElementById('studioInsight');
  if (!el) return;

  const next = getShelfById('to-read');
  const reading = getShelfById('reading-now');
  const finished = getShelfById('finished');
  const nextThree = (next?.bookKeys || [])
    .slice(0, 3)
    .map((key) => STUDIO_STATE.recordByKey.get(key)?.title)
    .filter(Boolean);

  if (STUDIO_STATE.pool.length > 0) {
    el.textContent = `${STUDIO_STATE.pool.length} books are still unsorted. Place them to complete your reading order.`;
    return;
  }

  if (nextThree.length > 0) {
    el.textContent = `Next queue: ${nextThree.join(' / ')}. Keep Reading Now small to improve completion.`;
    return;
  }

  const readingCount = reading ? reading.bookKeys.length : 0;
  const finishedCount = finished ? finished.bookKeys.length : 0;
  el.textContent = `Library status: ${readingCount} active and ${finishedCount} completed.`;
}

function createStudioSpine(record, shelfId) {
  const size = getStudioSpineSize(record);
  return window.SpineCard.create({
    title: record.title,
    author: record.author,
    spine: record.spine,
    text: record.text,
    width: size.width,
    height: size.height,
    className: 'studio-spine',
    dataAttrs: {
      bookKey: record.key,
      shelfId,
    },
    ariaLabel: `${record.title} by ${record.author}`,
    titleClass: 'studio-spine-title',
    authorClass: 'studio-spine-author',
  });
}

function startDrag(event, spineEl) {
  const bookKey = spineEl.dataset.bookKey || '';
  const sourceShelfId = spineEl.dataset.shelfId || 'pool';
  if (!bookKey) return;

  const sourceLane = spineEl.closest('.library-row, .library-pool-books');
  if (!sourceLane) return;

  const sourceList = getShelfList(sourceShelfId);
  const sourceIndex = sourceList ? sourceList.indexOf(bookKey) : -1;
  if (sourceIndex === -1) return;

  const rect = spineEl.getBoundingClientRect();
  const ghost = spineEl.cloneNode(true);
  ghost.classList.add('studio-spine-ghost');
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.appendChild(ghost);

  const placeholder = document.createElement('div');
  placeholder.className = 'studio-drop-placeholder';
  placeholder.style.width = `${rect.width}px`;
  placeholder.style.height = `${rect.height}px`;

  sourceLane.insertBefore(placeholder, spineEl);
  spineEl.style.display = 'none';

  STUDIO_STATE.drag = {
    bookKey,
    sourceShelfId,
    sourceIndex,
    sourceEl: spineEl,
    placeholder,
    ghost,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
  };

  positionGhost(event.clientX, event.clientY);
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
  window.addEventListener('pointercancel', onDragEnd);
}

function onDragMove(event) {
  const drag = STUDIO_STATE.drag;
  if (!drag) return;

  positionGhost(event.clientX, event.clientY);
  const lane = findLaneAtPoint(event.clientX, event.clientY);
  if (!lane) return;
  movePlaceholderToLane(lane, event.clientX);
}

function onDragEnd() {
  const drag = STUDIO_STATE.drag;
  if (!drag) return;

  const lane = drag.placeholder.parentElement;
  const targetShelfId = lane?.dataset.shelfId || drag.sourceShelfId;
  const targetIndex = computeTargetIndex(lane, drag.placeholder);

  moveBookToShelf(drag.bookKey, targetShelfId, targetIndex);
  cleanupDrag();
  renderStudio();
  saveStudioLayout();
}

function cleanupDrag() {
  const drag = STUDIO_STATE.drag;
  if (!drag) return;

  if (drag.sourceEl) drag.sourceEl.style.display = '';
  if (drag.placeholder?.parentElement) drag.placeholder.remove();
  if (drag.ghost?.parentElement) drag.ghost.remove();

  STUDIO_STATE.drag = null;
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
  window.removeEventListener('pointercancel', onDragEnd);
}

function computeTargetIndex(lane, placeholder) {
  if (!lane || !placeholder) return 0;
  const startIndex = Number(lane.dataset.startIndex || 0);
  const localIndex = Math.max(0, Array.from(lane.children).indexOf(placeholder));
  return startIndex + localIndex;
}

function moveBookToShelf(bookKey, targetShelfId, targetIndex) {
  if (!bookKey) return;
  const allLists = collectAllBookLists();
  allLists.forEach((bucket) => {
    const idx = bucket.indexOf(bookKey);
    if (idx !== -1) bucket.splice(idx, 1);
  });

  const target = getShelfList(targetShelfId);
  if (!target) return;
  const nextIndex = clamp(targetIndex, 0, target.length);
  target.splice(nextIndex, 0, bookKey);

  syncStatusToSource(bookKey, targetShelfId);
}

function collectAllBookLists() {
  return [STUDIO_STATE.pool, ...STUDIO_STATE.shelves.map((shelf) => shelf.bookKeys)];
}

function findLaneAtPoint(x, y) {
  const lanes = Array.from(document.querySelectorAll('#view-studio .library-row, #view-studio .library-pool-books'));
  return lanes.find((lane) => {
    const rect = lane.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }) || null;
}

function movePlaceholderToLane(lane, x) {
  const drag = STUDIO_STATE.drag;
  if (!drag || !lane) return;

  const children = Array.from(lane.children).filter((child) => child !== drag.placeholder);
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

function positionGhost(clientX, clientY) {
  const drag = STUDIO_STATE.drag;
  if (!drag) return;
  drag.ghost.style.left = `${clientX - drag.offsetX}px`;
  drag.ghost.style.top = `${clientY - drag.offsetY}px`;
}

function maybeStartLookDrag(event) {
  if (event.button !== 0) return;
  const scene = event.target.closest('#studioScene');
  if (!scene) return;
  if (event.target.closest('button, a, input, .studio-spine')) return;

  STUDIO_STATE.lookDrag = {
    startX: event.clientX,
    startY: event.clientY,
    yaw: STUDIO_STATE.camera.yaw,
    pitch: STUDIO_STATE.camera.pitch,
  };
  window.addEventListener('pointermove', onLookDragMove);
  window.addEventListener('pointerup', endLookDrag);
  window.addEventListener('pointercancel', endLookDrag);
}

function onLookDragMove(event) {
  const drag = STUDIO_STATE.lookDrag;
  if (!drag) return;

  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  STUDIO_STATE.camera.yaw = clamp(drag.yaw + dx * 0.08, -24, 24);
  STUDIO_STATE.camera.pitch = clamp(drag.pitch - dy * 0.05, 2, 18);
  applyCameraTransform();
}

function endLookDrag() {
  if (!STUDIO_STATE.lookDrag) return;
  STUDIO_STATE.lookDrag = null;
  window.removeEventListener('pointermove', onLookDragMove);
  window.removeEventListener('pointerup', endLookDrag);
  window.removeEventListener('pointercancel', endLookDrag);
  saveStudioLayout();
}

function applyCameraPreset(preset) {
  if (preset === 'left') {
    STUDIO_STATE.camera.yaw = -18;
    STUDIO_STATE.camera.pitch = 10;
  } else if (preset === 'right') {
    STUDIO_STATE.camera.yaw = 18;
    STUDIO_STATE.camera.pitch = 10;
  } else {
    STUDIO_STATE.camera.yaw = 0;
    STUDIO_STATE.camera.pitch = 8;
  }
  applyCameraTransform();
  saveStudioLayout();
}

function applyCameraTransform() {
  const scene = document.getElementById('studioScene');
  if (!scene) return;
  scene.style.setProperty('--lib-yaw', `${STUDIO_STATE.camera.yaw}deg`);
  scene.style.setProperty('--lib-pitch', `${STUDIO_STATE.camera.pitch}deg`);
}

function applyArrangement(kind) {
  if (kind === 'status') {
    arrangeByStatus();
    return;
  }
  if (kind === 'size') {
    arrangeBySize();
    return;
  }
  if (kind === 'color') {
    arrangeByColor();
    return;
  }
  if (kind === 'reset') {
    arrangeByStatus();
  }
}

function arrangeByStatus() {
  STUDIO_STATE.shelves = STUDIO_DEFAULT_SHELVES.map((shelf) => ({ ...shelf, bookKeys: [] }));
  STUDIO_STATE.pool = [];

  STUDIO_STATE.records.forEach((record) => {
    const targetId = mapStatusToShelfId(record.status);
    const target = getShelfById(targetId);
    if (target) target.bookKeys.push(record.key);
    else STUDIO_STATE.pool.push(record.key);
  });
}

function arrangeBySize() {
  ensureBaseShelves();
  clearLayoutBooks();

  STUDIO_STATE.records
    .slice()
    .sort((a, b) => (b.h * b.w) - (a.h * a.w))
    .forEach((record, index) => {
      STUDIO_STATE.shelves[index % STUDIO_STATE.shelves.length].bookKeys.push(record.key);
    });
}

function arrangeByColor() {
  ensureBaseShelves();
  clearLayoutBooks();

  STUDIO_STATE.records
    .slice()
    .sort((a, b) => getColorHue(a.spine) - getColorHue(b.spine))
    .forEach((record, index) => {
      STUDIO_STATE.shelves[index % STUDIO_STATE.shelves.length].bookKeys.push(record.key);
    });
}

function clearLayoutBooks() {
  STUDIO_STATE.pool = [];
  STUDIO_STATE.shelves.forEach((shelf) => { shelf.bookKeys = []; });
}

function ensureBaseShelves() {
  if (!STUDIO_STATE.shelves.length) {
    STUDIO_STATE.shelves = STUDIO_DEFAULT_SHELVES.map((shelf) => ({ ...shelf, bookKeys: [] }));
    return;
  }
  STUDIO_DEFAULT_SHELVES.forEach((base) => {
    if (!STUDIO_STATE.shelves.some((shelf) => shelf.id === base.id)) {
      STUDIO_STATE.shelves.push({ ...base, bookKeys: [] });
    }
  });
}

function addShelfPrompt() {
  const name = window.prompt('Shelf name');
  if (!name) return;
  const clean = name.trim();
  if (!clean) return;

  const idBase = slugify(clean);
  let id = idBase;
  let i = 2;
  while (STUDIO_STATE.shelves.some((shelf) => shelf.id === id)) {
    id = `${idBase}-${i}`;
    i += 1;
  }

  STUDIO_STATE.shelves.push({ id, name: clean, bookKeys: [] });
  renderStudio();
  saveStudioLayout();
}

function removeShelf(shelfId) {
  const shelf = getShelfById(shelfId);
  if (!shelf) return;
  STUDIO_STATE.pool.push(...shelf.bookKeys);
  STUDIO_STATE.shelves = STUDIO_STATE.shelves.filter((item) => item.id !== shelfId);
  renderStudio();
  saveStudioLayout();
}

function getShelfList(shelfId) {
  if (shelfId === 'pool') return STUDIO_STATE.pool;
  const shelf = getShelfById(shelfId);
  return shelf ? shelf.bookKeys : null;
}

function getShelfById(shelfId) {
  return STUDIO_STATE.shelves.find((shelf) => shelf.id === shelfId) || null;
}

function syncStatusToSource(bookKey, shelfId) {
  const record = STUDIO_STATE.recordByKey.get(bookKey);
  if (!record) return;
  const status = mapShelfIdToStatus(shelfId);
  if (!status) return;

  record.status = status;
  const source = window.SHELF_BOOKS?.[record.sourceIndex];
  if (source) source.status = status;
}

function splitShelfRows(bookKeys) {
  const total = bookKeys.length;
  if (!total) return [{ start: 0, keys: [] }];

  const rowCount = Math.min(3, Math.max(2, Math.ceil(total / 8)));
  const perRow = Math.ceil(total / rowCount);
  const rows = [];
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const start = rowIndex * perRow;
    const slice = bookKeys.slice(start, start + perRow);
    rows.push({ start, keys: slice });
  }
  return rows;
}

function saveStudioLayout() {
  const payload = {
    shelves: STUDIO_STATE.shelves.map((shelf) => ({
      id: shelf.id,
      name: shelf.name,
      bookKeys: shelf.bookKeys.slice(),
    })),
    pool: STUDIO_STATE.pool.slice(),
    camera: {
      yaw: STUDIO_STATE.camera.yaw,
      pitch: STUDIO_STATE.camera.pitch,
    },
  };

  try {
    localStorage.setItem(STUDIO_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('[Library] save skipped', err);
  }
}

function readStoredLayout() {
  try {
    const raw = localStorage.getItem(STUDIO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.shelves) || !Array.isArray(parsed.pool)) return null;
    return parsed;
  } catch (err) {
    return null;
  }
}

function getStudioSpineSize(record) {
  return {
    width: clamp(Math.round(record.w), 24, 64),
    height: clamp(Math.round(record.h * 194), 128, 216),
  };
}

function mapStatusToShelfId(status) {
  if (status === 'reading') return 'reading-now';
  if (status === 'finished') return 'finished';
  if (status === 'want') return 'to-read';
  return 'holding-bay';
}

function mapShelfIdToStatus(shelfId) {
  if (shelfId === 'reading-now') return 'reading';
  if (shelfId === 'finished') return 'finished';
  if (shelfId === 'to-read') return 'want';
  return '';
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

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
