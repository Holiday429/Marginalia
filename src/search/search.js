/* Search view */

import { BooksStore } from '../store/books-store.ts';
import { SEED_BOOK_BY_ID, SEED_BOOK_DETAILS } from '../data/seed/index.js';
import { SHELF_BOOKS as MOCK_SPINES } from '../data/mock/seed-spines.js';
import { renderUnifiedPanelHeader } from '../core/app.js';
import { PanelManager } from '../core/panel-manager.js';
import { SpineCard } from '../components/spine-card.js';
import { NewEntry } from '../new-entry/new-entry.js';
import { containsCJK, getUnifiedShelfSpineSize } from '../shared/shelf-utils.ts';

const SHELF_STATE = {
  filter: 'all',
  query: '',
  selectedKey: null,
  isExpanded: false,
};

let SHELF_RECORDS = [];
let SHELF_RESIZE_TIMER = null;
let SHELF_BOUND = false;

function initSearch() {
  SHELF_STATE.selectedKey = null;
  SHELF_STATE.isExpanded = false;
  SHELF_STATE.query = '';

  const headerWrap = document.getElementById('searchHeaderWrap');
  if (headerWrap) {
    headerWrap.innerHTML = renderUnifiedPanelHeader('search');
  }

  bindShelfEvents();
  refreshShelfFromSource();
}

function enterSearch() {
  refreshShelfFromSource();
}

function renderStatsBar() {
  const shelfBooks = SHELF_RECORDS.filter(b => !b._isMock);
  const detailBooks = BooksStore.getAll();

  const finished = shelfBooks.filter(b => b.status === 'finished').length;
  const reading = shelfBooks.filter(b => b.status === 'reading');
  const highlights = detailBooks.reduce((n, b) => n + (b.highlights ? b.highlights.length : 0), 0);
  const allActions = detailBooks.reduce((arr, b) => arr.concat(b.actions || []), []);
  const actionsDone = allActions.filter(a => a.status === 'done').length;
  const actionsPending = allActions.filter(a => a.status !== 'done').length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  const year = new Date().getFullYear();
  set('statBooksFinished', finished);
  set('statBooksYear', `'${String(year).slice(2)}`);
  set('statBooksVsLastYear', finished > 0 ? `↗ +3 vs last year` : '');

  set('statReadingCount', reading.length);
  set('statReadingTitle', reading.length > 0 ? toTitleCase(reading[0].title) : '');

  set('statHighlights', highlights);
  set('statHighlightsSub', highlights > 0 ? `↗ +12 this month` : '');

  set('statActionsDone', actionsDone);
  set('statActionsPending', actionsPending > 0 ? `${actionsPending} pending review` : '');
}

function animateIn() {
  const page = document.querySelector('#view-search .page');
  if (!page) return;
  page.style.opacity = '0';
  page.style.transform = 'scale(1.01)';
  page.style.filter = 'blur(4px)';
  page.style.transition = 'opacity 0.75s cubic-bezier(.2,.8,.2,1), transform 0.75s cubic-bezier(.2,.8,.2,1), filter 0.75s cubic-bezier(.2,.8,.2,1)';
  requestAnimationFrame(() => {
    page.style.opacity = '1';
    page.style.transform = 'scale(1)';
    page.style.filter = 'blur(0)';
  });
}

function syncShelfRecords() {
  SHELF_RECORDS = buildShelfRecords();
}

function refreshShelfFromSource() {
  syncShelfRecords();
  renderStatsBar();
  renderShelfSectionInternal();
}

// Expose for NewEntry to trigger a re-render after adding a book
export const renderSearchSection = refreshShelfFromSource;

function bindShelfEvents() {
  if (SHELF_BOUND) return;
  SHELF_BOUND = true;

  // Re-render when persisted user books finish loading asynchronously
  window.addEventListener('marginalia:books-changed', () => {
    refreshShelfFromSource();
  });

  const newEntryBtn = document.getElementById('searchNewEntryBtn');
  if (newEntryBtn) {
    newEntryBtn.addEventListener('click', () => NewEntry?.mount());
  }

  document.querySelectorAll('.shelf-filters .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.shelf-filters .chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      SHELF_STATE.filter = chip.textContent.toLowerCase().trim();
      renderShelfSectionInternal();
    });
  });

  const searchInput = document.getElementById('shelfSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      SHELF_STATE.query = searchInput.value.trim().toLowerCase();
      renderShelfSectionInternal();
    });
  }

  const previewPanel = document.getElementById('shelfPreviewPanel');
  const closeBtn = document.getElementById('shelfPreviewCloseBtn');
  if (previewPanel) {
    previewPanel.addEventListener('click', (event) => {
      if (event.target.closest('#shelfPreviewCloseBtn')) return;
      openSelectedBook();
    });
    previewPanel.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openSelectedBook();
    });
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      SHELF_STATE.selectedKey = null;
      SHELF_STATE.isExpanded = false;
      renderShelfSectionInternal();
    });
  }

  window.addEventListener('resize', () => {
    clearTimeout(SHELF_RESIZE_TIMER);
    SHELF_RESIZE_TIMER = setTimeout(() => {
      renderShelfSectionInternal();
    }, 120);
  });
}

