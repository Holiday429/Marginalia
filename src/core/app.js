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
    { view: 'home', label: 'Shelf', href: '#shelf' },
    { view: 'map', label: 'Map', href: '#map' },
    { view: 'web', label: 'Graph', href: '#web' },
    { view: 'yearbook', label: 'Yearbook', href: '#yearbook' },
  ];

  const views = {
    preloader: document.getElementById('view-preloader'),
    home:      document.getElementById('view-home'),
    book:      document.getElementById('view-book'),      // may be null until built
    map:       document.getElementById('view-map'),
    web:       document.getElementById('view-web'),
    yearbook:  document.getElementById('view-yearbook'),
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
  }

  let transitioning = false;
  function showHome() {
    if (transitioning) return;
    transitioning = true;

    const preloader = views.preloader;
    const home      = views.home;

    // Reveal home underneath the preloader, then fade preloader out
    home.hidden = false;
    document.body.dataset.view = 'home';
    if (typeof initHome === 'function' && !initialized.has('home')) {
      initHome();
      initialized.add('home');
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
    const links = NAV_ITEMS.map((item) => `
      <a href="${item.href}" class="nav-link${item.view === activeView ? ' active' : ''}" data-view="${item.view}">${item.label}</a>
    `).join('');

    const buttonLabel = actionLabel || (showNewEntry ? '＋ New entry' : '');
    const actionBtn = buttonLabel
      ? `<button class="add-btn"${actionId ? ` id="${actionId}"` : ''}>${buttonLabel}</button>`
      : '';

    return `
      <header class="home-masthead shared-masthead">
        <div>
          <div class="wordmark">Marginalia</div>
          <span class="wordmark-sub">Margins are where thinking happens</span>
        </div>
        <nav class="nav">
          ${links}
          ${actionBtn}
        </nav>
      </header>
    `;
  }

  window.renderPrimaryHeader = renderPrimaryHeader;

  // Start on preloader
  show('preloader');

  return { show, showHome };
})();
