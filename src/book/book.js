/* ==========================================================================
   Marginalia · Book detail view
   ========================================================================== */

let __currentBookId = null;

function initBook() {}

function enterBook(params = {}) {
  const id = params.id || __currentBookId || 'sapiens';
  const book = window.BOOK_BY_ID && window.BOOK_BY_ID[id];
  if (!book) { console.warn(`[book] No record for id="${id}"`); return; }
  __currentBookId = id;

  const root = document.getElementById('view-book');
  root.innerHTML = renderBook(book);

  // Wire up sidebar tabs
  root.querySelectorAll('.book-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;

      root.querySelectorAll('.book-tab-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');

      root.querySelectorAll('.book-section').forEach(s => {
        s.classList.toggle('is-active', s.id === target);
      });
    });
  });

  // Wire up outline toggle collapse
  const toggleBtn = root.querySelector('.book-outline-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const outline = root.querySelector('.book-outline');
      const shell = root.querySelector('.book-detail-shell');
      outline.classList.toggle('is-collapsed');
      shell.classList.toggle('is-outline-collapsed', outline.classList.contains('is-collapsed'));
    });
  }

  // Wire up annotation toggles
  root.querySelectorAll('.hl-annotation-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const ann = btn.parentElement.querySelector('.hl-annotation');
      if (!ann) return;
      const open = ann.classList.toggle('visible');
      btn.classList.toggle('open', open);
      const icon = btn.querySelector('.tog-icon');
      if (icon) icon.textContent = open ? '×' : '+';
    });
  });

  // Wire up action items
  root.querySelectorAll('.action-item').forEach(item => {
    item.addEventListener('click', () => {
      const done = item.classList.toggle('done');
      const tag = item.querySelector('.action-tag');
      if (tag) tag.textContent = done ? 'Completed' : 'Pending';
    });
  });

  // Wire up knowledge structure inner tabs
  root.querySelectorAll('.mm-top-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const paneId = tab.dataset.mmTab;
      const section = tab.closest('.mindmap-section');
      section.querySelectorAll('.mm-top-tab').forEach(t => t.classList.toggle('is-active', t === tab));
      section.querySelectorAll('.mm-tab-pane').forEach(p => {
        p.classList.toggle('is-active', p.dataset.mmPane === paneId);
      });
    });
  });

  // Wire up revolution inner tabs
  root.querySelectorAll('.mm-rev-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const revId = tab.dataset.mmRevTab;
      const wrap = tab.closest('.mm-tab-pane');
      wrap.querySelectorAll('.mm-rev-tab').forEach(t => t.classList.toggle('is-active', t === tab));
      wrap.querySelectorAll('.mm-rev-card').forEach(c => {
        c.classList.toggle('is-active', c.dataset.mmRevPane === revId);
      });
    });
  });

  // Wire up connection items
  root.querySelectorAll('.connection-item[data-book-id]').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.bookId;
      if (id && window.BOOK_BY_ID?.[id]) App.show('book', { id });
    });
  });
}

/* ── Render ──────────────────────────────────────────────────────────────── */

function renderBook(b) {
  const sections = getBookSections(b);
  const first = sections[0];

  return `
    <div class="page">
      ${renderMasthead(b)}
      <section class="book-detail-shell">
        <aside class="book-outline">
          <button class="book-outline-toggle" type="button">Sections</button>
          <nav class="book-outline-nav">
            ${sections.map((s, i) => `
              <button class="book-tab-btn${i === 0 ? ' is-active' : ''}" data-target="${esc(s.id)}" type="button">
                ${esc(s.label)}
              </button>
            `).join('')}
          </nav>
        </aside>
        <div class="book-detail-main">
          ${sections.map((s, i) => `
            <div class="book-section${i === 0 ? ' is-active' : ''}" id="${esc(s.id)}">
              ${s.html}
            </div>
          `).join('')}
        </div>
      </section>
      ${renderFooter(b)}
    </div>
  `;
}

function getBookSections(b) {
  const sections = [
    { id: 'overview',   label: 'Overview',               html: renderOverview(b) },
    { id: 'conclusion', label: 'My Conclusion',           html: renderIntegration(b) },
  ];
  if (b.highlights?.length)
    sections.push({ id: 'highlights', label: 'Key Notes & Highlights', html: renderHighlights(b) });
  if (b.cultural?.length)
    sections.push({ id: 'cultural',   label: 'Cultural Annotations',   html: renderCultural(b) });
  if (b.mindmap)
    sections.push({ id: 'knowledge',  label: 'Knowledge Structure',     html: renderMindmap(b) });
  if (b.connections?.length)
    sections.push({ id: 'related',    label: 'Related Books',           html: renderConnections(b) });
  if (b.actions?.length)
    sections.push({ id: 'actions',    label: 'Action List',             html: renderActions(b) });
  if (b.context)
    sections.push({ id: 'context',    label: 'Reading Context',         html: renderContext(b) });
  return sections;
}

