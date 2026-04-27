/* ==========================================================================
   Marginalia · Knowledge Graph view
   --------------------------------------------------------------------------
   D3.js force-directed graph:
     concept nodes = unique tags from MAP_BOOKS + BOOK_DETAILS (sized by count)
     book nodes    = individual books linked to their tags
   ========================================================================== */

let __webBooted   = false;
let __webFilter   = null;
let __webZoom     = null;
let __webSvg      = null;
let __webRootGroup = null;
let __webSim      = null;
let __webCNodes   = null;
let __webBNodes   = null;
let __webLinks    = null;
let __webFilterPanelOpen = false;

/* ── Lifecycle ─────────────────────────────────────────────────────────── */

function initWeb() {
  const container = document.getElementById('view-web');
  container.innerHTML = webShellHTML();
  bindWebShellEvents();
}

function enterWeb() {
  showWebHint();
  if (!__webBooted) {
    loadD3ThenBoot();
  }
}

/* ── Shell HTML ──────────────────────────────────────────────────────────── */

function webShellHTML() {
  const total = (typeof MAP_BOOKS !== 'undefined' ? MAP_BOOKS.length : 0)
              + (typeof BOOK_DETAILS !== 'undefined' ? BOOK_DETAILS.length : 0);
  const sharedHeader = typeof window.renderPrimaryHeader === 'function'
    ? window.renderPrimaryHeader('web', { actionLabel: 'New concept', actionId: 'webNewConceptBtn' })
    : '';
  return `
<div class="shared-header-wrap">
  ${sharedHeader}
</div>

<div class="web-subheader">
  <button class="web-filter-toggle" id="webFilterToggle" type="button" aria-expanded="false">
    Knowledge Graph
  </button>
  <div class="web-header-right">
    <div class="web-chip"><strong>${total}</strong> books</div>
    <div class="web-chip"><strong id="webConceptCount">—</strong> concepts</div>
  </div>
</div>

<aside class="web-sidebar-filter" id="webFilters" aria-hidden="true"></aside>

<svg id="webGraph"></svg>

<div class="web-hint" id="webHint">Drag to explore · hover to inspect · scroll to zoom</div>

<div class="web-tooltip" id="webTooltip">
  <div class="web-tt-tag"   id="ttTag"></div>
  <div class="web-tt-name"  id="ttName"></div>
  <div class="web-tt-body"  id="ttBody"></div>
  <div class="web-tt-books" id="ttBooks"></div>
</div>

<div class="web-legend">
  <div class="web-legend-row">
    <div class="web-legend-dot" style="background:rgba(198,139,74,0.85)"></div>
    <span>Concept / theme</span>
  </div>
  <div class="web-legend-row">
    <div class="web-legend-dot" style="background:rgba(232,223,200,0.3);border:1px solid rgba(232,223,200,0.4)"></div>
    <span>Book</span>
  </div>
  <div class="web-legend-row">
    <div class="web-legend-line" style="background:rgba(232,223,200,0.18)"></div>
    <span>Shared concept</span>
  </div>
</div>

<div class="web-controls">
  <button class="web-ctrl-btn" id="webZoomIn">+</button>
  <button class="web-ctrl-btn" id="webZoomOut">−</button>
  <button class="web-ctrl-btn" id="webReset" style="font-size:13px;letter-spacing:0.06em">fit</button>
</div>`;
}

function bindWebShellEvents() {
  const host = document.getElementById('view-web');
  const toggle = document.getElementById('webFilterToggle');
  if (!host || !toggle) return;

  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    toggleWebFilterPanel();
  });

  host.addEventListener('click', (event) => {
    if (!__webFilterPanelOpen) return;
    if (event.target.closest('#webFilters') || event.target.closest('#webFilterToggle')) return;
    toggleWebFilterPanel(false);
  });
}

/* ── D3 lazy load ────────────────────────────────────────────────────────── */

