/* Search view */

import { BooksStore } from '../store/books-store.ts';
import { openActionCount, openActionLabel } from '../store/actions-store.ts';
import { createEmptyBook } from '../data/schema/empty-book.ts';
import { renderUnifiedPanelHeader } from '../core/app.ts';
import { PanelManager } from '../core/panel-manager.ts';
import { SpineCard } from '../components/spine-card.ts';
import { NewEntry } from '../new-entry/new-entry.ts';
import { containsCJK, getUnifiedShelfSpineSize } from '../shared/shelf-utils.ts';
import { normalizeReadingStatus, readingStatusLabel } from '../shared/reading-status.ts';
import { maybeSettleLaptopFlyIn } from './laptop-fly.js';

const SHELF_STATE = {
  filter: 'all',
  sort: 'recent',
  tag: null,
  query: '',
  selectedKey: null,
  isExpanded: false,
};

const MIN_SHELF_SPINES = 8;
let SHELF_RECORDS = [];
let SHELF_RESIZE_TIMER = null;
let SHELF_BOUND = false;

function initSearch() {
  SHELF_STATE.selectedKey = null;
  SHELF_STATE.isExpanded = false;
  SHELF_STATE.query = '';
  SHELF_STATE.filter = 'all';
  SHELF_STATE.sort = 'recent';
  SHELF_STATE.tag = null;

  const headerWrap = document.getElementById('searchHeaderWrap');
  if (headerWrap) {
    headerWrap.innerHTML = renderUnifiedPanelHeader('search');
  }

  bindShelfEvents();
  refreshShelfFromSource();
  // If we arrived via the room's laptop fly-in, glide the search bar into place.
  maybeSettleLaptopFlyIn(document);
}

