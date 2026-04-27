/* Home view — shelf only */

const HOME_STATE = {
  filter: 'all',
  query: '',
  selectedKey: null,
  isExpanded: false,
  contextExpanded: true,
};

let HOME_BOOKS = [];
let HOME_RESIZE_TIMER = null;
let HOME_BOUND = false;

function initHome() {
  HOME_BOOKS = buildShelfRecords();
  HOME_STATE.selectedKey = null;
  HOME_STATE.isExpanded = false;
  HOME_STATE.query = '';
  HOME_STATE.contextExpanded = true;

  bindHomeEvents();
  renderShelfSection();
  animateIn();
}

function enterHome() {
  renderShelfSection();
}

function animateIn() {
  const page = document.querySelector('#view-home .page');
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

function bindHomeEvents() {
  if (HOME_BOUND) return;
  HOME_BOUND = true;

  document.querySelectorAll('.shelf-filters .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.shelf-filters .chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      HOME_STATE.filter = chip.textContent.toLowerCase().trim();
      renderShelfSection();
    });
  });

  const searchInput = document.getElementById('shelfSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      HOME_STATE.query = searchInput.value.trim().toLowerCase();
      renderShelfSection();
    });
  }

  const coverFrame = document.getElementById('shelfPreviewCoverFrame');
  const closeBtn = document.getElementById('shelfPreviewCloseBtn');
  const deepPanel = document.getElementById('shelfDeepPanel');
  if (coverFrame) coverFrame.addEventListener('click', openSelectedBook);
  if (deepPanel) {
    deepPanel.addEventListener('click', (event) => {
      const toggleBtn = event.target.closest('[data-toggle-context]');
      if (toggleBtn) {
        HOME_STATE.contextExpanded = !HOME_STATE.contextExpanded;
        renderShelfSection();
        return;
      }

      const actionBtn = event.target.closest('[data-open-book-id]');
      if (!actionBtn) return;
      const id = actionBtn.dataset.openBookId;
      if (!id || !window.BOOK_BY_ID?.[id]) return;
      App.show('book', { id });
    });
  }
  const actionPanel = document.getElementById('shelfActionPanel');
  if (actionPanel) {
    actionPanel.addEventListener('click', (event) => {
      const openBtn = event.target.closest('[data-open-book-id]');
      if (openBtn) {
        const id = openBtn.dataset.openBookId;
        if (id && window.BOOK_BY_ID?.[id]) App.show('book', { id });
        return;
      }

      const statusBtn = event.target.closest('[data-set-status]');
      if (!statusBtn) return;

      const key = statusBtn.dataset.key;
      const nextStatus = statusBtn.dataset.setStatus;
      if (!key || !nextStatus) return;
      applyRecordStatus(key, nextStatus);
      renderShelfSection();
    });
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      HOME_STATE.selectedKey = null;
      HOME_STATE.isExpanded = false;
      renderShelfSection();
    });
  }

  window.addEventListener('resize', () => {
    clearTimeout(HOME_RESIZE_TIMER);
    HOME_RESIZE_TIMER = setTimeout(() => {
      renderShelfSection();
    }, 120);
  });
}