/* ── Section renderers ───────────────────────────────────────────────────── */

function renderMasthead(b) {
  if (typeof window.renderPrimaryHeader === 'function') {
    return window.renderPrimaryHeader('home', { showNewEntry: true, actionLabel: '＋ New note' });
  }
  return `
    <header class="book-masthead">
      <a href="#" class="wordmark" data-view="home">Marginalia
        <span class="wordmark-sub">Margins are where thinking happens</span>
      </a>
      <nav class="book-breadcrumb">
        <a data-view="home">Shelf</a>
        <span class="sep">›</span>
        <span class="current">${esc(b.titleZh || b.title)}</span>
      </nav>
    </header>
  `;
}

function renderOverview(b) {
  const cv = b.cover || {};
  const cvStyle = `--cv-bg:${cv.bg || '#14263e'}; --cv-text:${cv.text || '#e8dfc8'}`;
  const hasCoverImage = Boolean(cv.image);
  const ratingNum = b.rating ?? '—';
  const stars = Array.from({ length: 5 }, (_, i) =>
    `<div class="star${i < (b.rating || 0) ? '' : ' empty'}"></div>`
  ).join('');

  const metaRows = [
    b.meta?.startedAt && b.meta?.finishedAt && {
      k: 'Reading window',
      v: `${formatDate(b.meta.startedAt)} – ${formatDate(b.meta.finishedAt)}`
    },
    b.context?.place && { k: 'Reading location', v: `<em>${truncate(b.context.place, 30)}</em>` },
    b.meta?.edition   && { k: 'Edition',      v: esc(b.meta.edition) },
    b.meta?.pages     && { k: 'Total pages',   v: `${b.meta.pages} 页` },
    b.meta?.readingHours && b.meta?.startedAt && b.meta?.finishedAt && {
      k: 'Reading time',
      v: `${daysBetween(b.meta.startedAt, b.meta.finishedAt)} 天 · 约 ${b.meta.readingHours} 小时`
    },
    b.tags?.length && { k: 'Tags', v: b.tags.join(' · ') }
  ].filter(Boolean);

  return `
    <section class="book-overview">
      <div class="book-overview-hero">
        <div class="book-cover${hasCoverImage ? ' has-image' : ''}" style="${cvStyle}" role="img" aria-label="${esc(b.titleZh || b.title)} cover">
          ${hasCoverImage
            ? `<img class="book-cover-image" src="${esc(cv.image)}" alt="${esc(b.titleZh || b.title)} cover">`
            : `
              <div><div class="cover-label">${esc(b.author)}</div></div>
              <div>
                <div class="cover-title-text">
                  ${esc(stripSubtitle(b.title))}
                  ${b.title.includes(':') ? `<em>${esc(b.title.split(':')[1].trim())}</em>` : ''}
                </div>
                <div class="cover-deco">${coverArt(cv.art)}</div>
              </div>
              <div class="cover-footer-text">${esc(b.meta?.publisher || '')} · ${b.year || ''}</div>
            `
          }
        </div>
        <div class="book-overview-main">
          <div class="book-title-big">${formatTitle(b.titleZh || b.title)}</div>
          <div class="book-author">${esc((b.authorZh ? b.authorZh + ' · ' : '') + b.author)}</div>
          <p class="book-overview-summary">${esc(b.summary || '')}</p>
          <div class="meta-rows">
            ${metaRows.map(r => `
              <div class="meta-row">
                <span class="meta-k">${r.k}</span>
                <span class="meta-v">${r.v}</span>
              </div>`).join('')}
          </div>
        </div>
        <div class="rating-block">
          <div class="rating-label">Overall rating</div>
          <div class="rating-num">${ratingNum}<sup>/5</sup></div>
          <div class="rating-stars">${stars}</div>
          <div class="rating-note">${esc((b.insight?.oneLiner || b.summary || '').slice(0, 40))}</div>
        </div>
      </div>
    </section>
  `;
}