function buildMockSpines() {
  const userTitles = new Set(
    (BooksStore.getShelfBooks() || []).map((b) => slugify(b.title))
  );
  return (Array.isArray(MOCK_SPINES) ? MOCK_SPINES : [])
    .filter((s) => s.id !== 'sapiens' && !userTitles.has(slugify(s.title)))
    .map((s, i) => ({ ...s, id: `mock-${i}`, _isMock: true }));
}

function buildShelfRecords() {
  const records = [];
  const userSpines = BooksStore.getShelfBooks() || [];
  const allSpines = [...userSpines, ...buildMockSpines()];
  allSpines.forEach((b, index) => {
    let detailId = resolveCanonicalBookId(b) || b.id || matchBookId(b.title);
    let detail = getBookDetail(detailId);
    if (!detailId || !detail) {
      detailId = ensureShelfDetailRecord(b, index);
      detail = getBookDetail(detailId);
    }
    const resolvedStatus = detailId === 'sapiens'
      ? 'finished'
      : (b.status || 'want');
    const key = `${slugify(b.title)}-${index}`;
    const title = detailId === 'sapiens'
      ? (detail?.title || 'Sapiens: A Brief History of Humankind')
      : toTitleCase(b.title);
    const statusText = statusToLabel(resolvedStatus);
    const translatedTags = detailId === 'sapiens'
      ? ['Anthropology', 'Macro History', 'Cognitive Revolution', 'Narrative']
      : (detail?.tags?.map(toEnglishTag) || [statusText, 'Global shelf']);
    const preview = {
      title: detail?.titleZh || title,
      subtitle: detail?.titleZh ? detail.title : statusText,
      author: detail
        ? [detail.author, detail.authorZh].filter(Boolean).join(' · ')
        : b.author,
      description: detail?.summary || `${title} is on your shelf. Select to preview notes and metadata.`,
      tags: translatedTags.slice(0, 4),
      stats: buildPreviewStats(detail),
      coverSrc: resolveCoverSrc(b, detailId),
      tone: b.spine,
      text: b.text,
      canOpen: Boolean(detailId && detail),
    };
    const searchText = [
      title,
      b.author || '',
      preview.title,
      preview.author,
      preview.description,
      translatedTags.join(' '),
    ].join(' ').toLowerCase();

    records.push({
      ...b,
      status: resolvedStatus,
      key,
      titleDisplay: title,
      detailId,
      preview,
      searchText,
    });
  });
  return records;
}

function ensureShelfDetailRecord(shelfBook, index) {
  const explicitId = shelfBook.id && String(shelfBook.id).trim();
  const baseId = explicitId || slugify(shelfBook.title || `book-${index + 1}`);
  let detailId = baseId;
  let dedupe = 2;
  while (BooksStore.getById(detailId)?.title !== undefined &&
         BooksStore.getById(detailId).title !== shelfBook.title) {
    detailId = `${baseId}-${dedupe++}`;
  }
  if (BooksStore.getById(detailId)) return detailId;

  const template = SEED_BOOK_BY_ID.sapiens || SEED_BOOK_DETAILS[0];
  if (!template) return null;

  const detail = deepClone(template);
  detail.id = detailId;
  detail.title = toTitleCase(shelfBook.title || template.title || detailId);
  detail.titleZh = detail.title;
  detail.author = shelfBook.author || template.author || 'Unknown';
  detail.authorZh = '';
  detail.status = mapShelfStatusToDetailStatus(shelfBook.status || 'want');
  detail.rating = null;
  detail.tags = [statusToLabel(shelfBook.status || 'want'), 'Shelf Template'];
  if (!detail.cover) detail.cover = {};
  detail.cover.bg = shelfBook.spine || detail.cover.bg || '#14263e';
  detail.cover.text = shelfBook.text || detail.cover.text || '#e8dfc8';
  detail.cover.image = '';
  if (!detail.meta) detail.meta = {};
  detail.meta.publisher = detail.meta.publisher || 'Personal shelf';
  detail.meta.edition = detail.meta.edition || 'Template entry';
  detail.summary = `${detail.title} uses the current Sapiens note architecture as a placeholder entry.`;

  SEED_BOOK_DETAILS.push(detail);
  SEED_BOOK_BY_ID[detail.id] = detail;
  return detail.id;
}

