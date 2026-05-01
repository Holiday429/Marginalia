/* ==========================================================================
   Marginalia · Concept graph
   ========================================================================== */

let __webBooted = false;
let __webSvg = null;
let __webZoom = null;
let __webMode = 'all';
let __webQuery = '';
let __webFocusConceptId = '';
let __webFilterPanelOpen = false;

function initWeb() {
  const container = document.getElementById('view-web');
  if (!container) return;
  container.innerHTML = webShellHTML();
  bindWebShellEvents();
}

function enterWeb() {
  showWebHint();
  if (typeof d3 === 'undefined') {
    loadD3ThenBoot();
    return;
  }
  bootWeb();
}

function webShellHTML() {
  const sharedHeader = typeof window.renderPrimaryHeader === 'function'
    ? window.renderPrimaryHeader('web', { actionLabel: '◈ New Concept', actionId: 'webNewConceptBtn' })
    : '';

  return `
    <div class="shared-header-wrap">
      ${sharedHeader}
    </div>

    <div class="web-subheader">
      <button class="web-filter-toggle" id="webFilterToggle" type="button" aria-expanded="false">
        Concept Network
      </button>
      <label class="web-search">
        <span>Search</span>
        <input id="webSearchInput" type="search" placeholder="Concept, book, context">
      </label>
      <div class="web-mode-switch" id="webModeSwitch">
        <button class="web-mode-btn active" data-web-mode="all" type="button">Concept Web</button>
        <button class="web-mode-btn" data-web-mode="suggested" type="button">Unconfirmed AI Links</button>
      </div>
      <div class="web-header-right">
        <div class="web-chip"><strong id="webBookCount">—</strong> books</div>
        <div class="web-chip"><strong id="webConceptCount">—</strong> concepts</div>
        <div class="web-chip"><strong id="webSuggestedCount">—</strong> suggested</div>
      </div>
    </div>

    <aside class="web-sidebar-filter" id="webFilters" aria-hidden="true"></aside>
    <svg id="webGraph"></svg>

    <div class="web-hint" id="webHint">Click a concept for its reading history · drag to inspect</div>

    <div class="web-tooltip" id="webTooltip">
      <div class="web-tt-tag" id="ttTag"></div>
      <div class="web-tt-name" id="ttName"></div>
      <div class="web-tt-body" id="ttBody"></div>
      <div class="web-tt-books" id="ttBooks"></div>
    </div>

    <div class="web-legend">
      <div class="web-legend-row">
        <div class="web-legend-dot" style="background:rgba(213,170,100,0.86)"></div>
        <span>Concept</span>
      </div>
      <div class="web-legend-row">
        <div class="web-legend-dot" style="background:rgba(232,223,200,0.3);border:1px solid rgba(232,223,200,0.4)"></div>
        <span>Book</span>
      </div>
      <div class="web-legend-row">
        <div class="web-legend-square"></div>
        <span>Cultural context</span>
      </div>
      <div class="web-legend-row">
        <div class="web-legend-line" style="background:rgba(213,170,100,0.58)"></div>
        <span>Confirmed</span>
      </div>
      <div class="web-legend-row">
        <div class="web-legend-line is-dashed"></div>
        <span>AI suggested</span>
      </div>
    </div>

    <div class="web-controls">
      <button class="web-ctrl-btn" id="webZoomIn" type="button">+</button>
      <button class="web-ctrl-btn" id="webZoomOut" type="button">−</button>
      <button class="web-ctrl-btn" id="webReset" type="button" style="font-size:13px;letter-spacing:0.06em">fit</button>
    </div>
  `;
}