function enterSearch() {
  refreshShelfFromSource();
  maybeSettleLaptopFlyIn(document);
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
  renderTagChips();
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

  document.getElementById('searchImportBtn')?.addEventListener('click', () => {
    import('../api/import/import-ui.ts').then(({ openImportDialog }) => openImportDialog());
  });

  const newEntryBtn = document.getElementById('searchNewEntryBtn');
  if (newEntryBtn) {
    newEntryBtn.addEventListener('click', () => NewEntry?.mount());
  }

  const statusChips = document.getElementById('shelfStatusChips');
  if (statusChips) {
    statusChips.addEventListener('click', (event) => {
      const chip = event.target.closest('.chip');
      if (!chip) return;
      statusChips.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      SHELF_STATE.filter = chip.dataset.filter || 'all';
      renderShelfSectionInternal();
    });
  }

  const sortChips = document.getElementById('shelfSortChips');
  if (sortChips) {
    sortChips.addEventListener('click', (event) => {
      const chip = event.target.closest('.chip');
      if (!chip) return;
      sortChips.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      SHELF_STATE.sort = chip.dataset.sort || 'recent';
      renderShelfSectionInternal();
    });
  }

  const tagChips = document.getElementById('shelfTagChips');
  if (tagChips) {
    tagChips.addEventListener('click', (event) => {
      const chip = event.target.closest('.chip');
      if (!chip) return;
      const tag = chip.dataset.tag || null;
      const isActive = chip.classList.contains('active');
      tagChips.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      if (!isActive) {
        chip.classList.add('active');
        SHELF_STATE.tag = tag;
      } else {
        SHELF_STATE.tag = null;
      }
      renderShelfSectionInternal();
    });
  }

  const filtersToggle = document.getElementById('shelfFiltersToggle');
  const filtersMenu = document.getElementById('shelfFiltersMenu');
  if (filtersToggle && filtersMenu) {
    filtersToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = filtersMenu.hidden;
      filtersMenu.hidden = !open;
      filtersToggle.setAttribute('aria-expanded', String(open));
      filtersToggle.classList.toggle('is-open', open);
    });
    document.addEventListener('click', (event) => {
      if (filtersMenu.hidden) return;
      if (event.target.closest('#shelfFiltersMenu') || event.target.closest('#shelfFiltersToggle')) return;
      filtersMenu.hidden = true;
      filtersToggle.setAttribute('aria-expanded', 'false');
      filtersToggle.classList.remove('is-open');
    });
  }

  const searchInput = document.getElementById('shelfSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      SHELF_STATE.query = searchInput.value.trim().toLowerCase();
      renderShelfSectionInternal();
    });
  }

  const quickRows = document.getElementById('shelfQuickRows');
  if (quickRows) {
    quickRows.addEventListener('click', (event) => {
      const card = event.target.closest('.shelf-quick-card');
      if (!card) return;
      const key = card.dataset.key;
      const record = SHELF_RECORDS.find((b) => b.key === key);
      if (record?.detailId && record.preview?.canOpen) {
        PanelManager.open('book', { id: record.detailId });
      }
    });
    quickRows.addEventListener('error', (event) => {
      const img = event.target;
      if (img?.classList?.contains('shelf-quick-cover-img')) img.style.display = 'none';
    }, true);
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

function buildShelfRecords() {
  const records = [];
  // Only the books BooksStore holds: the user's own, or the demo library when signed out.
  const spines = BooksStore.getShelfBooks() || [];
  spines.forEach((b, index) => {
    const detailId = String(b.id || '');
    const detail = getBookDetail(detailId) || createEmptyBook(b);
    const resolvedStatus = normalizeShelfStatus(b.status);
    const key = `${slugify(b.title)}-${index}`;
    const title = toTitleCase(b.title);
    const statusText = statusToLabel(resolvedStatus);
    const rawTags = Array.isArray(detail?.tags) && detail.tags.length
      ? detail.tags
      : (Array.isArray(b.tags) ? b.tags : []);
    const translatedTags = rawTags.length ? rawTags.map(toEnglishTag) : [statusText];
    const preview = {
      title: detail?.titleZh || title,
      subtitle: detail?.titleZh ? detail.title : statusText,
      author: detail
        ? [detail.author, detail.authorZh].filter(Boolean).join(' · ')
        : b.author,
      description: detail?.summary || `${title} is on your shelf. Select to preview notes and metadata.`,
      tags: translatedTags.slice(0, 4),
      stats: [],
      coverSrc: resolveCoverSrc(b, detailId),
      tone: b.spine,
      text: b.text,
      canOpen: Boolean(detailId),
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

function resolveCoverSrc(book, detailId) {
  if (book?.coverImage) return book.coverImage;
  if (book?.cover?.image) return book.cover.image;
  const detail = getBookDetail(detailId);
  if (detail?.cover?.image) return detail.cover.image;
  return '';
}

function getBookDetail(detailId) {
  return detailId ? BooksStore.getById(detailId) || null : null;
}

function renderShelfSectionInternal() {
  const shelfHost = document.getElementById('shelfStack');
  if (!shelfHost) return;

  renderQuickRows();

  const visible = getFilteredBooks();
  renderShelfSummary(visible.length);

  if (!SHELF_RECORDS.length) {
    // Nothing on the shelf at all (a brand-new account): invite the first book.
    shelfHost.innerHTML = `
      <div class="shelf-empty shelf-empty--first">
        <p>Your shelf is empty. Add the first book you are reading or want to read.</p>
        <button class="shelf-empty__add" id="shelfEmptyAdd" type="button">Add a book</button>
        <button class="shelf-empty__add" id="shelfEmptyImport" type="button">Import from Goodreads, Kindle and more</button>
      </div>`;
    shelfHost.querySelector('#shelfEmptyImport')?.addEventListener('click', () => {
      import('../api/import/import-ui.ts').then(({ openImportDialog }) => openImportDialog());
    });
    shelfHost.querySelector('#shelfEmptyAdd')?.addEventListener('click', () => NewEntry?.mount());
    SHELF_STATE.selectedKey = null;
    SHELF_STATE.isExpanded = false;
    applyShelfLayoutState();
    renderShelfPreview(null);
    return;
  }

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
  const narrowing = Boolean(SHELF_STATE.query) || SHELF_STATE.filter !== 'all' || Boolean(SHELF_STATE.tag);
  // A real user's short shelf gets ghost spines that invite the next book (never fake books).
  const ghostCount = !BooksStore.isUsingDemoData() && !narrowing
    ? Math.max(0, MIN_SHELF_SPINES - visible.length)
    : 0;
  const ghosts = Array.from({ length: ghostCount }, (_, i) => ({ _ghost: true, key: `ghost-${i}`, w: 34, h: 0.86 }));
  const rows = layoutShelfRows([...visible, ...ghosts], Math.round(shelfHost.getBoundingClientRect().width) || window.innerWidth);

  rows.forEach((row) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'shelf-row';

    const rowBooks = document.createElement('div');
    rowBooks.className = 'shelf-row-books';

    row.forEach((record) => {
      rowBooks.appendChild(record._ghost ? createGhostSpine(record) : createSpineButton(record));
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
    if (book.status === 'finished') acc.finished += 1;
    else if (book.status === 'reading') acc.reading += 1;
    else if (book.status === 'want') acc.want += 1;
    else if (book.status === 'confirmed-later') acc.later += 1;
    return acc;
  }, { finished: 0, reading: 0, want: 0, later: 0 });

  const base = `
    <span class="count-item"><strong>${totals.finished}</strong> finished</span>
    <span class="count-sep">·</span>
    <span class="count-item"><strong>${totals.reading}</strong> reading</span>
    <span class="count-sep">·</span>
    <span class="count-item"><strong>${totals.want}</strong> to read</span>
    <span class="count-sep">·</span>
    <span class="count-item"><strong>${totals.later}</strong> confirm later</span>
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

function createGhostSpine(record) {
  const { width, height } = getSpineSize(record);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'shelf-spine shelf-spine--ghost';
  btn.style.width = `${width}px`;
  btn.style.height = `${height}px`;
  btn.setAttribute('aria-label', 'Add a book');
  btn.title = 'Add a book';
  btn.innerHTML = '<span class="shelf-spine__plus" aria-hidden="true">+</span>';
  btn.addEventListener('click', () => NewEntry?.mount());
  return btn;
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
    dataAttrs:    { key: record.key, status: record.status, bookId: record.detailId },
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
  const grid = document.querySelector('.shelf-wall-grid');
  if (!grid) return;
  grid.classList.toggle('is-expanded', SHELF_STATE.isExpanded && Boolean(SHELF_STATE.selectedKey));
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
  const previewStats = buildPreviewStats(record);
  stats.innerHTML = previewStats.map((item) => `<span class="preview-stat" data-preview-actions>${escapeHTML(item)}</span>`).join('');
  stats.hidden = previewStats.length === 0;
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

// Same number as the Actions tab on the book page (openActionCount is the single source).
function buildPreviewStats(record) {
  const detail = getBookDetail(record.detailId);
  return record.detailId ? [openActionLabel(openActionCount(record.detailId, detail?.actions))] : [];
}

function openSelectedBook() {
  const selected = SHELF_RECORDS.find((b) => b.key === SHELF_STATE.selectedKey);
  if (!selected?.detailId || !selected.preview.canOpen) return;
  PanelManager.open('book', { id: selected.detailId });
}

function renderTagChips() {
  const group = document.getElementById('shelfTagGroup');
  const host = document.getElementById('shelfTagChips');
  if (!group || !host) return;

  // Collect tags from real user books only, ranked by frequency.
  const counts = new Map();
  SHELF_RECORDS.forEach((b) => {
    (b.preview?.tags || []).forEach((tag) => {
      const clean = String(tag || '').trim();
      if (!clean) return;
      counts.set(clean, (counts.get(clean) || 0) + 1);
    });
  });

  const tags = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag]) => tag);

  if (!tags.length) {
    group.hidden = true;
    host.innerHTML = '';
    SHELF_STATE.tag = null;
    return;
  }

  // Drop an active tag that no longer exists after a data refresh.
  if (SHELF_STATE.tag && !tags.some((t) => t.toLowerCase() === SHELF_STATE.tag.toLowerCase())) {
    SHELF_STATE.tag = null;
  }

  group.hidden = false;
  host.innerHTML = tags.map((tag) => {
    const active = SHELF_STATE.tag && SHELF_STATE.tag.toLowerCase() === tag.toLowerCase();
    return `<button class="chip${active ? ' active' : ''}" data-tag="${escapeHTML(tag)}">${escapeHTML(tag)}</button>`;
  }).join('');
}

function renderQuickRows() {
  const wrap = document.getElementById('shelfQuickRows');
  if (!wrap) return;

  const narrowing = Boolean(SHELF_STATE.query) || SHELF_STATE.filter !== 'all' || Boolean(SHELF_STATE.tag);
  const realBooks = SHELF_RECORDS;

  const reading = realBooks.filter((b) => b.status === 'reading').slice(0, 6);
  const recent = realBooks.slice(0, 6);

  const continueRendered = renderQuickRow('shelfContinueRow', 'shelfContinueTrack', reading);
  const recentRendered = renderQuickRow('shelfRecentRow', 'shelfRecentTrack', recent);

  wrap.hidden = narrowing || (!continueRendered && !recentRendered);
}

function renderQuickRow(rowId, trackId, records) {
  const row = document.getElementById(rowId);
  const track = document.getElementById(trackId);
  if (!row || !track) return false;
  if (!records.length) {
    row.hidden = true;
    track.innerHTML = '';
    return false;
  }
  row.hidden = false;
  track.innerHTML = records.map(buildQuickCard).join('');
  return true;
}

function buildQuickCard(record) {
  const p = record.preview || {};
  const title = escapeHTML(p.title || record.titleDisplay || '');
  const hasCover = Boolean(p.coverSrc);
  const tone = p.tone || record.spine || '#202020';
  const textColor = record.text || '#f4ead6';
  const cjkClass = containsCJK(p.title || record.titleDisplay) ? ' is-cjk' : '';

  const fallback = `<span class="shelf-quick-cover-fallback${cjkClass}" style="background:linear-gradient(150deg, ${escapeHTML(tone)}, #111); color:${escapeHTML(textColor)};">${title}</span>`;
  const coverInner = hasCover
    ? `<img class="shelf-quick-cover-img" src="${escapeHTML(p.coverSrc)}" alt="" loading="lazy">${fallback}`
    : fallback;

  return `
    <button class="shelf-quick-card" type="button" data-key="${escapeHTML(record.key)}" data-book-id="${escapeHTML(record.detailId)}" title="${title}">
      <span class="shelf-quick-cover">${coverInner}</span>
      <span class="shelf-quick-card-title${cjkClass}">${title}</span>
    </button>
  `;
}

function getFilteredBooks() {
  const tag = SHELF_STATE.tag ? SHELF_STATE.tag.toLowerCase() : null;
  const filtered = SHELF_RECORDS.filter((b) => {
    const status = b.status;
    if (SHELF_STATE.filter === 'finished' && status !== 'finished') return false;
    if (SHELF_STATE.filter === 'reading' && status !== 'reading') return false;
    if (SHELF_STATE.filter === 'to read' && status !== 'want') return false;
    if (SHELF_STATE.filter === 'confirm later' && status !== 'confirmed-later') return false;
    if (tag && !(b.preview?.tags || []).some((t) => t.toLowerCase() === tag)) return false;
    if (SHELF_STATE.query && !b.searchText.includes(SHELF_STATE.query)) return false;
    return true;
  });
  return sortShelfRecords(filtered);
}

function sortShelfRecords(records) {
  // 'recent' keeps source order (newest user books are unshifted to the front by
  // BooksStore), so only re-sort for the explicit title/rating modes.
  if (SHELF_STATE.sort === 'title') {
    return [...records].sort((a, b) =>
      String(a.titleDisplay || '').localeCompare(String(b.titleDisplay || '')));
  }
  if (SHELF_STATE.sort === 'rating') {
    const rate = (r) => Number(getBookDetail(r.detailId)?.rating) || 0;
    return [...records].sort((a, b) => rate(b) - rate(a));
  }
  return records;
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
  return readingStatusLabel(status);
}

function normalizeShelfStatus(status) {
  return normalizeReadingStatus(status);
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

function escapeHTML(str) {
  return String(str || '').replace(/[&<>"]/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
  ));
}

export { initSearch, enterSearch };
export function enterPanel_search(params = {}) { enterSearch(params); }