function loadD3ThenBoot() {
  if (typeof d3 !== 'undefined') { bootWeb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js';
  s.onload  = bootWeb;
  s.onerror = () => console.error('[web] D3 failed to load');
  document.head.appendChild(s);
}

/* ── Build graph data ────────────────────────────────────────────────────── */

function buildGraphData() {
  const allBooks = [];
  const tagMap   = {};   // normalised-key → { id, label, books[] }

  function addBook(id, title, author, tags, bg, text) {
    const node = { id, title, author, tags, bg, text, type: 'book' };
    allBooks.push(node);
    tags.forEach(tag => {
      const key = tag.toLowerCase().trim();
      if (!tagMap[key]) {
        tagMap[key] = { id: 'tag-' + key, label: tag, books: [], type: 'concept' };
      }
      tagMap[key].books.push(node);
    });
  }

  if (typeof MAP_BOOKS !== 'undefined') {
    MAP_BOOKS.forEach(b =>
      addBook(b.id, b.title, b.author, b.tags || [], b.bg || '#333', b.text || '#eee')
    );
  }
  if (typeof BOOK_DETAILS !== 'undefined') {
    BOOK_DETAILS.forEach(b => {
      if (allBooks.find(x => x.id === b.id)) return; // already from MAP_BOOKS
      const tags = [
        ...(b.tags || []),
        ...(b.cultural || []).map(c => c.tag)
      ];
      addBook(b.id, b.title, b.author, [...new Set(tags)],
              b.cover?.bg || '#333', b.cover?.text || '#eee');
    });
  }

  const concepts     = Object.values(tagMap);
  const linkedIds    = new Set(concepts.flatMap(c => c.books.map(bk => bk.id)));
  const linkedBooks  = allBooks.filter(b => linkedIds.has(b.id));
  const nodes        = [...concepts, ...linkedBooks];

  const links = [];
  concepts.forEach(c => {
    c.books.forEach(b => {
      links.push({ source: c.id, target: b.id });
    });
  });

  return { nodes, links, concepts, books: linkedBooks };
}

/* ── Main boot ───────────────────────────────────────────────────────────── */

function bootWeb() {
  __webBooted = true;

  const { nodes, links, concepts, books } = buildGraphData();

  // Update concept count
  const countEl = document.getElementById('webConceptCount');
  if (countEl) countEl.textContent = concepts.length;

  // Build filter chips
  buildWebFilters(concepts);

  // Measure viewport — view is now visible so clientWidth is valid
  const W = window.innerWidth;
  const H = window.innerHeight;

  const svg = d3.select('#webGraph')
    .attr('width', W)
    .attr('height', H);

  __webSvg = svg;

  const g = svg.append('g').attr('class', 'web-root');
  __webRootGroup = g;

  // ── Zoom ──────────────────────────────────────────────────────────────────
  __webZoom = d3.zoom()
    .scaleExtent([0.12, 5])
    .on('zoom', (ev) => {
      const constrained = constrainWebTransform(ev.transform);
      g.attr('transform', constrained);
      if (Math.abs(constrained.x - ev.transform.x) > 0.2 ||
          Math.abs(constrained.y - ev.transform.y) > 0.2 ||
          Math.abs(constrained.k - ev.transform.k) > 0.0001) {
        __webSvg.property('__zoom', constrained);
      }
    });

  svg.call(__webZoom);

  // Zoom controls (now injected into DOM)
  document.getElementById('webZoomIn').addEventListener('click', () =>
    svg.transition().duration(300).call(__webZoom.scaleBy, 1.45));
  document.getElementById('webZoomOut').addEventListener('click', () =>
    svg.transition().duration(300).call(__webZoom.scaleBy, 0.7));
  document.getElementById('webReset').addEventListener('click', () =>
    applyWebFit(true));

  // ── Scale ─────────────────────────────────────────────────────────────────
  const maxBooks  = d3.max(concepts, c => c.books.length) || 1;
  const conceptR  = d3.scaleSqrt().domain([1, maxBooks]).range([12, 38]);
  const bookR     = 6.5;

  // ── Simulation ────────────────────────────────────────────────────────────
  __webSim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id)
      .distance(d => {
        const src = d.source.id || d.source;
        const c   = concepts.find(x => x.id === src);
        return (c ? conceptR(c.books.length) : 16) + 44;
      })
      .strength(0.35))
    .force('charge', d3.forceManyBody()
      .strength(d => d.type === 'concept' ? -220 : -36))
    .force('center', d3.forceCenter(0, 0))
    .force('collision', d3.forceCollide()
      .radius(d => d.type === 'concept' ? conceptR(d.books.length) + 11 : bookR + 5));

  // ── Links ─────────────────────────────────────────────────────────────────
  __webLinks = g.append('g')
    .selectAll('line')
    .data(links)
    .enter().append('line')
      .attr('stroke', 'rgba(232,223,200,0.1)')
      .attr('stroke-width', 1);

  // ── Concept nodes ─────────────────────────────────────────────────────────
  __webCNodes = g.append('g')
    .selectAll('g')
    .data(concepts)
    .enter().append('g')
      .attr('class', 'c-node')
      .style('cursor', 'pointer')
      .call(webDrag(__webSim))
      .on('mouseenter', (ev, d) => webShowConceptTip(ev, d))
      .on('mousemove',  (ev)    => webMoveTip(ev))
      .on('mouseleave', ()      => webHideTip())
      .on('click',      (ev, d) => webToggleFilter(d.id, concepts, books, links));

  // Glow ring
  __webCNodes.append('circle')
    .attr('r', d => conceptR(d.books.length) + 5)
    .attr('fill',   'none')
    .attr('stroke', d => webTagColor(d.label))
    .attr('stroke-width', 1)
    .attr('opacity', 0.15);

  // Main circle
  __webCNodes.append('circle')
    .attr('r',            d => conceptR(d.books.length))
    .attr('fill',         d => webTagColor(d.label))
    .attr('fill-opacity', 0.2)
    .attr('stroke',       d => webTagColor(d.label))
    .attr('stroke-width', 1.5)
    .attr('stroke-opacity', 0.75)
    .attr('class', 'c-main');

  // Label
  __webCNodes.append('text')
    .attr('class', 'web-node-label')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .text(d => d.label.length > 13 ? d.label.slice(0, 12) + '…' : d.label);

  // ── Book nodes ────────────────────────────────────────────────────────────
  __webBNodes = g.append('g')
    .selectAll('g')
    .data(books)
    .enter().append('g')
      .attr('class', 'b-node')
      .style('cursor', d =>
        (d.id && typeof BOOK_BY_ID !== 'undefined' && BOOK_BY_ID[d.id]) ? 'pointer' : 'default')
      .call(webDrag(__webSim))
      .on('mouseenter', (ev, d) => webShowBookTip(ev, d))
      .on('mousemove',  (ev)    => webMoveTip(ev))
      .on('mouseleave', ()      => webHideTip())
      .on('click',      (ev, d) => {
        if (d.id && typeof BOOK_BY_ID !== 'undefined' && BOOK_BY_ID[d.id]) {
          App.show('book', { id: d.id });
        }
      });

  __webBNodes.append('circle')
    .attr('r',            bookR)
    .attr('fill',         d => d.bg)
    .attr('fill-opacity', 0.75)
    .attr('stroke',       'rgba(232,223,200,0.4)')
    .attr('stroke-width', 1);

  __webBNodes.append('text')
    .attr('class', 'web-node-label book-label')
    .attr('x', bookR + 5)
    .attr('dy', '0.35em')
    .text(d => webShortTitle(d.title));

  // ── Tick ──────────────────────────────────────────────────────────────────
  __webSim.on('tick', () => {
    __webLinks
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);
    __webCNodes.attr('transform', d => `translate(${d.x},${d.y})`);
    __webBNodes.attr('transform', d => `translate(${d.x},${d.y})`);
  });

  // Default fit mode with readable scale
  setTimeout(() => applyWebFit(false), 180);
  setTimeout(() => applyWebFit(true), 860);
}