function renderIntegration(b) {
  const insight = b.insight || {};
  const stanceCards = [
    { label: 'I agree',          items: insight.agree   || [] },
    { label: 'I doubt',          items: insight.doubt   || [] },
    { label: 'I want to pursue', items: insight.pursue  || [] },
  ].filter(c => c.items.length);

  return `
    <section class="takeaways-section">
      <div class="takeaways-main">
        <div class="section-label">§ 02 — Integration</div>
        <h2>My Conclusion</h2>
        <div class="takeaway-body">
          ${insight.oneLiner         ? `<p><em>${esc(insight.oneLiner)}</em></p>` : ''}
          ${insight.answeredQuestion ? `<p><strong>本书回答的问题：</strong>${esc(insight.answeredQuestion)}</p>` : ''}
          ${insight.integration      ? `<p>${esc(insight.integration)}</p>` : ''}
        </div>
        ${stanceCards.length ? `
          <div class="stance-grid">
            ${stanceCards.map(card => `
              <article class="stance-card">
                <div class="stance-label">${esc(card.label)}</div>
                <ul>${card.items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>
              </article>
            `).join('')}
          </div>` : ''}
      </div>
      <div class="takeaways-aside">
        <div class="aside-card">
          <div class="aside-card-label">Core Question</div>
          <div class="aside-card-body">${esc(insight.coreQuestion || b.highlights?.[0]?.quote || '')}</div>
        </div>
      </div>
    </section>
  `;
}

function renderHighlights(b) {
  return `
    <section class="highlights-section">
      <div class="section-head">
        <h2>Key Notes &amp; Highlights</h2>
        <span class="sh-meta">${b.highlights.length} excerpts</span>
      </div>
      <ul class="highlight-list">
        ${b.highlights.map((h, i) => `
          <li class="hl-item">
            <div class="hl-index">${String(i + 1).padStart(2, '0')}</div>
            <div class="hl-body">
              <p class="hl-quote">${esc(h.quote)}</p>
              <span class="hl-location">${h.page ? `p. ${h.page} · ` : ''}${esc(h.chapter || '')}</span>
              ${h.kind ? `<span class="hl-kind">${esc(normalizeHighlightKind(h.kind))}</span>` : ''}
              ${h.annotation ? `
                <br>
                <button class="hl-annotation-toggle" type="button">
                  <span class="tog-icon">+</span> Cultural note
                </button>
                <div class="hl-annotation">
                  <div class="hl-annotation-tag">Note</div>
                  <p>${esc(h.annotation)}</p>
                </div>` : ''}
            </div>
          </li>`).join('')}
      </ul>
    </section>
  `;
}

function renderCultural(b) {
  return `
    <section class="cultural-bg">
      <div class="section-label">§ 04 — Cultural Context</div>
      <h2 class="section-title">Cultural Annotations</h2>
      <div class="cultural-grid">
        ${b.cultural.map(c => `
          <div class="cultural-item">
            <div class="ci-tag">${esc(c.tag)}</div>
            <div class="ci-term">${esc(c.term)}</div>
            <div class="ci-body">${esc(c.body)}</div>
            ${c.ref ? `<span class="ci-ref">— ${esc(c.ref)}</span>` : ''}
          </div>`).join('')}
      </div>
    </section>
  `;
}

