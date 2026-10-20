interface PrimaryTabItem {
  id: string;
  label: string;
  icon: string;
  route: string;
  panel: string;
  disabled?: boolean;
}

// Plan 2.8, option B: Library · Map · Graph · Profile. Library is one tab with two modes (Browse = the old Search page,
// Arrange = the old Library page, see library-mode-switch); the tab opens Browse, `#search` and `#library` still work.
const PRIMARY_TAB_ITEMS: PrimaryTabItem[] = [
  { id: 'library', label: 'Library', icon: 'library', route: 'search', panel: 'search' },
  { id: 'map', label: 'Map', icon: 'map', route: 'map', panel: 'map' },
  { id: 'graph', label: 'Graph', icon: 'graph', route: 'graph', panel: 'web' },
  { id: 'profile', label: 'Profile', icon: 'profile', route: 'profile', panel: 'profile' },
];

/** The tab that is highlighted while `view` is on screen (both Library modes highlight Library). */
export function primaryTabIdForView(view: string): string {
  if (view === 'search' || view === 'library' || view === 'shelf' || view === 'studio') return 'library';
  if (view === 'web') return 'graph';
  return view;
}

const PRIMARY_TAB_ICON_SYMBOLS: Record<string, string> = {
  search: 'icon-nav-search',
  library: 'icon-nav-library',
  shelf: 'icon-nav-shelf',
  map: 'icon-nav-map',
  graph: 'icon-nav-graph',
  list: 'icon-nav-list',
};

function renderPrimaryTabIcon(iconId: string): string {
  if (iconId === 'profile') {
    return `
      <svg viewBox="0 0 18 18" class="room-svg-icon">
        <circle cx="9" cy="6.5" r="2.8" fill="none" stroke="currentColor" stroke-width="1.5"></circle>
        <path d="M3 15.5c0-3.3 2.7-6 6-6s6 2.7 6 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
      </svg>
    `;
  }
  const symbolId = PRIMARY_TAB_ICON_SYMBOLS[iconId] || PRIMARY_TAB_ICON_SYMBOLS.library;
  return `<svg viewBox="0 0 16 16" class="room-svg-icon"><use href="#${symbolId}"></use></svg>`;
}

interface RenderPrimaryTabsOptions {
  activeId?: string;
  dataAttr?: string;
  valueKey?: keyof PrimaryTabItem;
  className?: string;
  ariaLabel?: string;
}

export function renderPrimaryTabsMarkup({
  activeId = '',
  dataAttr = 'view',
  valueKey = 'route',
  className = 'room-top-tabs',
  ariaLabel = 'Primary pages',
}: RenderPrimaryTabsOptions = {}): string {
  return `
    <nav class="${className}" aria-label="${ariaLabel}">
      ${PRIMARY_TAB_ITEMS.map((item) => `
        <button
          class="room-nav-item${item.id === activeId ? ' is-active' : ''}${item.disabled ? ' is-disabled' : ''}"
          type="button"
          data-${dataAttr}="${item[valueKey]}"
          aria-label="${item.label}"
          ${item.disabled ? 'disabled title="Coming soon"' : ''}
        >
          <span class="room-nav-icon" aria-hidden="true">${renderPrimaryTabIcon(item.icon)}</span>
          <span class="room-nav-label">${item.label}</span>
        </button>
      `).join('')}
    </nav>
  `;
}

export { PRIMARY_TAB_ITEMS };
