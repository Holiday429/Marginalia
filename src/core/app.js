/* ==========================================================================
   Marginalia · SPA view manager
   --------------------------------------------------------------------------
   Registers each view that exists in index.html. Each view is a top-level
   <div id="view-xxx" hidden> block. Switching views just toggles `hidden`
   and updates body[data-view], which the design tokens key off of.

   A view module may expose:
     - init<Name>()    optional one-shot setup, called the first time the
                       view is shown. Define on window.
     - enter<Name>()   optional, called every time the view is shown.

   Use App.show('book', { id: 'sapiens' }) to pass params to a view.
   ========================================================================== */

import { PanelManager } from './panel-manager.js';
import { logEvent, logError } from '../services/analytics.ts';
import { VIEW_REGISTRY } from './view-registry.ts';

// Module-level exports for render helpers — set by App IIFE below.
// eslint-disable-next-line prefer-const
export let renderPrimaryHeader = null;
// eslint-disable-next-line prefer-const
export let renderUnifiedPanelHeader = null;
// eslint-disable-next-line prefer-const
export let renderToolPageShell = null;

const App = (() => {
  const NAV_ITEMS = [
    { view: 'room',     label: 'Library',  icon: 'library', href: '#room' },
    { view: 'shelf',    label: 'Shelf',    icon: 'shelf',   href: '#shelf' },
    { view: 'map',      label: 'Map',      icon: 'map',     href: '#map' },
    { view: 'graph',    label: 'Graph',    icon: 'graph',   href: '#graph' },
    { view: 'booklist', label: 'Booklist', icon: 'list',    href: '#booklist' },
  ];
  const HEADER_ACTION_BY_VIEW = {
    shelf:    { label: 'Add Book',     id: 'shelfNewEntryBtn' },
    map:      { label: '↩ Back',       id: 'mapWorldBtn' },
    web:      { label: '◈ New Concept', id: 'webNewConceptBtn' },
    booklist: { label: '↗ Share',      id: 'booklistShareBtn' },
  };

  const views = {
    preloader: document.getElementById('view-preloader'),
    shelf:     document.getElementById('view-shelf'),   // TODO(p0-cleanup): merge into panel-library
    // room is the persistent shell — not in views, never toggled by show()
  };

  const initialized = new Set();
  const routeParamsByView = new Map();

  function toCanonicalViewName(name) {
    if (name === 'graph') return 'web';
    return name;
  }

  function toNavViewName(name) {
    if (name === 'web') return 'graph';
    return name;
  }

  function setActiveNav(targetView) {
    const navView = toNavViewName(targetView);
    document.querySelectorAll('.nav-link[data-view]').forEach((a) => {
      a.classList.toggle('active', a.dataset.view === navView);
    });
  }

  function getRequestedViewFromEvent(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (const node of path) {
      if (!(node instanceof Element) || node === document.body) continue;
      if (node.hasAttribute('data-view')) return node.getAttribute('data-view');

      if (node instanceof HTMLAnchorElement) {
        const hash = node.getAttribute('href') || '';
        if (hash.startsWith('#') && hash.length > 1) return hash.slice(1);
      }
    }

    const fallback = event.target instanceof Element ? event.target.closest('[data-view]') : null;
    if (fallback && fallback !== document.body) return fallback.getAttribute('data-view');
    return '';
  }

  function syncFromHash() {
    const rawHash = window.location.hash.replace(/^#/, '').trim();
    if (!rawHash) {
      if (PanelManager) PanelManager.closeAll();
      return;
    }

    const requestedView = toCanonicalViewName(rawHash);
    if (requestedView === 'room') {
      if (PanelManager) PanelManager.closeAll();
      return;
    }

    if (['shelf', 'map', 'web', 'booklist'].includes(requestedView)) {
      const params = routeParamsByView.get(requestedView) || {};
      routeParamsByView.delete(requestedView);
      if (PanelManager) PanelManager.open(requestedView, params);
      return;
    }
  }

  function setHashRoute(targetView) {
    const navView = toNavViewName(targetView);
    const nextHash = `#${navView}`;
    if (window.location.hash === nextHash) {
      syncFromHash();
      return;
    }
    window.location.hash = nextHash;
  }

  function navigateTo(targetView, params = {}) {
    const canonicalView = toCanonicalViewName(targetView);
    if (canonicalView === 'room') {
      setHashRoute('room');
      return;
    }

    routeParamsByView.set(canonicalView, params);
    setHashRoute(canonicalView);
  }

  function show(name, params = {}) {
    const canonicalName = toCanonicalViewName(name);
    const view = views[canonicalName];
    if (!view) {
      logError(new Error(`[App] View "${canonicalName}" is not registered yet.`), { view: canonicalName });
      return;
    }

    Object.entries(views).forEach(([key, el]) => {
      if (el) el.hidden = key !== canonicalName;
    });
    document.body.dataset.view = canonicalName;
    if (canonicalName !== 'map') document.body.classList.remove('map-panel-open');

    // Run init once, enter every time — resolved from VIEW_REGISTRY.
    // preloader is excluded: it imports App itself (circular), so its
    // enterPreloader is registered on M.views by main.js and called via window.M.
    if (canonicalName !== 'preloader') {
      if (!initialized.has(canonicalName)) {
        VIEW_REGISTRY[canonicalName]?.init?.(params);
        initialized.add(canonicalName);
      }
      VIEW_REGISTRY[canonicalName]?.enter?.(params);
    } else {
      if (!initialized.has('preloader')) initialized.add('preloader');
      window.M?.views?.enterPreloader?.(params);
    }

    // Highlight nav state
    setActiveNav(canonicalName);

    logEvent('view_changed', { view: canonicalName });
    window.scrollTo({ top: 0 });
    window.dispatchEvent(new Event('marginalia:ui-refresh'));
  }

  let transitioning = false;
  function showShelf() {
    if (transitioning) return;
    transitioning = true;

    const preloader = views.preloader;
    const shelf     = views.shelf;

    // Reveal shelf underneath the preloader, then fade preloader out
    shelf.hidden = false;
    document.body.dataset.view = 'shelf';
    setActiveNav('shelf');
    if (!initialized.has('shelf')) {
      try { VIEW_REGISTRY.shelf?.init?.(); } catch(e) { logError(e, { context: 'App initShelf' }); }
      initialized.add('shelf');
    }

    preloader.style.position   = 'fixed';
    preloader.style.inset      = '0';
    preloader.style.zIndex     = '100';
    preloader.style.transition = 'opacity 0.7s ease';
    requestAnimationFrame(() => { preloader.style.opacity = '0'; });

    setTimeout(() => {
      preloader.hidden = true;
      preloader.style.cssText = '';
      transitioning = false;
      window.dispatchEvent(new Event('marginalia:ui-refresh'));
    }, 750);
  }

  // Close panel when any [data-panel-close] element is clicked.
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-panel-close]')) {
      e.preventDefault();
      navigateTo('room');
    }
  });

  function showRoom() {
    if (transitioning) return;
    transitioning = true;

    const preloader = views.preloader;

    document.body.dataset.view = 'room';
    setActiveNav('room');

    if (!initialized.has('room')) {
      try { VIEW_REGISTRY.room?.init?.(); } catch(e) { logError(e, { context: 'App initRoom' }); }
      initialized.add('room');
    }

    preloader.style.position   = 'fixed';
    preloader.style.inset      = '0';
    preloader.style.zIndex     = '100';
    preloader.style.transition = 'opacity 0.7s ease';
    requestAnimationFrame(() => { preloader.style.opacity = '0'; });

    setTimeout(() => {
      preloader.hidden = true;
      preloader.style.cssText = '';
      transitioning = false;
      syncFromHash();
      window.dispatchEvent(new Event('marginalia:ui-refresh'));
    }, 750);
  }

  // Wire up any element with data-view (nav links, wordmarks, breadcrumbs).
  // Body also carries data-view as a styling hook, so exclude it from the delegate.
  document.addEventListener('click', (e) => {
    const rawRequestedView = getRequestedViewFromEvent(e);
    if (!rawRequestedView) return;
    e.preventDefault();
    const requestedView = toCanonicalViewName(rawRequestedView);

    // 'room' nav → close all panels, return to room
    if (requestedView === 'room') {
      navigateTo('room');
      return;
    }
    // shelf / map / web / booklist → open via PanelManager
    if (['shelf', 'map', 'web', 'booklist'].includes(requestedView)) {
      navigateTo(requestedView);
      return;
    }
    show(requestedView);
  });

  window.addEventListener('hashchange', syncFromHash);

  function renderPrimaryHeader(
    activeView,
    { showNewEntry = false, actionLabel = '', actionId = '' } = {}
  ) {
    const canonicalView = toCanonicalViewName(activeView);
    const activeNavView = toNavViewName(canonicalView);
    const sharedAction = HEADER_ACTION_BY_VIEW[canonicalView] || null;
    const NAV_ICON_SYMBOLS = {
      shelf: 'icon-nav-shelf',
      library: 'icon-nav-library',
      map: 'icon-nav-map',
      graph: 'icon-nav-graph',
      list: 'icon-nav-list',
    };

    function renderNavIcon(iconKey) {
      const symbolId = NAV_ICON_SYMBOLS[iconKey];
      if (!symbolId) return '';
      return `<span class="nav-icon" aria-hidden="true"><svg class="nav-icon-svg" viewBox="0 0 16 16" focusable="false"><use href="#${symbolId}"></use></svg></span>`;
    }

    const links = NAV_ITEMS.map((item) => `
      <a href="${item.href}" class="nav-link${item.view === activeNavView ? ' active' : ''}" data-view="${item.view}">${renderNavIcon(item.icon)}${item.label}</a>
    `).join('');

    const showRoomReturn = ['shelf', 'map', 'web', 'booklist'].includes(canonicalView);
    const roomReturnBtn = showRoomReturn
      ? `<button class="nav-room-btn" type="button" data-view="room">Back To Room</button>`
      : '';

    const resolvedActionLabel = actionLabel || sharedAction?.label || (showNewEntry ? 'Add Book' : '');
    const resolvedActionId = actionId || sharedAction?.id || '';
    const actionBtn = (resolvedActionLabel)
      ? `<button class="nav-action-btn"${resolvedActionId ? ` id="${resolvedActionId}"` : ''}>${toServiceTitleCase(resolvedActionLabel)}</button>`
      : '';
    const authBtn = `
      <button class="auth-avatar-btn" type="button" data-auth-trigger aria-label="Open login panel" hidden>
        <span class="auth-avatar" data-auth-avatar aria-hidden="true">L</span>
      </button>
    `;

    return `
      <header class="app-masthead shared-masthead">
        <div>
          <div class="wordmark">Marginalia</div>
          <span class="wordmark-sub">Margins are where thinking happens</span>
        </div>
        <nav class="nav">
          ${roomReturnBtn}
          ${links}
          ${actionBtn}
          ${authBtn}
        </nav>
      </header>
    `;
  }

  window.renderPrimaryHeader = renderPrimaryHeader;

  function renderUnifiedPanelHeader(activeView) {
    return `
      <div class="shared-header-wrap">
        ${renderPrimaryHeader(activeView)}
      </div>
    `;
  }

  window.renderUnifiedPanelHeader = renderUnifiedPanelHeader;

  function renderToolPageShell(pageType, contentHTML = '') {
    const safeType = String(pageType || 'tool').trim().toLowerCase();
    return `
      <div class="tool-page-shell tool-page-shell--${safeType}">
        <div class="tool-page-inner tool-page-inner--${safeType}">
          ${contentHTML}
        </div>
      </div>
    `;
  }

  window.renderToolPageShell = renderToolPageShell;

  function toServiceTitleCase(text) {
    return String(text || '')
      .trim()
      .split(/\s+/)
      .map((chunk) => {
        const match = chunk.match(/^([^A-Za-z0-9]*)([A-Za-z][A-Za-z'’-]*)([^A-Za-z0-9]*)$/);
        if (!match) return chunk;
        const [, prefix, core, suffix] = match;
        if (core === core.toUpperCase() && core.length <= 4) return `${prefix}${core}${suffix}`;
        return `${prefix}${core.charAt(0).toUpperCase()}${core.slice(1).toLowerCase()}${suffix}`;
      })
      .join(' ');
  }

  // Start on preloader
  show('preloader');

  return { show, showShelf, showRoom, navigateTo };
})();

export { App };

// Update module-level exports from window (set inside the IIFE above).
// eslint-disable-next-line no-import-assign
renderPrimaryHeader = window.renderPrimaryHeader;
// eslint-disable-next-line no-import-assign
renderUnifiedPanelHeader = window.renderUnifiedPanelHeader;
// eslint-disable-next-line no-import-assign
renderToolPageShell = window.renderToolPageShell;