function renderMindmap(b) {
  const mm = b.mindmap || {};
  const timeline     = mm.timeline     || [];
  const revolutions  = mm.revolutions  || [];
  const ideas        = mm.ideas        || [];
  const happinessViews = mm.happiness?.views || [];
  const futurePaths  = mm.futurePaths  || [];

  const tabs = [
    timeline.length    ? { id: 'timeline',    label: '时间线' }   : null,
    revolutions.length ? { id: 'revolutions', label: '四大革命' } : null,
    ideas.length       ? { id: 'ideas',        label: '核心论点' } : null,
    (mm.happiness?.question || happinessViews.length) ? { id: 'happiness', label: '幸福之问' } : null,
    futurePaths.length ? { id: 'future',       label: '未来路径' } : null,
  ].filter(Boolean);

  const firstTabId = tabs[0]?.id || 'timeline';

  return `
    <section class="mindmap-section">
      <div class="section-label">§ 05 — Visual Knowledge View</div>
      <h2 class="mindmap-title">${esc(mm.title || 'Knowledge Structure')}</h2>
      <div class="mindmap-sub">${esc(mm.subtitle || `${b.titleZh || b.title} · concepts / timeline / arguments`)}</div>

      <div class="mm-top-tabs">
        ${tabs.map(t => `
          <button class="mm-top-tab${t.id === firstTabId ? ' is-active' : ''}" type="button" data-mm-tab="${esc(t.id)}">${esc(t.label)}</button>
        `).join('')}
      </div>

      <div class="mm-tab-shell">
        <div class="mm-tab-pane${firstTabId === 'timeline' ? ' is-active' : ''}" data-mm-pane="timeline">
          ${timeline.map(group => `
            <article class="mm-timeline-group">
              <div class="mm-timeline-era">${esc(group.era || '')}</div>
              <div class="mm-timeline-list">
                ${(group.items || []).map(item => `
                  <div class="mm-timeline-item">
                    <div class="mm-timeline-year">${esc(item.year || '')}</div>
                    <div class="mm-timeline-body">
                      <div class="mm-timeline-title">${esc(item.title || '')}</div>
                      ${(item.tags || []).length ? `
                        <div class="mm-pill-row">
                          ${item.tags.map(tag => `<span class="mm-pill">${esc(tag)}</span>`).join('')}
                        </div>` : ''}
                    </div>
                  </div>`).join('')}
              </div>
            </article>`).join('')}
        </div>

        <div class="mm-tab-pane${firstTabId === 'revolutions' ? ' is-active' : ''}" data-mm-pane="revolutions">
          <div class="mm-rev-tabs">
            ${revolutions.map((r, i) => `
              <button class="mm-rev-tab${i === 0 ? ' is-active' : ''}" type="button" data-mm-rev-tab="${esc(r.id || `r${i}`)}">
                <small>${esc(r.period || '')}</small>${esc(r.title || '')}
              </button>`).join('')}
          </div>
          <div class="mm-rev-panels">
            ${revolutions.map((r, i) => `
              <article class="mm-rev-card${i === 0 ? ' is-active' : ''}" data-mm-rev-pane="${esc(r.id || `r${i}`)}">
                <div class="mm-rev-head">
                  <div class="mm-rev-tag">${esc(r.period || '')}</div>
                  <h3>${esc(r.title || '')}</h3>
                  <p>${esc(r.thesis || '')}</p>
                </div>
                <div class="mm-rev-branches">
                  ${(r.branches || []).map(br => `
                    <div class="mm-branch">
                      <div class="mm-branch-label">${esc(br.label || '')}</div>
                      <div class="mm-pill-row">
                        ${(br.items || []).map(it => `<span class="mm-pill">${esc(it)}</span>`).join('')}
                      </div>
                    </div>`).join('')}
                </div>
                <ul class="mm-points">
                  ${(r.points || []).map(p => `<li>${esc(p)}</li>`).join('')}
                </ul>
                <div class="mm-chapters">
                  ${(r.chapters || []).map(ch => `<span class="mm-chapter">${esc(ch)}</span>`).join('')}
                </div>
              </article>`).join('')}
          </div>
        </div>

        <div class="mm-tab-pane${firstTabId === 'ideas' ? ' is-active' : ''}" data-mm-pane="ideas">
          <article class="mm-panel">
            <div class="mm-panel-label">Core Ideas</div>
            <h3>Core Ideas</h3>
            <div class="mm-ideas">
              ${ideas.map(it => `
                <div class="mm-idea">
                  <h4>${esc(it.title || '')}</h4>
                  <p>${esc(it.body || '')}</p>
                </div>`).join('')}
            </div>
          </article>
        </div>

        <div class="mm-tab-pane${firstTabId === 'happiness' ? ' is-active' : ''}" data-mm-pane="happiness">
          <article class="mm-panel">
            <div class="mm-panel-label">Happiness Question</div>
            <h3>Happiness Question</h3>
            <p class="mm-question">${esc(mm.happiness?.question || '')}</p>
            <div class="mm-view-grid">
              ${happinessViews.map(v => `
                <div class="mm-view">
                  <h4>${esc(v.title || '')}</h4>
                  <p>${esc(v.body || '')}</p>
                </div>`).join('')}
            </div>
            ${mm.happiness?.verdict ? `<p class="mm-verdict">${esc(mm.happiness.verdict)}</p>` : ''}
          </article>
        </div>

        <div class="mm-tab-pane${firstTabId === 'future' ? ' is-active' : ''}" data-mm-pane="future">
          <article class="mm-panel">
            <div class="mm-panel-label">Future Paths</div>
            <h3>Three Paths Beyond Current Humanity</h3>
            <div class="mm-path-grid">
              ${futurePaths.map(p => `
                <div class="mm-path">
                  <h4>${esc(p.title || '')}</h4>
                  ${p.badge ? `<div class="mm-path-badge">${esc(p.badge)}</div>` : ''}
                  <ul>${(p.details || []).map(d => `<li>${esc(d)}</li>`).join('')}</ul>
                </div>`).join('')}
            </div>
          </article>
        </div>
      </div>
    </section>
  `;
}