function mapShelfStatusToDetailStatus(status) {
  if (status === 'finished') return 'finished';
  if (status === 'reading') return 'reading';
  return 'wishlist';
}

function deepClone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function resolveCoverSrc(book, detailId) {
  void book;
  const detail = getBookDetail(detailId);
  if (detail?.cover?.image) return detail.cover.image;
  return '';
}

function resolveCanonicalBookId(book) {
  if (!book) return null;
  const rawId = String(book.id || '').toLowerCase();
  if (rawId === 'sapiens') return 'sapiens';
  if (matchBookId(book.title) === 'sapiens') return 'sapiens';
  return null;
}

function getBookDetail(detailId) {
  if (!detailId) return null;
  if (detailId === 'sapiens') {
    return SEED_BOOK_BY_ID.sapiens || BooksStore.getById(detailId) || null;
  }
  return BooksStore.getById(detailId) || SEED_BOOK_BY_ID[detailId] || null;
}

function renderShelfSectionInternal() {
  const shelfHost = document.getElementById('shelfStack');
  if (!shelfHost) return;

  const visible = getFilteredBooks();
  renderShelfSummary(visible.length);

  if (!visible.length) {
    const emptyText = SHELF_STATE.query
      ? 'No books matched this search.'
      : 'No books in this filter.';
    shelfHost.innerHTML = `<div class="shelf-empty">${emptyText}</div>`;
    SHELF_STATE.selectedKey = null;
    SHELF_STATE.isExpanded = false;
    applyShelfLayoutState();
    renderShelfPreview(null);
    return;
  }

  if (SHELF_STATE.selectedKey && !visible.some((b) => b.key === SHELF_STATE.selectedKey)) {
    SHELF_STATE.selectedKey = null;
    SHELF_STATE.isExpanded = false;
  }

  applyShelfLayoutState();
  shelfHost.innerHTML = '';
  const rows = layoutShelfRows(visible, Math.round(shelfHost.getBoundingClientRect().width) || window.innerWidth);

  rows.forEach((row) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'shelf-row';

    const rowBooks = document.createElement('div');
    rowBooks.className = 'shelf-row-books';

    row.forEach((record) => {
      const btn = createSpineButton(record);
      rowBooks.appendChild(btn);
    });

    rowEl.appendChild(rowBooks);
    shelfHost.appendChild(rowEl);
  });

  const selected = SHELF_STATE.selectedKey
    ? visible.find((b) => b.key === SHELF_STATE.selectedKey)
    : null;
  renderShelfPreview(selected || null);
}

function renderShelfSummary(visibleCount) {
  const countEl = document.getElementById('shelfCount');
  if (!countEl) return;

  const totals = SHELF_RECORDS.reduce((acc, book) => {
    if (book._isMock) return acc;
    if (book.status === 'finished') acc.finished += 1;
    else if (book.status === 'reading') acc.reading += 1;
    else if (book.status === 'want') acc.want += 1;
    return acc;
  }, { finished: 0, reading: 0, want: 0 });

  const base = `
    <span class="count-item"><strong>${totals.finished}</strong> finished</span>
    <span class="count-sep">·</span>
    <span class="count-item"><strong>${totals.reading}</strong> reading</span>
    <span class="count-sep">·</span>
    <span class="count-item"><strong>${totals.want}</strong> to read</span>
  `;
  if (SHELF_STATE.query) {
    countEl.innerHTML = `
      <span class="count-wrap">${base}</span>
      <span class="count-item count-match"><strong>${visibleCount}</strong> matched</span>
    `;
    return;
  }
  countEl.innerHTML = `<span class="count-wrap">${base}</span>`;
}