function applyWebFit(animated = false) {
  if (!__webSvg || !__webRootGroup || !__webZoom) return;

  const W = window.innerWidth;
  const H = window.innerHeight;
  __webSvg.attr('width', W).attr('height', H);

  const rootNode = __webRootGroup.node();
  if (!rootNode) return;
  const box = rootNode.getBBox();
  if (!isFinite(box.width) || !isFinite(box.height) || box.width <= 0 || box.height <= 0) return;

  const viewport = getWebSafeViewport(W, H);
  const availableW = Math.max(220, viewport.width);
  const availableH = Math.max(220, viewport.height);

  const scaleX = availableW / box.width;
  const scaleY = availableH / box.height;
  const targetScale = clamp(Math.min(scaleX, scaleY), 0.78, 1.2);

  const centerX = viewport.left + availableW / 2;
  const centerY = viewport.top + availableH / 2;
  const graphCenterX = box.x + box.width / 2;
  const graphCenterY = box.y + box.height / 2;
  const tx = centerX - targetScale * graphCenterX;
  const ty = centerY - targetScale * graphCenterY;
  const transform = constrainWebTransform(d3.zoomIdentity.translate(tx, ty).scale(targetScale));

  if (animated) {
    __webSvg.transition().duration(450).call(__webZoom.transform, transform);
  } else {
    __webSvg.call(__webZoom.transform, transform);
  }
}