function bindWebShellEvents() {
  const host = document.getElementById('view-web');
  const toggle = document.getElementById('webFilterToggle');
  const input = document.getElementById('webSearchInput');
  if (!host || !toggle) return;

  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    toggleWebFilterPanel();
  });

  input?.addEventListener('input', () => {
    __webQuery = input.value.trim().toLowerCase();
    __webFocusConceptId = '';
    renderWebGraph();
  });

  document.querySelectorAll('[data-web-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      __webMode = button.dataset.webMode || 'all';
      document.querySelectorAll('[data-web-mode]').forEach((item) => {
        item.classList.toggle('active', item === button);
      });
      __webFocusConceptId = '';
      renderWebGraph();
    });
  });

  host.addEventListener('click', (event) => {
    if (!__webFilterPanelOpen) return;
    if (event.target.closest('#webFilters') || event.target.closest('#webFilterToggle')) return;
    toggleWebFilterPanel(false);
  });

  window.addEventListener('marginalia:graph-links-changed', () => {
    if (document.body.dataset.view === 'web') renderWebGraph();
  });
}

function loadD3ThenBoot() {
  if (typeof d3 !== 'undefined') {
    bootWeb();
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js';
  script.onload = bootWeb;
  script.onerror = () => console.error('[web] Failed to load D3.');
  document.head.appendChild(script);
}

function bootWeb() {
  if (!__webBooted) {
    const svg = d3.select('#webGraph');
    __webSvg = svg;
    __webZoom = d3.zoom()
      .scaleExtent([0.18, 5])
      .on('zoom', (event) => {
        d3.select('#webGraphRoot').attr('transform', event.transform);
      });

    svg.call(__webZoom);
    document.getElementById('webZoomIn')?.addEventListener('click', () => {
      svg.transition().duration(240).call(__webZoom.scaleBy, 1.4);
    });
    document.getElementById('webZoomOut')?.addEventListener('click', () => {
      svg.transition().duration(240).call(__webZoom.scaleBy, 0.72);
    });
    document.getElementById('webReset')?.addEventListener('click', () => applyWebFit(true));
    __webBooted = true;
  }

  renderWebGraph();
}

function renderWebGraph() {
  if (!__webSvg || typeof d3 === 'undefined' || !window.MarginaliaGraph) return;

  const snapshot = window.MarginaliaGraph.getGraphSnapshot({
    query: __webQuery,
    mode: __webMode,
    topConceptLimit: __webQuery ? 18 : 10,
    focusConceptId: __webFocusConceptId,
  });

  updateWebStats(snapshot);
  buildWebFilters(snapshot);

  const W = window.innerWidth;
  const H = window.innerHeight;
  __webSvg.attr('width', W).attr('height', H);
  __webSvg.selectAll('*').remove();

  const root = __webSvg.append('g').attr('id', 'webGraphRoot');
  const conceptNodes = snapshot.nodes.filter((node) => node.type === 'concept');
  const bookNodes = snapshot.nodes.filter((node) => node.type === 'book');
  const contextNodes = snapshot.nodes.filter((node) => node.type === 'context');

  const conceptRadius = d3.scaleSqrt()
    .domain([0.6, d3.max(conceptNodes, (node) => node.weight) || 1])
    .range([18, 46]);
  const contextSize = d3.scaleSqrt()
    .domain([0.4, d3.max(contextNodes, (node) => node.weight) || 1])
    .range([14, 24]);

  const simulation = d3.forceSimulation(snapshot.nodes)
    .force('link', d3.forceLink(snapshot.links).id((node) => node.id)
      .distance((link) => link.linkType === 'context-concept' ? 110 : 132)
      .strength((link) => link.linkType === 'context-concept' ? 0.34 : 0.44))
    .force('charge', d3.forceManyBody().strength((node) => (
      node.type === 'concept' ? -420 : node.type === 'context' ? -180 : -90
    )))
    .force('collision', d3.forceCollide().radius((node) => {
      if (node.type === 'concept') return conceptRadius(node.weight) + 12;
      if (node.type === 'context') return contextSize(node.weight) + 10;
      return 18;
    }))
    .force('center', d3.forceCenter(0, 0));

  const linkEls = root.append('g')
    .selectAll('line')
    .data(snapshot.links)
    .enter()
    .append('line')
    .attr('stroke', (link) => {
      if (link.linkType === 'context-concept') return 'rgba(123,151,198,0.34)';
      return link.status === 'suggested' ? 'rgba(213,170,100,0.5)' : 'rgba(213,170,100,0.7)';
    })
    .attr('stroke-width', (link) => link.linkType === 'context-concept' ? 1 : Math.max(1.1, link.strength * 1.7))
    .attr('stroke-dasharray', (link) => link.status === 'suggested' ? '6 5' : null)
    .attr('opacity', (link) => link.linkType === 'context-concept' ? 0.8 : 1);

  const conceptEls = root.append('g')
    .selectAll('g')
    .data(conceptNodes)
    .enter()
    .append('g')
    .attr('class', 'web-concept-node')
    .style('cursor', 'pointer')
    .call(webDrag(simulation))
    .on('mouseenter', (event, node) => webShowConceptTip(event, node))
    .on('mousemove', (event) => webMoveTip(event))
    .on('mouseleave', webHideTip)
    .on('click', (event, node) => {
      __webFocusConceptId = node.id;
      window.openConceptDrawer?.(node.id);
      renderWebGraph();
    });

  conceptEls.append('circle')
    .attr('r', (node) => conceptRadius(node.weight) + 6)
    .attr('fill', 'none')
    .attr('stroke', (node) => node.hasSuggested ? 'rgba(213,170,100,0.45)' : 'rgba(213,170,100,0.22)');
  conceptEls.append('circle')
    .attr('r', (node) => conceptRadius(node.weight))
    .attr('fill', (node) => node.hasSuggested ? 'rgba(213,170,100,0.28)' : 'rgba(213,170,100,0.17)')
    .attr('stroke', 'rgba(213,170,100,0.92)')
    .attr('stroke-width', 1.4);
  conceptEls.append('text')
    .attr('class', 'web-node-label')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .text((node) => truncateWebLabel(node.shortLabel || node.name, 14));

  const contextEls = root.append('g')
    .selectAll('g')
    .data(contextNodes)
    .enter()
    .append('g')
    .attr('class', 'web-context-node')
    .call(webDrag(simulation))
    .on('mouseenter', (event, node) => webShowContextTip(event, node))
    .on('mousemove', (event) => webMoveTip(event))
    .on('mouseleave', webHideTip);

  contextEls.append('rect')
    .attr('x', (node) => -contextSize(node.weight))
    .attr('y', (node) => -contextSize(node.weight) * 0.7)
    .attr('rx', 6)
    .attr('ry', 6)
    .attr('width', (node) => contextSize(node.weight) * 2)
    .attr('height', (node) => contextSize(node.weight) * 1.4)
    .attr('fill', 'rgba(123,151,198,0.18)')
    .attr('stroke', 'rgba(123,151,198,0.55)');
  contextEls.append('text')
    .attr('class', 'web-node-label web-context-label')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.32em')
    .text((node) => truncateWebLabel(node.label, 12));

  const bookEls = root.append('g')
    .selectAll('g')
    .data(bookNodes)
    .enter()
    .append('g')
    .attr('class', 'web-book-node')
    .style('cursor', 'pointer')
    .call(webDrag(simulation))
    .on('mouseenter', (event, node) => webShowBookTip(event, node))
    .on('mousemove', (event) => webMoveTip(event))
    .on('mouseleave', webHideTip)
    .on('click', (event, node) => {
      if (window.BOOK_BY_ID?.[node.id]) App.show('book', { id: node.id });
    });

  bookEls.append('circle')
    .attr('r', 8)
    .attr('fill', (node) => node.bg)
    .attr('fill-opacity', 0.88)
    .attr('stroke', 'rgba(232,223,200,0.42)')
    .attr('stroke-width', 1.1);
  bookEls.append('text')
    .attr('class', 'web-node-label book-label')
    .attr('x', 13)
    .attr('dy', '0.35em')
    .text((node) => truncateWebLabel(shortBookTitle(node.titleZh || node.title), 18));

  simulation.on('tick', () => {
    linkEls
      .attr('x1', (link) => link.source.x)
      .attr('y1', (link) => link.source.y)
      .attr('x2', (link) => link.target.x)
      .attr('y2', (link) => link.target.y);
    conceptEls.attr('transform', (node) => `translate(${node.x},${node.y})`);
    contextEls.attr('transform', (node) => `translate(${node.x},${node.y})`);
    bookEls.attr('transform', (node) => `translate(${node.x},${node.y})`);
  });

  setTimeout(() => applyWebFit(false), 120);
  setTimeout(() => applyWebFit(true), 420);
}

function updateWebStats(snapshot) {
  document.getElementById('webBookCount').textContent = snapshot.stats.books;
  document.getElementById('webConceptCount').textContent = snapshot.stats.concepts;
  document.getElementById('webSuggestedCount').textContent = snapshot.stats.suggestedLinks;
}

function buildWebFilters(snapshot) {
  const panel = document.getElementById('webFilters');
  if (!panel) return;

  const concepts = snapshot.concepts
    .slice()
    .sort((a, b) => (b.totalStrength - a.totalStrength) || a.name.localeCompare(b.name, 'zh-Hans-CN'));

  panel.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = `web-filter-item${!__webFocusConceptId ? ' active' : ''}`;
  allBtn.type = 'button';
  allBtn.style.setProperty('--i', '0');
  allBtn.textContent = __webMode === 'suggested' ? 'All Suggested Links' : 'Top Concepts';
  allBtn.addEventListener('click', () => {
    __webFocusConceptId = '';
    renderWebGraph();
  });
  panel.appendChild(allBtn);

  concepts.forEach((concept, index) => {
    const button = document.createElement('button');
    button.className = `web-filter-item${concept.id === __webFocusConceptId ? ' active' : ''}`;
    button.type = 'button';
    button.style.setProperty('--i', String(index + 1));
    button.textContent = `${concept.name} · ${concept.bookCount}`;
    button.addEventListener('click', () => {
      __webFocusConceptId = concept.id;
      renderWebGraph();
      window.openConceptDrawer?.(concept.id);
    });
    panel.appendChild(button);
  });

  toggleWebFilterPanel(__webFilterPanelOpen);
}

function toggleWebFilterPanel(forceOpen) {
  const panel = document.getElementById('webFilters');
  const toggle = document.getElementById('webFilterToggle');
  if (!panel || !toggle) return;

  __webFilterPanelOpen = typeof forceOpen === 'boolean' ? forceOpen : !__webFilterPanelOpen;
  panel.classList.toggle('open', __webFilterPanelOpen);
  panel.setAttribute('aria-hidden', String(!__webFilterPanelOpen));
  toggle.classList.toggle('open', __webFilterPanelOpen);
  toggle.setAttribute('aria-expanded', String(__webFilterPanelOpen));
}

function webDrag(simulation) {
  return d3.drag()
    .on('start', (event, node) => {
      if (!event.active) simulation.alphaTarget(0.28).restart();
      node.fx = node.x;
      node.fy = node.y;
    })
    .on('drag', (event, node) => {
      node.fx = event.x;
      node.fy = event.y;
    })
    .on('end', (event, node) => {
      if (!event.active) simulation.alphaTarget(0);
      node.fx = null;
      node.fy = null;
    });
}

function applyWebFit(animated = false) {
  if (!__webSvg || !__webZoom) return;
  const rootNode = document.getElementById('webGraphRoot');
  if (!rootNode) return;
  const box = rootNode.getBBox();
  if (!isFinite(box.width) || !isFinite(box.height) || box.width <= 0 || box.height <= 0) return;

  const viewport = getWebSafeViewport();
  const scale = clamp(Math.min(viewport.width / box.width, viewport.height / box.height), 0.52, 1.08);
  const tx = viewport.left + viewport.width / 2 - scale * (box.x + box.width / 2);
  const ty = viewport.top + viewport.height / 2 - scale * (box.y + box.height / 2);
  const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);

  if (animated) {
    __webSvg.transition().duration(360).call(__webZoom.transform, transform);
  } else {
    __webSvg.call(__webZoom.transform, transform);
  }
}

