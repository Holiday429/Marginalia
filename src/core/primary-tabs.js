const PRIMARY_TAB_ITEMS = [
  { id: 'search', label: 'Search', icon: 'search', route: 'search', panel: 'search' },
  { id: 'library', label: 'Library', icon: 'library', route: 'library', panel: 'library' },
  { id: 'map', label: 'Map', icon: 'map', route: 'map', panel: 'map' },
  { id: 'graph', label: 'Graph', icon: 'graph', route: 'graph', panel: 'web' },
  { id: 'profile', label: 'Profile', icon: 'profile', route: 'profile', panel: 'profile' },
];

const PRIMARY_TAB_ICON_SYMBOLS = {
  search: 'icon-nav-search',
  library: 'icon-nav-library',
  shelf: 'icon-nav-shelf',
  map: 'icon-nav-map',
  graph: 'icon-nav-graph',
  list: 'icon-nav-list',
};

function renderPrimaryTabIcon(iconId) {
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

export function renderPrimaryTabsMarkup({
  activeId = '',
  dataAttr = 'view',
  valueKey = 'route',
  className = 'room-top-tabs',
  ariaLabel = 'Primary pages',
} = {}) {
  return `
    <nav class="${className}" aria-label="${ariaLabel}">
      ${PRIMARY_TAB_ITEMS.map((item) => `
        <button
          class="room-nav-item${item.id === activeId ? ' is-active' : ''}"
          type="button"
          data-${dataAttr}="${item[valueKey]}"
          aria-label="${item.label}"
        >
          <span class="room-nav-icon" aria-hidden="true">${renderPrimaryTabIcon(item.icon)}</span>
          <span class="room-nav-label">${item.label}</span>
        </button>
      `).join('')}
    </nav>
  `;
}

export { PRIMARY_TAB_ITEMS };