function getWebSafeViewport(W = window.innerWidth, H = window.innerHeight) {
  const subheaderRect = document.querySelector('#view-web .web-subheader')?.getBoundingClientRect();
  const controlsRect = document.querySelector('#view-web .web-controls')?.getBoundingClientRect();
  const isMobile = W <= 980;

  const left = isMobile ? 20 : 56;
  const top = subheaderRect
    ? Math.round(subheaderRect.bottom + (isMobile ? 20 : 22))
    : (isMobile ? 228 : 188);
  const right = controlsRect
    ? Math.round(controlsRect.left - (isMobile ? 18 : 22))
    : W - (isMobile ? 64 : 92);
  const bottom = H - (isMobile ? 28 : 24);

  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(220, right - left),
    height: Math.max(220, bottom - top),
  };
}

function constrainWebTransform(transform) {
  if (!__webRootGroup) return transform;
  const rootNode = __webRootGroup.node();
  if (!rootNode) return transform;
  const box = rootNode.getBBox();
  if (!isFinite(box.width) || !isFinite(box.height) || box.width <= 0 || box.height <= 0) {
    return transform;
  }

  const viewport = getWebSafeViewport();
  const k = transform.k;
  const scaledW = box.width * k;
  const scaledH = box.height * k;

  let x = transform.x;
  let y = transform.y;

  if (scaledW <= viewport.width) {
    x = viewport.left + (viewport.width - scaledW) / 2 - box.x * k;
  } else {
    const minX = viewport.right - (box.x + box.width) * k;
    const maxX = viewport.left - box.x * k;
    x = clamp(x, minX, maxX);
  }

  if (scaledH <= viewport.height) {
    y = viewport.top + (viewport.height - scaledH) / 2 - box.y * k;
  } else {
    const minY = viewport.bottom - (box.y + box.height) * k;
    const maxY = viewport.top - box.y * k;
    y = clamp(y, minY, maxY);
  }

  return d3.zoomIdentity.translate(x, y).scale(k);
}

/* ── Tag colour ──────────────────────────────────────────────────────────── */

