import { renderUnifiedPanelHeader } from '../core/app.js';

function renderLeftRail() {
  return `
    <aside class="library-rail" aria-label="Library Tools">
      <button type="button" class="library-rail-btn" data-library-rail="new-shelf">
        <span class="library-rail-icon">+</span>
        <span>New Shelf</span>
      </button>
      <button type="button" class="library-rail-btn" data-library-rail="add-books">
        <span class="library-rail-icon">+</span>
        <span>Add Books</span>
      </button>
      <div class="library-rail-group">
        <button type="button" class="library-rail-btn" data-library-group-trigger="organize">
          <span class="library-rail-icon">#</span>
          <span>Organize</span>
        </button>
        <div class="library-rail-popover" aria-label="Organize Shelf">
          <button type="button" class="library-rail-popover-btn" data-arrange="status">By Status</button>
          <button type="button" class="library-rail-popover-btn" data-arrange="color">By Color</button>
          <button type="button" class="library-rail-popover-btn" data-arrange="size">By Size</button>
          <button type="button" class="library-rail-popover-btn" data-arrange="reset">Reset Layout</button>
        </div>
      </div>
      <div class="library-rail-edit" id="libraryRailEdit" hidden>
        <button type="button" class="library-rail-btn" data-library-rail="rename">
          <span class="library-rail-icon">T</span>
          <span>Rename</span>
        </button>
        <button type="button" class="library-rail-btn" data-library-rail="delete">
          <span class="library-rail-icon">x</span>
          <span>Delete</span>
        </button>
      </div>
    </aside>
  `;
}

export function renderLibraryShell() {
  const header = renderUnifiedPanelHeader('library', {
    rightHTML: `
      <div class="library-header-search" id="librarySearchSection">
        <form class="library-topbar-search" id="librarySearchForm" autocomplete="off">
          <label class="sr-only" for="librarySearchInput">Search books</label>
          <span class="library-search-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16" class="room-svg-icon"><use href="#icon-nav-search"></use></svg>
          </span>
          <input id="librarySearchInput" type="search" placeholder="Locate a book on your shelf" />
          <button type="submit" class="library-search-submit">Locate</button>
          <p class="library-search-feedback" id="librarySearchFeedback" aria-live="polite"></p>
        </form>
      </div>
    `,
  });

  return `
    <div class="page library-page">
      ${header}

      <section class="library-main">
        ${renderLeftRail()}

        <section class="library-content-shell" id="libraryOrganizeSection">
          <div class="library-meta-row">
            <div class="library-stats" id="libraryStats"></div>
          </div>

          <div class="library-shelf-create" id="libraryShelfCreate" hidden>
            <form id="libraryShelfForm" class="library-shelf-form" autocomplete="off">
              <label class="library-shelf-field library-shelf-field--name">
                <span class="library-shelf-label">Name</span>
                <input id="libraryShelfName" type="text" placeholder="Poetry" maxlength="28" />
              </label>

              <label class="library-shelf-field library-shelf-field--rows">
                <span class="library-shelf-label">Rows</span>
                <input id="libraryShelfRows" type="number" min="1" max="12" step="1" value="2" inputmode="numeric" />
              </label>

              <div class="library-shelf-field library-shelf-field--tint">
                <span class="library-shelf-label">Tint</span>
                <div class="library-shelf-color-grid" id="libraryShelfColorGrid"></div>
                <input id="libraryShelfColor" type="hidden" value="#8f6f44" />
              </div>

              <div class="library-shelf-actions">
                <button type="submit" class="chip">Create Shelf</button>
              </div>
            </form>
          </div>

          <div class="library-scene" id="libraryScene">
            <div class="library-scene-viewport" id="librarySceneViewport">
              <div class="library-wall-grid" id="libraryShelves"></div>
            </div>
            <div class="library-zoom" aria-label="Library zoom controls">
              <button type="button" class="library-zoom-btn" id="libraryZoomIn">+</button>
              <button type="button" class="library-zoom-btn" id="libraryZoomOut">−</button>
              <button type="button" class="library-zoom-btn library-zoom-fit" id="libraryZoomFit">Fit</button>
            </div>
          </div>
        </section>
      </section>

    </div>

    <div class="library-book-overlay" id="libraryBookOverlay" hidden>
      <div class="library-overlay-shell" id="libraryOverlayShell">
        <button type="button" class="library-overlay-close" id="libraryOverlayClose" aria-label="Close book inspector">x</button>
        <div class="library-overlay-stage" id="libraryOverlayStage">
          <div class="library-overlay-book-scene" id="libraryOverlayBookScene">
            <div class="library-overlay-book" id="libraryOverlayBook">
              <div class="library-overlay-book-face library-overlay-book-spine" id="libraryOverlaySpine"></div>
              <div class="library-overlay-book-face library-overlay-book-cover" id="libraryOverlayCover"></div>
            </div>
          </div>
          <article class="library-overlay-info" id="libraryOverlayInfo">
            <div class="library-overlay-info-copy">
              <p class="library-overlay-eyebrow" id="libraryOverlayEyebrow"></p>
              <h4 id="libraryOverlayTitle"></h4>
              <p id="libraryOverlayAuthor"></p>
              <div class="library-overlay-divider" id="libraryOverlayDivider" aria-hidden="true"></div>
              <p id="libraryOverlaySummary"></p>
            </div>
            <div class="library-overlay-info-footer">
              <div class="library-overlay-tags" id="libraryOverlayTags"></div>
              <div class="library-overlay-actions" id="libraryOverlayActions"></div>
            </div>
          </article>
        </div>
      </div>
    </div>
  `;
}
