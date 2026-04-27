/* ==========================================================================
   Marginalia · Global concept drawer
   ========================================================================== */

window.openConceptDrawer = openConceptDrawer;
window.closeConceptDrawer = closeConceptDrawer;

let __conceptDrawerReady = false;
let __conceptDrawerState = null;

ensureConceptDrawer();

function ensureConceptDrawer() {
  if (__conceptDrawerReady || !document.body) return;
  const shell = document.createElement('div');
  shell.innerHTML = `
    <div class="concept-overlay" id="conceptOverlay" hidden></div>
    <aside class="concept-drawer" id="conceptDrawer" aria-hidden="true">
      <div class="concept-drawer-head">
        <div>
          <div class="concept-drawer-kicker">Concept</div>
          <h2 class="concept-drawer-title" id="conceptDrawerTitle">Untitled</h2>
        </div>
        <button class="concept-drawer-close" id="conceptDrawerClose" type="button" aria-label="Close concept drawer">×</button>
      </div>
      <div class="concept-drawer-body" id="conceptDrawerBody"></div>
    </aside>
  `;
  Array.from(shell.children).forEach((node) => document.body.appendChild(node));

  document.getElementById('conceptDrawerClose')?.addEventListener('click', closeConceptDrawer);
  document.getElementById('conceptOverlay')?.addEventListener('click', closeConceptDrawer);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && __conceptDrawerState) closeConceptDrawer();
  });
  window.addEventListener('marginalia:graph-links-changed', () => {
    if (!__conceptDrawerState?.conceptId) return;
    openConceptDrawer(__conceptDrawerState.conceptId, __conceptDrawerState.options);
  });
  __conceptDrawerReady = true;
}

function openConceptDrawer(conceptId, options = {}) {
  ensureConceptDrawer();
  const details = window.MarginaliaGraph?.getConceptDetails(conceptId, options);
  if (!details) return;

  __conceptDrawerState = { conceptId, options };

  const titleEl = document.getElementById('conceptDrawerTitle');
  const bodyEl = document.getElementById('conceptDrawerBody');
  const drawerEl = document.getElementById('conceptDrawer');
  const overlayEl = document.getElementById('conceptOverlay');
  if (!titleEl || !bodyEl || !drawerEl || !overlayEl) return;

  titleEl.textContent = details.concept.name;
  bodyEl.innerHTML = renderConceptDrawerBody(details, options);
  drawerEl.classList.add('open');
  drawerEl.setAttribute('aria-hidden', 'false');
  overlayEl.hidden = false;
  overlayEl.classList.add('open');
  document.body.classList.add('concept-drawer-open');

  bindConceptDrawerEvents();
}

function closeConceptDrawer() {
  __conceptDrawerState = null;
  document.getElementById('conceptDrawer')?.classList.remove('open');
  document.getElementById('conceptDrawer')?.setAttribute('aria-hidden', 'true');
  document.getElementById('conceptOverlay')?.classList.remove('open');
  const overlay = document.getElementById('conceptOverlay');
  if (overlay) overlay.hidden = true;
  document.body.classList.remove('concept-drawer-open');
}

function renderConceptDrawerBody(details, options) {
  const concept = details.concept;
  const contextMarkup = details.relatedContexts.length
    ? `<div class="concept-chip-row">
        ${details.relatedContexts.map((context) => `<span class="concept-chip">${esc(context.label)}</span>`).join('')}
      </div>`
    : '';

  const relatedBooks = details.relatedBooks.map(({ book, link, context }) => {
    const relation = window.MarginaliaGraph.getRelationMeta(link.relationType);
    const statusMeta = window.MarginaliaGraph.getLinkStatusMeta(link.status);
    const evidence = link.evidenceHighlights.map((item) => `
      <article class="concept-evidence-card">
        <div class="concept-evidence-meta">${item.page ? `p. ${esc(item.page)} · ` : ''}${esc(item.chapter || '')}</div>
        <p>${esc(item.quote || '')}</p>
      </article>
    `).join('');
    const actions = link.relatedActions.length
      ? `<div class="concept-inline-list">
          ${link.relatedActions.map((item) => `<span class="concept-inline-pill">${esc(item.text)}</span>`).join('')}
        </div>`
      : '<p class="concept-muted">No linked actions yet.</p>';
    const controls = link.status === 'suggested'
      ? `
        <div class="concept-link-actions">
          <button class="concept-status-btn is-confirm" type="button" data-link-status="confirmed" data-link-id="${esc(link.id)}">Confirm</button>
          <button class="concept-status-btn is-reject" type="button" data-link-status="rejected" data-link-id="${esc(link.id)}">Reject</button>
        </div>
      `
      : '';

    return `
      <article class="concept-book-card${book.id === options.focusBookId ? ' is-focus' : ''}">
        <div class="concept-book-head">
          <button class="concept-book-open" type="button" data-open-book-id="${esc(book.id)}">${esc(book.titleZh || book.title)}</button>
          <div class="concept-book-meta">
            <span class="concept-status">${esc(statusMeta.label)}</span>
            <span class="concept-sep">·</span>
            <span style="color:${relation.color}">${esc(relation.label)}</span>
            ${context ? `<span class="concept-sep">·</span><span>${esc(context.label)}</span>` : ''}
          </div>
        </div>
        ${link.readerUnderstanding ? `<p class="concept-understanding">${esc(link.readerUnderstanding)}</p>` : ''}
        ${link.rationale ? `<p class="concept-rationale">${esc(link.rationale)}</p>` : ''}
        ${evidence ? `<section class="concept-subsection"><h3>Key highlights</h3>${evidence}</section>` : ''}
        <section class="concept-subsection"><h3>Actions</h3>${actions}</section>
        ${controls}
      </article>
    `;
  }).join('');

  return `
    <section class="concept-drawer-section">
      <p class="concept-summary">${esc(concept.description || 'This concept is seeded from your notes and ready for richer cloud sync later.')}</p>
      ${contextMarkup}
    </section>

    <section class="concept-drawer-section">
      <div class="concept-section-head">
        <h3>Books under this concept</h3>
        <span>${details.relatedBooks.length}</span>
      </div>
      ${relatedBooks || '<p class="concept-muted">No visible book links.</p>'}
    </section>
  `;
}

function bindConceptDrawerEvents() {
  document.querySelectorAll('[data-open-book-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const bookId = button.dataset.openBookId;
      if (bookId && window.BOOK_BY_ID?.[bookId]) {
        closeConceptDrawer();
        App.show('book', { id: bookId });
      }
    });
  });

  document.querySelectorAll('[data-link-status][data-link-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const linkId = button.dataset.linkId;
      const status = button.dataset.linkStatus;
      if (!linkId || !status) return;
      window.MarginaliaGraph?.setBookConceptLinkStatus(linkId, status);
    });
  });
}

function esc(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"]/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]
  ));
}