function buildShelfRecords() {
  const records = [];
  (window.SHELF_BOOKS || []).forEach((b, index) => {
    let detailId = b.id || matchBookId(b.title);
    if (!detailId || !window.BOOK_BY_ID?.[detailId]) {
      detailId = ensureShelfDetailRecord(b, index);
    }
    const key = `${slugify(b.title)}-${index}`;
    const title = toTitleCase(b.title);
    const detail = detailId ? window.BOOK_BY_ID?.[detailId] : null;
    const statusText = statusToLabel(b.status);
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
  while (window.BOOK_BY_ID?.[detailId] && window.BOOK_BY_ID[detailId].title !== shelfBook.title) {
    detailId = `${baseId}-${dedupe++}`;
  }
  if (window.BOOK_BY_ID?.[detailId]) return detailId;

  const template = window.BOOK_BY_ID?.sapiens || window.BOOK_DETAILS?.[0];
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

  window.BOOK_DETAILS.push(detail);
  window.BOOK_BY_ID[detail.id] = detail;
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
  const detail = detailId ? window.BOOK_BY_ID?.[detailId] : null;
  if (detail?.cover?.image) return detail.cover.image;
  return '';
}

function renderShelfSection() {
  const shelfHost = document.getElementById('shelfStack');
  if (!shelfHost) return;

  const visible = getFilteredBooks();
  renderShelfSummary(visible.length);

  if (!visible.length) {
    const emptyText = HOME_STATE.query
      ? 'No books matched this search.'
      : 'No books in this filter.';
    shelfHost.innerHTML = `<div class="shelf-empty">${emptyText}</div>`;
    HOME_STATE.selectedKey = null;
    HOME_STATE.isExpanded = false;
    applyShelfLayoutState();
    renderShelfPreview(null);
    renderShelfDeepPanel(null);
    renderShelfActionPanel(null);
    return;
  }

  if (HOME_STATE.selectedKey && !visible.some((b) => b.key === HOME_STATE.selectedKey)) {
    HOME_STATE.selectedKey = null;
    HOME_STATE.isExpanded = false;
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

  const selected = HOME_STATE.selectedKey
    ? visible.find((b) => b.key === HOME_STATE.selectedKey)
    : null;
  renderShelfPreview(selected || null);
  renderShelfDeepPanel(selected || null);
  renderShelfActionPanel(selected || null);
}

function renderShelfSummary(visibleCount) {
  const countEl = document.getElementById('shelfCount');
  if (!countEl) return;

  const totals = HOME_BOOKS.reduce((acc, book) => {
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
  if (HOME_STATE.query) {
    countEl.innerHTML = `
      <span class="count-wrap">${base}</span>
      <span class="count-item count-match"><strong>${visibleCount}</strong> matched</span>
    `;
    return;
  }
  countEl.innerHTML = `<span class="count-wrap">${base}</span>`;
}

function createSpineButton(record) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'shelf-spine';
  btn.dataset.key = record.key;
  btn.dataset.status = record.status;
  if (record.key === HOME_STATE.selectedKey) btn.classList.add('active');

  const { width, height } = getSpineSize(record);
  btn.style.width = width + 'px';
  btn.style.height = height + 'px';
  btn.style.background = record.spine || '#2b2b2b';
  btn.style.color = record.text || '#e8dfc8';

  const title = document.createElement('span');
  title.className = 'shelf-spine-title';
  title.textContent = record.titleDisplay;
  btn.appendChild(title);

  const author = document.createElement('span');
  author.className = 'shelf-spine-author';
  author.textContent = record.author || '';
  btn.appendChild(author);

  btn.addEventListener('click', () => {
    const sourceSnapshot = captureSpineSnapshot(btn);
    const wasExpanded = HOME_STATE.isExpanded;
    HOME_STATE.isExpanded = true;
    HOME_STATE.selectedKey = record.key;
    renderShelfSection();

    const runAnimation = () => {
      const previewFrame = document.getElementById('shelfPreviewCoverFrame');
      if (previewFrame) animateSpinePullout(sourceSnapshot, previewFrame, !wasExpanded);
    };
    requestAnimationFrame(() => requestAnimationFrame(runAnimation));
  });

  return btn;
}

function applyShelfLayoutState() {
  const layout = document.querySelector('.shelf-layout');
  if (!layout) return;
  layout.classList.toggle('is-expanded', HOME_STATE.isExpanded && Boolean(HOME_STATE.selectedKey));
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
  coverFrame.classList.toggle('is-openable', p.canOpen);
}

function renderShelfDeepPanel(record) {
  const panel = document.getElementById('shelfDeepPanel');
  if (!panel) return;

  const detail = record?.detailId ? window.BOOK_BY_ID?.[record.detailId] : null;
  const context = getBookContextSections(detail);
  const contextMeta = getBookContextMeta(detail);
  if (!detail || !context.length) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }

  panel.hidden = false;
  const isExpanded = HOME_STATE.contextExpanded;
  panel.innerHTML = `
    <div class="shelf-deep-head">
      <div>
        <h3>Cultural Background</h3>
      </div>
      <button type="button" class="shelf-context-toggle" data-toggle-context aria-label="${isExpanded ? 'Collapse background' : 'Expand background'}">
        ${isExpanded ? '▾' : '▸'}
      </button>
    </div>
    <article class="shelf-context-card ${isExpanded ? '' : 'is-collapsed'}">
      <div class="shelf-context-top">
        <h4 class="shelf-context-title">${escapeHTML(contextMeta.title)}</h4>
        <div class="shelf-context-tags">
          ${contextMeta.tags.map((tag) => `
            <span class="shelf-context-tag">${escapeHTML(tag)}</span>
          `).join('')}
        </div>
      </div>
      <div class="shelf-context-grid">
        ${context.map((item) => `
          <article class="shelf-context-section">
            <div class="shelf-context-bar"></div>
            <div class="shelf-context-k">${escapeHTML(item.k)}</div>
            <div class="shelf-context-h">${escapeHTML(item.h)}</div>
            <p class="shelf-context-p">${item.isHtml ? item.p : escapeHTML(item.p)}</p>
          </article>
        `).join('')}
      </div>
    </article>
  `;
}

function renderShelfActionPanel(record) {
  const panel = document.getElementById('shelfActionPanel');
  if (!panel) return;

  const detail = record?.detailId ? window.BOOK_BY_ID?.[record.detailId] : null;
  const actions = (detail?.actions || []).slice(0, 3);
  if (!record) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }

  panel.hidden = false;
  panel.innerHTML = `
    <div class="shelf-action-head">
      <div>
        <h3>To Do Next</h3>
      </div>
    </div>
    <div class="shelf-action-body">
      <div class="shelf-action-status">
        <button type="button" class="shelf-status-btn ${record.status === 'want' ? 'is-active' : ''}" data-key="${record.key}" data-set-status="want">Mark as to read</button>
        <button type="button" class="shelf-status-btn ${record.status === 'reading' ? 'is-active' : ''}" data-key="${record.key}" data-set-status="reading">Mark as reading</button>
        <button type="button" class="shelf-status-btn ${record.status === 'finished' ? 'is-active' : ''}" data-key="${record.key}" data-set-status="finished">Mark as finished</button>
      </div>
      <div class="shelf-action-ops">
        <button type="button" class="shelf-op-btn" data-open-book-id="${detail?.id || ''}">Create Notes</button>
        <button type="button" class="shelf-op-btn is-ghost" data-open-book-id="${detail?.id || ''}">Open Detail</button>
      </div>
      ${actions.length ? `
        <div class="shelf-action-list">
          ${actions.map((item) => `
            <div class="shelf-action-item">
              <span class="shelf-action-badge is-${escapeHTML(item.status || 'todo')}">${escapeHTML(actionStatusLabel(item.status))}</span>
              <span class="shelf-action-text">${escapeHTML(truncateText(item.text || '', 86))}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function getBookContextMeta(detail) {
  if (!detail) return { title: '', tags: [] };
  if (detail.id === 'sapiens') {
    return {
      title: '尤瓦尔·赫拉利与《人类简史》的诞生语境',
      tags: ['以色列学者', '希伯来大学', '2011 年出版', '进化生物学 × 历史学', '全球化语境', '跨学科叙事'],
    };
  }
  const title = `${detail.authorZh || detail.author || '作者'} 与《${detail.titleZh || detail.title || '本书'}》的背景`;
  const yearTag = detail.year ? `${detail.year} 年出版` : '出版语境';
  return {
    title,
    tags: [yearTag, statusToLabel(detail.status === 'wishlist' ? 'want' : detail.status), 'Book Context'],
  };
}

function getBookContextSections(detail) {
  if (!detail) return [];
  if (detail.id === 'sapiens') {
    return [
      {
        k: '作者学术背景',
        h: '从军事史到宏观历史学',
        isHtml: true,
        p: '赫拉利的博士论文研究中世纪欧洲军事史，师从牛津大学史蒂文·甘布尔教授，属于相当专门化的历史学训练。这种背景反而给他提供了一个超越学科边界的自由度——他不属于任何大历史学派，因此不受学术门派的叙事义务约束。《人类简史》最初以希伯来语写就（<em class="ctx-keyword">Qitzur Toldot Ha-Enoshut</em>），作为希伯来大学的公开课讲义，教学对象是非历史专业的本科生。这一「非专业受众」的写作起点，塑造了全书拒绝技术性细节、追求震撼性论断的叙事风格。'
      },
      {
        k: '以色列视角',
        h: '边缘位置的认识论优势',
        isHtml: true,
        p: '以色列的知识分子处境独特：身处中东却深嵌西方学术体系，拥有欧洲犹太流散史的创伤记忆，同时置身于民族国家神话的现实实验室。赫拉利对<em class="ctx-keyword">「集体虚构」</em>的敏感——国家、货币、法律都是人类合谋相信的故事——与以色列作为一个靠信仰建构身份认同的国家的现实深度共鸣。此外，他公开出柜的同性恋身份和对冥想的实践，也使他对主流叙事保持一种结构性的质疑姿态。'
      },
      {
        k: '出版语境 · 2011',
        h: '全球化加速与宏大叙事的复苏',
        isHtml: true,
        p: '2011 年是《阿拉伯之春》、占领华尔街运动、日本福岛核灾难同时发生的年份——全球化的脆弱性以戏剧化方式暴露。与此同时，社交媒体首次成为主流信息基础设施，人类的集体注意力碎片化加剧。恰在此刻，一本声称能从七万年高空俯瞰人类全史的书，提供了某种秩序感和意义框架，击中了集体焦虑。英译本 2014 年由 Harper Collins 出版后，马克·扎克伯格将其列入年度读书清单，一举引爆全球销量。'
      },
      {
        k: '知识谱系',
        h: '进化生物学 × 历史学 × 哲学',
        isHtml: true,
        p: '《人类简史》是一次有意识的跨学科合并：吸收道金斯（<em class="ctx-keyword">利己基因</em>）的进化生物学，借用邓巴（<em class="ctx-keyword">社交大脑假说</em>）的认知人类学，援引萨林斯（<em class="ctx-keyword">石器时代经济学</em>）的原始主义批判，并以维特根斯坦式的语言游戏概念重新包装宗教与制度。这种「策展式」知识整合，既是书的力量所在——综合性视野罕有，也是其受到专业历史学家批评之处——每个领域的论证都嫌粗疏。'
      }
    ];
  }

  return (detail.cultural || []).slice(0, 4).map((item) => ({
    k: item.tag || '背景维度',
    h: item.term || 'Context',
    p: item.body || ''
  }));
}

function buildPreviewStats(detail) {
  void detail;
  return [];
}

function applyRecordStatus(key, nextStatus) {
  const record = HOME_BOOKS.find((b) => b.key === key);
  if (!record) return;
  const previousStatusLabel = statusToLabel(record.status);
  record.status = nextStatus;

  const detail = record.detailId ? window.BOOK_BY_ID?.[record.detailId] : null;
  if (detail) detail.status = nextStatus === 'want' ? 'wishlist' : nextStatus;

  if (record.preview.subtitle === previousStatusLabel) {
    record.preview.subtitle = statusToLabel(nextStatus);
  }
}

function actionStatusLabel(status) {
  if (status === 'doing') return 'In progress';
  if (status === 'done') return 'Done';
  return 'To do';
}

function openSelectedBook() {
  const selected = HOME_BOOKS.find((b) => b.key === HOME_STATE.selectedKey);
  if (!selected?.detailId || !selected.preview.canOpen) return;
  App.show('book', { id: selected.detailId });
}

function getFilteredBooks() {
  return HOME_BOOKS.filter((b) => {
    const status = b.status;
    if (HOME_STATE.filter === 'finished' && status !== 'finished') return false;
    if (HOME_STATE.filter === 'reading' && status !== 'reading') return false;
    if (HOME_STATE.filter === 'to read' && status !== 'want') return false;
    if (HOME_STATE.query && !b.searchText.includes(HOME_STATE.query)) return false;
    return true;
  });
}

function getSpineSize(record) {
  const isNarrowExpanded = HOME_STATE.isExpanded && window.matchMedia('(max-width: 1220px)').matches;
  const widthScale = HOME_STATE.isExpanded
    ? (isNarrowExpanded ? 0.86 : 0.8)
    : 0.9;
  const baseHeight = HOME_STATE.isExpanded
    ? (isNarrowExpanded ? 194 : 184)
    : 205;
  const width = Math.max(24, Math.round((record.w || 34) * widthScale));
  const height = Math.max(88, Math.round(baseHeight * (record.h || 0.85)));
  return { width, height };
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

function truncateText(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

function escapeHTML(str) {
  return String(str || '').replace(/[&<>"]/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
  ));
}