function renderConnections(b) {
  return `
    <section class="connections-section">
      <div class="section-label">§ 06 — Cross-book Connections</div>
      <h2>Related Books</h2>
      <ul class="connection-list">
        ${(b.connections || []).map(item => {
          const canOpen = Boolean(item.id && window.BOOK_BY_ID?.[item.id]);
          return `
            <li class="connection-item${canOpen ? ' is-openable' : ''}"${canOpen ? ` data-book-id="${esc(item.id)}"` : ''}>
              <div class="connection-main">
                <div class="connection-title">${esc(item.title || '')}</div>
                <div class="connection-author">${esc(item.author || '')}</div>
                <p class="connection-relation">${esc(item.relation || '')}</p>
              </div>
              <div class="connection-meta">
                ${item.type ? `<span class="connection-type">${esc(item.type)}</span>` : ''}
                <span class="connection-open${canOpen ? '' : ' is-disabled'}">${canOpen ? 'Open' : 'Not in shelf'}</span>
              </div>
            </li>`;
        }).join('')}
      </ul>
    </section>
  `;
}

function renderActions(b) {
  return `
    <section class="actions-section">
      <div class="section-label">§ 07 — Actions</div>
      <h2>Action List</h2>
      <ul class="action-list">
        ${b.actions.map(a => `
          <li class="action-item${a.status === 'done' ? ' done' : ''}" data-id="${esc(a.id)}">
            <div class="action-check"></div>
            <div class="action-text">${esc(a.text)}</div>
            <span class="action-tag">${esc(normalizeActionTag(a.tag) || statusLabel(a.status))}</span>
          </li>`).join('')}
      </ul>
    </section>
  `;
}

function renderContext(b) {
  const c = b.context;
  const block = (label, body, tags) => `
    <div class="ctx-block">
      <div class="ctx-label">${label}</div>
      <div class="ctx-content">${body ? esc(body).replace(/\n/g, '<br>') : ''}</div>
      ${tags?.length ? `<div class="ctx-tags">${tags.map(t => `<span class="ctx-tag">${esc(t)}</span>`).join('')}</div>` : ''}
    </div>`;
  return `
    <section class="context-section">
      ${block('§ 08 · Reading Location', c.place)}
      ${block('§ 08 · Mindset', c.mood, c.moodTags)}
      ${block('§ 08 · Life Context', c.life, c.lifeTags)}
    </section>
  `;
}

function renderFooter(b) {
  const total = (window.BOOK_DETAILS || []).length;
  return `
    <footer class="book-foot">
      <span>Marginalia · ${esc(b.titleZh || b.title)}</span>
      <span>Last edited ${formatDate(b.meta?.finishedAt) || '—'} · Book #${total}</span>
    </footer>
  `;
}

/* ── Utilities ───────────────────────────────────────────────────────────── */

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"]/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

function daysBetween(a, b) {
  return Math.max(1, Math.round((new Date(b) - new Date(a)) / 86400000));
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function stripSubtitle(t) {
  return t.includes(':') ? t.split(':')[0].trim() : t;
}

function formatTitle(t) {
  if (!t) return '';
  if (t.length <= 2) return esc(t);
  if (/[一-龥]/.test(t)) {
    const split = Math.floor(t.length / 2);
    return `${esc(t.slice(0, split))}<em>${esc(t.slice(split))}</em>`;
  }
  return esc(t);
}

function statusLabel(s) {
  return { done: 'Completed', doing: 'In progress', todo: 'Pending' }[s] || s;
}

function normalizeActionTag(tag) {
  if (!tag) return '';
  return { '已完成': 'Completed', '待执行': 'Pending', '进行中': 'In progress' }[tag] || tag;
}

function normalizeHighlightKind(kind) {
  return { concept: 'Concept', argument: 'Argument', critique: 'Critique', action: 'Action trigger' }[kind] || kind;
}

function coverArt(id) {
  if (id === 'sapiens') {
    return `
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
        <circle cx="36" cy="36" r="34" stroke="rgba(232,223,200,0.18)" stroke-width="1"/>
        <circle cx="36" cy="36" r="22" stroke="rgba(232,223,200,0.12)" stroke-width="1"/>
        <line x1="36" y1="2" x2="36" y2="70" stroke="rgba(232,223,200,0.2)" stroke-width="0.5"/>
        <line x1="2" y1="36" x2="70" y2="36" stroke="rgba(232,223,200,0.2)" stroke-width="0.5"/>
        <circle cx="36" cy="19" r="4" fill="rgba(232,223,200,0.55)"/>
        <path d="M36 24 L36 44 M28 30 L36 34 L44 30 M36 44 L30 56 M36 44 L42 56"
          stroke="rgba(232,223,200,0.55)" stroke-width="1.5" stroke-linecap="round"/>
      </svg>`;
  }
  return '';
}