function getWebSafeViewport() {
  const subheader = document.querySelector('#view-web .web-subheader')?.getBoundingClientRect();
  const controls = document.querySelector('#view-web .web-controls')?.getBoundingClientRect();
  const left = window.innerWidth <= 980 ? 18 : 56;
  const top = subheader ? Math.round(subheader.bottom + 24) : 190;
  const right = controls ? Math.round(controls.left - 20) : window.innerWidth - 92;
  const bottom = window.innerHeight - 28;

  return {
    left,
    top,
    width: Math.max(240, right - left),
    height: Math.max(240, bottom - top),
  };
}

function webShowConceptTip(event, concept) {
  document.getElementById('ttTag').textContent = concept.hasSuggested ? 'Concept · Evolving' : 'Concept';
  document.getElementById('ttName').textContent = concept.name;
  document.getElementById('ttBody').textContent = `${concept.bookCount} book link${concept.bookCount !== 1 ? 's' : ''} · click for reading history`;
  const container = document.getElementById('ttBooks');
  container.innerHTML = '';
  (window.MarginaliaGraph.getConceptDetails(concept.id)?.relatedBooks || []).slice(0, 5).forEach(({ book }) => {
    const chip = document.createElement('span');
    chip.className = 'web-tt-book';
    chip.textContent = shortBookTitle(book.titleZh || book.title);
    container.appendChild(chip);
  });
  document.getElementById('webTooltip').classList.add('show');
  webMoveTip(event);
}

