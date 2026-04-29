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

const App = (() => {
  const NAV_ITEMS = [
    { view: 'shelf',    label: 'Shelf',    icon: 'shelf', href: '#shelf' },
    { view: 'studio',   label: 'Library', icon: 'library', href: '#studio' },
    { view: 'map',      label: 'Map',      icon: 'map', href: '#map' },
    { view: 'web',      label: 'Graph',    icon: 'graph', href: '#web' },
    { view: 'booklist', label: 'Booklist', icon: 'list', href: '#booklist' },
  ];

  const views = {
    preloader: document.getElementById('view-preloader'),
    shelf:     document.getElementById('view-shelf'),
    studio:    document.getElementById('view-studio'),
    book:      document.getElementById('view-book'),      // may be null until built
    map:       document.getElementById('view-map'),
    web:       document.getElementById('view-web'),
    booklist:  document.getElementById('view-booklist'),
  };

  const initialized = new Set();

  function show(name, params = {}) {
    const view = views[name];
    if (!view) {
      console.warn(`[App] View "${name}" is not registered yet.`);
      return;
    }

    Object.entries(views).forEach(([key, el]) => {
      if (el) el.hidden = key !== name;
    });
    document.body.dataset.view = name;
    if (name !== 'map') document.body.classList.remove('map-panel-open');

    // Run init<Name>() once, enter<Name>() every time
    if (!initialized.has(name)) {
      const initFn = window['init' + cap(name)];
      if (typeof initFn === 'function') initFn(params);
      initialized.add(name);
    }
    const enterFn = window['enter' + cap(name)];
    if (typeof enterFn === 'function') enterFn(params);

    // Highlight nav state
    document.querySelectorAll('.nav-link[data-view]').forEach(a => {
      a.classList.toggle('active', a.dataset.view === name);
    });

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
    document.querySelectorAll('.nav-link[data-view]').forEach(a => {
      a.classList.toggle('active', a.dataset.view === 'shelf');
    });
    if (typeof initShelf === 'function' && !initialized.has('shelf')) {
      try { initShelf(); } catch(e) { console.error('[App] initShelf threw:', e); }
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

  // Wire up any element with data-view (nav links, wordmarks, breadcrumbs).
  // Body also carries data-view as a styling hook, so exclude it from the delegate.
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-view]');
    if (!link || link === document.body) return;
    e.preventDefault();
    show(link.dataset.view);
  });

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function renderPrimaryHeader(
    activeView,
    { showNewEntry = false, actionLabel = '', actionId = '' } = {}
  ) {
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
      <a href="${item.href}" class="nav-link${item.view === activeView ? ' active' : ''}" data-view="${item.view}">${renderNavIcon(item.icon)}${item.label}</a>
    `).join('');

    const resolvedActionLabel = actionLabel || (showNewEntry ? 'Add Book' : '');
    const actionBtn = (resolvedActionLabel)
      ? `<button class="nav-action-btn"${actionId ? ` id="${actionId}"` : ''}>${toServiceTitleCase(resolvedActionLabel)}</button>`
      : '';
    const authBtn = `
      <button class="auth-avatar-btn" type="button" data-auth-trigger aria-label="Open login panel" hidden>
        <span class="auth-avatar" data-auth-avatar aria-hidden="true">L</span>
      </button>
    `;

    const aiBtn = `
      <button class="ai-settings-trigger" id="aiSettingsBtn" type="button" aria-label="AI settings" title="AI settings">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4">
          <circle cx="8" cy="8" r="2.8"/>
          <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"/>
        </svg>
      </button>
    `;

    return `
      <header class="app-masthead shared-masthead">
        <div>
          <div class="wordmark">Marginalia</div>
          <span class="wordmark-sub">Margins are where thinking happens</span>
        </div>
        <nav class="nav">
          ${links}
          ${actionBtn}
          ${authBtn}
          ${aiBtn}
        </nav>
      </header>
    `;
  }

  window.renderPrimaryHeader = renderPrimaryHeader;

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

  return { show, showShelf };
})();
