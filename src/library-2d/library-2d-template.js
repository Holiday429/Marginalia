import { LIBRARY_TAB_ITEMS } from './library-2d-state.js';

function renderFallbackTopTabs(activeId = 'shelf') {
  return LIBRARY_TAB_ITEMS.map((item) => `
    <button type="button" class="room-nav-item${item.id === activeId ? ' is-active' : ''}" data-library-panel="${item.id}" aria-label="${item.label}">
      <span>${item.label}</span>
    </button>
  `).join('');
}

function renderLeftRail() {
  return `
    <aside class="library-rail" aria-label="Shelf Tools">
      <button type="button" class="library-rail-btn is-primary" data-library-rail="new-shelf">
        <span class="library-rail-icon">+</span>
        <span>New Shelf</span>
      </button>
      <button type="button" class="library-rail-btn" data-library-rail="add-books">
        <span class="library-rail-icon">+</span>
        <span>Add Books</span>
      </button>
      <button type="button" class="library-rail-btn" data-library-rail="select">
        <span class="library-rail-icon">□</span>
        <span>Select</span>
      </button>
      <button type="button" class="library-rail-btn" data-library-rail="group">
        <span class="library-rail-icon">#</span>
        <span>Group</span>
      </button>
      <button type="button" class="library-rail-btn" data-library-rail="rename">
        <span class="library-rail-icon">T</span>
        <span>Rename</span>
      </button>
      <button type="button" class="library-rail-btn" data-library-rail="delete">
        <span class="library-rail-icon">x</span>
        <span>Delete</span>
      </button>
    </aside>
  `;
}

export function renderLibraryShell() {
  const roomTabs = typeof window.renderRoomTopTabs === 'function'
    ? window.renderRoomTopTabs({
      activeId: 'shelf',
      dataAttr: 'library-panel',
      className: 'room-top-tabs room-top-tabs--library',
      ariaLabel: 'Library Tabs',
    })
    : `<nav class="room-top-tabs room-top-tabs--library" aria-label="Library Tabs">${renderFallbackTopTabs('shelf')}</nav>`;

  return `
    <div class="page library-page">
      <header class="library-topbar" id="librarySearchSection">
        <div class="library-topbar-left">
          <button type="button" class="library-back-btn" id="libraryOpenRoomBtn">Back To Room</button>
          <h1>Organize</h1>
          <p>Arrange your books, your way.</p>
        </div>
        ${roomTabs}
        <form class="library-topbar-search" id="librarySearchForm" autocomplete="off">
          <label class="sr-only" for="librarySearchInput">Search books</label>
          <input id="librarySearchInput" type="search" placeholder="Search books..." />
          <button type="submit" class="library-search-submit">Locate</button>
          <p class="library-search-feedback" id="librarySearchFeedback" aria-live="polite"></p>
        </form>
      </header>

      <section class="library-main">
        ${renderLeftRail()}

        <section class="library-content-shell" id="libraryOrganizeSection">
          <div class="library-toolbar-row">
            <div class="library-toolbar">
              <button type="button" class="chip active" data-arrange="status">Auto By Status</button>
              <button type="button" class="chip" data-arrange="color">Auto By Color</button>
              <button type="button" class="chip" data-arrange="size">Auto By Size</button>
              <button type="button" class="chip" data-arrange="reset">Reset</button>
            </div>
            <div class="library-zoom-inline" aria-label="Library zoom controls">
              <button type="button" class="library-zoom-btn" id="libraryZoomIn">+</button>
              <button type="button" class="library-zoom-btn" id="libraryZoomOut">−</button>
              <button type="button" class="library-zoom-btn library-zoom-fit" id="libraryZoomFit">Fit</button>
              <button type="button" class="library-zoom-btn library-zoom-fit" id="libraryCenterView">Center</button>
            </div>
          </div>

          <div class="library-meta-row">
            <div class="library-stats" id="libraryStats"></div>
            <p class="library-status-line" id="libraryStatusLine">Drag books across shelves. Drag shelf backboards to move shelves.</p>
          </div>

          <div class="library-shelf-create" id="libraryShelfCreate" hidden>
            <form id="libraryShelfForm" class="library-shelf-form" autocomplete="off">
              <label>
                <span>Name</span>
                <input id="libraryShelfName" type="text" placeholder="Poetry" maxlength="28" />
              </label>
              <label>
                <span>Rows</span>
                <select id="libraryShelfRows">
                  <option value="1">1</option>
                  <option value="2" selected>2</option>
                  <option value="3">3</option>
                </select>
              </label>
              <label>
                <span>Tint</span>
                <input id="libraryShelfColor" type="color" value="#8f6f44" />
              </label>
              <button type="submit" class="chip">Create Shelf</button>
            </form>
          </div>

          <div class="library-scene" id="libraryScene">
            <div class="library-scene-viewport" id="librarySceneViewport">
              <div class="library-wall-grid" id="libraryShelves"></div>
            </div>
          </div>

          <div class="library-book-overlay" id="libraryBookOverlay" hidden>
            <div class="library-overlay-book" id="libraryOverlayBook">
              <div class="library-overlay-book-face library-overlay-book-spine" id="libraryOverlaySpine"></div>
              <div class="library-overlay-book-face library-overlay-book-cover" id="libraryOverlayCover"></div>
            </div>
            <article class="library-overlay-info" id="libraryOverlayInfo">
              <button type="button" class="library-overlay-close" id="libraryOverlayClose" aria-label="Close book inspector">x</button>
              <h4 id="libraryOverlayTitle"></h4>
              <p id="libraryOverlayAuthor"></p>
              <p id="libraryOverlaySummary"></p>
              <div class="library-overlay-tags" id="libraryOverlayTags"></div>
              <div class="library-overlay-actions" id="libraryOverlayActions"></div>
            </article>
          </div>
        </section>
      </section>
    </div>
  `;
}