const WEB_COLORS = {
  // Chinese lit
  'Classic':      '#c68b4a', 'Qing': '#c68b4a', 'Beijing': '#c07840',
  'Shanghai':     '#c07840', 'Shandong': '#c07840', 'Hunan': '#c07840',
  'Sichuan':      '#c07840', 'Inner Mongolia': '#c07840',
  'Labour':       '#b06830', 'Rivers': '#b06830', 'Pastoral': '#b06830',
  // Awards
  'Nobel':        '#c4903a', 'Booker': '#c4903a', 'Booker Prize': '#c4903a',
  'Hugo Award':   '#c4903a',
  // Sci-fi / speculative
  'Sci-fi':       '#4a8aaa', 'Trilogy': '#4a8aaa', 'Magic realism': '#6a5aaa',
  'Dystopia':     '#4a6aaa', 'Absurd': '#6a5aaa',
  // European / Western lit
  'Modernist':    '#6a8a6a', 'Victorian': '#6a8a6a', 'Gothic': '#8a6a8a',
  'Paris':        '#5a7a8a', 'London': '#5a7a8a', 'Moscow': '#5a7a8a',
  'St Petersburg':'5a7a8a',
  // Ideas
  'Philosophy':   '#8a6aaa', 'Memory': '#8a6aaa', 'Consciousness': '#7a6a9a',
  '人类学':       '#2a9a7a', '宏观历史': '#2a8a6a', '认知革命': '#3a8a6a',
  '叙事':         '#4a7a6a', '帝国主义': '#5a6a6a', '科学革命': '#2a9a8a',
  '历史哲学':     '#3a7a8a', '消费主义': '#6a7a5a', '农业革命': '#5a8a5a',
  // War / Dark
  'War':          '#8a4a3a', 'Violence': '#8a4a3a', 'Crime': '#7a4a5a',
  'Psychological':'7a5a6a',
  // Nature
  'Nature':       '#4a7a4a', 'Sea': '#3a6a7a', 'Snow': '#7a8a9a',
  // Family / Society
  'Family':       '#8a7a4a', 'Family saga': '#8a7a4a', 'Society': '#8a7a5a',
  'Colonialism':  '#7a6a4a', 'Caste': '#7a6a5a',
};

function webTagColor(label) {
  if (WEB_COLORS[label]) return WEB_COLORS[label];
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) & 0xffff;
  return `hsl(${h % 360},35%,52%)`;
}

/* ── Filter bar ─────────────────────────────────────────────────────────── */

const WEB_FILTER_GROUPS = [
  { label: 'All' },
  { label: 'Chinese lit',  match: ['Classic','Qing','Beijing','Shanghai','Shandong','Hunan',
                                    'Sichuan','Inner Mongolia','Labour','Memoir','Pastoral',
                                    'Novella','Coming-of-age','Rivers','Satire','Journey'] },
  { label: 'European',     match: ['Modernist','Epic','Paris','London','Moscow','St Petersburg',
                                    'Yorkshire','Gothic','Victorian','Absurd','Psychological',
                                    'Dystopia','Surveillance','Consciousness','Memory',
                                    'Moorland','Midlands','Revolution'] },
  { label: 'Ideas',        match: ['Philosophy','人类学','宏观历史','认知革命','叙事','帝国主义',
                                    '科学革命','历史哲学','消费主义','农业革命','Memory',
                                    'Consciousness','Inner life'] },
  { label: 'Awards',       match: ['Nobel','Booker','Booker Prize','Hugo Award'] },
  { label: 'Epic & War',   match: ['Epic','War','Violence','Ancient','Napoleon','Sea',
                                    'Medieval','Crime','Western'] },
];

function buildWebFilters(concepts) {
  const panel = document.getElementById('webFilters');
  if (!panel) return;
  panel.innerHTML = '';

  WEB_FILTER_GROUPS.forEach((g, i) => {
    const btn = document.createElement('button');
    btn.className = 'web-filter-item' + (i === 0 ? ' active' : '');
    btn.style.setProperty('--i', String(i));
    btn.type = 'button';
    btn.textContent = g.label;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.web-filter-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      __webFilter = null; // clear concept-click filter
      const ids = g.match
        ? concepts.filter(c => g.match.includes(c.label)).map(c => c.id)
        : null;
      webApplyFilter(ids);
    });
    panel.appendChild(btn);
  });

  toggleWebFilterPanel(__webFilterPanelOpen);
}

function toggleWebFilterPanel(forceOpen) {
  const panel = document.getElementById('webFilters');
  const toggle = document.getElementById('webFilterToggle');
  if (!panel || !toggle) return;

  const nextOpen = typeof forceOpen === 'boolean'
    ? forceOpen
    : !__webFilterPanelOpen;

  __webFilterPanelOpen = nextOpen;
  panel.classList.toggle('open', nextOpen);
  panel.setAttribute('aria-hidden', String(!nextOpen));
  toggle.classList.toggle('open', nextOpen);
  toggle.setAttribute('aria-expanded', String(nextOpen));
}