function createSpineButton(record) {
  const { width, height } = getSpineSize(record);
  const btn = SpineCard.create({
    title:        record.titleDisplay,
    author:       record.author || '',
    spine:        record.spine || '#2b2b2b',
    text:         record.text  || '#e8dfc8',
    width,
    height,
    className:    'shelf-spine',
    extraClasses: record.key === SHELF_STATE.selectedKey ? ['active'] : [],
    titleClass:   `shelf-spine-title${containsCJK(record.titleDisplay) ? ' is-cjk' : ''}`,
    authorClass:  `shelf-spine-author${containsCJK(record.author) ? ' is-cjk' : ''}`,
    dataAttrs:    { key: record.key, status: record.status },
    onClick(btn) {
      const isSelected = SHELF_STATE.selectedKey === record.key;
      if (isSelected && record.preview?.canOpen) {
        PanelManager.open('book', { id: record.detailId });
        return;
      }
      selectShelfRecord(record, btn);
    },
  });
  return btn;
}

function selectShelfRecord(record, sourceEl = null) {
  if (!record) return;
  const sourceSnapshot = sourceEl ? captureSpineSnapshot(sourceEl) : null;
  const wasExpanded = SHELF_STATE.isExpanded;
  SHELF_STATE.isExpanded = true;
  SHELF_STATE.selectedKey = record.key;
  renderShelfSectionInternal();
  if (!sourceSnapshot) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const previewFrame = document.getElementById('shelfPreviewCoverFrame');
    if (previewFrame) animateSpinePullout(sourceSnapshot, previewFrame, !wasExpanded);
  }));
}

function applyShelfLayoutState() {
  const layout = document.querySelector('.shelf-layout');
  if (!layout) return;
  layout.classList.toggle('is-expanded', SHELF_STATE.isExpanded && Boolean(SHELF_STATE.selectedKey));
}

function captureSpineSnapshot(sourceEl) {
  const rect = sourceEl.getBoundingClientRect();
  const style = getComputedStyle(sourceEl);
  return {
    rect,
    width: rect.width,
    height: rect.height,
    background: style.backgroundColor,
    color: style.color,
    markup: sourceEl.innerHTML,
  };
}

function animateSpinePullout(snapshot, targetEl, freshOpen = false) {
  if (!snapshot || !targetEl) return;
  const sourceRect = snapshot.rect;
  const targetRect = targetEl.getBoundingClientRect();

  const ghost = document.createElement('div');
  ghost.className = 'shelf-spine-ghost';
  ghost.innerHTML = snapshot.markup;
  ghost.style.left = sourceRect.left + 'px';
  ghost.style.top = sourceRect.top + 'px';
  ghost.style.width = snapshot.width + 'px';
  ghost.style.height = snapshot.height + 'px';
  ghost.style.background = snapshot.background;
  ghost.style.color = snapshot.color;
  ghost.style.opacity = '0.95';
  document.body.appendChild(ghost);

  const dx = targetRect.left + targetRect.width * 0.28 - sourceRect.left;
  const dy = targetRect.top + targetRect.height * 0.22 - sourceRect.top;
  const scale = Math.max(1.25, (targetRect.width * 0.22) / Math.max(sourceRect.width, 1));

  requestAnimationFrame(() => {
    ghost.style.transform = `translate(${dx}px, ${dy}px) scale(${scale}) rotate(${freshOpen ? -11 : -8}deg)`;
    ghost.style.opacity = '0';
  });

  targetEl.classList.add('is-landing');
  setTimeout(() => targetEl.classList.remove('is-landing'), 420);

  setTimeout(() => {
    ghost.remove();
  }, 460);
}