function webShowBookTip(event, book) {
  document.getElementById('ttTag').textContent = book.authorZh || book.author || 'Book';
  document.getElementById('ttName').textContent = book.titleZh || book.title;
  document.getElementById('ttBody').textContent = (book.tags || []).slice(0, 4).join(' · ');
  const container = document.getElementById('ttBooks');
  container.innerHTML = '';
  const chip = document.createElement('span');
  chip.className = 'web-tt-book';
  chip.textContent = 'Open Book';
  container.appendChild(chip);
  document.getElementById('webTooltip').classList.add('show');
  webMoveTip(event);
}

function webShowContextTip(event, context) {
  document.getElementById('ttTag').textContent = 'Cultural Context';
  document.getElementById('ttName').textContent = context.label;
  document.getElementById('ttBody').textContent = context.description || `${context.conceptCount} connected concepts`;
  const container = document.getElementById('ttBooks');
  container.innerHTML = '';
  const chip = document.createElement('span');
  chip.className = 'web-tt-book';
  chip.textContent = `${context.conceptCount} concepts`;
  container.appendChild(chip);
  document.getElementById('webTooltip').classList.add('show');
  webMoveTip(event);
}

function webMoveTip(event) {
  const tooltip = document.getElementById('webTooltip');
  if (!tooltip) return;
  const x = Math.min(event.clientX + 16, window.innerWidth - tooltip.offsetWidth - 10);
  const y = Math.max(10, Math.min(event.clientY - 14, window.innerHeight - tooltip.offsetHeight - 10));
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function webHideTip() {
  document.getElementById('webTooltip')?.classList.remove('show');
}

function showWebHint() {
  const hint = document.getElementById('webHint');
  if (!hint) return;
  hint.classList.add('show');
  setTimeout(() => hint.classList.remove('show'), 3200);
}

function truncateWebLabel(value, maxChars) {
  const raw = String(value || '').trim();
  return raw.length > maxChars ? `${raw.slice(0, maxChars - 1)}…` : raw;
}

function shortBookTitle(value) {
  const raw = String(value || '').trim();
  if (raw.length <= 18) return raw;
  return `${raw.slice(0, 17)}…`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// TODO(p0-cleanup): remove after phase 3 — app.js looks up init/enter via window[]
window.initWeb = initWeb;
window.enterWeb = enterWeb;