function webApplyFilter(ids) {
  if (!__webCNodes) return;
  __webCNodes.style('opacity', d => (!ids || ids.includes(d.id)) ? 1 : 0.07);
  __webBNodes.style('opacity', d => {
    if (!ids) return 1;
    return d.tags.some(t => {
      const key = 'tag-' + t.toLowerCase().trim();
      return ids.includes(key);
    }) ? 1 : 0.04;
  });
  __webLinks.style('opacity', d => {
    if (!ids) return 1;
    const src = typeof d.source === 'object' ? d.source.id : d.source;
    return ids.includes(src) ? 0.25 : 0.03;
  });
}

function webToggleFilter(tagId, concepts) {
  if (__webFilter === tagId) {
    __webFilter = null;
    webApplyFilter(null);
    document.querySelectorAll('.web-filter-item').forEach((b, i) => {
      b.classList.toggle('active', i === 0);
    });
  } else {
    __webFilter = tagId;
    webApplyFilter([tagId]);
    document.querySelectorAll('.web-filter-item').forEach(b => b.classList.remove('active'));
  }
}

/* ── Drag ────────────────────────────────────────────────────────────────── */

function webDrag(sim) {
  return d3.drag()
    .on('start', (ev, d) => {
      if (!ev.active) sim.alphaTarget(0.3).restart();
      d.fx = d.x; d.fy = d.y;
    })
    .on('drag',  (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
    .on('end',   (ev, d) => {
      if (!ev.active) sim.alphaTarget(0);
      d.fx = null; d.fy = null;
    });
}

/* ── Tooltips ────────────────────────────────────────────────────────────── */

function webShowConceptTip(ev, concept) {
  document.getElementById('ttTag').textContent  = 'Concept';
  document.getElementById('ttName').textContent = concept.label;
  document.getElementById('ttBody').textContent =
    `${concept.books.length} book${concept.books.length !== 1 ? 's' : ''} share this theme · click to highlight`;
  const bEl = document.getElementById('ttBooks');
  bEl.innerHTML = '';
  concept.books.slice(0, 7).forEach(b => {
    const s = document.createElement('span');
    s.className = 'web-tt-book';
    s.textContent = webShortTitle(b.title);
    bEl.appendChild(s);
  });
  if (concept.books.length > 7) {
    const s = document.createElement('span');
    s.className = 'web-tt-book';
    s.textContent = `+${concept.books.length - 7} more`;
    bEl.appendChild(s);
  }
  document.getElementById('webTooltip').classList.add('show');
  webMoveTip(ev);
}

function webShowBookTip(ev, book) {
  document.getElementById('ttTag').textContent  = book.author || '';
  document.getElementById('ttName').textContent = book.title;
  document.getElementById('ttBody').textContent = (book.tags || []).join(' · ');
  const bEl = document.getElementById('ttBooks');
  bEl.innerHTML = '';
  if (typeof BOOK_BY_ID !== 'undefined' && BOOK_BY_ID[book.id]) {
    const s = document.createElement('span');
    s.className = 'web-tt-book';
    s.textContent = 'Click to open';
    bEl.appendChild(s);
  }
  document.getElementById('webTooltip').classList.add('show');
  webMoveTip(ev);
}

function webMoveTip(ev) {
  const tt = document.getElementById('webTooltip');
  const x  = Math.min(ev.clientX + 14, window.innerWidth  - tt.offsetWidth  - 10);
  const y  = Math.max(10, Math.min(ev.clientY - 14, window.innerHeight - tt.offsetHeight - 10));
  tt.style.left = x + 'px';
  tt.style.top  = y + 'px';
}

function webHideTip() {
  document.getElementById('webTooltip')?.classList.remove('show');
}

/* ── Hint ────────────────────────────────────────────────────────────────── */

function showWebHint() {
  const el = document.getElementById('webHint');
  if (!el) return;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3500);
}

/* ── Utility ─────────────────────────────────────────────────────────────── */

function webShortTitle(t) {
  if (!t) return '';
  const skip = new Set(['The','A','An','In','Of','And','Les','Der','Die']);
  const words = t.split(' ').filter(w => !skip.has(w));
  if (words.length <= 3) return words.join(' ');
  return words.slice(0, 3).join(' ') + '…';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