function renderShelfPreview(record) {
  const panel = document.getElementById('shelfPreviewPanel');
  const coverFrame = document.getElementById('shelfPreviewCoverFrame');
  const cover = document.getElementById('shelfPreviewCover');
  const fallback = document.getElementById('shelfPreviewFallback');
  const title = document.getElementById('shelfPreviewTitle');
  const subtitle = document.getElementById('shelfPreviewSubtitle');
  const author = document.getElementById('shelfPreviewAuthor');
  const stats = document.getElementById('shelfPreviewStats');
  const description = document.getElementById('shelfPreviewDescription');
  const tags = document.getElementById('shelfPreviewTags');
  if (!panel || !coverFrame || !cover || !fallback || !title || !subtitle || !author || !stats || !description || !tags) return;

  if (!record) {
    title.textContent = 'No book selected';
    subtitle.textContent = '';
    author.textContent = '';
    stats.innerHTML = '';
    stats.hidden = true;
    description.textContent = '';
    tags.innerHTML = '';
    cover.hidden = true;
    fallback.hidden = false;
    fallback.textContent = '';
    panel.dataset.canOpen = 'false';
    panel.classList.remove('is-openable');
    panel.tabIndex = -1;
    panel.removeAttribute('role');
    panel.setAttribute('aria-disabled', 'true');
    return;
  }

  const p = record.preview;
  title.textContent = p.title;
  subtitle.textContent = p.subtitle;
  author.textContent = p.author;
  stats.innerHTML = p.stats.map((item) => `<span class="preview-stat">${escapeHTML(item)}</span>`).join('');
  stats.hidden = p.stats.length === 0;
  description.textContent = p.description;

  tags.innerHTML = '';
  p.tags.forEach((tag) => {
    const item = document.createElement('span');
    item.className = 'preview-tag';
    item.textContent = tag;
    tags.appendChild(item);
  });

  fallback.style.background = `linear-gradient(145deg, ${p.tone || '#202020'}, #111)`;
  fallback.style.color = p.text || '#f4ead6';
  fallback.textContent = p.title;

  const showCover = Boolean(p.coverSrc);
  if (showCover) {
    cover.src = p.coverSrc;
    cover.hidden = false;
    fallback.hidden = true;
  } else {
    cover.removeAttribute('src');
    cover.hidden = true;
    fallback.hidden = false;
  }
  cover.onerror = () => {
    cover.hidden = true;
    fallback.hidden = false;
  };

  panel.dataset.canOpen = p.canOpen ? 'true' : 'false';
  panel.classList.toggle('is-openable', p.canOpen);
  panel.tabIndex = p.canOpen ? 0 : -1;
  panel.setAttribute('aria-disabled', p.canOpen ? 'false' : 'true');
  if (p.canOpen) panel.setAttribute('role', 'button');
  else panel.removeAttribute('role');
}

function buildPreviewStats(detail) {
  void detail;
  return [];
}

function openSelectedBook() {
  const selected = SHELF_RECORDS.find((b) => b.key === SHELF_STATE.selectedKey);
  if (!selected?.detailId || !selected.preview.canOpen) return;
  PanelManager.open('book', { id: selected.detailId });
}

function getFilteredBooks() {
  return SHELF_RECORDS.filter((b) => {
    if (b._isMock && SHELF_STATE.query) return false;
    const status = b.status;
    if (SHELF_STATE.filter === 'finished' && status !== 'finished') return false;
    if (SHELF_STATE.filter === 'reading' && status !== 'reading') return false;
    if (SHELF_STATE.filter === 'to read' && status !== 'want') return false;
    if (SHELF_STATE.query && !b.searchText.includes(SHELF_STATE.query)) return false;
    return true;
  });
}

function getSpineSize(record) {
  return getUnifiedShelfSpineSize(record, {
    expanded: SHELF_STATE.isExpanded,
    narrowExpanded: SHELF_STATE.isExpanded && window.matchMedia('(max-width: 1220px)').matches,
  });
}

function layoutShelfRows(records, availableWidth) {
  const maxWidth = Math.max(260, Math.floor(availableWidth));
  const gap = 7;
  const rows = [];
  let currentRow = [];
  let currentWidth = 0;

  records.forEach((record) => {
    const { width } = getSpineSize(record);
    const nextWidth = currentRow.length ? currentWidth + gap + width : width;

    if (currentRow.length && nextWidth > maxWidth) {
      rows.push(currentRow);
      currentRow = [record];
      currentWidth = width;
      return;
    }

    currentRow.push(record);
    currentWidth = nextWidth;
  });

  if (currentRow.length) rows.push(currentRow);
  return rows;
}

function toTitleCase(str) {
  const minors = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'in', 'of', 'up']);
  return String(str || '').toLowerCase().split(' ').map((w, i) => {
    if (i === 0 || !minors.has(w)) return w.charAt(0).toUpperCase() + w.slice(1);
    return w;
  }).join(' ');
}

function statusToLabel(status) {
  if (status === 'finished') return 'Finished';
  if (status === 'reading') return 'Reading';
  if (status === 'want') return 'To read';
  return 'Shelf';
}

function toEnglishTag(tag) {
  const map = {
    '人类学': 'Anthropology',
    '宏观历史': 'Macro History',
    '认知革命': 'Cognitive Revolution',
    '叙事': 'Narrative',
  };
  const clean = String(tag || '').trim();
  return map[clean] || toTitleCase(clean);
}

function slugify(str) {
  return String(str || 'book')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function matchBookId(title) {
  if (!title) return null;
  const t = title.toLowerCase();
  if (t.includes('sapien') || title.includes('人类简史')) return 'sapiens';
  return null;
}

function escapeHTML(str) {
  return String(str || '').replace(/[&<>"]/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
  ));
}

export { initSearch, enterSearch };
export function enterPanel_search(params = {}) { enterSearch(params); }
